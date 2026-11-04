// USD prices of quote coins (SOL, $PUMP, tokenized stocks…), for the dead-on-arrival rule. From Jupiter's free price
// API, cached for a minute. A price assay doesn't have is null, and the rule is skipped rather than guessed.
import { SOL_QUOTE } from "./pump.ts";

const WSOL = "So11111111111111111111111111111111111111112";
const TTL = 60_000;
const cache = new Map<string, { usd: number; decimals: number; at: number }>();
const pending = new Set<string>();
export const priceStats = { fetches: 0, errors: 0 };

const idOf = (quoteMint: string) => (quoteMint === SOL_QUOTE ? WSOL : quoteMint);

async function refresh(ids: string[]) {
  const want = ids.filter((id) => !pending.has(id));
  if (!want.length) return;
  want.forEach((id) => pending.add(id));
  try {
    priceStats.fetches++;
    const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${want.join(",")}`, { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as Record<string, { usdPrice?: number; decimals?: number }>;
    const now = Date.now();
    for (const id of want) {
      const v = j[id];
      if (v?.usdPrice) cache.set(id, { usd: v.usdPrice, decimals: v.decimals ?? (id === WSOL ? 9 : 6), at: now });
    }
  } catch { priceStats.errors++; }
  finally { want.forEach((id) => pending.delete(id)); }
}

/** The cached USD price and decimals of a quote coin; refreshes in the background when stale. */
export function quote(quoteMint: string): { usd: number; decimals: number } | null {
  const id = idOf(quoteMint), c = cache.get(id);
  if (!c || Date.now() - c.at > TTL) void refresh([id]);
  return c ?? null;
}

/** Market cap in USD from the last trade's price (quote units per token, both raw) and the real supply. */
export function mcUsd(price: number, supply: bigint, quoteMint: string): number | null {
  const q = quote(quoteMint);
  if (!q || !price) return null;
  return (price * Number(supply)) / 10 ** q.decimals * q.usd;
}

// keep SOL warm, so the first coins after a start aren't judged without a price
void refresh([WSOL]);
setInterval(() => void refresh([WSOL]), TTL).unref();
