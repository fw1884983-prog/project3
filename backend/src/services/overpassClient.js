import { fetchWithTimeout } from "../utils/fetchWithTimeout.js";

/**
 * Overpass 公共实例（国内直连常超时，可多端点依次重试）。
 * 可用环境变量覆盖：
 * - OVERPASS_URL：单一完整地址，如 https://overpass-api.de/api/interpreter
 * - OVERPASS_URLS：多个地址用英文逗号分隔，会按顺序尝试
 */
const DEFAULT_OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];

function getOverpassUrls() {
  const single = (process.env.OVERPASS_URL || "").trim();
  const multi = (process.env.OVERPASS_URLS || "").trim();
  if (multi) {
    return multi.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (single) return [single];
  return [...DEFAULT_OVERPASS_URLS];
}

const OVERPASS_TIMEOUT_MS = Math.min(
  120000,
  Math.max(15000, Number(process.env.OVERPASS_TIMEOUT_MS) || 55000)
);

export async function postOverpass(query) {
  const urls = getOverpassUrls();
  let lastErr = null;

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "UrbanNarrativeGenerator/1.0 (MVP)",
          },
        },
        OVERPASS_TIMEOUT_MS
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        lastErr = new Error(`Overpass HTTP ${res.status} @ ${hostOf(url)}：${text.slice(0, 160)}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      const code = e?.cause?.code || e?.name;
      const msg = e?.message || String(e);
      lastErr = new Error(`${code || msg} @ ${hostOf(url)}`);
    }
  }

  const detail = lastErr?.message || "unknown";
  throw new Error(
    `无法连接 Overpass（已尝试 ${urls.length} 个端点，最后：${detail}）。` +
      `多为网络超时或被墙：可换网络/VPN，或在 .env 设置 OVERPASS_URL 指向你可访问的实例。`
  );
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
