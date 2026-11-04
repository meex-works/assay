// How many transactions per second touch the pump program (what a logs subscription would deliver). Read-only.
const RPC = process.env.RPC;
const rpc = async (m, p) => { for (let i = 0; ; i++) { const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }); if (r.status === 429 && i < 8) { await new Promise((z) => setTimeout(z, 500 * 2 ** i)); continue; } const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result; } };
const out = [];
for (const [name, addr] of [["pump (curve)", "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"], ["pump AMM (PumpSwap)", "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"]]) {
  let before, n = 0, ok = 0, t0, t1;
  for (let p = 0; p < 5; p++) {
    const page = await rpc("getSignaturesForAddress", [addr, { limit: 1000, before }]);
    if (!page.length) break; n += page.length; ok += page.filter((s) => !s.err).length;
    t1 ??= page[0].blockTime; t0 = page[page.length - 1].blockTime; before = page[page.length - 1].signature;
  }
  const span = t1 - t0;
  out.push({ program: name, sampled: n, span_s: span, tx_per_s: +(n / span).toFixed(1), ok_tx_per_s: +(ok / span).toFixed(1), failed_share: +((n - ok) / n).toFixed(2), per_day_millions: +((n / span) * 86400 / 1e6).toFixed(1) });
}
console.table(out);
