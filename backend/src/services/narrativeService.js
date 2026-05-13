import OpenAI from "openai";

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("未配置 OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey: key });
}

/**
 * 将 POI 压缩为传给模型的精简结构，控制 token。
 */
function slimPoisForLlm(pois, max = 120) {
  const slice = pois.slice(0, max);
  return slice.map((p, i) => ({
    ref_id: p.id || `idx_${i}`,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    tag_summary: summarizeTags(p.tags),
  }));
}

function summarizeTags(tags) {
  if (!tags || typeof tags !== "object") return "";
  const keys = [
    "tourism",
    "historic",
    "amenity",
    "building",
    "leisure",
    "memorial",
    "heritage",
    "wikidata",
    "wikipedia",
  ];
  const parts = [];
  for (const k of keys) {
    if (tags[k]) parts.push(`${k}=${tags[k]}`);
  }
  return parts.slice(0, 8).join("; ");
}

async function chatJson(client, system, user, { model = "gpt-4o-mini", temperature = 0.6 } = {}) {
  const completion = await client.chat.completions.create({
    model,
    temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("OpenAI 返回为空");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("OpenAI 返回非合法 JSON");
  }
}

/**
 * Step 3：生成 1~3 个城市叙事主题（仅 LLM，无人工库）。
 */
export async function generateNarrativeThemes(context) {
  const client = getClient();
  const system = `你是城市文化研究者。根据给定地理区域与 POI 名称列表（原始材料），提出 1~3 个可辩论的「城市叙事主题」标题。
要求：主题应体现空间、历史、权力、消费、全球化等维度之一或多者；不要写成旅游广告口号；不要虚构具体史实数字。
只输出 JSON：{"themes": string[] }`;

  const user = JSON.stringify(context, null, 0);
  const out = await chatJson(client, system, user, { temperature: 0.7 });
  const themes = Array.isArray(out.themes) ? out.themes.map(String).filter(Boolean) : [];
  if (themes.length === 0) {
    throw new Error("模型未返回有效 themes");
  }
  return themes.slice(0, 3);
}

/**
 * Step 4：语义筛选 POI。
 */
export async function scorePoisForTheme(theme, slimPois) {
  const client = getClient();
  const system = `你是城市叙事分析助手。给定一个叙事主题和一组地点（ref_id 对应 OpenStreetMap 材料）。
对每个地点判断是否与该主题在文化/历史上可建立联想（允许弱关联，但要诚实）。
输出 JSON：{
  "items": [
    {
      "ref_id": string,
      "important": boolean,
      "importance_score": number,
      "narrative_role": string,
      "cultural_tags": string[]
    }
  ]
}
规则：importance_score 为 0-10 的整数；cultural_tags 2~5 个短标签（中文）；items 必须覆盖输入中的每一个 ref_id。`;

  const user = JSON.stringify({ theme, pois: slimPois }, null, 0);
  const out = await chatJson(client, system, user, { temperature: 0.4 });
  const items = Array.isArray(out.items) ? out.items : [];
  return items;
}

/**
 * Step 5：叙事路径 + 整体故事。
 */
export async function buildNarrativePath(theme, nodesForPath) {
  const client = getClient();
  const system = `你是城市空间叙事设计者。输入包含若干节点（每个有 ref_id、名称、坐标、重要性、角色、标签）。
请选择一条「叙事路径」：顺序将用于在真实步行路网上依次衔接（由后端 OSRM 计算），请在同一城市研究范围内避免无意义的空间跳跃；顺序应体现主题展开（起承转合），不是「最短游览」优化，但应大致可步行串联。
输出 JSON：
{
  "path": string[],
  "path_explanation": string,
  "turning_points": { "after_ref_id": string, "turn": string }[],
  "story": string
}
要求：
- path 为 ref_id 的有序列表，至少 3 个节点（若输入不足 3 个则尽量使用全部且不重复）；
- turning_points 描述每一段结束后叙事如何转折，键 after_ref_id 对应 path 中该段终点 ref_id；
- story 为 2~4 段中文散文式城市叙事，与主题一致，可引用地点名称但不要编造精确年代数据。`;

  const user = JSON.stringify({ theme, nodes: nodesForPath }, null, 0);
  const out = await chatJson(client, system, user, { temperature: 0.65 });
  return out;
}

/**
 * 端到端叙事流水线（POI 已由调用方获取）。
 */
export async function runNarrativePipeline({ areaLabel, bbox, pois, maxPoisForLlm = 100 }) {
  if (!Array.isArray(pois) || pois.length === 0) {
    throw new Error("POI 列表为空，无法生成叙事");
  }

  const slim = slimPoisForLlm(pois, maxPoisForLlm);
  const themes = await generateNarrativeThemes({
    area_label: areaLabel || "指定区域",
    bbox,
    poi_names_preview: slim.map((p) => p.name).slice(0, 40),
    poi_count: pois.length,
  });

  const theme = themes[0];
  const scored = await scorePoisForTheme(theme, slim);
  const scoreByRef = new Map(scored.map((s) => [String(s.ref_id), s]));

  const enrichedNodes = slim.map((p) => {
    const s = scoreByRef.get(String(p.ref_id)) || {
      important: false,
      importance_score: 0,
      narrative_role: "未由模型标注",
      cultural_tags: [],
    };
    return {
      ref_id: p.ref_id,
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      important: Boolean(s.important),
      importance_score: clampInt(s.importance_score, 0, 10),
      narrative_role: String(s.narrative_role || ""),
      cultural_tags: Array.isArray(s.cultural_tags) ? s.cultural_tags.map(String) : [],
    };
  });

  const candidates = enrichedNodes
    .filter((n) => n.important || n.importance_score >= 5)
    .sort((a, b) => b.importance_score - a.importance_score);

  const pool = candidates.length >= 3 ? candidates : enrichedNodes.sort((a, b) => b.importance_score - a.importance_score);

  const pathInput = pool.slice(0, 25).map((n) => ({
    ref_id: n.ref_id,
    name: n.name,
    lat: n.lat,
    lon: n.lon,
    importance_score: n.importance_score,
    narrative_role: n.narrative_role,
    cultural_tags: n.cultural_tags,
  }));

  const pathOut = await buildNarrativePath(theme, pathInput);

  const pathIds = Array.isArray(pathOut.path) ? pathOut.path.map(String) : [];
  const nodeByRef = new Map(enrichedNodes.map((n) => [String(n.ref_id), n]));

  const orderedNodes = pathIds.map((id) => nodeByRef.get(String(id))).filter(Boolean);

  const finalNodes = orderedNodes.length
    ? orderedNodes
    : pool.slice(0, Math.min(8, pool.length));

  const nodesPayload = finalNodes.map((n) => ({
    id: n.ref_id,
    name: n.name,
    lat: n.lat,
    lon: n.lon,
    importance_score: n.importance_score,
    narrative_role: n.narrative_role,
    cultural_tags: n.cultural_tags,
  }));

  const pathPayload = nodesPayload.map((n) => n.id);

  return {
    theme,
    themes_considered: themes,
    nodes: nodesPayload,
    path: pathPayload,
    path_explanation: String(pathOut.path_explanation || ""),
    turning_points: Array.isArray(pathOut.turning_points) ? pathOut.turning_points : [],
    story: String(pathOut.story || ""),
  };
}

function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}
