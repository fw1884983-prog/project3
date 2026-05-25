import { computeBoundingBox } from "../utils/bbox.js";
import { postOverpass } from "./overpassClient.js";

/**
 * 构建 Overpass QL：在 bbox 内拉取带名称的 POI（旅游、历史、博物馆、纪念物、建筑等）。
 * 使用 union 合并多类 tag，out center 以便 way/relation 也有近似中心点。
 */
function buildOverpassQuery(south, west, north, east) {
  const s = south.toFixed(6);
  const w = west.toFixed(6);
  const n = north.toFixed(6);
  const e = east.toFixed(6);

  return `
[out:json][timeout:90];
(
  nwr["tourism"](${s},${w},${n},${e});
  nwr["historic"](${s},${w},${n},${e});
  nwr["amenity"="museum"](${s},${w},${n},${e});
  nwr["amenity"="arts_centre"](${s},${w},${n},${e});
  nwr["amenity"="theatre"](${s},${w},${n},${e});
  nwr["leisure"="park"]["name"](${s},${w},${n},${e});
  nwr["building"]["name"](${s},${w},${n},${e});
);
out center tags;
`;
}

function pickCenter(element) {
  if (element.type === "node" && element.lat != null && element.lon != null) {
    return { lat: element.lat, lon: element.lon };
  }
  if (element.center && element.center.lat != null && element.center.lon != null) {
    return { lat: element.center.lat, lon: element.center.lon };
  }
  return null;
}

/**
 * 将 Overpass 元素规范为原始 POI 列表（仅空间材料，不做语义加工）。
 */
function normalizeElements(elements) {
  const list = [];
  if (!Array.isArray(elements)) return list;

  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags["name:zh"] || tags["name:en"];
    if (!name) continue;

    const pos = pickCenter(el);
    if (!pos) continue;

    const id = `${el.type}/${el.id}`;
    list.push({
      id,
      osmType: el.type,
      osmId: el.id,
      name: String(name).trim(),
      lat: pos.lat,
      lon: pos.lon,
      tags: { ...tags },
    });
  }

  // 按 id 去重（部分元素可能重复出现在结果中）
  const seen = new Set();
  return list.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} radiusKm
 * @returns {Promise<{ bbox: object, pois: Array<{id,name,lat,lon,tags}> }>}
 */
async function runOverpassQuery(bbox) {
  const query = buildOverpassQuery(bbox.south, bbox.west, bbox.north, bbox.east);
  const json = await postOverpass(query);
  return normalizeElements(json.elements);
}

export async function fetchPoisInRadius(lat, lon, radiusKm) {
  const bbox = computeBoundingBox(lat, lon, radiusKm);
  const pois = await runOverpassQuery(bbox);
  return { bbox, pois };
}

/** 廊道 bbox 内 POI（沿路叙事用） */
export async function fetchPoisInBbox(bbox) {
  const pois = await runOverpassQuery(bbox);
  return { bbox, pois };
}
