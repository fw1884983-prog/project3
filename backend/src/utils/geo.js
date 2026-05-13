/**
 * Haversine 球面距离（米）
 */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * 点是否在「以 center 为圆心、radiusKm 为半径」的圆内（含容差，便于贴边点击）
 */
export function isInsideRadiusKm(lat, lon, centerLat, centerLon, radiusKm, toleranceM = 20) {
  const d = haversineMeters(centerLat, centerLon, lat, lon);
  return d <= radiusKm * 1000 + toleranceM;
}
