// L1: the coin's metadata JSON, its image, and its links. Every fetch is bounded; a fetch that fails or times out is
// recorded as "unknown", never as a fail, because a slow gateway says nothing about the coin.
import { createHash } from "node:crypto";

// Measured 2026-11-04: ipfs.io, dweb.link, w3s.link and nftstorage.link rate-limit at assay's volume (429 in 0.1 s);
// pump's own Pinata gateway is fast but only serves what pump pinned (403 otherwise); Filebase (0.2 s) and 4everland
// (0.4 s) serve anything. So those three race first, and the slow or rate-limited ones are the fallback.
const FIRST = ["https://pump.mypinata.cloud/ipfs/", "https://ipfs.filebase.io/ipfs/", "https://4everland.io/ipfs/"];
const REST = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/"];
export const metaStats = { ok: 0, failed: 0 };

async function get(url: string, ms: number, max = 2_000_000): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), redirect: "follow", headers: { "user-agent": "assay/0.1 (+https://github.com/meex-works/assay)" } });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > max ? b.subarray(0, max) : b;
  } catch { return null; }
}

function anyOf(urls: string[], ms: number, max?: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let left = urls.length;
    for (const u of urls) get(u, ms, max).then((b) => { if (b) resolve(b); else if (--left === 0) resolve(null); });
  });
}

/** IPFS content: pump's gateway first (1.5 s), then the others raced. Anything else: fetched as given. */
async function race(url: string, ms: number, max?: number): Promise<Buffer | null> {
  const cid = /\/ipfs\/([^?#]+)/.exec(url)?.[1] ?? (url.startsWith("ipfs://") ? url.slice(7) : null);
  if (!cid) return get(url, ms, max);
  return (await anyOf(FIRST.map((g) => g + cid), Math.min(ms, 2500), max)) ?? (await anyOf(REST.map((g) => g + cid), ms, max));
}

export type Meta = {
  ok: boolean; description: string | null; image: string | null; imageSha: string | null;
  links: { twitter: string | null; telegram: string | null; website: string | null };
  website: "shows_mint" | "no_mint" | "unknown" | null;
  telegram: "resolves" | "missing" | "unknown" | null;
  twitterShape: "profile" | "post" | "community" | "other" | null;
};

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function fetchMeta(uri: string, mint: string): Promise<Meta> {
  const out: Meta = { ok: false, description: null, image: null, imageSha: null, links: { twitter: null, telegram: null, website: null }, website: null, telegram: null, twitterShape: null };
  const raw = await race(uri, 4000, 200_000);
  if (!raw) { metaStats.failed++; return out; }
  let j: Record<string, unknown>;
  try { j = JSON.parse(raw.toString("utf8")); } catch { metaStats.failed++; return out; }
  out.ok = true; metaStats.ok++;
  out.description = clean(j.description);
  out.image = clean(j.image);
  out.links = { twitter: clean(j.twitter), telegram: clean(j.telegram), website: clean(j.website) };
  const [img, site, tg] = await Promise.all([
    out.image ? race(out.image, 5000) : null,
    out.links.website ? get(out.links.website, 5000, 1_000_000) : null,
    out.links.telegram ? get(out.links.telegram, 4000, 200_000) : null,
  ]);
  if (img) out.imageSha = createHash("sha256").update(img).digest("hex");
  // A site that doesn't show the mint in its HTML may render it with JavaScript: that's "unknown", not "no".
  if (out.links.website) out.website = site ? (site.toString("utf8").includes(mint) ? "shows_mint" : "unknown") : "unknown";
  if (out.links.telegram) out.telegram = tg ? (/tgme_page_title/.test(tg.toString("utf8")) ? "resolves" : "missing") : "unknown";
  if (out.links.twitter) {
    const t = out.links.twitter;
    out.twitterShape = /\/i\/communities\//.test(t) ? "community" : /\/status\/\d+/.test(t) ? "post" : /^(https?:\/\/)?(www\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(t) ? "profile" : "other";
  }
  return out;
}
