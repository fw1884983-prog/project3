/**
 * 根据中心点与半径（km）计算 Overpass 使用的 bounding box。
 * 使用近似：纬度 1° ≈ 111km；经度随纬度缩放。
 */
export function computeBoundingBox(lat, lon, radiusKm) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  const r = Number(radiusKm);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum) || !Number.isFinite(r) || r <= 0) {
    throw new Error("无效的 lat、lon 或 radiusKm");
  }
  if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    throw new Error("经纬度超出有效范围");
  }

  const deltaLat = r / 111;
  const cosLat = Math.cos((latNum * Math.PI) / 180);
  const safeCos = Math.abs(cosLat) < 0.01 ? 0.01 : cosLat;
  const deltaLon = r / (111 * safeCos);

  return {
    south: latNum - deltaLat,
    north: latNum + deltaLat,
    west: lonNum - deltaLon,
    east: lonNum + deltaLon,
  };
}
