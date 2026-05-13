/**
 * 以 (lon, lat) 为中心、radiusKm 为半径，在球面近似下生成 GeoJSON Polygon（闭合环）。
 * 用于地图上绘制研究范围圆域。
 */
export function circlePolygonGeoJson(lon, lat, radiusKm, steps = 72) {
  const lon0 = Number(lon);
  const lat0 = Number(lat);
  const rKm = Number(radiusKm);
  if (![lon0, lat0, rKm].every((n) => Number.isFinite(n)) || rKm <= 0) {
    throw new Error("无效的圆参数");
  }

  const R = 6371;
  const lat1 = (lat0 * Math.PI) / 180;
  const lon1 = (lon0 * Math.PI) / 180;
  const d = rKm / R;
  const ring = [];

  for (let i = 0; i <= steps; i++) {
    const brng = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
      );
    ring.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }

  return {
    type: "Feature",
    properties: { kind: "study_circle", radiusKm: rKm },
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
}
