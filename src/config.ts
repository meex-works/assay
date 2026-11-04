// Configuration. Two files:
//   config/assay.yaml        which modules and checks run, where posts go, providers (overridable, see below)
//   config/lenses/pure.yaml  the pure checklist's thresholds and the post/watch timings
// Overrides for assay.yaml, highest first: --set section.key=value (repeatable), ASSAY_SECTION_KEY=value, the file.
// Shortcuts: --dry (post.dry=true), --config <path> (or ASSAY_CONFIG) to use another instance file.
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import "./keys.ts";   // loads .env before the environment is read below

const root = new URL("../", import.meta.url);
const argv = process.argv.slice(2);
const arg = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

export const ms = (d: string | number): number => {
  if (typeof d === "number") return d;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(d.trim());
  if (!m) throw new Error(`bad duration ${d}`);
  return Number(m[1]) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[m[2] as "ms" | "s" | "m" | "h"];
};

// ── the instance file, with overrides ───────────────────────────────────────────────────────────────────────────────
const file = arg("--config") ?? process.env.ASSAY_CONFIG ?? "config/assay.yaml";
const inst: Record<string, any> = parse(readFileSync(new URL(file, root), "utf8"));

const coerce = (v: string): unknown => (v === "true" ? true : v === "false" ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
// A mistyped setting stops the run with one plain line, not a stack trace.
const stop = (msg: string): never => { console.error(`\nconfig: ${msg}\n`); process.exit(2); };
function setPath(obj: Record<string, any>, path: string[], value: unknown, source: string) {
  let o = obj;
  for (const k of path.slice(0, -1)) { if (typeof o[k] !== "object" || o[k] === null) stop(`${source}: there's no section "${k}" in ${file}. Sections: ${Object.keys(obj).join(", ")}`); o = o[k]; }
  const last = path[path.length - 1];
  if (!(last in o)) stop(`${source}: there's no setting "${path.join(".")}" in ${file}. Settings in "${path.slice(0, -1).join(".") || "the file"}": ${Object.keys(o).join(", ")}`);
  o[last] = value;
}
// environment: ASSAY_POST_DRY=true → post.dry. Sections and keys are matched case-insensitively; keys may contain "_".
for (const [k, v] of Object.entries(process.env)) {
  if (!k.startsWith("ASSAY_") || v == null || ["ASSAY_CONFIG", "ASSAY_API_KEY", "ASSAY_POST"].includes(k)) continue;
  const rest = k.slice(6).toLowerCase();
  const section = Object.keys(inst).find((s) => rest === s || rest.startsWith(`${s}_`));
  if (!section) continue;
  const key = rest.slice(section.length + 1);
  setPath(inst, key ? [section, key] : [section], coerce(v), k);
}
// command line
argv.forEach((a, i) => {
  if (a === "--set") { const [p, ...v] = (argv[i + 1] ?? "").split("="); setPath(inst, p.split("."), coerce(v.join("=")), `--set ${argv[i + 1]}`); }
  if (a === "--dry") inst.post.dry = true;
});
if (process.env.ASSAY_POST === "0") inst.post.dry = true;   // the original switch, kept working

/** Modules and switches, after overrides. */
export const mod = {
  grpc: !!inst.feeds.grpc, websocket: !!inst.feeds.websocket, funding: !!inst.funding, metadata: !!inst.metadata,
  checks: inst.checks as Record<string, boolean>, telegram: !!inst.post.telegram, dry: !!inst.post.dry, watch: !!inst.watch,
  controlShare: Number(inst.post.control_share), channel: String(inst.post.channel),
  dbPath: new URL(inst.store.path, root).pathname, keepTradesDays: Number(inst.store.keep_trades_days),
  api: { port: Number(inst.api.port), host: String(inst.api.host) },
  providers: inst.providers as { grpc_endpoint: string; websocket: string },
  feedback: (inst.feedback ?? {}) as { text?: string; x?: string; telegram?: string },
  file,
};
export const on = (check: string) => mod.checks[check] !== false;

// ── the lens thresholds ─────────────────────────────────────────────────────────────────────────────────────────────
const lens = parse(readFileSync(new URL("config/lenses/pure.yaml", root), "utf8"));
const gate = (key: string) => lens.gate.find((g: Record<string, unknown>) => key in g || g.trait === key);

export const cfg = {
  devBuyMax: gate("dev_buy_share")?.max ?? 0.05,
  independentBuyersMin: gate("independent_buyers_min")?.independent_buyers_min ?? 10,
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
  // Operational constants of the silent run (see docs/tutorials/04-configuration.md before changing them).
  earlyWindow: 60_000,          // the "first buyers" are those in the first minute
  freshWallet: 3_600_000,       // a wallet first active less than an hour before it buys is fresh
  fundedTogether: 180_000,      // wallets funded within 3 minutes of each other read as one group
  bundleShareMin: 0.03,         // a funder group or same-slot cluster below 3% of supply is noted, not a bundle
  serialCreatorLaunches: 3,     // this many launches by one creator or signer in 24 h (as far as assay has seen) = serial
  disperserCoins: 3,            // a funder whose wallets bought early in this many coins = disperser
  busyWallet: 1000,             // a wallet with a full page of signatures is classed by activity, not funder
  trackFor: 30 * 60_000,        // keep a coin's trades in memory and on disk for its first 30 minutes
  channel: mod.channel,
};
