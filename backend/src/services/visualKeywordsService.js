import { getLLMClient, getLLMModel, friendlyLLMError } from "../utils/llmClient.js";

/**
 * DeepSeek 生成适合 Pexels 英文检索的视觉关键词（3~6 条）。
 */
export async function generateVisualSearchKeywords({
  poi,
  theme = null,
  narrative_role = null,
  osm_summary = "",
  focus_keywords = [],
}) {
  const client = getLLMClient();
  const focus = [...new Set((focus_keywords || []).map(String).filter(Boolean))].slice(0, 10);

  const system = `你是旅行摄影编辑。根据城市 POI 与路线主题，生成 3~6 条适合在 Pexels 图库搜索的英文关键词短语。
要求：
- 每条 2~5 个英文单词，描述可拍到的城市景观/建筑/街景/氛围；
- 结合中国/亚洲城市语境时可含 Shanghai, China, urban 等；
- 不要人名、不要过长句子；
- 输出 JSON：{"queries": string[]}`;

  const userPayload = {
    poi_name: poi?.name,
    lat: poi?.lat,
    lon: poi?.lon,
    route_theme: theme,
    narrative_role,
    osm_summary: osm_summary || "",
    focus_keywords: focus,
  };

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: getLLMModel(),
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    });
  } catch (e) {
    throw new Error(friendlyLLMError(e));
  }

  const text = completion.choices[0]?.message?.content;
  if (!text) return fallbackQueries(poi, focus);

  try {
    const parsed = JSON.parse(text);
    const queries = (parsed.queries || parsed.keywords || [])
      .map((q) => String(q).trim())
      .filter(Boolean)
      .slice(0, 6);
    if (queries.length) return queries;
  } catch {
    /* fall through */
  }

  return fallbackQueries(poi, focus);
}

function fallbackQueries(poi, focus) {
  const name = String(poi?.name || "urban landmark").replace(/[^\w\s\u4e00-\u9fff-]/g, " ");
  const base = [
    `${name} Shanghai architecture`,
    `${name} city street China`,
    "Shanghai urban skyline night",
  ];
  if (focus.length) {
    for (const k of focus.slice(0, 2)) {
      base.unshift(`${k} Shanghai urban`);
    }
  }
  return [...new Set(base)].slice(0, 5);
}
