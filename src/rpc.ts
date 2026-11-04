// JSON-RPC over HTTPS (raw: @solana/web3.js 1.x can't deserialize version-1 transactions, 64% of launches), with a
// concurrency cap and backoff on 429. Plus the one-hop funder lookup.
import { secret } from "./keys.ts";
import { cfg } from "./config.ts";

const URL_ = `https://solana-mainnet.g.alchemy.com/v2/${secret("assay-alchemy")}`;
const MAX = 8;
let active = 0;
const queue: (() => void)[] = [];
export const rpcStats = { calls: 0, errors: 0, throttled: 0 };

async function slot() {
  if (active >= MAX) await new Promise<void>((r) => queue.push(r));
  active++;
}
function release() { active--; queue.shift()?.(); }

export async function rpc<T = any>(method: string, params: unknown[]): Promise<T> {
  await slot();
  try {
    for (let i = 0; ; i++) {
      rpcStats.calls++;
      const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10_000) }).catch((e) => e as Error);
      if (r instanceof Error) { if (i < 3) continue; rpcStats.errors++; throw r; }
      if (r.status === 429) { rpcStats.throttled++; if (i < 6) { await new Promise((z) => setTimeout(z, 300 * 2 ** i)); continue; } }
      const j = await r.json();
      if (j.error) { rpcStats.errors++; throw new Error(`${method}: ${JSON.stringify(j.error)}`); }
      return j.result as T;
    }
  } finally { release(); }
}

export type Funding = { class: string | null; funder: string | null; firstActiveS: number | null };

/**
 * A wallet's funder: in its earliest transaction, the account (other than the wallet) whose SOL fell the most. Only for
 * wallets young enough to have their first transaction within one page of signatures; busier wallets are classed by
 * activity (`busy`), because their "earliest reachable" transaction isn't their first (verified 2026-11-04).
 */
export async function funderOf(wallet: string): Promise<Funding> {
  const sigs = await rpc<{ signature: string; blockTime: number | null }[]>("getSignaturesForAddress", [wallet, { limit: cfg.busyWallet }]);
  if (sigs.length >= cfg.busyWallet) return { class: "busy", funder: null, firstActiveS: null };
  const oldest = sigs[sigs.length - 1];
  if (!oldest) return { class: null, funder: null, firstActiveS: null };
  const tx = await rpc<any>("getTransaction", [oldest.signature, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
  if (!tx) return { class: null, funder: null, firstActiveS: oldest.blockTime };
  const keys: string[] = [...tx.transaction.message.accountKeys, ...(tx.meta.loadedAddresses?.writable || []), ...(tx.meta.loadedAddresses?.readonly || [])];
  let funder: string | null = null, drop = 0;
  keys.forEach((k, i) => { const d = tx.meta.preBalances[i] - tx.meta.postBalances[i]; if (k !== wallet && d > drop) { drop = d; funder = k; } });
  return { class: null, funder, firstActiveS: oldest.blockTime ?? tx.blockTime ?? null };
}
