// Identify quote mints and check real mint supply for mayhem vs normal coins. Read-only.
import { readFileSync, readdirSync } from "node:fs";
const RPC = process.env.RPC;
const rpc = async (method, params) => { const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result; };
const f = readdirSync(new URL("./out/", import.meta.url)).filter((x) => x.startsWith("launches-")).sort().pop();
const { rows } = JSON.parse(readFileSync(new URL(`./out/${f}`, import.meta.url)));
const dec = rows.filter((r) => r.create);
const name = async (m) => {
  if (m === "11111111111111111111111111111111") return "native SOL (system-program sentinel)";
  const a = await rpc("getAccountInfo", [m, { encoding: "jsonParsed" }]);
  const ext = a?.value?.data?.parsed?.info?.extensions?.find((e) => e.extension === "tokenMetadata")?.state;
  return ext ? `${ext.symbol} / ${ext.name}` : (a?.value?.owner ?? "?");
};
console.log("quote mints:");
for (const m of [...new Set(dec.map((r) => r.create.quote_mint))]) console.log(" ", m, "→", await name(m), `(${dec.filter((r) => r.create.quote_mint === m).length})`);
console.log("\nreal supply now, mayhem vs not:");
for (const mayhem of [true, false]) for (const r of dec.filter((r) => r.create.mayhem === mayhem).slice(0, 4)) {
  const s = await rpc("getTokenSupply", [r.create.mint]);
  console.log(`  mayhem=${mayhem} ${r.create.mint} supply=${s.value.uiAmountString}`);
}
