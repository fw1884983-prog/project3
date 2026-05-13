const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/**
 * 使用 Nominatim 将地名解析为坐标（需遵守 OSM 使用政策：合理 User-Agent）。
 */
export async function geocodePlaceName(query, { language = "zh" } = {}) {
  const q = String(query || "").trim();
  if (!q) {
    throw new Error("地名为空");
  }

  const url = new URL(NOMINATIM);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", language);

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "UrbanNarrativeGenerator/1.0 (academic MVP; contact: local-dev)",
      },
    });
  } catch (e) {
    const msg = e?.cause?.code || e?.message || String(e);
    throw new Error(`无法连接 Nominatim（地理编码）：${msg}。请检查网络或代理。`);
  }

  if (!res.ok) {
    throw new Error(`Nominatim 请求失败: ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`未找到地点: ${q}`);
  }

  const hit = data[0];
  const lat = parseFloat(hit.lat);
  const lon = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("解析坐标失败");
  }

  return {
    lat,
    lon,
    displayName: hit.display_name || q,
    osmType: hit.osm_type,
    osmId: hit.osm_id,
  };
}
