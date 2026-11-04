// A coin in its first minutes: every trade, every wallet's net position, and the funding behind its buyers.
import { cfg, mod } from "./config.ts";
import { KNOWN, type Launch, type Trade } from "./pump.ts";
import { funderOf, rpc, type Funding } from "./rpc.ts";
import { bumpEarly, funderCoins, getWallet, insEarly, setFunder } from "./store.ts";
import type { Meta } from "./meta.ts";
import { mcUsd } from "./price.ts";

export type Holder = { wallet: string; firstMs: number; firstSlotOffset: number; bought: bigint; sold: bigint; peak: bigint; buyQuote: bigint };

// ── funding, cached across coins (the cross-coin index in miniature) ───────────────────────────────────────────────
const funding = new Map<string, Promise<Funding>>();
const hubs = new Map<string, Promise<boolean>>();
export const fundStats = { lookups: 0, cached: 0, hubChecks: 0 };

const NONE: Funding = { class: null, funder: null, firstActiveS: null };
export function fundingOf(wallet: string): Promise<Funding> {
  if (!mod.funding) return Promise.resolve(NONE);   // funding: false — no lookups, no funder-based rules
  let p = funding.get(wallet);
  if (p) return p;
  const row = getWallet.get(wallet) as any;
  if (row?.checked_ms) { fundStats.cached++; p = Promise.resolve({ class: row.class, funder: row.funder, firstActiveS: row.first_active_s }); }
  else {
    fundStats.lookups++;
    p = funderOf(wallet).then((f) => { setFunder.run(f.class, f.funder, f.firstActiveS, Date.now(), wallet); return f; })
      .catch(() => ({ class: null, funder: null, firstActiveS: null }));
  }
  funding.set(wallet, p);
  return p;
}

/**
 * Is a funder a hub (an exchange or a router: thousands of transactions an hour)? Wallets funded by the same hub are not
 * linked by it. A full page of signatures spanning under 6 hours = hub. The verified disperser (0.1 tx/min) isn't one.
 */
export function isHub(funder: string): Promise<boolean> {
  let p = hubs.get(funder);
  if (!p) {
    fundStats.hubChecks++;
    p = rpc<{ blockTime: number | null }[]>("getSignaturesForAddress", [funder, { limit: 1000 }]).then((s) => {
      if (s.length < 1000) return false;
      const t = s.map((x) => x.blockTime ?? 0);
      return Math.max(...t) - Math.min(...t) < 6 * 3600;
    }).catch(() => false);
    hubs.set(funder, p);
  }
  return p;
}

export function isDisperser(funder: string): boolean {
  return ((funderCoins.get(funder) as any)?.n ?? 0) >= cfg.disperserCoins;
}

// ── the coin ────────────────────────────────────────────────────────────────────────────────────────────────────────
export class Coin {
  launch: Launch;
  holders = new Map<string, Holder>();
  trades: Trade[] = [];
  firstPrice = 0;
  lastPrice = 0;
  meta: Meta | null = null;
  metaDone: Promise<void> | null = null;
  tracing = false;            // funder lookups started for this coin's early buyers
  evaluated = false;
  devWallets: Set<string>;

  constructor(l: Launch) {
    this.launch = l;
    this.devWallets = new Set([l.creator, l.signer]);
  }

  age(ms = Date.now()) { return ms - this.launch.seenMs; }
  share(tokens: bigint) { return Number((tokens * 1_000_000n) / this.launch.supply) / 1_000_000; }
  net(w: string) { const h = this.holders.get(w); return h ? h.bought - h.sold : 0n; }

  add(t: Trade, replay = false) {
    this.trades.push(t);
    if (t.price) { if (!this.firstPrice) this.firstPrice = t.price; this.lastPrice = t.price; }
    let h = this.holders.get(t.user);
    if (!h) {
      h = { wallet: t.user, firstMs: t.seenMs, firstSlotOffset: t.slot - this.launch.slot, bought: 0n, sold: 0n, peak: 0n, buyQuote: 0n };
      this.holders.set(t.user, h);
      if (!replay && t.isBuy && t.seenMs - this.launch.seenMs <= cfg.earlyWindow && !KNOWN[t.user]) {
        insEarly.run(this.launch.mint, t.user, t.seenMs, h.firstSlotOffset);
        bumpEarly.run(t.user);
      }
    }
    if (t.isBuy) { h.bought += t.tokens; h.buyQuote += t.quote; } else h.sold += t.tokens;
    const n = h.bought - h.sold;
    if (n > h.peak) h.peak = n;
  }

  /** Buyers other than the dev and known program agents. */
  buyers(until = Infinity): Holder[] {
    return [...this.holders.values()].filter((h) => h.bought > 0n && !this.devWallets.has(h.wallet) && !KNOWN[h.wallet] && h.firstMs - this.launch.seenMs <= until);
  }
  early(): Holder[] { return this.buyers(cfg.earlyWindow); }
  devNet(): bigint { let n = 0n; for (const w of this.devWallets) n += this.net(w); return n; }
  devBought(): bigint { let n = 0n; for (const w of this.devWallets) n += this.holders.get(w)?.bought ?? 0n; return n; }
  /** Market cap in USD at the last trade; null until there's a trade and a USD price for the quote coin. */
  mc(): number | null { return mcUsd(this.lastPrice, this.launch.supply, this.launch.quoteMint); }
  knownShare(): number { let n = 0n; for (const w of Object.keys(KNOWN)) n += this.net(w); return this.share(n); }
}

export type Cluster = { kind: "creator_funded" | "shared_funder" | "same_slot_fresh" | "funded_together"; wallets: string[]; share: number; funder?: string; spreadS?: number };

/**
 * Group a set of buyers into clusters, each a candidate bundle. Shared funders alone miss bundles funded from separate
 * sources, and timing alone misses patient ones (both verified on mainnet), so every rule runs.
 */
export async function clusters(c: Coin, hs: Holder[], opts: { sameSlot: boolean }): Promise<Cluster[]> {
  const fs = new Map<string, Funding>();
  await Promise.all(hs.map(async (h) => fs.set(h.wallet, await fundingOf(h.wallet))));
  const shareOf = (ws: string[]) => c.share(ws.reduce((a, w) => a + (c.net(w) > 0n ? c.net(w) : 0n), 0n));
  const out: Cluster[] = [];
  // 1. funded by the dev
  const byDev = hs.filter((h) => { const f = fs.get(h.wallet)?.funder; return f && c.devWallets.has(f); }).map((h) => h.wallet);
  if (byDev.length) out.push({ kind: "creator_funded", wallets: byDev, share: shareOf(byDev) });
  // 2. a shared funder that isn't a hub
  const byFunder = new Map<string, string[]>();
  for (const h of hs) { const f = fs.get(h.wallet)?.funder; if (f && !c.devWallets.has(f)) byFunder.set(f, [...(byFunder.get(f) ?? []), h.wallet]); }
  for (const [f, ws] of byFunder) if (ws.length >= 2 && !(await isHub(f))) out.push({ kind: "shared_funder", wallets: ws, share: shareOf(ws), funder: f });
  // fresh = first active less than an hour before its first buy, and not a busy wallet
  const fresh = hs.filter((h) => { const f = fs.get(h.wallet); return f?.class !== "busy" && f?.firstActiveS != null && h.firstMs / 1000 - f.firstActiveS < cfg.freshWallet / 1000; });
  // 3. fresh wallets buying in the launch's first slots (any wallets, when funding lookups are off)
  if (opts.sameSlot) {
    const ss = (mod.funding ? fresh : hs.filter((h) => !KNOWN[h.wallet])).filter((h) => h.firstSlotOffset <= 2).map((h) => h.wallet);
    if (ss.length >= 2) out.push({ kind: "same_slot_fresh", wallets: ss, share: shareOf(ss) });
  }
  // 4. fresh wallets funded within a few minutes of each other. Three or more: two fresh wallets funded minutes apart
  //    happens by chance at pump's volume, three is a pattern. (Tunable; the silent week records every cluster.)
  const timed = fresh.map((h) => ({ w: h.wallet, t: fs.get(h.wallet)!.firstActiveS! })).sort((a, b) => a.t - b.t);
  let run: typeof timed = [];
  const flush = () => {
    if (run.length >= 3) out.push({ kind: "funded_together", wallets: run.map((x) => x.w), share: shareOf(run.map((x) => x.w)), spreadS: run[run.length - 1].t - run[0].t });
    run = [];
  };
  for (const x of timed) { if (run.length && x.t - run[run.length - 1].t > cfg.fundedTogether / 1000) flush(); run.push(x); }
  flush();
  return out;
}
