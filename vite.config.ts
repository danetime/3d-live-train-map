import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// Current git branch, captured when the dev server / build starts, so the HUD
// can show which branch (= which design) you're viewing. Falls back to "" if
// git isn't available (e.g. a detached deploy build), which hides the chip.
function gitBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  } catch {
    return "";
  }
}

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
    // Baked-in build constant: the active git branch (overridable via env).
    define: {
      __APP_BRANCH__: JSON.stringify(env.VITE_APP_BRANCH || gitBranch()),
    },
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
            // If RTT creds aren't set the upstream replies 401 with a
            // WWW-Authenticate header, which makes the browser pop its native
            // Basic-auth sign-in box. Strip that header so the client just sees
            // a plain 401 and falls back quietly (no destination enrichment).
            proxy.on("proxyRes", (proxyRes) => {
              delete proxyRes.headers["www-authenticate"];
            });
          },
        },
      },
    },
  };
});
