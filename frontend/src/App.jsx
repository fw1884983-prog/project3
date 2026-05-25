import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { isInsideStudy } from "./geo.js";
import {
  cumulativeDistances,
  interpolateAlongRoute,
  pickTriggeredPoi,
  nearbyPoisFor,
} from "./routeGeometry.js";
import KeywordRail from "./components/KeywordRail.jsx";
import EncyclopediaPanel from "./components/EncyclopediaPanel.jsx";
import RouteTimeline from "./components/RouteTimeline.jsx";
import JourneyFilmstrip from "./components/JourneyFilmstrip.jsx";
import JourneySettleModal from "./components/JourneySettleModal.jsx";
import "./App.css";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

async function fetchStudyConfig() {
  const res = await fetch("/study-config");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `加载失败 ${res.status}`);
  return data;
}

async function postPlanRoute(start, end) {
  let res;
  try {
    res = await fetch("/plan-driving-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end }),
    });
  } catch (e) {
    throw new Error(`连接中断：${e.message}。请确认 backend 在 3040 运行。`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `规划失败 ${res.status}`);
  return data;
}

async function postNarrativeForRoute(payload) {
  const res = await fetch("/narrative-for-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `叙事分析失败 ${res.status}`);
  return data;
}

async function postEncyclopedia(body) {
  const res = await fetch("/narrative-encyclopedia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `百科失败 ${res.status}`);
  return data;
}

async function postEncyclopediaExpand(body) {
  const res = await fetch("/narrative-encyclopedia-expand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `展开失败 ${res.status}`);
  return data;
}

async function postSettleLog(frames, route_theme) {
  const res = await fetch("/journey-log-settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frames, route_theme }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `结算失败 ${res.status}`);
  return data;
}

function applyViewportLock(map, study) {
  if (!map || !study?.bbox || !study?.max_bounds) return;
  const run = () => {
    map.setMaxBounds(study.max_bounds);
    map.fitBounds(
      [
        [study.bbox.west, study.bbox.south],
        [study.bbox.east, study.bbox.north],
      ],
      { padding: 28, maxZoom: 16, duration: 0 }
    );
  };
  if (map.isStyleLoaded?.()) run();
  else map.once("load", run);
}

function newFrameId() {
  return `fr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function App() {
  const mapRef = useRef(null);
  const studyRef = useRef(null);
  const hintTimerRef = useRef(0);
  const encAbortRef = useRef(null);
  const lastPoiRef = useRef(null);

  const [study, setStudy] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [pickMode, setPickMode] = useState(null);
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [hint, setHint] = useState("");

  const [narrativeResult, setNarrativeResult] = useState(null);
  const [routeProgress, setRouteProgress] = useState(0);

  const [triggeredPoi, setTriggeredPoi] = useState(null);
  const [encyclopediaCard, setEncyclopediaCard] = useState(null);
  const [encyclopediaLoading, setEncyclopediaLoading] = useState(false);
  const [encyclopediaExpandLoading, setEncyclopediaExpandLoading] = useState(false);
  const [encyclopediaError, setEncyclopediaError] = useState("");

  const [filmFrames, setFilmFrames] = useState([]);
  const [activeFrameId, setActiveFrameId] = useState(null);
  const [settleLog, setSettleLog] = useState(null);
  const [settling, setSettling] = useState(false);

  studyRef.current = study;

  const routeLine = useMemo(() => {
    const g = route?.route_geojson?.geometry;
    if (g?.type === "LineString" && Array.isArray(g.coordinates)) return g.coordinates;
    return null;
  }, [route]);

  const routeCum = useMemo(() => (routeLine ? cumulativeDistances(routeLine) : null), [routeLine]);

  const timelineReady = Boolean(route?.route_geojson && narrativeResult?.pois_analyzed?.length);

  const vehiclePos = useMemo(() => {
    if (!timelineReady || !routeLine || !routeCum) return null;
    return interpolateAlongRoute(routeLine, routeCum, routeProgress);
  }, [timelineReady, routeLine, routeCum, routeProgress]);

  const narrativePois = useMemo(() => {
    const list = narrativeResult?.pois_analyzed;
    if (!Array.isArray(list)) return [];
    return list.filter((p) => p?.name && Number.isFinite(Number(p.lat)));
  }, [narrativeResult]);

  const activeKeywords = useMemo(() => {
    if (!triggeredPoi) return [];
    return encyclopediaCard?.keywords?.length
      ? encyclopediaCard.keywords
      : triggeredPoi.cultural_tags?.length
        ? triggeredPoi.cultural_tags
        : [triggeredPoi.name];
  }, [triggeredPoi, encyclopediaCard]);

  const inTrigger = Boolean(triggeredPoi);

  useEffect(() => {
    fetchStudyConfig().then(setStudy).catch((e) => setLoadErr(e.message));
  }, []);

  const studyFc = useMemo(() => {
    if (!study?.study_area_circle) return null;
    return { type: "FeatureCollection", features: [study.study_area_circle] };
  }, [study]);

  const routeFc = useMemo(() => {
    if (!route?.route_geojson?.geometry) return null;
    return { type: "FeatureCollection", features: [route.route_geojson] };
  }, [route]);

  const flashHint = useCallback((msg) => {
    setHint(msg);
    window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setHint(""), 3200);
  }, []);

  const appendFrameForPoi = useCallback((poi, progress) => {
    setFilmFrames((prev) => {
      if (prev.some((f) => f.poiId === poi.id)) return prev;
      const frame = {
        id: newFrameId(),
        poiId: poi.id,
        poiName: poi.name,
        progress,
        items: [],
      };
      setActiveFrameId(frame.id);
      return [...prev, frame];
    });
  }, []);

  const loadEncyclopedia = useCallback(
    async (poi) => {
      encAbortRef.current?.abort();
      const ac = new AbortController();
      encAbortRef.current = ac;
      setEncyclopediaLoading(true);
      setEncyclopediaError("");
      try {
        const data = await postEncyclopedia({
          poi: {
            id: poi.id,
            name: poi.name,
            lat: poi.lat,
            lon: poi.lon,
            tags: poi.tags,
          },
          theme: narrativeResult?.theme,
          narrative_role: poi.narrative_role,
          nearby_pois: nearbyPoisFor(poi, narrativePois),
        });
        if (!ac.signal.aborted) setEncyclopediaCard(data.card);
      } catch (e) {
        if (!ac.signal.aborted) setEncyclopediaError(e.message);
      } finally {
        if (!ac.signal.aborted) setEncyclopediaLoading(false);
      }
    },
    [narrativeResult, narrativePois]
  );

  useEffect(() => {
    if (!timelineReady || !vehiclePos) {
      setTriggeredPoi(null);
      setEncyclopediaCard(null);
      setEncyclopediaError("");
      lastPoiRef.current = null;
      return;
    }

    const hit = pickTriggeredPoi(vehiclePos, narrativePois, { triggerM: 150 });
    if (!hit?.poi) {
      setTriggeredPoi(null);
      setEncyclopediaCard(null);
      setEncyclopediaError("");
      lastPoiRef.current = null;
      return;
    }

    const poi = hit.poi;
    setTriggeredPoi(poi);

    if (lastPoiRef.current !== poi.id) {
      lastPoiRef.current = poi.id;
      appendFrameForPoi(poi, routeProgress);
      loadEncyclopedia(poi);
    }
  }, [vehiclePos, narrativePois, timelineReady, routeProgress, appendFrameForPoi, loadEncyclopedia]);

  const handleDropKeywordOnEncyclopedia = async (keyword) => {
    if (!triggeredPoi) return;
    setEncyclopediaExpandLoading(true);
    setEncyclopediaError("");
    try {
      const data = await postEncyclopediaExpand({
        poi: {
          id: triggeredPoi.id,
          name: triggeredPoi.name,
          lat: triggeredPoi.lat,
          lon: triggeredPoi.lon,
        },
        keywords: [keyword, ...(encyclopediaCard?.keywords || []).slice(0, 4)],
        base_card: encyclopediaCard,
        theme: narrativeResult?.theme,
        collected_notes: filmFrames.flatMap((f) => f.items.map((i) => i.label)).slice(0, 12),
      });
      setEncyclopediaCard(data.card);
      flashHint(`已围绕「${keyword}」展开新一版百科`);
    } catch (e) {
      setEncyclopediaError(e.message);
    } finally {
      setEncyclopediaExpandLoading(false);
    }
  };

  const handleDropOnFrame = (frameId, item) => {
    setFilmFrames((prev) =>
      prev.map((f) => (f.id === frameId ? { ...f, items: [...f.items, item] } : f))
    );
    flashHint("已写入胶卷帧");
  };

  const handleSettle = async () => {
    setSettling(true);
    try {
      const log = await postSettleLog(
        filmFrames.map((f) => ({
          poiName: f.poiName,
          poiId: f.poiId,
          progress: f.progress,
          items: f.items,
        })),
        narrativeResult?.theme
      );
      setSettleLog(log);
    } catch (e) {
      flashHint(e.message);
    } finally {
      setSettling(false);
    }
  };

  const resetJourney = () => {
    setNarrativeResult(null);
    setRouteProgress(0);
    setTriggeredPoi(null);
    setEncyclopediaCard(null);
    setFilmFrames([]);
    setActiveFrameId(null);
    setSettleLog(null);
    lastPoiRef.current = null;
  };

  const onMapClick = useCallback(
    (e) => {
      const cfg = studyRef.current;
      if (!cfg || !pickMode) return;
      const { lat, lng } = e.lngLat;
      if (!isInsideStudy(lat, lng, cfg)) {
        flashHint("只能在运营圆内选点");
        return;
      }
      const pt = { lat, lon: lng };
      if (pickMode === "start") {
        setStart(pt);
        setPickMode(null);
      } else {
        setEnd(pt);
        setPickMode(null);
      }
    },
    [pickMode, flashHint]
  );

  const handlePlan = async () => {
    if (!start || !end) {
      flashHint("请先设 A/B");
      return;
    }
    setLoading(true);
    setRoute(null);
    resetJourney();
    try {
      setRoute(await postPlanRoute(start, end));
    } catch (e) {
      flashHint(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNarrative = async () => {
    if (!route?.route_geojson) {
      flashHint("请先规划路线");
      return;
    }
    setNarrativeLoading(true);
    resetJourney();
    try {
      const data = await postNarrativeForRoute({
        route_geojson: route.route_geojson,
        start,
        end,
        route_distance_m: route.route_distance_m,
      });
      setNarrativeResult(data);
      setRouteProgress(0);
      flashHint("叙事就绪：拖动下方时间轴，经过地点将唤起关键词与百科");
    } catch (e) {
      flashHint(e.message);
    } finally {
      setNarrativeLoading(false);
    }
  };

  const initialView = study
    ? { latitude: study.center.lat, longitude: study.center.lon, zoom: 13.35 }
    : { latitude: 31.2397, longitude: 121.4996, zoom: 13.35 };

  const journeySteps = [
    { n: 1, label: "设定 A / B", desc: "在运营圆内选择起点与终点" },
    { n: 2, label: "规划并叙事分析", desc: "生成车行路线与沿路 POI 叙事" },
    { n: 3, label: "沿路探索", desc: "拖动时间轴，进入地点触发关键词与百科" },
    { n: 4, label: "编织胶卷日志", desc: "拖入素材到胶卷帧，结算完整旅行叙事" },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-logo" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <polygon points="3 11 22 2 13 22 11 13 3 11" />
          </svg>
        </div>
        <h1 className="app-title">城市叙事旅程</h1>
        <div className="app-header-divider" />
        <span className="app-header-meta">Urban Narrative</span>
        <div className="app-header-actions">
          {filmFrames.length > 0 ? (
            <span className="app-badge">
              {filmFrames.length} 帧胶卷
            </span>
          ) : null}
          {hint ? <span className="app-hint-chip">{hint}</span> : null}
          <button
            type="button"
            className={`btn btn-ghost${pickMode === "start" ? " btn-active" : ""}`}
            onClick={() => setPickMode(pickMode === "start" ? null : "start")}
          >
            起点 A
          </button>
          <button
            type="button"
            className={`btn btn-ghost${pickMode === "end" ? " btn-active" : ""}`}
            onClick={() => setPickMode(pickMode === "end" ? null : "end")}
          >
            终点 B
          </button>
          <button type="button" className="btn btn-primary" disabled={loading} onClick={handlePlan}>
            {loading ? "规划中…" : "规划路线"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!route || narrativeLoading}
            onClick={handleNarrative}
          >
            {narrativeLoading ? "分析中…" : "叙事分析"}
          </button>
        </div>
      </header>

      <div className="app-main">
        <div className={`map-wrap${pickMode ? " is-picking" : ""}${timelineReady ? " journey-mode" : ""}`}>
          {loadErr ? <div className="fatal-banner">{loadErr}</div> : null}

          {!timelineReady && !pickMode && !loadErr ? (
            <div className="map-hint-float">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              选择 A/B 并规划路线，再进行叙事分析
            </div>
          ) : null}

      <Map
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={initialView}
        onLoad={() => applyViewportLock(mapRef.current?.getMap?.(), study)}
        onClick={onMapClick}
        className="map"
        mapStyle={MAP_STYLE}
        dragRotate={false}
        maxPitch={0}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {studyFc ? (
          <Source id="study-area" type="geojson" data={studyFc}>
            <Layer id="study-fill" type="fill" paint={{ "fill-color": "#E8601C", "fill-opacity": 0.08 }} />
            <Layer
              id="study-outline"
              type="line"
              paint={{ "line-color": "#E8601C", "line-width": 2, "line-dasharray": [1.2, 1.8], "line-opacity": 0.65 }}
            />
          </Source>
        ) : null}
        {routeFc ? (
          <Source id="drive-route" type="geojson" data={routeFc}>
            <Layer
              id="route-core"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": "#E8601C", "line-width": 3.5, "line-dasharray": [2, 1.4] }}
            />
          </Source>
        ) : null}
        {start ? (
          <Marker longitude={start.lon} latitude={start.lat} anchor="center">
            <div className="pin pin-start">A</div>
          </Marker>
        ) : null}
        {end ? (
          <Marker longitude={end.lon} latitude={end.lat} anchor="center">
            <div className="pin pin-end">B</div>
          </Marker>
        ) : null}
        {timelineReady && vehiclePos ? (
          <Marker longitude={vehiclePos.lon} latitude={vehiclePos.lat} anchor="center">
            <div className="vehicle-marker" title="沿路位置">●</div>
          </Marker>
        ) : null}
        {inTrigger ? (
          <Marker longitude={triggeredPoi.lon} latitude={triggeredPoi.lat} anchor="center">
            <div className="trigger-dot" />
          </Marker>
        ) : null}
      </Map>

      {inTrigger ? <KeywordRail keywords={activeKeywords} poiName={triggeredPoi.name} /> : null}

      <EncyclopediaPanel
        visible={inTrigger}
        card={encyclopediaCard}
        poi={triggeredPoi}
        loading={encyclopediaLoading}
        expandLoading={encyclopediaExpandLoading}
        error={encyclopediaError}
        onDropKeyword={handleDropKeywordOnEncyclopedia}
      />

      <JourneySettleModal log={settleLog} onClose={() => setSettleLog(null)} />
        </div>
      </div>

      <footer className="app-footer">
        {timelineReady ? (
          <div className="journey-bottom">
            <RouteTimeline progress={routeProgress} onProgressChange={setRouteProgress} disabled={!timelineReady} />
            <JourneyFilmstrip
              frames={filmFrames}
              activeFrameId={activeFrameId}
              onSelectFrame={setActiveFrameId}
              onDropItem={handleDropOnFrame}
              onSettle={handleSettle}
              settling={settling}
            />
          </div>
        ) : (
          <div className="app-footer-steps">
            {journeySteps.map((step, i) => (
              <div key={step.n} style={{ display: "flex", alignItems: "center" }}>
                <div className="app-step">
                  <div className="app-step-num">{step.n}</div>
                  <div>
                    <div className="app-step-label">{step.label}</div>
                    <div className="app-step-desc">{step.desc}</div>
                  </div>
                </div>
                {i < journeySteps.length - 1 ? (
                  <svg className="app-step-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
