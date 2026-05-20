/**
 * 由 LineString 坐标 [[lon,lat],...] 计算带缓冲的 bbox，并可夹在研究区 bbox 内。
 */
export function bboxFromLineString(coords, padMeters = 300) {
  if (!Array.isArray(coords) || coords.length === 0) {
    throw new Error("路线坐标为空");
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const c of coords) {
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  if (!Number.isFinite(minLat)) {
    throw new Error("无法解析路线坐标");
  }
  const midLat = (minLat + maxLat) / 2;
  const padLat = padMeters / 111000;
  const cos = Math.max(0.2, Math.abs(Math.cos((midLat * Math.PI) / 180)));
  const padLon = padMeters / (111000 * cos);
  return {
    south: minLat - padLat,
    north: maxLat + padLat,
    west: minLon - padLon,
    east: maxLon + padLon,
  };
}

export function clampBbox(inner, outer) {
  if (!inner || !outer) return inner;
  const south = Math.max(inner.south, outer.south);
  const north = Math.min(inner.north, outer.north);
  const west = Math.max(inner.west, outer.west);
  const east = Math.min(inner.east, outer.east);
  if (south >= north || west >= east) {
    throw new Error("路径廊道与研究区无重叠");
  }
  return { south, north, west, east };
}
