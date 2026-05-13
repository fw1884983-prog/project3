import express from "express";
import { geocodePlaceName } from "../utils/geocode.js";
import { computeBoundingBox } from "../utils/bbox.js";
import { circlePolygonGeoJson } from "../utils/circleGeoJson.js";
import { getStudyAreaConfig } from "../config/studyArea.js";
import { isInsideRadiusKm } from "../utils/geo.js";
import { fetchPoisInRadius } from "../services/overpassService.js";
import { runNarrativePipeline } from "../services/narrativeService.js";
import { routeDrivingWaypoints } from "../services/routingService.js";

export const narrativeRouter = express.Router();

/**
 * GET /study-config
 * 返回固定运营区（默认东方明珠 2km）的 bbox、圆多边形、max_bounds，供前端锁视角与禁选区外点击。
 */
narrativeRouter.get("/study-config", (_req, res) => {
  try {
    res.json(getStudyAreaConfig());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "服务器错误" });
  }
});

/**
 * POST /plan-driving-route
 * body: { start: { lat, lon }, end: { lat, lon } }
 * OSRM driving（类似打车软件路网）；起终点必须在运营圆内。
 */
narrativeRouter.post("/plan-driving-route", async (req, res) => {
  try {
    const study = getStudyAreaConfig();
    const { start, end } = req.body || {};
    const sLat = Number(start?.lat);
    const sLon = Number(start?.lon);
    const eLat = Number(end?.lat);
    const eLon = Number(end?.lon);

    if (![sLat, sLon, eLat, eLon].every(Number.isFinite)) {
      return res.status(400).json({ error: "请提供 start 与 end 的 lat、lon（数字）" });
    }

    if (!isInsideRadiusKm(sLat, sLon, study.center.lat, study.center.lon, study.radiusKm)) {
      return res.status(400).json({ error: "起点不在运营圆域内（东方明珠周边 2km）" });
    }
    if (!isInsideRadiusKm(eLat, eLon, study.center.lat, study.center.lon, study.radiusKm)) {
      return res.status(400).json({ error: "终点不在运营圆域内（东方明珠周边 2km）" });
    }

    const same =
      Math.abs(sLat - eLat) < 1e-7 &&
      Math.abs(sLon - eLon) < 1e-7;
    if (same) {
      return res.status(400).json({ error: "起点与终点不能为同一点" });
    }

    const routed = await routeDrivingWaypoints([
      { lat: sLat, lon: sLon },
      { lat: eLat, lon: eLon },
    ]);

    res.json({
      study,
      start: { lat: sLat, lon: sLon },
      end: { lat: eLat, lon: eLon },
      route_geojson: routed.feature,
      route_distance_m: routed.distance_m,
      route_duration_s: routed.duration_s,
      route_error: routed.error || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "服务器错误" });
  }
});

/**
 * POST /fetch-poi
 * body: { placeName?: string, lat?: number, lon?: number, radiusKm: number }
 */
narrativeRouter.post("/fetch-poi", async (req, res) => {
  try {
    const { placeName, lat, lon, radiusKm } = req.body || {};
    const r = Number(radiusKm);
    if (!Number.isFinite(r) || r <= 0 || r > 50) {
      return res.status(400).json({ error: "radiusKm 须为 (0, 50] 的数字" });
    }

    let centerLat = lat != null ? Number(lat) : null;
    let centerLon = lon != null ? Number(lon) : null;
    let label = "";

    if (placeName && String(placeName).trim()) {
      const geo = await geocodePlaceName(placeName);
      centerLat = geo.lat;
      centerLon = geo.lon;
      label = geo.displayName;
    }

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
      return res.status(400).json({ error: "请提供 placeName，或同时提供有效的 lat 与 lon" });
    }

    const bbox = computeBoundingBox(centerLat, centerLon, r);
    const { pois } = await fetchPoisInRadius(centerLat, centerLon, r);

    res.json({
      center: { lat: centerLat, lon: centerLon, label: label || undefined },
      radiusKm: r,
      bbox,
      count: pois.length,
      pois,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "服务器错误" });
  }
});

/**
 * POST /generate-narrative
 * body: { placeName?: string, lat?: number, lon?: number, radiusKm: number }
 */
narrativeRouter.post("/generate-narrative", async (req, res) => {
  try {
    const { placeName, lat, lon, radiusKm } = req.body || {};
    const r = Number(radiusKm);
    if (!Number.isFinite(r) || r <= 0 || r > 50) {
      return res.status(400).json({ error: "radiusKm 须为 (0, 50] 的数字" });
    }

    let centerLat = lat != null ? Number(lat) : null;
    let centerLon = lon != null ? Number(lon) : null;
    let areaLabel = "";

    if (placeName && String(placeName).trim()) {
      const geo = await geocodePlaceName(placeName);
      centerLat = geo.lat;
      centerLon = geo.lon;
      areaLabel = geo.displayName;
    }

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
      return res.status(400).json({ error: "请提供 placeName，或同时提供有效的 lat 与 lon" });
    }

    const bbox = computeBoundingBox(centerLat, centerLon, r);
    const { pois } = await fetchPoisInRadius(centerLat, centerLon, r);

    const result = await runNarrativePipeline({
      areaLabel: areaLabel || `中心 (${centerLat.toFixed(5)}, ${centerLon.toFixed(5)}) 半径 ${r}km`,
      bbox,
      pois,
    });

    const studyCircle = circlePolygonGeoJson(centerLon, centerLat, r);
    const waypoints = (result.nodes || []).map((n) => ({ lat: n.lat, lon: n.lon }));
    const routed = await routeDrivingWaypoints(waypoints);

    res.json({
      center: { lat: centerLat, lon: centerLon },
      radiusKm: r,
      bbox,
      study_area_circle: studyCircle,
      route_geojson: routed.feature,
      route_distance_m: routed.distance_m,
      route_duration_s: routed.duration_s,
      route_error: routed.error || null,
      ...result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "服务器错误" });
  }
});
