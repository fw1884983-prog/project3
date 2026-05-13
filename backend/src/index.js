import "dotenv/config";
import express from "express";
import cors from "cors";
import { narrativeRouter } from "./api/narrativeRoutes.js";

const app = express();
const PORT = Number(process.env.PORT) || 3040;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "urban-narrative-backend" });
});

app.use(narrativeRouter);

app.listen(PORT, () => {
  console.log(`Urban Narrative API listening on http://localhost:${PORT}`);
  console.log("  GET  /study-config");
  console.log("  POST /plan-driving-route");
  console.log("  POST /fetch-poi");
  console.log("  POST /generate-narrative");
});
