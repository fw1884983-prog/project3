import { haversineMeters } from "./geo.js";

/** LineString coordinates [[lon, lat], ...] → 累计距离（米） */
export function cumulativeDistances(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const [lon0, lat0] = coords[i - 1];
    const [lon1, lat1] = coords[i];
    cum.push(cum[i - 1] + haversineMeters(lat0, lon0, lat1, lon1));
  }
  return cum;
}

/** progress 0~1 → { lat, lon, progress } */
export function interpolateAlongRoute(coords, cum, progress) {
  if (!coords?.length) return null;
  const total = cum[cum.length - 1] || 0;
  if (total <= 0) {
    const [lon, lat] = coords[0];
    return { lat, lon, progress: 0 };
  }
  const target = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 1; i < coords.length; i++) {
    if (cum[i] >= target) {
      const segLen = cum[i] - cum[i - 1];
      const t = segLen > 0 ? (target - cum[i - 1]) / segLen : 0;
      const [lon0, lat0] = coords[i - 1];
      const [lon1, lat1] = coords[i];
      return {
        lat: lat0 + (lat1 - lat0) * t,
        lon: lon0 + (lon1 - lon0) * t,
        progress: target / total,
      };
    }
  }
  const [lon, lat] = coords[coords.length - 1];
  return { lat, lon, progress: 1 };
}

/** 将地图上的点投影到折线，返回 progress 0~1 */
export function projectPointToRoute(coords, cum, lat, lon) {
  if (!coords?.length) return 0;
  const total = cum[cum.length - 1] || 0;
  if (total <= 0) return 0;

  let bestDist = Infinity;
  let bestAlong = 0;

  for (let i = 1; i < coords.length; i++) {
    const [lon0, lat0] = coords[i - 1];
    const [lon1, lat1] = coords[i];
    const segLen = cum[i] - cum[i - 1];
    if (segLen <= 0) continue;

    const dx = lon1 - lon0;
    const dy = lat1 - lat0;
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-14 ? 0 : clamp(((lon - lon0) * dx + (lat - lat0) * dy) / len2, 0, 1);
    const projLat = lat0 + (lat1 - lat0) * t;
    const projLon = lon0 + (lon1 - lon0) * t;
    const d = haversineMeters(lat, lon, projLat, projLon);
    if (d < bestDist) {
      bestDist = d;
      bestAlong = cum[i - 1] + t * segLen;
    }
  }
  return bestAlong / total;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** 根据车辆位置选取触发的叙事 POI */
export function pickTriggeredPoi(vehicle, pois, { triggerM = 140, minScore = 0 } = {}) {
  if (!vehicle || !Array.isArray(pois) || pois.length === 0) return null;

  let best = null;
  let bestScore = minScore;

  for (const p of pois) {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const d = haversineMeters(vehicle.lat, vehicle.lon, lat, lon);
    if (d > triggerM) continue;

    const imp = Number(p.importance_score) || 0;
    const importantBoost = p.important ? 12 : 0;
    const proximity = Math.max(0, 1 - d / triggerM);
    const score = proximity * 40 + imp * 3 + importantBoost;

    if (score > bestScore) {
      bestScore = score;
      best = { poi: p, distance_m: Math.round(d), trigger_score: score };
    }
  }
  return best;
}

/** 按路线顺序对 POI 排序（投影到折线的 progress） */
export function sortPoisAlongRoute(coords, cum, pois) {
  const total = cum[cum.length - 1] || 1;
  return [...pois]
    .map((p) => ({
      ...p,
      _progress: projectPointToRoute(coords, cum, Number(p.lat), Number(p.lon)),
    }))
    .sort((a, b) => a._progress - b._progress);
}

export function nearbyPoisFor(poi, all, limit = 5) {
  const lat = Number(poi.lat);
  const lon = Number(poi.lon);
  return all
    .filter((p) => p.id !== poi.id)
    .map((p) => ({
      name: p.name,
      distance_m: Math.round(haversineMeters(lat, lon, Number(p.lat), Number(p.lon))),
    }))
    .filter((p) => p.distance_m < 800)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);
}
