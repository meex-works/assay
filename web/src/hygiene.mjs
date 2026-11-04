/**
 * serve — the server half of the hygiene pass, for a Worker or any fetch handler. What
 * `polish check` looks for, produced rather than checked. No dependencies; vendor it or import it.
 *
 *   import { hygiene, securityTxt } from "@meex-works/polish/serve";
 *
 *   // Hono
 *   app.use("*", async (c, next) => { await next(); c.res = hygiene(c.res, { frameAncestors: MINI_APP_HOSTS }); });
 *   app.get("/.well-known/security.txt", (c) => c.text(securityTxt({ contact: "security@meex.work", policy: `${origin}/terms`, canonical: `${origin}/.well-known/security.txt` })));
 *
 *   // plain fetch()
 *   const res = await handle(request); return hygiene(res);
 *
 * 🔴 TWO HEADERS BREAK A DAPP WHEN SET THE "STRICT" WAY, so this module never sets them that way:
 *   - X-Frame-Options: DENY / frame-ancestors 'none' — a Farcaster or Base mini app IS framed by
 *     its host. Pass `frameAncestors` (the hosts that may frame you) and the site gets a CSP
 *     `frame-ancestors` list instead of DENY; the checker only asks that framing be governed.
 *   - Cross-Origin-Opener-Policy: same-origin — severs window.opener, which wallet and OAuth
 *     popups rely on. `same-origin-allow-popups` keeps the isolation and the popups.
 * A full Content-Security-Policy is deliberately NOT emitted here: it is per app (inline boot
 * scripts, RPC hosts, fonts) and a wrong one is a blank page. Pass `csp` when you have one.
 */

/** The hosts that frame Farcaster and Base mini apps. Extend per app if a client is missing. */
export const MINI_APP_HOSTS = ["https://farcaster.xyz", "https://*.farcaster.xyz", "https://warpcast.com", "https://*.warpcast.com", "https://base.app", "https://*.base.app", "https://*.base.org", "https://wallet.coinbase.com", "https://*.coinbase.com"];

const HTML = (res) => /^text\/html/i.test(res.headers.get("content-type") ?? "");

/**
 * Add the hygiene headers to a Response and return it. HTML responses get the full set; other
 * responses only what is safe everywhere (HSTS, nosniff).
 *
 * 🔴 RETURNS A RESPONSE, WHICH MAY NOT BE THE ONE PASSED IN. A Response from fetch(), an
 * assets binding, or Response.redirect() has immutable headers and `headers.set` throws; those
 * are re-wrapped (`new Response(body, res)`) — same body, status and headers, now mutable. So
 * always use the return value: `c.res = hygiene(c.res)`, `return hygiene(await handle(req))`.
 */
export function hygiene(res, { frameAncestors = null, csp = null, hsts = "max-age=63072000; includeSubDomains; preload" } = {}) {
  try { res.headers.set("X-Hygiene-Probe", "1"); res.headers.delete("X-Hygiene-Probe"); } catch { res = new Response(res.body, res); }
  const h = res.headers;
  const set = (k, v) => { if (!h.has(k)) h.set(k, v); };
  set("Strict-Transport-Security", hsts);
  set("X-Content-Type-Options", "nosniff");
  if (!HTML(res)) return res;
  set("Referrer-Policy", "strict-origin-when-cross-origin");
  set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  if (csp) set("Content-Security-Policy", csp);
  else if (frameAncestors?.length) set("Content-Security-Policy", `frame-ancestors 'self' ${frameAncestors.join(" ")}`);
  else set("X-Frame-Options", "DENY");
  return res;
}

/** RFC 9116. `expires` defaults to one year from now, which is the most the RFC allows. */
export function securityTxt({ contact, policy = null, canonical = null, languages = "en", expires = null, now = new Date() } = {}) {
  if (!contact) throw new Error("securityTxt: contact is required");
  const exp = expires ?? new Date(now.getTime() + 365 * 86400e3).toISOString();
  const lines = [`Contact: ${/^(mailto|https?):/.test(contact) ? contact : `mailto:${contact}`}`, `Expires: ${exp}`, `Preferred-Languages: ${languages}`];
  if (canonical) lines.push(`Canonical: ${canonical}`);
  if (policy) lines.push(`Policy: ${policy}`);
  return lines.join("\n") + "\n";
}

/** A robots.txt with the sitemap line the checker wants. `disallow` is a list of prefixes. */
export const robotsTxt = (origin, { disallow = [] } = {}) => `User-agent: *\nAllow: /\n${disallow.map((p) => `Disallow: ${p}\n`).join("")}Sitemap: ${origin}/sitemap.xml\n`;

/** A sitemap from a list of { loc, lastmod?, priority? }. */
export const sitemapXml = (urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}${u.priority != null ? `<priority>${u.priority}</priority>` : ""}</url>`).join("")}</urlset>\n`;
