// The two feeds. A: Alchemy Yellowstone gRPC, every successful transaction that touches pump's event authority (every
// pump instruction that emits an event), at PROCESSED. B: a Helius websocket on the mint-authority account, launches
// only: an independent second source for the launches, reconciled against A.
// Both reconnect with backoff; A resumes from the last slot it saw (Alchemy replays up to 6000 slots).
import ClientModule, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import WebSocket from "ws";
import { secret } from "./keys.ts";
import { EVENT_AUTHORITY, MINT_AUTHORITY, decodeGrpc, decodeLogs, type Decoded } from "./pump.ts";

export const feedStats = { grpc: { txs: 0, reconnects: 0, lastSlot: 0, lastMs: 0 }, helius: { notes: 0, reconnects: 0, lastMs: 0 } };
// the package is CommonJS; its default export is the client class at runtime
const Client: any = (ClientModule as any).default ?? ClientModule;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runGrpc(onTx: (d: Decoded) => void): Promise<never> {
  const token = secret("assay-alchemy");
  for (let attempt = 0; ; attempt++) {
    try {
      const client = new Client("https://solana-mainnet.streaming.alchemy.com", token, { "grpc.max_receive_message_length": 64 * 1024 * 1024 });
      const stream = await client.subscribe();
      const done = new Promise<void>((resolve) => {
        stream.on("error", (e: Error) => { console.error(`[grpc] ${e.message.slice(0, 160)}`); resolve(); });
        stream.on("end", () => resolve());
        stream.on("close", () => resolve());
      });
      stream.on("data", (u: any) => {
        if (!u.transaction) return;
        const seen = Date.now();
        feedStats.grpc.txs++; feedStats.grpc.lastMs = seen; feedStats.grpc.lastSlot = Number(u.transaction.slot);
        const d = decodeGrpc(u, seen);
        if (d && (d.launches.length || d.trades.length)) onTx(d);
      });
      const req: any = {
        accounts: {}, slots: {}, blocks: {}, blocksMeta: {}, entry: {}, transactionsStatus: {}, accountsDataSlice: [],
        transactions: { pump: { vote: false, failed: false, accountInclude: [EVENT_AUTHORITY], accountExclude: [], accountRequired: [] } },
        commitment: CommitmentLevel.PROCESSED,
      };
      if (feedStats.grpc.lastSlot) req.fromSlot = String(feedStats.grpc.lastSlot - 2);
      await new Promise<void>((res, rej) => stream.write(req, (e: Error | null) => (e ? rej(e) : res())));
      const ping = setInterval(() => stream.write({ ping: { id: 1 }, accounts: {}, slots: {}, transactions: {}, transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: [] }), 10_000);
      // a stream that goes silent for 30 s is dead even if nobody said so
      const watchdog = setInterval(() => { if (Date.now() - feedStats.grpc.lastMs > 30_000) stream.destroy?.(); }, 5_000);
      attempt = 0;
      await done;
      clearInterval(ping); clearInterval(watchdog);
    } catch (e) {
      console.error(`[grpc] connect failed: ${(e as Error).message.slice(0, 160)}`);
    }
    feedStats.grpc.reconnects++;
    await sleep(Math.min(30_000, 1000 * 2 ** attempt));
  }
}

export async function runHelius(onLaunch: (d: Decoded) => void): Promise<never> {
  const url = `wss://mainnet.helius-rpc.com/?api-key=${secret("assay-helius")}`;
  for (let attempt = 0; ; attempt++) {
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(url);
      const ping = setInterval(() => ws.readyState === ws.OPEN && ws.ping(), 20_000);
      ws.on("open", () => {
        attempt = 0;
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "logsSubscribe", params: [{ mentions: [MINT_AUTHORITY] }, { commitment: "processed" }] }));
      });
      ws.on("message", (buf) => {
        const m = JSON.parse(String(buf));
        if (m.method !== "logsNotification") return;
        const seen = Date.now();
        feedStats.helius.notes++; feedStats.helius.lastMs = seen;
        const v = m.params.result.value;
        if (v.err) return;
        const d = decodeLogs(v.signature, m.params.result.context.slot, seen, v.logs);
        if (d.launches.length) onLaunch(d);
      });
      const end = () => { clearInterval(ping); resolve(); };
      ws.on("close", end);
      ws.on("error", (e) => { console.error(`[helius] ${e.message.slice(0, 160)}`); ws.close(); });
    });
    feedStats.helius.reconnects++;
    await sleep(Math.min(30_000, 1000 * 2 ** attempt));
  }
}
