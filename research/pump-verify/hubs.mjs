// What are the recurring wallets and funders? Owner program, activity rate, and whether the mayhem program shows up.
const RPC = process.env.RPC;
const rpc = async (m, p) => { for (let i = 0; ; i++) { const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }); if (r.status === 429 && i < 8) { await new Promise((z) => setTimeout(z, 500 * 2 ** i)); continue; } const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result; } };
for (const a of process.argv.slice(2)) {
  const info = await rpc("getAccountInfo", [a, { encoding: "base64" }]);
  const sigs = await rpc("getSignaturesForAddress", [a, { limit: 1000 }]);
  const t = sigs.map((s) => s.blockTime).filter(Boolean);
  const span = Math.max(...t) - Math.min(...t);
  const tx = await rpc("getTransaction", [sigs[0].signature, { encoding: "json", maxSupportedTransactionVersion: 1 }]);
  const progs = new Set(); const keys = [...tx.transaction.message.accountKeys, ...(tx.meta.loadedAddresses?.writable || []), ...(tx.meta.loadedAddresses?.readonly || [])];
  for (const ix of tx.transaction.message.instructions) progs.add(keys[ix.programIdIndex]);
  console.log(a.slice(0, 6), { owner: info.value?.owner, sol: (info.value?.lamports ?? 0) / 1e9, last1000_span_min: +(span / 60).toFixed(1), txs_per_min: +(sigs.length / (span / 60)).toFixed(1), latest_tx_programs: [...progs].map((p) => p.slice(0, 6)) });
}
