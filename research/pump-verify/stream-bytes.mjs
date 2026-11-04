// Size of what a logsSubscribe(mentions: pump) notification carries per transaction, measured on recent ones. Read-only.
const RPC = process.env.RPC;
const rpc = async (m, p) => { for (let i = 0; ; i++) { const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }); if (r.status === 429 && i < 8) { await new Promise((z) => setTimeout(z, 500 * 2 ** i)); continue; } const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result; } };
const sigs = await rpc("getSignaturesForAddress", ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", { limit: 300 }]);
const sizes = { ok: [], failed: [] };
for (const s of sigs.slice(0, 300).filter((_, i) => i % 2 === 0)) {
  const tx = await rpc("getTransaction", [s.signature, { encoding: "json", maxSupportedTransactionVersion: 1 }]);
  if (!tx) continue;
  const note = JSON.stringify({ jsonrpc: "2.0", method: "logsNotification", params: { result: { context: { slot: tx.slot }, value: { signature: s.signature, err: tx.meta.err, logs: tx.meta.logMessages } }, subscription: 1 } });
  (tx.meta.err ? sizes.failed : sizes.ok).push(note.length);
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log({ ok_n: sizes.ok.length, ok_avg_bytes: Math.round(avg(sizes.ok)), failed_n: sizes.failed.length, failed_avg_bytes: Math.round(avg(sizes.failed)) });
