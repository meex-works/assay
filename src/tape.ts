// The watch after a coin is judged pure (docs/pure.md): late bundles, the dev selling, a bundle selling, manufactured
// moves, and the confirmations at 5:00 and 15:00. Posted coins get every event in their Telegram thread and an edit
// when purity breaks; control coins (pure, deliberately not posted) are watched identically and only recorded, so the
// week can compare them (hypothesis H7: does posting draw bundles?).
import { cfg } from "./config.ts";
import { clusters, fundingOf, type Cluster, type Coin } from "./coin.ts";
import { clock, describeCluster } from "./pure.ts";
import { insTimeline, setPostBroke, bumpPostEvents } from "./store.ts";
import * as tg from "./telegram.ts";

export type Watch = {
  coin: Coin; posted: boolean; channelMsg: number | null; text: string; judgedMs: number;
  pure: boolean; brokeReason: string | null; events: number; lastEventMs: number; pending: string[];
  earlyWallets: Set<string>; bundle: Cluster | null; bundleSoldNoted: boolean; devSoldNoted: number; movesNoted: Set<number>;
  confirmed: Set<number>; checking: boolean; done: boolean;
};
export const watches = new Map<string, Watch>();

export function startWatch(coin: Coin, posted: boolean, channelMsg: number | null, text: string, judgedMs: number) {
  const w: Watch = { coin, posted, channelMsg, text, judgedMs, pure: true, brokeReason: null, events: 0, lastEventMs: 0, pending: [],
    earlyWallets: new Set(coin.early().map((h) => h.wallet)), bundle: null, bundleSoldNoted: false, devSoldNoted: 0, movesNoted: new Set(),
    confirmed: new Set(), checking: false, done: false };
  watches.set(coin.launch.mint, w);
  return w;
}

/** Record a timeline event; on posted coins also thread it (coalesced) and, if it breaks purity, edit the post. */
async function event(w: Watch, kind: string, text: string, triggerMs: number, breaks = false) {
  const at = Date.now(), c = w.coin;
  const line = `${clock(at - c.launch.seenMs)}  ${text}`;
  if (breaks && w.pure) {
    w.pure = false; w.brokeReason = text;
    if (w.posted && w.channelMsg != null && cfg.thread.edit) {
      w.text = `${w.text}\n\nNo longer pure at ${clock(at - c.launch.seenMs)} after launch: ${lowerFirst(text)}`;
      try { await tg.edit(cfg.channel, w.channelMsg, w.text); } catch (e) { console.error(`[tape] edit failed: ${(e as Error).message}`); }
    }
    setPostBroke.run(at, text, w.text, c.launch.mint);
  }
  insTimeline.run(c.launch.mint, at, kind, text, +w.posted, Date.now() - triggerMs);
  if (!w.posted || w.channelMsg == null || w.events >= cfg.thread.maxEvents) return;
  w.pending.push(line);
  if (at - w.lastEventMs < cfg.thread.coalesce) return;   // flushed by the next event or the tick
  await flush(w);
}

async function flush(w: Watch) {
  if (!w.pending.length || w.channelMsg == null) return;
  const text = w.pending.join("\n");
  w.pending = []; w.events++; w.lastEventMs = Date.now();
  bumpPostEvents.run(w.coin.launch.mint);
  try { await tg.comment(w.channelMsg, text); } catch (e) { console.error(`[tape] comment failed: ${(e as Error).message}`); }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/** Called on every trade of a watched coin. Cheap checks inline; funder-dependent checks run at most one at a time. */
export function onTrade(w: Watch, triggerMs: number) {
  if (w.done) return;
  const c = w.coin;
  // dev selling
  const bought = c.devBought();
  if (bought > 0n) {
    const sold = 1 - Number((c.devNet() * 1000n) / bought) / 1000;
    const step = sold >= 0.999 ? 1 : sold >= 0.5 ? 0.5 : 0;
    if (step > w.devSoldNoted) {
      w.devSoldNoted = step;
      void event(w, "dev_sold", step === 1 ? "Dev sold their whole buy." : `Dev sold ${pct(sold)} of their buy.`, triggerMs, true);
    }
  }
  // the bundle (once found) selling
  if (w.bundle && !w.bundleSoldNoted) {
    const peak = w.bundle.wallets.reduce((a, x) => a + (c.holders.get(x)?.peak ?? 0n), 0n);
    const now = w.bundle.wallets.reduce((a, x) => a + (c.net(x) > 0n ? c.net(x) : 0n), 0n);
    if (peak > 0n && now * 2n <= peak) { w.bundleSoldNoted = true; void event(w, "bundle_selling", `The bundle has sold ${pct(1 - Number((now * 1000n) / peak) / 1000)} of its position.`, triggerMs); }
  }
  // late bundle: buyers after judgement, clustered the same way as the early ones
  if (!w.checking && w.pure) {
    const late = c.buyers().filter((h) => !w.earlyWallets.has(h.wallet) && h.firstMs >= w.judgedMs - cfg.minAge && c.share(c.net(h.wallet)) >= 0.005);
    const lateShare = c.share(late.reduce((a, h) => a + (c.net(h.wallet) > 0n ? c.net(h.wallet) : 0n), 0n));
    if (late.length >= 2 && lateShare >= cfg.lateBundleShareMax) {
      w.checking = true;
      clusters(c, late, { sameSlot: false }).then((cl) => {
        const hit = cl.filter((x) => x.share >= cfg.lateBundleShareMax).sort((a, b) => b.share - a.share)[0];
        if (hit && w.pure) { w.bundle = hit; void event(w, "late_bundle", `Late bundle: ${lowerFirst(describeCluster(hit, c))}`, triggerMs, true); }
      }).finally(() => { w.checking = false; });
    }
  }
  // manufactured move: a big move whose buying is mostly not independent
  if (c.firstPrice && c.lastPrice) {
    const mult = c.lastPrice / c.firstPrice;
    for (const step of [cfg.thread.moveMin, 10, 30, 100]) {
      if (mult < step || w.movesNoted.has(step)) continue;
      w.movesNoted.add(step);
      void independentShare(w).then((ind) => {
        if (ind < cfg.thread.independentShareMax) void event(w, "manufactured_move", `Up ${Math.floor(mult)}× since launch. ${pct(ind)} of the buying since ${clock(w.judgedMs - c.launch.seenMs)} came from independent wallets.`, triggerMs);
      });
    }
  }
}

/** Share of buy volume (in quote) since judgement from wallets in no cluster, not the dev, and not busy. */
async function independentShare(w: Watch): Promise<number> {
  const c = w.coin, bundled = new Set(w.bundle?.wallets ?? []);
  let all = 0n, ind = 0n;
  for (const t of c.trades) {
    if (!t.isBuy || t.seenMs < w.judgedMs) continue;
    all += t.quote;
    if (bundled.has(t.user) || c.devWallets.has(t.user)) continue;
    const f = await fundingOf(t.user);
    if (f.class !== "busy") ind += t.quote;
  }
  return all ? Number((ind * 1000n) / all) / 1000 : 1;
}

/** Once a second: confirmations, coalesced threads, and the end of each watch. */
export async function tick() {
  const now = Date.now();
  for (const w of watches.values()) {
    if (w.done) continue;
    const age = now - w.coin.launch.seenMs;
    if (w.pending.length && now - w.lastEventMs >= cfg.thread.coalesce) await flush(w);
    for (const at of cfg.confirmAt) {
      if (w.confirmed.has(at) || age < at) continue;
      w.confirmed.add(at);
      if (!w.pure) continue;
      const last = at === Math.max(...cfg.confirmAt);
      await event(w, "confirmed", `Still pure at ${clock(at)}.${last ? " No longer watched." : ""}`, now);
      if (last && w.posted && w.channelMsg != null) {
        w.text = `${w.text}\n\nStill pure at ${clock(at)}. No longer watched.`;
        try { await tg.edit(cfg.channel, w.channelMsg, w.text); } catch {}
      }
    }
    if (age >= cfg.minAge + cfg.watchFor) {
      const ind = new Set<string>();
      for (const h of w.coin.buyers()) { const f = await fundingOf(h.wallet); if (!w.bundle?.wallets.includes(h.wallet)) ind.add(f.funder ?? h.wallet); }
      const tail = w.bundle ? ` The bundle holds ${pct(w.coin.share(w.bundle.wallets.reduce((a, x) => a + (w.coin.net(x) > 0n ? w.coin.net(x) : 0n), 0n)))} of supply.` : "";
      await event(w, "watch_ended", `Watch ended. ${ind.size} independent buyers since launch.${tail}`, now);
      await flush(w);
      w.done = true;
    }
  }
  for (const [m, w] of watches) if (w.done && now - w.coin.launch.seenMs > cfg.trackFor) watches.delete(m);
}
