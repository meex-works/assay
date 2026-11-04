// pump.fun program constants and event decoding. Verified against mainnet on 2026-11-04 (docs/verified.md):
// events are emitted both as self-CPI inner instructions and in the logs; logs can be truncated (0.3% of trades), so
// inner instructions are read first. Mayhem coins have 2B tokens on-chain although CreateEvent says 1B.
import { BorshCoder } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

const idl = JSON.parse(readFileSync(new URL("../idl/pump.json", import.meta.url), "utf8"));
const coder = new BorshCoder(idl);

export const PUMP = idl.address as string;
const pda = (seed: string) => PublicKey.findProgramAddressSync([Buffer.from(seed)], new PublicKey(PUMP))[0].toBase58();
export const MINT_AUTHORITY = pda("mint-authority");
export const EVENT_AUTHORITY = pda("__event_authority");
const EVENT_IX_TAG = Buffer.from("e445a52e51cb9a1d", "hex");   // anchor emit_cpi! prefix
export const SOL_QUOTE = "11111111111111111111111111111111";  // CreateEvent's quote_mint for SOL-quoted coins
export const ONE_B = 1_000_000_000_000_000n;                   // 1B tokens, 6 decimals

// Wallets known by address. The mayhem agent buys most mayhem coins in their first seconds (verified 2026-11-04).
export const KNOWN: Record<string, string> = {
  BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s: "mayhem_agent",
};

export type Launch = {
  sig: string; slot: number; seenMs: number; mint: string; curve: string; creator: string; signer: string;
  name: string; symbol: string; uri: string; quoteMint: string; mayhem: boolean; holderReward: boolean;
  cashback: boolean; creatorFeeBps: number; depth: number; tokenProgram: string; supply: bigint;
};
export type Trade = {
  sig: string; slot: number; seenMs: number; mint: string; user: string; isBuy: boolean; tokens: bigint;
  quote: bigint; price: number; ixName: string;
};
export type Decoded = { sig: string; slot: number; seenMs: number; launches: Launch[]; trades: Trade[]; truncated: boolean; source: "cpi" | "logs" | "none" };

const big = (v: { toString(): string } | null | undefined) => (v == null ? 0n : BigInt(v.toString()));
const b58 = (v: { toBase58(): string }) => v.toBase58();

function decodeEvent(b64: string) {
  try { return coder.events.decode(b64); } catch { return null; }
}

// price in quote units per token (both raw), from virtual reserves after the trade
function priceOf(d: Record<string, any>): number {
  const q = big(d.virtual_quote_reserves) || big(d.virtual_sol_reserves);
  const t = big(d.virtual_token_reserves);
  return t ? Number(q) / Number(t) : 0;
}

/** Decode a pump transaction given its account keys, inner instructions and logs (shape-agnostic: gRPC or JSON-RPC). */
export function decode(input: {
  sig: string; slot: number; seenMs: number; keys: string[]; logs: string[];
  inner: { programIdIndex: number; data: Uint8Array }[];
}): Decoded {
  const events: { name: string; data: Record<string, any> }[] = [];
  for (const ix of input.inner) {
    if (input.keys[ix.programIdIndex] !== PUMP) continue;
    const data = Buffer.from(ix.data);
    if (data.length < 16 || !data.subarray(0, 8).equals(EVENT_IX_TAG)) continue;
    const e = decodeEvent(data.subarray(8).toString("base64"));
    if (e) events.push(e as any);
  }
  let source: Decoded["source"] = events.length ? "cpi" : "none";
  if (!events.length) {
    for (const l of input.logs) {
      if (!l.startsWith("Program data: ")) continue;
      const e = decodeEvent(l.slice(14));
      if (e) events.push(e as any);
    }
    if (events.length) source = "logs";
  }
  const launches: Launch[] = [], trades: Trade[] = [];
  for (const { name, data: d } of events) {
    if (name === "CreateEvent") {
      launches.push({
        sig: input.sig, slot: input.slot, seenMs: input.seenMs, mint: b58(d.mint), curve: b58(d.bonding_curve),
        creator: b58(d.creator), signer: b58(d.user), name: d.name, symbol: d.symbol, uri: d.uri,
        quoteMint: d.quote_mint ? b58(d.quote_mint) : SOL_QUOTE, mayhem: !!d.is_mayhem_mode, holderReward: !!d.is_holder_reward,
        cashback: !!d.is_cashback_enabled, creatorFeeBps: Number(big(d.creator_fee_bps)), depth: Number(d.depth ?? 0),
        tokenProgram: d.token_program ? b58(d.token_program) : "", supply: d.is_mayhem_mode ? 2n * ONE_B : ONE_B,
      });
    } else if (name === "TradeEvent") {
      trades.push({
        sig: input.sig, slot: input.slot, seenMs: input.seenMs, mint: b58(d.mint), user: b58(d.user), isBuy: !!d.is_buy,
        tokens: big(d.token_amount), quote: big(d.quote_amount) || big(d.sol_amount), price: priceOf(d), ixName: d.ix_name ?? "",
      });
    }
  }
  return { sig: input.sig, slot: input.slot, seenMs: input.seenMs, launches, trades, truncated: input.logs.some((l) => l === "Log truncated"), source };
}

/** Adapt a Yellowstone SubscribeUpdate transaction to decode(). */
export function decodeGrpc(u: any, seenMs: number): Decoded | null {
  const t = u.transaction?.transaction;
  if (!t?.meta || t.meta.err) return null;
  const msg = t.transaction.message;
  const keys = [...msg.accountKeys, ...(t.meta.loadedWritableAddresses || []), ...(t.meta.loadedReadonlyAddresses || [])].map((k: Uint8Array) => bs58.encode(k));
  const inner = (t.meta.innerInstructions || []).flatMap((g: any) => g.instructions);
  return decode({ sig: bs58.encode(t.signature), slot: Number(u.transaction.slot), seenMs, keys, logs: t.meta.logMessages || [], inner });
}

/** Decode CreateEvents out of a logs notification (Helius websocket). Logs only: no inner instructions there. */
export function decodeLogs(sig: string, slot: number, seenMs: number, logs: string[]): Decoded {
  return decode({ sig, slot, seenMs, keys: [], logs, inner: [] });
}
