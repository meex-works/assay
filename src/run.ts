// The silent run: both feeds → coins → the pure checklist at min_age → Assay Office posts (or a held-out control) →
// the tape's 15-minute watch. Everything is written to data/assay.db for the week's analysis (src/report.ts).
//
//   node src/run.ts               posts to Assay Office
//   ASSAY_POST=0 node src/run.ts  dry: prints posts instead of sending them
import { createHash } from "node:crypto";
import { cfg } from "./config.ts";
import { Coin, fundStats, fundingOf } from "./coin.ts";
import { feedStats, runGrpc, runHelius } from "./feeds.ts";
import { fetchMeta, metaStats } from "./meta.ts";
import { KNOWN, type Decoded, type Launch } from "./pump.ts";
import { evaluate, postText } from "./pure.ts";
import { rpcStats } from "./rpc.ts";
import { insCheck, insGap, insMetric, insPost, pruneTrades, saveLaunch, saveTrade, setMeta, tx } from "./store.ts";
import { onTrade, startWatch, tick, watches } from "./tape.ts";
import * as tg from "./telegram.ts";

const coins = new Map<string, Coin>();
const stats = { launches: 0, grpcLaunches: 0, heliusLaunches: 0, evaluated: 0, dead: 0, pure: 0, alive: 0, posted: 0, control: 0, capped: 0 };
const postTimes: number[] = [];
const CONTROL_SHARE = 0.2;    // one pure coin in five is watched but not posted: the comparison set for H7
const isControl = (mint: string) => createHash("sha256").update(mint).digest()[0] < 256 * CONTROL_SHARE;

// ── launches ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const seenBy = new Map<string, { grpc?: number; helius?: number }>();
function onLaunch(l: Launch, source: "grpc" | "helius") {
  const s = seenBy.get(l.mint) ?? {};
  s[source] = l.seenMs; seenBy.set(l.mint, s);
  saveLaunch(l, source);
  source === "grpc" ? stats.grpcLaunches++ : stats.heliusLaunches++;
  if (coins.has(l.mint)) return;
  stats.launches++;
  const c = new Coin(l);
  coins.set(l.mint, c);
  c.metaDone = fetchMeta(l.uri, l.mint).then((m) => { c.meta = m; setMeta.run(m.imageSha, JSON.stringify({ links: m.links, website: m.website, telegram: m.telegram, twitter: m.twitterShape }), l.mint); });
  setTimeout(() => judge(c).catch((e) => console.error(`[judge] ${l.mint}: ${e.message}`)), cfg.minAge);
}

// ── trades ───────────────────────────────────────────────────────────────────────────────────────────────────────────
let batch: Decoded[] = [];
function onTx(d: Decoded) {
  for (const l of d.launches) onLaunch(l, "grpc");
  for (const t of d.trades) {
    const c = coins.get(t.mint);
    if (!c) continue;
    c.add(t);
    // start tracing funders once a coin has three outside buyers: below that it can't pass the alive gate
    if (!c.tracing && c.age(t.seenMs) <= cfg.earlyWindow && c.early().length >= 3) {
      c.tracing = true;
      for (const h of c.early()) void fundingOf(h.wallet);
      void fundingOf(c.launch.signer);
    } else if (c.tracing && t.isBuy && c.age(t.seenMs) <= cfg.earlyWindow && !KNOWN[t.user] && !c.devWallets.has(t.user)) void fundingOf(t.user);
    const w = watches.get(t.mint);
    if (w) onTrade(w, t.seenMs);
  }
  batch.push(d);
}
setInterval(() => {
  if (!batch.length) return;
  const b = batch; batch = [];
  tx(() => { for (const d of b) for (const t of d.trades) { const c = coins.get(t.mint); saveTrade(t, !!c && c.age(t.seenMs) <= cfg.trackFor); } });
}, 1000);

// ── judgement at min_age ─────────────────────────────────────────────────────────────────────────────────────────────
async function judge(c: Coin) {
  const l = c.launch;
  if (c.early().length < 3) { stats.dead++; insCheck.run(l.mint, Date.now(), "t30", 0, JSON.stringify({ dead: true, buyers: c.early().length })); return; }
  await Promise.race([c.metaDone, new Promise((r) => setTimeout(r, 5000))]);
  const v = await evaluate(c);
  const at = Date.now();
  stats.evaluated++; if (v.pure) stats.pure++; if (v.alive) stats.alive++;
  insCheck.run(l.mint, at, "t30", +(v.pure && v.alive), JSON.stringify(v));
  if (!v.pure || !v.alive) return;
  const text = postText(c, v, at);
  while (postTimes.length && at - postTimes[0] > 3_600_000) postTimes.shift();
  const capped = postTimes.length >= cfg.maxPostsPerHour;
  if (isControl(l.mint) || capped) {
    capped ? stats.capped++ : stats.control++;
    insPost.run(l.mint, at, null, null, text, capped ? "capped" : "control");
    startWatch(c, false, null, text, at);
    return;
  }
  const msg = await tg.post(cfg.channel, text);
  postTimes.push(at); stats.posted++;
  insPost.run(l.mint, at, msg, null, text, "pure");
  startWatch(c, true, msg, text, at);
  console.log(`[post] ${l.symbol} ${l.mint} at ${((at - l.seenMs) / 1000).toFixed(1)}s, ${v.independent} independent buyers`);
}

// ── housekeeping ─────────────────────────────────────────────────────────────────────────────────────────────────────
setInterval(() => { tick().catch((e) => console.error(`[tick] ${e.message}`)); }, 1000);
setInterval(() => {
  const now = Date.now();
  for (const [m, c] of coins) if (c.age(now) > cfg.trackFor && !watches.has(m)) coins.delete(m);
  // reconciliation: a launch one feed saw and the other didn't within 30 s
  for (const [m, s] of seenBy) {
    const first = Math.min(s.grpc ?? Infinity, s.helius ?? Infinity);
    if (now - first < 30_000) continue;
    if (!s.grpc) insGap.run(now, "helius_only", m, "");
    else if (!s.helius) insGap.run(now, "grpc_only", m, "");
    seenBy.delete(m);
  }
}, 10_000);
setInterval(() => pruneTrades.run(Date.now() - 8 * 86_400_000), 3_600_000);
setInterval(() => {
  const m = { ...stats, coins: coins.size, watches: watches.size, feeds: feedStats, rpc: rpcStats, funding: fundStats, meta: metaStats, telegram: tg.tgStats, rssMb: Math.round(process.memoryUsage().rss / 1e6) };
  insMetric.run(Date.now(), JSON.stringify(m));
  console.log(`[${new Date().toISOString().slice(11, 19)}] launches ${stats.launches} (grpc ${stats.grpcLaunches}, helius ${stats.heliusLaunches}) · judged ${stats.evaluated} · dead ${stats.dead} · pure+alive ${stats.posted + stats.control + stats.capped} (posted ${stats.posted}, control ${stats.control}, capped ${stats.capped}) · meta ${metaStats.ok}/${metaStats.ok + metaStats.failed} · rpc ${rpcStats.calls} (429 ${rpcStats.throttled}) · watches ${watches.size} · ${m.rssMb} MB`);
}, 60_000);

// ── start ────────────────────────────────────────────────────────────────────────────────────────────────────────────
await tg.init(cfg.channel);
console.log(`assay silent run · ${tg.DRY ? "DRY (not posting)" : `posting to ${cfg.channel}`} · min_age ${cfg.minAge / 1000}s · watch ${cfg.watchFor / 60_000}m`);
void runGrpc(onTx);
void runHelius((d) => { for (const l of d.launches) onLaunch(l, "helius"); });
