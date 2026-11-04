// The pure checklist (docs/pure.md), evaluated at min_age after launch, and the post it produces.
// Every check returns pass / fail / unknown with the fact behind it. A coin is pure when nothing fails; "unknown" is
// allowed only where the cause is a slow fetch, never for the chain checks.
import { cfg, mod, on } from "./config.ts";
import { clusters, fundingOf, isDisperser, isHub, type Cluster, type Coin } from "./coin.ts";
import { SOL_QUOTE } from "./pump.ts";
import { rpc } from "./rpc.ts";
import { creatorLaunches, sameImage, sameTicker, sameUri } from "./store.ts";
import { feedbackLine } from "./telegram.ts";

export type Check = { check: string; result: "pass" | "fail" | "unknown"; fact: string };
export type Verdict = { pure: boolean; alive: boolean; checks: Check[]; clusters: Cluster[]; facts: string[]; independent: number };

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const DAY = 86_400_000;

const quoteNames = new Map<string, Promise<string>>();
function quoteName(mint: string): Promise<string> {
  let p = quoteNames.get(mint);
  if (!p) {
    p = rpc<any>("getAccountInfo", [mint, { encoding: "jsonParsed" }]).then((a) => {
      const ext = a?.value?.data?.parsed?.info?.extensions?.find((e: any) => e.extension === "tokenMetadata")?.state;
      return ext?.symbol ? `$${ext.symbol}` : `${mint.slice(0, 4)}…${mint.slice(-4)}`;
    }).catch(() => `${mint.slice(0, 4)}…${mint.slice(-4)}`);
    quoteNames.set(mint, p);
  }
  return p;
}

/** Independent buyers: distinct funding sources among non-dev buyers (a wallet with no known funder counts alone). */
async function independentOf(c: Coin, cl: Cluster[]): Promise<number> {
  const inCluster = new Set(cl.flatMap((x) => x.wallets));
  const keys = new Set<string>();
  for (const h of c.buyers()) {
    if (inCluster.has(h.wallet)) continue;
    const f = await fundingOf(h.wallet);
    keys.add(f.funder && !(await isHub(f.funder)) ? `f:${f.funder}` : `w:${h.wallet}`);
  }
  return keys.size;
}

export async function evaluate(c: Coin): Promise<Verdict> {
  const l = c.launch, checks: Check[] = [], facts: string[] = [];
  const early = c.early();
  const cl = await clusters(c, early, { sameSlot: true });
  const bundles = cl.filter((x) => x.kind === "creator_funded" || x.share >= cfg.bundleShareMin);

  // dev buy
  const devBought = c.share(c.devBought()), devNet = c.share(c.devNet());
  if (on("dev_buy")) checks.push({ check: "dev_buy", result: devBought <= cfg.devBuyMax ? "pass" : "fail",
    fact: devBought === 0 ? "No dev buy." : `Dev bought ${pct(devBought)}${devNet < devBought * 0.99 ? `, and has sold ${pct(1 - devNet / devBought)} of it` : ", nothing sold"}.` });
  if (on("dev_holding") && devBought > 0 && devNet < devBought * 0.5) checks.push({ check: "dev_holding", result: "fail", fact: `Dev sold ${pct(1 - devNet / devBought)} of their buy.` });

  // bundle
  if (on("bundle")) checks.push({ check: "no_bundle", result: bundles.length ? "fail" : "pass",
    fact: bundles.length ? describeCluster(bundles.sort((a, b) => b.share - a.share)[0], c) : "No bundle among the first buyers." });

  // known bad actors: early buyers funded by a disperser
  const fs = await Promise.all(early.map(async (h) => ({ h, f: await fundingOf(h.wallet) })));
  const dispersed = fs.filter(({ f }) => f.funder && isDisperser(f.funder));
  const dispShare = c.share(dispersed.reduce((a, { h }) => a + (c.net(h.wallet) > 0n ? c.net(h.wallet) : 0n), 0n));
  if (on("known_actors") && mod.funding) checks.push({ check: "no_known_actors", result: dispShare >= 0.01 ? "fail" : "pass",
    fact: dispShare >= 0.01 ? `${dispersed.length} early ${dispersed.length === 1 ? "buyer" : "buyers"} funded by a wallet that has funded early buyers in other coins, holding ${pct(dispShare)}.` : "No known bundler or disperser wallets among the first buyers." });

  // creator
  const seen = (creatorLaunches.get(l.creator, l.signer, l.seenMs - DAY, l.mint) as any)?.n ?? 0;
  const cf = mod.funding ? await fundingOf(l.signer) : { class: null, funder: null, firstActiveS: null };
  if (on("clean_creator")) checks.push({ check: "clean_creator", result: seen >= cfg.serialCreatorLaunches ? "fail" : "pass",
    fact: seen ? `${seen} other launches by this creator in the last 24 hours.` : "No other launch by this creator in assay's record." });
  if (cf.class === "busy") facts.push("Creator wallet has a long history.");
  else if (cf.firstActiveS) facts.push(`Creator wallet first active ${ago(l.seenMs / 1000 - cf.firstActiveS)} before launch.`);

  // originality
  const uri = sameUri.get(l.uri, l.mint) as any;
  const img = c.meta?.imageSha ? (sameImage.get(c.meta.imageSha, l.mint) as any) : null;
  const tick = sameTicker.get(l.symbol, l.name, l.mint, l.seenMs - DAY) as any;   // a reused ticker older than a day is normal
  const copy = uri ? "the same metadata" : img ? "the same image" : tick ? "the same name or ticker" : null;
  // with metadata off, originality rests on the metadata URI and the name/ticker, which are on-chain
  const checked = c.meta?.ok || !mod.metadata;
  if (on("original")) checks.push({ check: "original", result: copy ? "fail" : checked ? "pass" : "unknown",
    fact: copy ? `An earlier coin (${short((uri ?? img ?? tick).mint)}) has ${copy}.` : checked ? `No earlier coin with this ${mod.metadata ? "image, " : ""}metadata, or name and ticker.` : "Metadata didn't load in time." });

  // links
  const m = c.meta;
  if (m?.links.website) {
    if (m.website === "shows_mint") facts.push("The website shows this mint.");
    else facts.push("Website linked.");
  }
  if (on("links") && m?.links.telegram) {
    checks.push({ check: "telegram", result: m.telegram === "missing" ? "fail" : m.telegram === "resolves" ? "pass" : "unknown", fact: m.telegram === "missing" ? "The linked Telegram doesn't exist." : "Telegram linked." });
  }
  if (m?.links.twitter) facts.push(m.twitterShape === "community" ? "X Community linked." : m.twitterShape === "post" ? "An X post linked." : "X account linked.");
  if (m?.ok && !m.links.twitter && !m.links.telegram && !m.links.website) facts.push("No socials.");

  // config honesty: a description that promises holder rewards needs the holder-reward flag
  const promises = /(fees?|rewards?)\s+(go(es)?\s+)?(to|for)\s+holders|holder\s+rewards?/i.test(m?.description ?? "");
  if (on("honest_config") && promises) checks.push({ check: "honest_config", result: l.holderReward ? "pass" : "fail", fact: l.holderReward ? "Holder rewards on, as described." : "The description promises holder rewards; holder rewards are off." });
  if (l.mayhem) facts.push("Mayhem mode.");
  if (l.quoteMint !== SOL_QUOTE) facts.push(`Quoted in ${await quoteName(l.quoteMint)}.`);
  if (l.holderReward && !promises) facts.push("Holder rewards on.");
  if (l.creatorFeeBps) facts.push(`Creator fee ${+(l.creatorFeeBps / 100).toFixed(2)}%.`);

  const independent = await independentOf(c, bundles);
  const alive = !on("alive") || independent >= cfg.independentBuyersMin;
  // Unknown is allowed only for links. Originality that couldn't be checked blocks the post: "pure" means checked.
  const pure = !checks.some((x) => x.result === "fail" || (x.result === "unknown" && x.check === "original"));
  return { pure, alive, checks, clusters: cl, facts, independent };
}

export function describeCluster(x: Cluster, c: Coin): string {
  const n = x.wallets.length, s = pct(x.share);
  switch (x.kind) {
    case "creator_funded": return `${n} ${n === 1 ? "wallet" : "wallets"} funded by the creator bought ${s} of supply.`;
    case "shared_funder": return `${n} wallets funded by one wallet (${short(x.funder!)}) bought ${s} of supply.`;
    case "same_slot_fresh": return `${n} wallets created in the last hour bought ${s} of supply within 2 slots of launch.`;
    case "funded_together": { const m = Math.max(1, Math.round((x.spreadS ?? 0) / 60)); return `${n} wallets funded within ${m} ${m === 1 ? "minute" : "minutes"} of each other bought ${s} of supply.`; }
  }
}

export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function ago(s: number) {
  if (s < 90) return "a minute";
  if (s < 3600) return `${Math.round(s / 60)} minutes`;
  if (s < 2 * 86400) return `${Math.round(s / 3600)} hours`;
  return `${Math.round(s / 86400)} days`;
}

export function postText(c: Coin, v: Verdict, atMs: number): string {
  const l = c.launch;
  const line = (k: string) => v.checks.find((x) => x.check === k)?.fact;
  const wallet = (f: string) => f.startsWith("Creator wallet");
  const body = [line("dev_buy"), line("no_bundle"), line("no_known_actors"), line("clean_creator"), ...v.facts.filter(wallet), line("original"),
    ...v.facts.filter((f) => !wallet(f)), line("honest_config")].filter(Boolean);
  return [
    `PURE LAUNCH  ${l.symbol.startsWith("$") ? "" : "$"}${l.symbol}  ${l.name}`, l.mint, "",
    ...body, "",
    `Pure as of ${clock(atMs - l.seenMs)} after launch. Watched for ${Math.round(cfg.watchFor / 60_000)} minutes; this message updates if that changes.`,
    "Not a recommendation. Do your own research.",
    ...(feedbackLine() ? [feedbackLine()!] : []),
  ].join("\n");
}
