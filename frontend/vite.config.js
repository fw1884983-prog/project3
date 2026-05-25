import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
  "/study-config": { target: "http://localhost:3040", changeOrigin: true },
  "/plan-driving-route": { target: "http://localhost:3040", changeOrigin: true },
  "/narrative-for-route": { target: "http://localhost:3040", changeOrigin: true },
  "/narrative-encyclopedia": { target: "http://localhost:3040", changeOrigin: true },
  "/narrative-encyclopedia-expand": { target: "http://localhost:3040", changeOrigin: true },
  "/journey-log-settle": { target: "http://localhost:3040", changeOrigin: true },
  "/fetch-poi": { target: "http://localhost:3040", changeOrigin: true },
  "/generate-narrative": { target: "http://localhost:3040", changeOrigin: true },
  "/health": { target: "http://localhost:3040", changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  /** `vite preview` 默认不带 dev 的 proxy，不配置则 /study-config 会 404 */
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
});
