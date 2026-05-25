import { fetchPublicWebArchive } from "./webArchiveService.js";
import { getLLMClient, getLLMModel, friendlyLLMError } from "../utils/llmClient.js";
import { generateVisualSearchKeywords } from "./visualKeywordsService.js";
import { searchPexelsForKeywords } from "./pexelsService.js";

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

  const pexelsImages = await fetchPexelsImagesForPoi({
    poi,
    theme,
    narrative_role,
    osm_summary: summarizeOsmTags(poi.tags),
  });

  const card = await formatEncyclopediaWithLlm({
    poi,
    theme,
    narrative_role,
    nearby_pois,
    osm_summary: summarizeOsmTags(poi.tags),
    web,
    pexelsImages,
  });

  card.meta = {
    poi_id: poi.id,
    generated_at: new Date().toISOString(),
    source_count: web.sources.length,
    image_count: (card.image_gallery || []).length,
    image_provider: "pexels",
    pexels_queries: pexelsImages.map((i) => i.search_query).filter(Boolean),
  };

  cardCache.set(key, { at: Date.now(), card });
  return card;
}

/**
 * 用户将关键词拖入百科区后：基于关键词 + 已有材料生成「新一版」百科卡片（文字由 LLM，图片来自公开网页）。
 */
export async function expandEncyclopediaFromKeywords({
  poi,
  keywords = [],
  base_card = null,
  theme = null,
  collected_notes = [],
}) {
  if (!poi?.name) throw new Error("缺少 POI 名称");
  const kws = [...new Set((keywords || []).map(String).filter(Boolean))].slice(0, 12);
  if (kws.length === 0) throw new Error("请至少提供一个关键词");

  const lat = Number(poi.lat);
  const lon = Number(poi.lon);
  const web = await fetchPublicWebArchive({
    name: String(poi.name),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  });

  const pexelsImages = await fetchPexelsImagesForPoi({
    poi,
    theme,
    focus_keywords: kws,
    osm_summary: "",
  });

  const card = await formatKeywordExpandedCard({
    poi,
    theme,
    keywords: kws,
    collected_notes,
    web,
    pexelsImages,
    base_card,
  });
  card.meta = {
    ...(card.meta || {}),
    expanded_from_keywords: kws,
    variant: "keyword-expanded",
    image_provider: "pexels",
  };
  return card;
}

async function fetchPexelsImagesForPoi({
  poi,
  theme,
  narrative_role,
  osm_summary = "",
  focus_keywords = [],
}) {
  try {
    const queries = await generateVisualSearchKeywords({
      poi,
      theme,
      narrative_role,
      osm_summary,
      focus_keywords,
    });
    const images = await searchPexelsForKeywords(queries, { perQuery: 2, maxTotal: 8 });
    return images;
  } catch (e) {
    console.warn("[encyclopedia] Pexels 配图失败，将尝试仅用网页图:", e.message);
    return [];
  }
}

async function formatKeywordExpandedCard({
  poi,
  theme,
  keywords,
  collected_notes,
  web,
  pexelsImages,
  base_card,
}) {
  const client = getClient();
  const system = `你是城市文化百科编辑。用户沿路线采集了关键词并拖入百科面板，请围绕这些关键词重写一版「展开式」百科卡片 JSON。
要求：以关键词为叙事线索组织全文；综合公开网页摘录与已有卡片；中文、有杂志感；
image_gallery 优先使用 candidate_images（Pexels）中的 url，可为每张图写中文 caption，credit 保留摄影师信息。
结构同标准百科卡片：title, subtitle, keywords, cultural_summary, sections{...}, timeline_snippets, related_nearby, image_gallery, sources。`;

  const userPayload = {
    focus_keywords: keywords,
    poi: { name: poi.name, lat: poi.lat, lon: poi.lon },
    route_theme: theme,
    prior_card: base_card
      ? {
          title: base_card.title,
          summary: base_card.cultural_summary,
          keywords: base_card.keywords,
        }
      : null,
    traveler_notes: collected_notes,
    web_snippets: web.snippets,
    candidate_images: mergeCandidateImages(pexelsImages, web.images),
  };

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: getLLMModel(),
      temperature: 0.62,
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
  if (!text) throw new Error("关键词展开失败");
  return normalizeCard(JSON.parse(text), { images: mergeCandidateImages(pexelsImages, web.images) }, poi);
}

async function formatEncyclopediaWithLlm({
  poi,
  theme,
  narrative_role,
  nearby_pois,
  osm_summary,
  web,
  pexelsImages,
}) {
  const client = getClient();
  const system = `你是城市文化百科编辑。根据 OpenStreetMap 点位信息与来自公开网页的摘录（维基百科、网络摘要等），编写一份「数字城市百科卡片」JSON。
要求：
- 综合多源信息，用中文撰写，可读、有编辑感，像博物馆展签 + 旅行杂志；
- 不要捏造精确年代与数字；无依据处用概括语气；
- 不要输出原始搜索列表；sections 每项 2~5 句；
- image_gallery 优先使用 candidate_images（Pexels 摄影图）中的 url，可改写中文 caption，不要编造 url；
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
    candidate_images: mergeCandidateImages(pexelsImages, web.images),
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

  return normalizeCard(parsed, { images: mergeCandidateImages(pexelsImages, web.images), sources: web.sources }, poi);
}

function mergeCandidateImages(pexelsImages = [], webImages = []) {
  const seen = new Set();
  const out = [];
  for (const img of [...pexelsImages, ...webImages]) {
    if (!img?.url || seen.has(img.url)) continue;
    seen.add(img.url);
    out.push(img);
  }
  return out.slice(0, 10);
}

function normalizeCard(raw, imagePool, poi) {
  const poolImages = imagePool?.images || [];
  const gallery = Array.isArray(raw.image_gallery) ? raw.image_gallery : [];
  const validUrls = new Set(poolImages.map((i) => i.url).filter(Boolean));
  const mergedGallery = gallery
    .filter((g) => g?.url && (validUrls.has(g.url) || g.url.startsWith("http")))
    .slice(0, 8);

  if (mergedGallery.length === 0 && poolImages.length) {
    for (const img of poolImages.slice(0, 6)) {
      mergedGallery.push({
        url: img.url,
        caption: img.caption || poi.name,
        credit: img.credit || "Pexels",
      });
    }
  }

  const poolSources = imagePool?.sources || [];
  const sources = Array.isArray(raw.sources) && raw.sources.length
    ? raw.sources
    : poolSources.map((s) => ({ title: s.title, url: s.url }));

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
