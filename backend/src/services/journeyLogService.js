import { getLLMClient, getLLMModel, friendlyLLMError } from "../utils/llmClient.js";
import {
  pickRandomLayoutVariant,
  layoutPromptHint,
  LAYOUT_META,
} from "./journeyLogLayouts.js";

/**
 * 将胶卷帧序列编排为线性旅行日志，并随机套用 A/B/C 排版方案数据。
 */
export async function compileJourneyLogNarrative({ frames = [], route_theme = null }) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error("胶卷为空，无法结算旅行日志");
  }

  const layout_variant = pickRandomLayoutVariant();
  const collectedImages = collectFrameImages(frames);
  const frameDigest = frames.map((f, i) => ({
    order: i + 1,
    place: f.poiName || f.poi_name || "途经地点",
    progress: f.progress,
    items: (f.items || []).map((it) => ({
      type: it.type,
      label: it.label || "",
      text: it.text || "",
      url: it.url || "",
    })),
  }));

  const client = getLLMClient();
  const system = `你是旅行杂志编辑。用户沿路线在「胶卷帧」中按顺序采集了关键词、百科摘录与图片（含 Pexels 配图）。
请根据材料写成可出版的旅行日志，并输出严格 JSON。

排版方案：${layout_variant}（${LAYOUT_META[layout_variant]?.label}）
风格提示：${layoutPromptHint(layout_variant)}

要求：
- 中文；保持胶卷帧顺序；必须引用用户拖入的素材（关键词、文字、图片说明）；
- highlights 恰好 4 条短句，适合侧边栏/手账列表；
- hero 与 supporting 的 url 必须来自输入 collected_images 或 frame items 中的 url，不要编造；
- 若图片不足，supporting 可为 1~2 张，数组可为空；
- 不要编造精确年代数字。

输出 JSON：
{
  "title": string,
  "subtitle": string,
  "coordinates": string,
  "summary": string,
  "highlights": [string, string, string, string],
  "hero": { "url": string, "alt": string, "caption": string },
  "supporting": [{ "url": string, "alt": string, "caption": string }],
  "sections": [{ "heading": string, "place": string, "body": string }],
  "full_story": string
}`;

  const payload = {
    route_theme,
    layout_variant,
    frame_count: frames.length,
    frames: frameDigest,
    collected_images: collectedImages,
  };

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: getLLMModel(),
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });
  } catch (e) {
    throw new Error(friendlyLLMError(e));
  }

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("旅行日志生成失败");

  const raw = JSON.parse(text);
  return normalizeJourneyLog(raw, {
    layout_variant,
    collectedImages,
    route_theme,
    frames,
  });
}

function collectFrameImages(frames) {
  const seen = new Set();
  const out = [];
  for (const f of frames) {
    for (const it of f.items || []) {
      if (it.type === "image" && it.url && !seen.has(it.url)) {
        seen.add(it.url);
        out.push({
          url: it.url,
          caption: it.label || it.caption || f.poiName,
          place: f.poiName,
        });
      }
    }
  }
  return out;
}

function normalizeJourneyLog(raw, { layout_variant, collectedImages, route_theme, frames }) {
  const validUrls = new Set(collectedImages.map((i) => i.url));

  const pickUrl = (obj) => {
    const u = obj?.url;
    if (u && (validUrls.has(u) || u.startsWith("http"))) return u;
    return collectedImages[0]?.url || "";
  };

  const heroUrl = pickUrl(raw.hero) || collectedImages[0]?.url || "";
  const hero = {
    url: heroUrl,
    alt: String(raw.hero?.alt || collectedImages[0]?.caption || "旅程主图"),
    caption: String(raw.hero?.caption || collectedImages[0]?.caption || ""),
  };

  let supporting = Array.isArray(raw.supporting) ? raw.supporting : [];
  supporting = supporting
    .map((s, i) => ({
      url: pickUrl(s) || collectedImages[i + 1]?.url || "",
      alt: String(s.alt || s.caption || ""),
      caption: String(s.caption || ""),
    }))
    .filter((s) => s.url)
    .slice(0, 2);

  while (supporting.length < 2 && collectedImages.length > supporting.length + (heroUrl ? 1 : 0)) {
    const idx = supporting.length + (heroUrl ? 1 : 0);
    const img = collectedImages[idx];
    if (!img?.url || supporting.some((s) => s.url === img.url) || img.url === heroUrl) break;
    supporting.push({
      url: img.url,
      alt: img.caption || "",
      caption: img.caption || "",
    });
  }

  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights.map(String).filter(Boolean).slice(0, 4)
    : [];
  while (highlights.length < 4) {
    const f = frames[highlights.length];
    if (f?.poiName) highlights.push(`${f.poiName} · 沿途记录`);
    else highlights.push("—");
  }

  return {
    layout_variant,
    layout_label: LAYOUT_META[layout_variant]?.label || layout_variant,
    title: String(raw.title || route_theme || "城市叙事旅程"),
    subtitle: String(raw.subtitle || ""),
    coordinates: String(raw.coordinates || ""),
    summary: String(raw.summary || raw.full_story?.slice(0, 400) || ""),
    highlights,
    hero,
    heroAlt: hero.alt,
    supporting,
    sections: Array.isArray(raw.sections)
      ? raw.sections.map((s) => ({
          heading: String(s.heading || ""),
          place: String(s.place || ""),
          body: String(s.body || ""),
        }))
      : [],
    full_story: String(raw.full_story || ""),
    journal: {
      title: String(raw.title || route_theme || "城市叙事旅程"),
      subtitle: String(raw.subtitle || ""),
      coordinates: String(raw.coordinates || ""),
      summary: String(raw.summary || ""),
      highlights,
      hero: heroUrl,
      heroAlt: hero.alt,
      supporting: supporting.map((s) => ({
        url: s.url,
        alt: s.alt,
        caption: s.caption,
      })),
    },
  };
}
