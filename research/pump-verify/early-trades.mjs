#!/usr/bin/env node
/**
 * For sampled launches (from the latest out/launches-*.json, at least an hour old): the trades in the first 60 seconds,
 * who made them, and where each early buyer's SOL came from (one hop). Tests whether a bundle can actually be seen
 * from the chain, and what it costs in RPC calls per coin. Read-only, no keys.
 *
 *   RPC=<mainnet http url> node early-trades.mjs [--coins 40] [--window 60]
 */
import { BorshCoder } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i < 0 ? d : Number(process.argv[i + 1]); };
const COINS = arg("--coins", 40), WINDOW = arg("--window", 60);
const RPC = process.env.RPC; if (!RPC) throw new Error("RPC env var required");
const idl = JSON.parse(readFileSync(new URL("../../idl/pump.json", import.meta.url)));
const coder = new BorshCoder(idl);
const PUMP = idl.address;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
async function rpc(method, params) {
  for (let i = 0; ; i++) {
    calls++;
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (r.status === 429 && i < 8) { await sleep(500 * 2 ** i); continue; }
    const j = await r.json(); if (j.error) { if (i < 4) { await sleep(800); continue; } throw new Error(`${method}: ${JSON.stringify(j.error)}`); }
    return j.result;
  }
}
const getTx = (sig) => rpc("getTransaction", [sig, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
const keysOf = (tx) => [...tx.transaction.message.accountKeys, ...(tx.meta.loadedAddresses?.writable || []), ...(tx.meta.loadedAddresses?.readonly || [])];
function tradesIn(tx) {
  const out = [];
  for (const l of tx.meta.logMessages || []) {
    if (!l.startsWith("Program data: ")) continue;
    try { const e = coder.events.decode(l.slice(14)); if (e?.name === "TradeEvent") out.push(e.data); } catch {}
  }
  return out;
}
// The funder of a wallet: in the wallet's earliest transaction, the account (other than the wallet) whose SOL balance
// fell the most. Also returns how long before `atTime` the wallet first appeared.
async function funderOf(wallet, atTime) {
  let before, oldest;
  for (let p = 0; p < 3; p++) {
    const page = await rpc("getSignaturesForAddress", [wallet, { limit: 1000, before }]);
    if (!page.length) break;
    oldest = page[page.length - 1]; before = oldest.signature;
    if (page.length < 1000) break;
  }
  if (!oldest) return { funder: null };
  const tx = await getTx(oldest.signature);
  if (!tx) return { funder: null };
  const keys = keysOf(tx); let best = null, drop = 0;
  keys.forEach((k, i) => { const d = tx.meta.preBalances[i] - tx.meta.postBalances[i]; if (k !== wallet && d > drop) { drop = d; best = k; } });
  return { funder: best, first_seen_s_before: atTime - oldest.blockTime, history_capped: !!before && oldest && false };
}

const f = readdirSync(new URL("./out/", import.meta.url)).filter((x) => x.startsWith("launches-")).sort().pop();
const { rows } = JSON.parse(readFileSync(new URL(`./out/${f}`, import.meta.url)));
const now = Date.now() / 1000;
const pool = rows.filter((r) => r.create && r.time < now - 3600);
const stride = Math.max(1, Math.floor(pool.length / COINS));
const coins = pool.filter((_, i) => i % stride === 0).slice(0, COINS);
const funders = new Map();          // cache across coins: wallet → funder (the cross-coin index, in miniature)
const results = [];
for (const c of coins) {
  const callsBefore = calls;
  // page the bonding curve's signatures back to the create
  let before, sigs = [], reached = false;
  for (let p = 0; p < 4 && !reached; p++) {
    const page = await rpc("getSignaturesForAddress", [c.create.bonding_curve, { limit: 1000, before }]);
    if (!page.length) break;
    sigs.push(...page); before = page[page.length - 1].signature;
    reached = page.some((s) => s.signature === c.sig) || page.length < 1000;
  }
  if (!reached) { results.push({ mint: c.create.mint, skipped: "more than 4000 transactions; first minute not reached" }); continue; }
  const early = sigs.filter((s) => !s.err && s.blockTime != null && s.blockTime - c.time <= WINDOW && s.signature !== c.sig).reverse();
  const buys = [], sells = [];
  for (const s of early.slice(0, 60)) {
    const tx = await getTx(s.signature); if (!tx) continue;
    for (const t of tradesIn(tx)) if (t.mint.toBase58() === c.create.mint)
      (t.is_buy ? buys : sells).push({ user: t.user.toBase58(), slot: tx.slot, slot_offset: tx.slot - c.slot, s_after: tx.blockTime - c.time,
        pct: Number((BigInt(t.token_amount.toString()) * 10000n) / 1_000_000_000_000_000n) / 100, ix: t.ix_name });
  }
  const buyers = [...new Set(buys.map((b) => b.user))];
  for (const w of buyers) if (!funders.has(w)) funders.set(w, await funderOf(w, c.time));
  // groups: early buyers sharing a funder, or funded by the creator
  const groups = {};
  for (const w of buyers) { const fd = funders.get(w)?.funder; if (fd) (groups[fd] ||= []).push(w); }
  // net position at the end of the window (buys minus sells), in % of supply
  const net = {}; for (const b of buys) net[b.user] = (net[b.user] || 0) + b.pct; for (const x of sells) if (x.user in net) net[x.user] -= x.pct;
  const share = (ws) => +ws.reduce((a, w) => a + Math.max(0, net[w] || 0), 0).toFixed(2);
  const shared = Object.entries(groups).filter(([, ws]) => ws.length >= 2).map(([fd, ws]) => ({ funder: fd, wallets: ws.length, pct: share(ws), is_creator: fd === c.create.creator || fd === c.create.user }));
  const creatorFunded = buyers.filter((w) => [c.create.creator, c.create.user].includes(funders.get(w)?.funder));
  const fresh = buyers.filter((w) => (funders.get(w)?.first_seen_s_before ?? 1e9) < 3600);
  results.push({
    mint: c.create.mint, mayhem: c.create.mayhem, quote: c.create.quote_mint, uri_host: (() => { try { return new URL(c.create.uri).host; } catch { return null; } })(),
    early_txs: early.length, buys: buys.length, buyers: buyers.length,
    slot0_buyers: new Set(buys.filter((b) => b.slot_offset === 0).map((b) => b.user)).size,
    slot0_2_pct: share([...new Set(buys.filter((b) => b.slot_offset <= 2).map((b) => b.user))]),
    fresh_buyers_lt_1h: fresh.length, fresh_pct: share(fresh),
    creator_funded_buyers: creatorFunded.length, creator_funded_pct: share(creatorFunded),
    shared_funder_groups: shared, rpc_calls: calls - callsBefore,
    buyer_detail: buyers.map((w) => ({ wallet: w, net_pct: +(net[w] || 0).toFixed(3), first_slot_offset: Math.min(...buys.filter((b) => b.user === w).map((b) => b.slot_offset)),
      s_after: Math.min(...buys.filter((b) => b.user === w).map((b) => b.s_after)), funder: funders.get(w)?.funder, first_seen_s_before: funders.get(w)?.first_seen_s_before,
      ix: [...new Set(buys.filter((b) => b.user === w).map((b) => b.ix))].join(",") })),
  });
  process.stderr.write(".");
}
const done = results.filter((r) => !r.skipped);
const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor((v.length - 1) / 2)]; };
const summary = {
  coins: results.length, analysed: done.length, skipped: results.length - done.length,
  with_slot0_buyers: done.filter((r) => r.slot0_buyers > 0).length,
  with_creator_funded_buyers: done.filter((r) => r.creator_funded_buyers > 0).length,
  with_shared_funder_group_2plus: done.filter((r) => r.shared_funder_groups.length).length,
  with_shared_group_over_10pct: done.filter((r) => r.shared_funder_groups.some((g) => g.pct >= 10)).length,
  median_buyers_first_minute: med(done.map((r) => r.buyers)),
  median_fresh_pct: med(done.map((r) => r.fresh_pct)),
  rpc_calls_per_coin: { median: med(done.map((r) => r.rpc_calls)), max: Math.max(...done.map((r) => r.rpc_calls)) },
  funder_cache_hits_possible: [...funders.values()].filter((v) => v.funder).length,
  distinct_funders: new Set([...funders.values()].map((v) => v.funder).filter(Boolean)).size,
};
const out = new URL(`./out/early-${Date.now()}.json`, import.meta.url);
writeFileSync(out, JSON.stringify({ summary, results }, null, 2));
console.log("\n" + JSON.stringify(summary, null, 2) + `\nwrote ${out.pathname}`);
