import { fetchPublicWebArchive } from "./webArchiveService.js";
import { getLLMClient, getLLMModel, friendlyLLMError } from "../utils/llmClient.js";

const cardCache = new Map();
const CACHE_TTL_MS = 45 * 60 * 1000;

function getClient() {
  return getLLMClient();
}

function cacheKey(poi) {
  return `${poi.id || poi.name}:${poi.lat}:${poi.lon}`;
}

function summarizeOsmTags(tags) {
  if (!tags || typeof tags !== "object") return "";
  const keys = [
    "tourism",
    "historic",
    "amenity",
    "building",
    "architect",
    "start_date",
    "heritage",
    "wikidata",
    "wikipedia",
    "description",
  ];
  return keys
    .filter((k) => tags[k])
    .map((k) => `${k}=${tags[k]}`)
    .join("; ");
}

/**
 * 聚合公开网页资料 + LLM 编排为百科式叙事卡片（不改变路线/POI 管线）。
 */
export async function buildPoiEncyclopediaCard({
  poi,
  theme = null,
  narrative_role = null,
  nearby_pois = [],
}) {
  if (!poi?.name) throw new Error("缺少 POI 名称");

  const key = cacheKey(poi);
  const hit = cardCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.card;

  const lat = Number(poi.lat);
  const lon = Number(poi.lon);
  const web = await fetchPublicWebArchive({
    name: String(poi.name),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  });

  const card = await formatEncyclopediaWithLlm({
    poi,
    theme,
    narrative_role,
    nearby_pois,
    osm_summary: summarizeOsmTags(poi.tags),
    web,
  });

  card.meta = {
    poi_id: poi.id,
    generated_at: new Date().toISOString(),
    source_count: web.sources.length,
    image_count: (card.image_gallery || []).length,
  };

  cardCache.set(key, { at: Date.now(), card });
  return card;
}

async function formatEncyclopediaWithLlm({
  poi,
  theme,
  narrative_role,
  nearby_pois,
  osm_summary,
  web,
}) {
  const client = getClient();
  const system = `你是城市文化百科编辑。根据 OpenStreetMap 点位信息与来自公开网页的摘录（维基百科、网络摘要等），编写一份「数字城市百科卡片」JSON。
要求：
- 综合多源信息，用中文撰写，可读、有编辑感，像博物馆展签 + 旅行杂志；
- 不要捏造精确年代与数字；无依据处用概括语气；
- 不要输出原始搜索列表；sections 每项 2~5 句；
- image_gallery 仅使用输入中给出的 url，可改写 caption，不要编造 url；
- keywords 6~12 个中文标签；
- related_nearby 来自输入的 nearby 列表，每项一句关联说明。

输出 JSON 结构：
{
  "title": string,
  "subtitle": string,
  "keywords": string[],
  "cultural_summary": string,
  "sections": {
    "historical_background": string,
    "architecture_urban_identity": string,
    "notable_stories": string,
    "local_identity": string,
    "travel_impressions": string,
    "atmosphere": string
  },
  "timeline_snippets": [{"period": string, "event": string}],
  "related_nearby": [{"name": string, "note": string}],
  "image_gallery": [{"url": string, "caption": string, "credit": string}],
  "sources": [{"title": string, "url": string}]
}`;

  const userPayload = {
    poi: {
      name: poi.name,
      lat: poi.lat,
      lon: poi.lon,
      tags_summary: osm_summary,
    },
    route_theme: theme,
    narrative_role,
    nearby_pois: (nearby_pois || []).slice(0, 8).map((p) => ({
      name: p.name,
      distance_hint: p.distance_m ?? null,
    })),
    web_snippets: web.snippets,
    candidate_images: web.images,
    web_sources: web.sources,
  };

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: getLLMModel(),
      temperature: 0.55,
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
  if (!text) throw new Error("百科卡片生成失败");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("百科卡片 JSON 解析失败");
  }

  return normalizeCard(parsed, web, poi);
}

function normalizeCard(raw, web, poi) {
  const gallery = Array.isArray(raw.image_gallery) ? raw.image_gallery : [];
  const validUrls = new Set(web.images.map((i) => i.url).filter(Boolean));
  const mergedGallery = gallery
    .filter((g) => g?.url && (validUrls.has(g.url) || g.url.startsWith("http")))
    .slice(0, 8);

  if (mergedGallery.length === 0 && web.images.length) {
    for (const img of web.images.slice(0, 6)) {
      mergedGallery.push({
        url: img.url,
        caption: img.caption || poi.name,
        credit: img.credit || "Web",
      });
    }
  }

  const sources = Array.isArray(raw.sources) && raw.sources.length
    ? raw.sources
    : web.sources.map((s) => ({ title: s.title, url: s.url }));

  return {
    title: String(raw.title || poi.name),
    subtitle: String(raw.subtitle || ""),
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String).slice(0, 14) : [],
    cultural_summary: String(raw.cultural_summary || ""),
    sections: {
      historical_background: String(raw.sections?.historical_background || ""),
      architecture_urban_identity: String(raw.sections?.architecture_urban_identity || ""),
      notable_stories: String(raw.sections?.notable_stories || ""),
      local_identity: String(raw.sections?.local_identity || ""),
      architecture: String(raw.sections?.architecture_urban_identity || ""),
      travel_impressions: String(raw.sections?.travel_impressions || ""),
      atmosphere: String(raw.sections?.atmosphere || ""),
    },
    timeline_snippets: Array.isArray(raw.timeline_snippets)
      ? raw.timeline_snippets.slice(0, 6).map((t) => ({
          period: String(t.period || ""),
          event: String(t.event || ""),
        }))
      : [],
    related_nearby: Array.isArray(raw.related_nearby)
      ? raw.related_nearby.slice(0, 6).map((r) => ({
          name: String(r.name || ""),
          note: String(r.note || ""),
        }))
      : [],
    image_gallery: mergedGallery,
    sources: sources.slice(0, 8),
  };
}
