// assay.meex.work: the static front end, plus /api/* proxied to the box's read-only API (through the Cloudflare tunnel)
// with the shared key and a few seconds of edge cache, so the box never sees viewer traffic directly.
import { hygiene, securityTxt } from "./hygiene.mjs";

const ORIGIN = "https://assay.meex.work";
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
  "img-src 'self' data:", "connect-src 'self'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "object-src 'none'",
].join("; ");
const TTL = { summary: 15, tape: 5, posts: 5, coin: 10 };

const ROBOTS = `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${ORIGIN}/sitemap.xml\n`;
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${ORIGIN}/</loc><changefreq>always</changefreq></url>\n  <url><loc>${ORIGIN}/how</loc><changefreq>monthly</changefreq></url>\n</urlset>\n`;
const LLMS = `# Assay Office

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
  const up = await fetch(`https://assay-api.meex.work${path}${new URL(req.url).search}`, { headers: { "x-assay-key": env.API_KEY } }).catch(() => null);
  if (!up) return Response.json({ error: "the box is unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
  res = new Response(up.body, { status: up.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${ttl}` } });
  if (up.ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.hostname !== "assay.meex.work" && url.hostname.endsWith("meex.work")) return Response.redirect(`${ORIGIN}${url.pathname}${url.search}`, 301);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const p = url.pathname;
    let res;
    if (p.startsWith("/api/")) res = await proxy(req, env, ctx, p);
    else if (p === "/robots.txt") res = new Response(ROBOTS, { headers: { "content-type": "text/plain; charset=utf-8" } });
    else if (p === "/sitemap.xml") res = new Response(SITEMAP, { headers: { "content-type": "application/xml; charset=utf-8" } });
    else if (p === "/llms.txt") res = new Response(LLMS, { headers: { "content-type": "text/plain; charset=utf-8" } });
    else if (p === "/.well-known/security.txt") res = new Response(securityTxt({ contact: "security@meex.work", policy: "https://github.com/meex-works/assay", canonical: `${ORIGIN}/.well-known/security.txt` }), { headers: { "content-type": "text/plain; charset=utf-8" } });
    else if (/^\/c\/[1-9A-HJ-NP-Za-km-z]{32,44}\/?$/.test(p)) res = await env.ASSETS.fetch(new Request(new URL("/coin.html", url), req));
    else if (p === "/how" || p === "/how/") res = await env.ASSETS.fetch(new Request(new URL("/how.html", url), req));
    else res = await env.ASSETS.fetch(req);
    return hygiene(res, { csp: CSP });
  },
};
