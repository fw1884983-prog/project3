/** Haversine 距离（米） */
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

/** 是否在运营圆内（与后端 isInsideRadiusKm 一致） */
export function isInsideStudy(lat, lon, study, toleranceM = 20) {
  if (!study?.center) return false;
  const d = haversineMeters(study.center.lat, study.center.lon, lat, lon);
  return d <= study.radiusKm * 1000 + toleranceM;
}
