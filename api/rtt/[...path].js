/**
 * Production proxy for the Realtime Trains API (Vercel-style serverless
 * function). Mirrors the Vite dev proxy: forwards /api/rtt/* to the RTT API and
 * attaches HTTP Basic auth from environment variables, so the credentials never
 * reach the browser.
 *
 * Deploy notes:
 * - Set RTT_USERNAME and RTT_PASSWORD in your host's environment.
 * - On Vercel this file at /api/rtt/[...path].js handles /api/rtt/<anything>.
 * - Other hosts (Netlify, Cloudflare): adapt the handler signature; the core
 *   (build target URL, add Authorization header, stream JSON back) is the same.
 *
 * This file lives outside src/ and is not part of the app's TypeScript build.
 */
export default async function handler(req, res) {
  const user = process.env.RTT_USERNAME;
  const pass = process.env.RTT_PASSWORD;
  if (!user || !pass) {
    res.status(500).json({ error: "RTT credentials not configured" });
    return;
  }

  // Everything after /api/rtt/ becomes the RTT path (e.g. json/search/EXD).
  const path = (req.query.path || []).join("/");
  const target = `https://api.rtt.io/api/v1/${path}`;
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  try {
    const upstream = await fetch(target, { headers: { Authorization: auth } });
    const body = await upstream.text();
    res
      .status(upstream.status)
      .setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    res.send(body);
  } catch (err) {
    res.status(502).json({ error: "RTT upstream failed", detail: String(err) });
  }
}
