#!/usr/bin/env node
/**
 * Live test of assay's two feeds, side by side, for --seconds (default 60):
 *   A. Alchemy Yellowstone gRPC: every successful pump-program transaction (vote:false, failed:false), PROCESSED.
 *   B. Helius websocket: logsSubscribe on the mint-authority PDA (launches only), processed.
 * Reports rate, bytes, decoded events, and for launches: seen by A, by B, by both, and which saw each first.
 * Keys are read from the macOS Keychain in-process (account "assay"), never printed or passed in argv.
 */
import Client, { CommitmentLevel, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { BorshCoder } from "@coral-xyz/anchor";
import WebSocket from "ws";
import bs58 from "bs58";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";

const SECONDS = Number(process.argv[process.argv.indexOf("--seconds") + 1]) || 60;
const key = (s) => execFileSync("security", ["find-generic-password", "-a", "assay", "-s", s, "-w"], { encoding: "utf8" }).trim();
const idl = JSON.parse(readFileSync(new URL("../pump-verify/idl/pump.json", import.meta.url)));
const coder = new BorshCoder(idl);
const PUMP = idl.address;
const MINT_AUTHORITY = PublicKey.findProgramAddressSync([Buffer.from("mint-authority")], new PublicKey(PUMP))[0].toBase58();
const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;   // ms, monotonic

function eventsFrom(logs) {
  const out = [];
  for (const l of logs || []) {
    if (!l.startsWith("Program data: ")) continue;
    try { const e = coder.events.decode(l.slice(14)); if (e) out.push(e); } catch {}
  }
  return out;
}

const A = { txs: 0, bytes: 0, trades: 0, creates: 0, undecoded: 0, slots: new Set(), launches: new Map(), errors: [] };
const B = { notes: 0, bytes: 0, launches: new Map(), failed: 0, errors: [] };

// ── A: gRPC ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const client = new Client("https://solana-mainnet.streaming.alchemy.com", key("assay-alchemy"), { "grpc.max_receive_message_length": 64 * 1024 * 1024 });
await client.connect?.();
const stream = await client.subscribe();
stream.on("error", (e) => A.errors.push(String(e.message || e).slice(0, 200)));
stream.on("data", (u) => {
  const t = u.transaction?.transaction;
  if (!t) return;
  A.txs++;
  try { A.bytes += SubscribeUpdate.encode(u).finish().length; } catch {}
  A.slots.add(String(u.transaction.slot));
  const ev = eventsFrom(t.meta?.logMessages);
  if (!ev.length) A.undecoded++;
  for (const e of ev) {
    if (e.name === "TradeEvent") A.trades++;
    if (e.name === "CreateEvent") { A.creates++; const sig = bs58.encode(t.signature); if (!A.launches.has(sig)) A.launches.set(sig, now()); }
  }
});
await new Promise((res, rej) => stream.write({
  accounts: {}, slots: {}, blocks: {}, blocksMeta: {}, entry: {}, transactionsStatus: {}, accountsDataSlice: [],
  transactions: { pump: { vote: false, failed: false, accountInclude: [PUMP], accountExclude: [], accountRequired: [] } },
  commitment: CommitmentLevel.PROCESSED,
}, (err) => (err ? rej(err) : res())));
// keepalive pings (some gateways drop idle-looking streams)
const ping = setInterval(() => stream.write({ ping: { id: 1 }, accounts: {}, slots: {}, transactions: {}, transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: [] }), 10_000);

// ── B: Helius websocket ──────────────────────────────────────────────────────────────────────────────────────────────
const ws = new WebSocket(`wss://mainnet.helius-rpc.com/?api-key=${key("assay-helius")}`);
ws.on("error", (e) => B.errors.push(String(e.message).slice(0, 200)));
ws.on("open", () => ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "logsSubscribe", params: [{ mentions: [MINT_AUTHORITY] }, { commitment: "processed" }] })));
ws.on("message", (buf) => {
  const m = JSON.parse(buf);
  if (m.method !== "logsNotification") { if (m.error) B.errors.push(JSON.stringify(m.error)); return; }
  B.notes++; B.bytes += buf.length;
  const v = m.params.result.value;
  if (v.err) { B.failed++; return; }
  if (eventsFrom(v.logs).some((e) => e.name === "CreateEvent") && !B.launches.has(v.signature)) B.launches.set(v.signature, now());
});

// ── run, then compare ────────────────────────────────────────────────────────────────────────────────────────────────
const t0 = now();
await new Promise((r) => setTimeout(r, SECONDS * 1000));
clearInterval(ping); stream.end?.(); stream.destroy?.(); ws.close();
const secs = (now() - t0) / 1000;
const both = [...A.launches.keys()].filter((s) => B.launches.has(s));
const lead = both.map((s) => B.launches.get(s) - A.launches.get(s));   // > 0: gRPC first
const med = (a) => { const v = [...a].sort((x, y) => x - y); return v.length ? +v[Math.floor((v.length - 1) / 2)].toFixed(0) : null; };
const report = {
  seconds: +secs.toFixed(1),
  grpc: { tx_per_s: +(A.txs / secs).toFixed(1), trades_per_s: +(A.trades / secs).toFixed(1), launches: A.creates, undecoded_txs: A.undecoded,
    bytes_per_s: Math.round(A.bytes / secs), tb_per_month_at_this_rate: +((A.bytes / secs) * 86400 * 30 / 1e12).toFixed(3), slots: A.slots.size, errors: A.errors.slice(0, 3) },
  helius_ws: { notifications: B.notes, failed_skipped: B.failed, launches: B.launches.size, gb_per_month_at_this_rate: +((B.bytes / secs) * 86400 * 30 / 1e9).toFixed(2), errors: B.errors.slice(0, 3) },
  launches: { grpc_only: A.launches.size - both.length, helius_only: B.launches.size - both.length, both: both.length,
    grpc_first: lead.filter((x) => x > 0).length, helius_first: lead.filter((x) => x < 0).length, median_lead_ms_grpc_minus: med(lead) },
};
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL(`./out/smoke-${Date.now()}.json`, import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(0);
