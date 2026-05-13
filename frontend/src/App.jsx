import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { isInsideStudy } from "./geo.js";
import "./App.css";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

async function fetchStudyConfig() {
  let res;
  try {
    res = await fetch("/study-config");
  } catch (e) {
    const msg = e?.message || String(e);
    throw new Error(
      `连不上后端（${msg}）。请先在「backend」目录执行 npm run dev（默认 http://localhost:3040），再开前端；并确认后端已启动。`
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error ||
        `加载运营区失败（HTTP ${res.status}）。若用 vite preview，请确认 vite.config 已配置 preview.proxy；开发请用 npm run dev。`
    );
  }
  return data;
}

async function postPlanRoute(start, end) {
  const res = await fetch("/plan-driving-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: { lat: start.lat, lon: start.lon },
      end: { lat: end.lat, lon: end.lon },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `规划失败 (${res.status})`);
  return data;
}

function applyViewportLock(map, study) {
  if (!map || !study?.bbox || !study?.max_bounds) return;
  const run = () => {
    try {
      map.setMaxBounds(study.max_bounds);
      map.fitBounds(
        [
          [study.bbox.west, study.bbox.south],
          [study.bbox.east, study.bbox.north],
        ],
        { padding: 28, maxZoom: 16, duration: 0 }
      );
      const onIdle = () => {
        try {
          const z = map.getZoom();
          map.setMinZoom(Math.max(z - 0.9, 12.9));
          map.setMaxZoom(18);
        } catch {
          /* ignore */
        }
        map.off("idle", onIdle);
      };
      map.once("idle", onIdle);
    } catch {
      /* ignore */
    }
  };
  if (map.isStyleLoaded?.()) run();
  else map.once("load", run);
}

export default function App() {
  const mapRef = useRef(null);
  const studyRef = useRef(null);
  const hintTimerRef = useRef(0);
  const [study, setStudy] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [pickMode, setPickMode] = useState(null);
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");

  studyRef.current = study;

  useEffect(() => {
    fetchStudyConfig()
      .then(setStudy)
      .catch((e) => setLoadErr(e.message || String(e)));
  }, []);

  const studyFc = useMemo(() => {
    if (!study?.study_area_circle) return null;
    return { type: "FeatureCollection", features: [study.study_area_circle] };
  }, [study]);

  const routeFc = useMemo(() => {
    if (!route?.route_geojson?.geometry) return null;
    return { type: "FeatureCollection", features: [route.route_geojson] };
  }, [route]);

  const tryLockViewport = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    const cfg = studyRef.current;
    if (map && cfg) applyViewportLock(map, cfg);
  }, []);

  const onMapLoad = useCallback(() => {
    tryLockViewport();
  }, [tryLockViewport]);

  useEffect(() => {
    tryLockViewport();
  }, [study, tryLockViewport]);

  const flashHint = useCallback((msg) => {
    setHint(msg);
    window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setHint(""), 2800);
  }, []);

  const onMapClick = useCallback(
    (e) => {
      const cfg = studyRef.current;
      if (!cfg || !pickMode) return;
      const { lat, lng } = e.lngLat;
      if (!isInsideStudy(lat, lng, cfg)) {
        flashHint("只能在蓝色运营圆内选点");
        return;
      }
      const pt = { lat, lon: lng };
      if (pickMode === "start") {
        setStart(pt);
        flashHint("已设置起点");
        setPickMode(null);
      } else if (pickMode === "end") {
        setEnd(pt);
        flashHint("已设置终点");
        setPickMode(null);
      }
    },
    [pickMode, flashHint]
  );

  const handlePlan = async () => {
    if (!start || !end) {
      flashHint("请先设置起点和终点");
      return;
    }
    setLoading(true);
    setRoute(null);
    try {
      const data = await postPlanRoute(start, end);
      setRoute(data);
    } catch (err) {
      flashHint(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setStart(null);
    setEnd(null);
    setRoute(null);
    setPickMode(null);
    flashHint("已清除选点与路线");
  };

  const km = route?.route_distance_m != null ? (route.route_distance_m / 1000).toFixed(2) : null;
  const min = route?.route_duration_s != null ? Math.ceil(route.route_duration_s / 60) : null;

  const initialView = study
    ? {
        latitude: study.center.lat,
        longitude: study.center.lon,
        zoom: 13.35,
        bearing: 0,
        pitch: 0,
      }
    : { latitude: 31.2397, longitude: 121.4996, zoom: 13.35, bearing: 0, pitch: 0 };

  return (
    <div className={`map-wrap${pickMode ? " is-picking" : ""}`}>
      {loadErr ? (
        <div className="fatal-banner">{loadErr}</div>
      ) : null}

      <Map
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={initialView}
        onLoad={onMapLoad}
        onClick={onMapClick}
        className="map"
        mapStyle={MAP_STYLE}
        dragRotate={false}
        touchPitch={false}
        maxPitch={0}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />

        {studyFc ? (
          <Source id="study-area" type="geojson" data={studyFc}>
            <Layer
              id="study-fill"
              type="fill"
              paint={{ "fill-color": "#1d4ed8", "fill-opacity": 0.1 }}
            />
            <Layer
              id="study-outline"
              type="line"
              paint={{
                "line-color": "#1e3a8a",
                "line-width": 2.5,
                "line-dasharray": [1.2, 1.8],
              }}
            />
          </Source>
        ) : null}

        {routeFc ? (
          <Source id="drive-route" type="geojson" data={routeFc}>
            <Layer
              id="route-glow"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#0ea5e9",
                "line-width": 12,
                "line-opacity": 0.22,
              }}
            />
            <Layer
              id="route-core"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#0369a1",
                "line-width": 5,
                "line-opacity": 0.95,
              }}
            />
          </Source>
        ) : null}

        {start ? (
          <Marker longitude={start.lon} latitude={start.lat} anchor="center">
            <div className="pin pin-start" title="起点">
              A
            </div>
          </Marker>
        ) : null}
        {end ? (
          <Marker longitude={end.lon} latitude={end.lat} anchor="center">
            <div className="pin pin-end" title="终点">
              B
            </div>
          </Marker>
        ) : null}
      </Map>

      <div className="hud">
        <div className="hud-title">
          <h1>运营区内 · 车行路径规划</h1>
          <p>
            范围：<strong>{study?.label || "东方明珠周边"}</strong> 半径 <strong>{study?.radiusKm ?? 2} km</strong>。
            先点按钮再点地图设置 <strong>A 起点 / B 终点</strong>；圆外点击无效。路线为 OSRM <strong>driving</strong>（类似打车软件路网）。
          </p>
          {hint ? <p className="hint-line">{hint}</p> : null}
          {route?.route_error ? (
            <p className="route-meta warn">路径引擎：{route.route_error}</p>
          ) : km != null ? (
            <p className="route-meta">
              本次路网约 <strong>{km} km</strong>
              {min != null ? ` · 车行估算约 ${min} 分钟` : ""}
            </p>
          ) : null}
        </div>
        <div className="hud-actions">
          <button
            type="button"
            className={`btn ${pickMode === "start" ? "btn-active" : "btn-ghost"}`}
            onClick={() => setPickMode(pickMode === "start" ? null : "start")}
          >
            {pickMode === "start" ? "正在选起点…" : "设起点 A"}
          </button>
          <button
            type="button"
            className={`btn ${pickMode === "end" ? "btn-active" : "btn-ghost"}`}
            onClick={() => setPickMode(pickMode === "end" ? null : "end")}
          >
            {pickMode === "end" ? "正在选终点…" : "设终点 B"}
          </button>
          <button type="button" className="btn btn-primary" disabled={loading} onClick={handlePlan}>
            {loading ? "规划中…" : "规划车行路线"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleClear}>
            清除
          </button>
          <button type="button" className="btn btn-ghost" onClick={tryLockViewport}>
            重置视野
          </button>
        </div>
      </div>
    </div>
  );
}
