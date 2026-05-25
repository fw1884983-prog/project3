import { reloadEnv } from "../utils/llmClient.js";

const PEXELS_SEARCH = "https://api.pexels.com/v1/search";

function getPexelsApiKey() {
  reloadEnv();
  const key = (process.env.PEXELS_API_KEY || "").trim();
  if (!key || key.includes("your-")) {
    throw new Error("未配置 PEXELS_API_KEY。请在 backend/.env 添加 Pexels API Key 并保存。");
  }
  return key;
}

/**
 * 按关键词搜索 Pexels，返回百科/胶卷可用的图片列表。
 */
export async function searchPexelsForKeywords(keywords = [], { perQuery = 2, maxTotal = 8 } = {}) {
  const queries = [...new Set((keywords || []).map((k) => String(k).trim()).filter(Boolean))].slice(0, 6);
  if (queries.length === 0) return [];

  const apiKey = getPexelsApiKey();
  const seen = new Set();
  const out = [];

  for (const query of queries) {
    if (out.length >= maxTotal) break;
    try {
      const url = new URL(PEXELS_SEARCH);
      url.searchParams.set("query", query);
      url.searchParams.set("per_page", String(Math.min(15, perQuery)));
      url.searchParams.set("orientation", "landscape");

      const res = await fetch(url, {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[pexels] ${query} → ${res.status}`, errText.slice(0, 120));
        continue;
      }

      const data = await res.json();
      for (const photo of data.photos || []) {
        const imgUrl = photo.src?.large || photo.src?.medium || photo.src?.original;
        if (!imgUrl || seen.has(imgUrl)) continue;
        seen.add(imgUrl);
        out.push({
          url: imgUrl,
          caption: photo.alt || query,
          credit: `Pexels · ${photo.photographer || "Contributor"}`,
          photographer: photo.photographer,
          pexels_url: photo.url,
          search_query: query,
        });
        if (out.length >= maxTotal) break;
      }
    } catch (e) {
      console.warn(`[pexels] search failed for "${query}":`, e.message);
    }
  }

  return out;
}
