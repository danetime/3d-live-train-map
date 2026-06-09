import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read RTT credentials from .env (gitignored). Non-VITE_ vars stay server-side.
  const env = loadEnv(mode, process.cwd(), "");
  const user = env.RTT_USERNAME;
  const pass = env.RTT_PASSWORD;
  const auth =
    user && pass ? `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` : "";

  return {
    plugins: [react()],
    server: {
      host: true,
      // Proxy /api/rtt/* → the RTT API, attaching Basic auth so the secret
      // never reaches the browser. Phase 2; see src/services/realtimeTrains.ts.
      proxy: {
        "/api/rtt": {
          target: "https://api.rtt.io/api/v1",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/rtt/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (auth) proxyReq.setHeader("Authorization", auth);
            });
          },
        },
      },
    },
  };
});
