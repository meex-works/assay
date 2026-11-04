// Settings for the silent run, read from config/lenses/pure.yaml so the lens file stays the one place they live.
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const root = new URL("../", import.meta.url);
const lens = parse(readFileSync(new URL("config/lenses/pure.yaml", root), "utf8"));

export const ms = (d: string | number): number => {
  if (typeof d === "number") return d;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(d.trim());
  if (!m) throw new Error(`bad duration ${d}`);
  return Number(m[1]) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[m[2] as "ms" | "s" | "m" | "h"];
};
const gate = (key: string) => lens.gate.find((g: Record<string, unknown>) => key in g || g.trait === key);

export const cfg = {
  devBuyMax: gate("dev_buy_share")?.max ?? 0.05,
  independentBuyersMin: gate("independent_buyers_min")?.independent_buyers_min ?? 10,
  traceHops: gate("creator_funding_clean")?.creator_funding_clean?.trace_hops ?? 1,
  minAge: ms(lens.post.min_age),
  stayPureFor: ms(lens.post.stay_pure_for),
  maxPostsPerHour: lens.post.max_posts_per_hour as number,
  watchFor: ms(lens.post.watch_for),
  confirmAt: (lens.post.confirm_at as string[]).map(ms),
  lateBundleShareMax: lens.post.late_bundle_share_max as number,
  thread: {
    edit: lens.thread.edit_post_on_break as boolean,
    moveMin: lens.thread.move_min as number,
    independentShareMax: lens.thread.independent_share_max as number,
    coalesce: ms(lens.thread.coalesce),
    maxEvents: lens.thread.max_events as number,
  },
  // Not in the lens file: operational limits of the silent run.
  earlyWindow: 60_000,          // the "first buyers" are those in the first minute
  freshWallet: 3_600_000,       // a wallet first active less than an hour before it buys is fresh
  fundedTogether: 180_000,      // wallets funded within 3 minutes of each other read as one group
  bundleShareMin: 0.03,         // a funder group or same-slot fresh cluster below 3% of supply is noted, not a bundle
  serialCreatorLaunches: 3,     // this many launches by one creator in 24 h (as far as assay has seen) = serial
  disperserCoins: 3,            // a funder whose wallets bought early in this many coins = disperser
  busyWallet: 1000,             // a wallet with a full page of signatures is classed by activity, not funder
  trackFor: 30 * 60_000,        // keep a coin's trades in memory and on disk for its first 30 minutes
  channel: "@assayoffice",
};
