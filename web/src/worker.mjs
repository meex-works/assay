// assay.meex.work: the static front end, plus /api/* proxied to the box's read-only API (through the Cloudflare tunnel)
// with the shared key and a few seconds of edge cache, so the box never sees viewer traffic directly.
import { hygiene, securityTxt } from "./hygiene.mjs";

// Your site and your API, from wrangler.toml [vars]: SITE_ORIGIN, API_ORIGIN.
let ORIGIN = "https://assay.meex.work";
const CSP = [
  "default-src 'self'", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
  "img-src 'self' data:", "connect-src 'self' https://cloudflareinsights.com", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "object-src 'none'",
].join("; ");
const TTL = { summary: 15, tape: 5, posts: 5, coin: 10, batch: 10 };

const robots = () => `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${ORIGIN}/sitemap.xml\n`;
const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${ORIGIN}/</loc><changefreq>always</changefreq></url>\n  <url><loc>${ORIGIN}/how</loc><changefreq>monthly</changefreq></url>\n  <url><loc>${ORIGIN}/tutorials</loc><changefreq>monthly</changefreq></url>\n  <url><loc>${ORIGIN}/overlay</loc><changefreq>monthly</changefreq></url>\n  <url><loc>${ORIGIN}/terms</loc><changefreq>yearly</changefreq></url>\n  <url><loc>${ORIGIN}/privacy</loc><changefreq>yearly</changefreq></url>\n</urlset>\n`;
const llms = () => `# Assay Office

> The public end of assay (https://github.com/meex-works/assay): every pump.fun launch checked 30 seconds in; pure
> launches (honest structure: small dev buy, no bundle, no known bad wallets early, original identity, honest links)
> are posted to https://t.me/assayoffice with no market details, watched for 15 minutes, and edited if purity breaks.

- [The tape](${ORIGIN}/): every judged coin, every post, the last 24 hours' numbers
- [How it works](${ORIGIN}/how): the checklist, the watch, the comparison set
- [Source](https://github.com/meex-works/assay): MIT; design docs, verification against mainnet, the service

assay never gives prices, predictions or recommendations, and never signs a transaction. Operated by SHYGUY LLC.
`;

async function proxy(req, env, ctx, path) {
  const kind = path.split("/")[2] ?? "";
  const ttl = TTL[kind];
  if (ttl == null) return Response.json({ error: "not found" }, { status: 404 });
  const cache = caches.default;
  const key = new Request(new URL(path + new URL(req.url).search, ORIGIN), { method: "GET" });
  let res = await cache.match(key);
  if (res) return res;
  const up = await fetch(`${env.API_ORIGIN}${path}${new URL(req.url).search}`, { headers: { "x-assay-key": env.API_KEY } }).catch(() => null);
  if (!up) return Response.json({ error: "the box is unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
  // read-only public data: any origin may read it (the overlay runs on pump.fun's pages)
  res = new Response(up.body, { status: up.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${ttl}`, "access-control-allow-origin": "*" } });
  if (up.ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// Videos need byte ranges (Safari won't play an MP4 without 206 responses), and the assets binding returned the whole
// file to a Range request when reached through this Worker. The tutorial videos are ~1 MB, so serve ranges here.
async function ranged(req, res) {
  if (!res.ok) return res;
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  const headers = new Headers(res.headers);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=86400");
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!m) { headers.set("content-length", String(size)); return new Response(buf, { status: 200, headers }); }
  let start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  let end = m[1] === "" || m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start > end || start >= size) { headers.set("content-range", `bytes */${size}`); return new Response(null, { status: 416, headers }); }
  headers.set("content-range", `bytes ${start}-${end}/${size}`);
  headers.set("content-length", String(end - start + 1));
  return new Response(buf.slice(start, end + 1), { status: 206, headers });
}

export default {
  async fetch(req, env, ctx) {
    ORIGIN = env.SITE_ORIGIN ?? ORIGIN;
    const url = new URL(req.url);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const p = url.pathname;
    let res;
    if (p.startsWith("/api/")) res = await proxy(req, env, ctx, p);
    else if (p === "/robots.txt") res = new Response(robots(), { headers: { "content-type": "text/plain; charset=utf-8" } });
    else if (p === "/sitemap.xml") res = new Response(sitemap(), { headers: { "content-type": "application/xml; charset=utf-8" } });
    else if (p === "/llms.txt") res = new Response(llms(), { headers: { "content-type": "text/plain; charset=utf-8" } });
    else if (p === "/.well-known/security.txt") res = new Response(securityTxt({ contact: "security@meex.work", policy: `${ORIGIN}/terms`, canonical: `${ORIGIN}/.well-known/security.txt` }), { headers: { "content-type": "text/plain; charset=utf-8" } });
    else if (/^\/c\/[1-9A-HJ-NP-Za-km-z]{32,44}\/?$/.test(p)) res = await env.ASSETS.fetch(new Request(new URL("/coin", url), req));   // "/coin.html" would 307 to "/coin" and the browser would follow it
      else if (/^\/tutorials\/[\w-]+\.mp4$/.test(p)) res = await ranged(req, await env.ASSETS.fetch(new Request(url, { method: "GET" })));
    else res = await env.ASSETS.fetch(req);
    return hygiene(res, { csp: CSP });
  },
};
