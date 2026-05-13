/**
 * OSRM 路网路径（支持 foot / driving）。
 * 无人驾驶出租车 MVP 使用 driving profile。
 */
const DEFAULT_OSRM = "https://router.project-osrm.org";

function buildCoordsParam(waypoints) {
  return waypoints.map((w) => `${w.lon},${w.lat}`).join(";");
}

/**
 * @param {'foot'|'driving'} profile
 * @param {{ lat: number, lon: number }[]} waypoints
 */
async function routeOsrm(profile, waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return {
      feature: null,
      distance_m: 0,
      duration_s: 0,
      error: waypoints?.length === 1 ? "单点无法做路网路径" : undefined,
    };
  }

  const base = (process.env.OSRM_BASE_URL || DEFAULT_OSRM).replace(/\/$/, "");
  const coords = buildCoordsParam(waypoints);
  const url = `${base}/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=false`;

  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "UrbanNarrativeGenerator/1.0 (routing)" },
    });
  } catch (e) {
    const msg = e?.cause?.code || e?.message || String(e);
    return {
      feature: straightLineFallback(waypoints, profile),
      distance_m: 0,
      duration_s: 0,
      error: `OSRM 连接失败，已退回直线示意：${msg}`,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      feature: straightLineFallback(waypoints, profile),
      distance_m: 0,
      duration_s: 0,
      error: `OSRM HTTP ${res.status}，已退回直线示意：${text.slice(0, 120)}`,
    };
  }

  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.[0]?.geometry) {
    return {
      feature: straightLineFallback(waypoints, profile),
      distance_m: 0,
      duration_s: 0,
      error: `OSRM 未返回有效路线（${data.code || "unknown"}），已退回直线示意`,
    };
  }

  const route = data.routes[0];
  const geometry = route.geometry;
  const distance_m = Math.round(route.distance || 0);
  const duration_s = Math.round(route.duration || 0);

  return {
    feature: {
      type: "Feature",
      properties: {
        kind: `osrm_${profile}_route`,
        distance_m,
        duration_s,
        profile,
      },
      geometry,
    },
    distance_m,
    duration_s,
  };
}

function straightLineFallback(waypoints, profile) {
  const coordinates = waypoints.map((w) => [w.lon, w.lat]);
  return {
    type: "Feature",
    properties: { kind: "straight_fallback", distance_m: 0, duration_s: 0, profile },
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

/** 叙事多段步行衔接（保留给 /generate-narrative） */
export function routeFootWaypoints(waypoints) {
  return routeOsrm("foot", waypoints);
}

/** 起点—终点 车行（类似打车软件路网） */
export function routeDrivingWaypoints(waypoints) {
  return routeOsrm("driving", waypoints);
}
