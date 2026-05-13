import { computeBoundingBox } from "../utils/bbox.js";
import { circlePolygonGeoJson } from "../utils/circleGeoJson.js";

/**
 * 运营研究区：默认东方明珠 + 2km（可通过环境变量覆盖，便于部署）。
 */
export function getStudyAreaConfig() {
  const lat = parseFloat(process.env.STUDY_CENTER_LAT || "31.2397");
  const lon = parseFloat(process.env.STUDY_CENTER_LON || "121.4996");
  const radiusKm = parseFloat(process.env.STUDY_RADIUS_KM || "2");

  if (![lat, lon, radiusKm].every((n) => Number.isFinite(n)) || radiusKm <= 0 || radiusKm > 50) {
    throw new Error("无效的研究区配置（STUDY_CENTER_LAT/LON 或 STUDY_RADIUS_KM）");
  }

  const bbox = computeBoundingBox(lat, lon, radiusKm);
  const study_area_circle = circlePolygonGeoJson(lon, lat, radiusKm);

  /** 略大于 bbox，保证 maxBounds 下仍能看到圆边界，但不可把视野拖到市区外 */
  const padLat = (bbox.north - bbox.south) * 0.04;
  const padLon = (bbox.east - bbox.west) * 0.04;
  const max_bounds = [
    [bbox.west - padLon, bbox.south - padLat],
    [bbox.east + padLon, bbox.north + padLat],
  ];

  return {
    label: process.env.STUDY_LABEL || "东方明珠周边",
    center: { lat, lon },
    radiusKm,
    bbox,
    study_area_circle,
    max_bounds,
  };
}
