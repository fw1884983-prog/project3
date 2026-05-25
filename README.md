# Urban Narrative Generator（MVP）

当前前端以 **运营区内的车行路径规划** 为主（类似打车软件：地图上选 **A 起点 / B 终点**，OSRM **driving** 路网折线）。研究区默认 **东方明珠周边 2 km 圆**；**圆外不可选点**，**地图视野**通过 `maxBounds` + `minZoom` 锁在运营区附近。叙事 LLM 接口仍保留在 `/generate-narrative`，界面暂未接入。

## 架构

- **backend**：`GET /study-config`、`POST /plan-driving-route`、以及原有 POI/叙事接口
- **frontend**：全屏 MapLibre；加载运营区后锁视角；选点 → 规划车行路线

## 环境变量（`backend/.env`）

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | 叙事分析、百科文案、视觉关键词、旅行日志 |
| `PEXELS_API_KEY` | 百科配图：DeepSeek 生成检索词 → Pexels Search |
| `PORT` | 默认 `3040`（与前端 Vite 代理一致） |
| `OSRM_BASE_URL` | 可选；默认公共 OSRM |
| `STUDY_CENTER_LAT` / `STUDY_CENTER_LON` / `STUDY_RADIUS_KM` / `STUDY_LABEL` | 可选；默认东方明珠、`2` km |

`backend/.env.example` 为模板，**请把真实 Key 写在 `backend/.env`，不要提交到仓库**。

## 启动

```bash
cd backend && npm install && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

## API 摘要

- **`GET /study-config`**：`center`、`radiusKm`、`bbox`、`study_area_circle`、`max_bounds`（供前端锁图与圆内选点校验）
- **`POST /plan-driving-route`**：`{ "start": { "lat", "lon" }, "end": { "lat", "lon" } }` → OSRM **driving** 路线 GeoJSON、里程、时间；起终点须在研究圆内
- **`POST /generate-narrative`**：原叙事流水线（车行多段衔接 OSRM **driving**）

## 说明

- 公共 OSRM / 底图 CDN 受网络环境影响；生产环境建议自建 OSRM 与瓦片。
- 若 OSRM 失败，后端仍会返回**直线回退**并在 `route_error` 中说明。
