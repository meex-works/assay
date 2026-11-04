#!/usr/bin/env node
/**
 * Sample real pump.fun launches from mainnet and check assay's assumptions against them. Read-only, no keys.
 *
 *   RPC=<mainnet http url> node sample-launches.mjs [--pages 3] [--sample 300]
 *
 * 1. Launch rate: signatures on the program's mint-authority PDA (only create / create_v2 touch it), paged back, over
 *    the block-time span they cover.
 * 2. For a spread sample of successful creates: which instruction (create vs create_v2), the launch config from the
 *    CreateEvent, the buys inside the create transaction, and WHERE each event was found: in the program logs
 *    ("Program data:") or as a self-CPI inner instruction to the event authority. assay's speed design assumes logs.
 * Writes out/launches-<ts>.json and prints a summary.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { BorshCoder } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i < 0 ? d : Number(process.argv[i + 1]); };
const PAGES = arg("--pages", 3), SAMPLE = arg("--sample", 300);
const RPC = process.env.RPC; if (!RPC) throw new Error("RPC env var required");
const conn = new Connection(RPC, "confirmed");
const idl = JSON.parse(readFileSync(new URL("../../idl/pump.json", import.meta.url)));
const coder = new BorshCoder(idl);
const PUMP = new PublicKey(idl.address);
const MINT_AUTHORITY = PublicKey.findProgramAddressSync([Buffer.from("mint-authority")], PUMP)[0];
const EVENT_AUTHORITY = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], PUMP)[0];
const EVENT_IX_TAG = Buffer.from("e445a52e51cb9a1d", "hex");   // anchor emit_cpi! prefix
const SUPPLY = 1_000_000_000_000_000n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`); return j.result;
}
async function retry(fn, n = 5) {
  for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= n) throw e; await sleep(800 * (i + 1)); } }
}

// ── 1. launch rate ──────────────────────────────────────────────────────────────────────────────────────────────────
let sigs = [], before;
for (let p = 0; p < PAGES; p++) {
  const page = await retry(() => conn.getSignaturesForAddress(MINT_AUTHORITY, { limit: 1000, before }));
  if (!page.length) break;
  sigs.push(...page); before = page[page.length - 1].signature;
}
const ok = sigs.filter((s) => !s.err), failed = sigs.length - ok.length;
const times = sigs.map((s) => s.blockTime).filter(Boolean);
const spanS = Math.max(...times) - Math.min(...times);
const rate = { signatures: sigs.length, ok: ok.length, failed, span_s: spanS,
  per_minute: +(ok.length / (spanS / 60)).toFixed(1), per_day_extrapolated: Math.round(ok.length / spanS * 86400),
  window: [new Date(Math.min(...times) * 1000).toISOString(), new Date(Math.max(...times) * 1000).toISOString()],
  by_hour_utc: (() => { const m = {}; for (const x of ok) if (x.blockTime) { const h = new Date(x.blockTime * 1000).toISOString().slice(0, 13); m[h] = (m[h] || 0) + 1; } return m; })() };

// ── 2. decode a spread sample ───────────────────────────────────────────────────────────────────────────────────────
const step = Math.max(1, Math.floor(ok.length / SAMPLE));
const picks = ok.filter((_, i) => i % step === 0).slice(0, SAMPLE);
const rows = [];
for (const s of picks) {
  // raw JSON-RPC: @solana/web3.js 1.x can't deserialize version-1 transactions, which pump launches now include
  const tx = await retry(() => rpc("getTransaction", [s.signature, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]));
  if (!tx) { rows.push({ sig: s.signature, missing: true }); continue; }
  const msg = tx.transaction.message;
  const keyList = [...msg.accountKeys, ...(tx.meta.loadedAddresses?.writable || []), ...(tx.meta.loadedAddresses?.readonly || [])];
  const key = (i) => keyList[i];
  const logs = tx.meta.logMessages || [];
  const truncated = logs.some((l) => /Log truncated/i.test(l));
  const logEvents = [];
  for (const l of logs) {
    if (!l.startsWith("Program data: ")) continue;
    try { const e = coder.events.decode(l.slice(14)); if (e) logEvents.push(e); } catch {}
  }
  const cpiEvents = [];
  for (const group of tx.meta.innerInstructions || []) for (const ix of group.instructions) {
    if (key(ix.programIdIndex) !== PUMP.toBase58()) continue;
    const data = Buffer.from(bs58.decode(ix.data));
    if (!data.subarray(0, 8).equals(EVENT_IX_TAG)) continue;
    try { const e = coder.events.decode(data.subarray(8).toString("base64")); if (e) cpiEvents.push(e); } catch {}
  }
  const events = cpiEvents.length ? cpiEvents : logEvents;
  const ixNames = [];
  for (const ix of msg.instructions) {
    if (key(ix.programIdIndex) !== PUMP.toBase58()) continue;
    try { ixNames.push(coder.instruction.decode(Buffer.from(bs58.decode(ix.data)))?.name); } catch { ixNames.push("?"); }
  }
  const ce = events.find((e) => e.name === "CreateEvent")?.data;
  const trades = events.filter((e) => e.name === "TradeEvent").map((e) => e.data);
  const big = (v) => (v == null ? null : BigInt(v.toString()));
  rows.push({
    sig: s.signature, slot: tx.slot, time: tx.blockTime, version: tx.version ?? "legacy",
    ix: ixNames, truncated,
    events_in_logs: logEvents.map((e) => e.name), events_in_cpi: cpiEvents.map((e) => e.name),
    create: ce && {
      mint: ce.mint.toBase58(), bonding_curve: ce.bonding_curve.toBase58(), creator: ce.creator.toBase58(), user: ce.user.toBase58(),
      token_program: ce.token_program?.toBase58(), quote_mint: ce.quote_mint?.toBase58(),
      mayhem: ce.is_mayhem_mode, cashback: ce.is_cashback_enabled, holder_reward: ce.is_holder_reward,
      creator_fee_bps: ce.creator_fee_bps?.toString(), depth: ce.depth, supply: ce.token_total_supply?.toString(),
      uri: ce.uri,
    },
    trades: trades.map((t) => ({ user: t.user.toBase58(), is_buy: t.is_buy, tokens: big(t.token_amount).toString(),
      quote_amount: big(t.quote_amount ?? t.sol_amount).toString(), ix_name: t.ix_name, shareholders: t.shareholders?.length ?? 0 })),
  });
  await sleep(60);
}

// ── summary ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const dec = rows.filter((r) => r.create);
const count = (f) => { const m = {}; for (const r of dec) { const k = String(f(r)); m[k] = (m[k] || 0) + 1; } return m; };
const pct = (n) => `${((100 * n) / dec.length).toFixed(1)}%`;
const devShare = (r) => {
  const own = r.trades.filter((t) => t.is_buy && t.user === r.create.user).reduce((a, t) => a + BigInt(t.tokens), 0n);
  return Number((own * 10000n) / BigInt(r.create.supply || SUPPLY)) / 100;
};
const summary = {
  rate,
  sampled: rows.length, decoded: dec.length, missing: rows.filter((r) => r.missing).length,
  create_ix: count((r) => r.ix.filter((n) => n?.startsWith("create")).join("+") || "none"),
  events_found_in: count((r) => `${r.events_in_logs.length ? "logs" : ""}${r.events_in_logs.length && r.events_in_cpi.length ? "+" : ""}${r.events_in_cpi.length ? "cpi" : ""}` || "neither"),
  logs_truncated: rows.filter((r) => r.truncated).length,
  tx_version: (() => { const m = {}; for (const r of rows) if (!r.missing) m[r.version] = (m[r.version] || 0) + 1; return m; })(),
  quote_mint: count((r) => r.create.quote_mint), token_program: count((r) => r.create.token_program),
  mayhem: count((r) => r.create.mayhem), cashback: count((r) => r.create.cashback), holder_reward: count((r) => r.create.holder_reward),
  creator_fee_bps: count((r) => r.create.creator_fee_bps), depth: count((r) => r.create.depth), supply: count((r) => r.create.supply),
  creator_is_signer: count((r) => r.create.creator === r.create.user),
  buys_in_create_tx: count((r) => r.trades.filter((t) => t.is_buy).length),
  distinct_buyers_in_create_tx: count((r) => new Set(r.trades.filter((t) => t.is_buy).map((t) => t.user)).size),
  dev_buy_pct: (() => { const v = dec.map(devShare).sort((a, b) => a - b); const q = (p) => v[Math.floor(p * (v.length - 1))];
    return { zero: pct(v.filter((x) => x === 0).length), p50: q(0.5), p90: q(0.9), max: v[v.length - 1] }; })(),
  uri_hosts: count((r) => { try { return new URL(r.create.uri).host; } catch { return "invalid"; } }),
};
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const out = new URL(`./out/launches-${Date.now()}.json`, import.meta.url);
writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`\nwrote ${out.pathname}`);
