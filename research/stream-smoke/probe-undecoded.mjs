// For 20 s: collect pump transactions with no decodable event in their logs, and look inside them. Read-only.
import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import { BorshCoder } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const key = (s) => execFileSync("security", ["find-generic-password", "-a", "assay", "-s", s, "-w"], { encoding: "utf8" }).trim();
const idl = JSON.parse(readFileSync(new URL("../../idl/pump.json", import.meta.url)));
const coder = new BorshCoder(idl); const PUMP = idl.address;
const TAG = Buffer.from("e445a52e51cb9a1d", "hex");
const dec = (b64) => { try { return coder.events.decode(b64); } catch { return null; } };
const stats = { total: 0, undecoded: 0, cpi_event_found: 0, pump_ix_names: {}, top_programs: {}, invoked_pump: 0, samples: [] };
const client = new Client("https://solana-mainnet.streaming.alchemy.com", key("assay-alchemy"), {});
const stream = await client.subscribe();
stream.on("data", (u) => {
  const t = u.transaction?.transaction; if (!t) return; stats.total++;
  const logs = t.meta?.logMessages || [];
  if (logs.some((l) => l.startsWith("Program data: ") && dec(l.slice(14)))) return;
  stats.undecoded++;
  const msg = t.transaction.message;
  const keys = [...msg.accountKeys, ...(t.meta.loadedWritableAddresses || []), ...(t.meta.loadedReadonlyAddresses || [])].map((k) => bs58.encode(k));
  // events as self-CPI?
  let cpi = 0;
  for (const g of t.meta.innerInstructions || []) for (const ix of g.instructions) if (keys[ix.programIdIndex] === PUMP && Buffer.from(ix.data).subarray(0, 8).equals(TAG) && dec(Buffer.from(ix.data).subarray(8).toString("base64"))) cpi++;
  if (cpi) stats.cpi_event_found++;
  const invoked = logs.some((l) => l.startsWith(`Program ${PUMP} invoke`)); if (invoked) stats.invoked_pump++;
  for (const l of logs) { const m = l.match(/^Program log: Instruction: (\w+)/); if (m && invoked) stats.pump_ix_names[m[1]] = (stats.pump_ix_names[m[1]] || 0) + 1; }
  for (const ix of msg.instructions) { const p = keys[ix.programIdIndex]?.slice(0, 8); stats.top_programs[p] = (stats.top_programs[p] || 0) + 1; }
  if (stats.samples.length < 4) stats.samples.push({ sig: bs58.encode(t.signature), invoked_pump: invoked, cpi_events: cpi, logs_tail: logs.slice(-6).map((l) => l.slice(0, 110)) });
});
await new Promise((r, j) => stream.write({ accounts: {}, slots: {}, blocks: {}, blocksMeta: {}, entry: {}, transactionsStatus: {}, accountsDataSlice: [],
  transactions: { pump: { vote: false, failed: false, accountInclude: [PUMP], accountExclude: [], accountRequired: [] } }, commitment: CommitmentLevel.PROCESSED }, (e) => (e ? j(e) : r())));
await new Promise((r) => setTimeout(r, 20000));
stats.top_programs = Object.fromEntries(Object.entries(stats.top_programs).sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log(JSON.stringify(stats, null, 2)); process.exit(0);
