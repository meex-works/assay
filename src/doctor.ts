// `npm run doctor`: checks everything the enabled modules need, one line each, with the fix for anything that fails.
// Read-only: it sends nothing to Telegram and writes nothing but a test row-less open of the database.
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync, accessSync, constants } from "node:fs";
import { mod } from "./config.ts";
import { KEYS, lookup, rpcUrl, secret, websocketUrl, type KeyName } from "./keys.ts";

let bad = 0;
const ok = (what: string, detail = "") => console.log(`  ✓ ${what}${detail ? ` · ${detail}` : ""}`);
const fail = (what: string, fix: string) => { bad++; console.log(`  ✗ ${what}\n      fix: ${fix}`); };
const skip = (what: string, why: string) => console.log(`  · ${what} · skipped (${why})`);
const withTimeout = <T>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<T>((_, j) => setTimeout(() => j(new Error(`${what}: no answer in ${ms / 1000} s`)), ms))]);

console.log(`\nassay doctor · config ${mod.file}\n`);

// ── basics ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const [maj, min] = process.versions.node.split(".").map(Number);
(maj > 22 || (maj === 22 && min >= 18)) ? ok("Node.js", process.versions.node) : fail(`Node.js ${process.versions.node}`, "install Node 22.18 or newer (it runs TypeScript directly): https://nodejs.org");
existsSync(new URL("../idl/pump.json", import.meta.url)) ? ok("pump.fun IDL", "idl/pump.json") : fail("pump.fun IDL missing", "npm run idl");
try { mkdirSync(dirname(mod.dbPath), { recursive: true }); accessSync(dirname(mod.dbPath), constants.W_OK); ok("database folder writable", dirname(mod.dbPath)); }
catch { fail(`can't write ${dirname(mod.dbPath)}`, "change store.path in the config, or fix the folder's permissions"); }

// ── keys ────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\nkeys (from .env or the Keychain)");
const need: [KeyName, boolean, string][] = [
  ["grpc", mod.grpc, "feeds.grpc is off"], ["websocket", mod.websocket, "feeds.websocket is off"], ["rpc", mod.funding, "funding is off"],
  ["telegram", mod.telegram && !mod.dry, mod.dry ? "a dry run" : "post.telegram is off"], ["api", process.argv.includes("--api"), "pass --api to check it"],
];
for (const [k, needed, why] of need) {
  if (!needed) { skip(KEYS[k].what, why); continue; }
  const f = lookup(k);
  f ? ok(KEYS[k].what, `from ${f.from}`) : fail(`missing: ${KEYS[k].what}`, `add to .env → ${KEYS[k].how}`);
}

// ── providers, live ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\nproviders (live)");
if (mod.funding && lookup("rpc")) {
  try {
    const r = await withTimeout(fetch(rpcUrl(), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }) }).then((x) => x.json()), 10_000, "RPC");
    r.result ? ok("RPC answers", `slot ${r.result}`) : fail("RPC refused getSlot", `the provider said: ${JSON.stringify(r.error ?? r).slice(0, 160)}`);
  } catch (e) { fail("RPC unreachable", (e as Error).message); }
} else skip("RPC", mod.funding ? "no key" : "funding is off");

if (mod.grpc && lookup("grpc")) {
  try {
    const mod_ = await import("@triton-one/yellowstone-grpc");
    const Client: any = (mod_ as any).default?.default ?? (mod_ as any).default ?? mod_;
    const client = new Client(mod.providers.grpc_endpoint, secret("grpc"), {});
    const stream = await client.subscribe();
    const got = new Promise<number>((res, rej) => { stream.on("data", (u: any) => u.slot && res(Number(u.slot.slot))); stream.on("error", (e: Error) => rej(e)); });
    await new Promise<void>((res, rej) => stream.write({ slots: { s: {} }, accounts: {}, transactions: {}, transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: [], commitment: 0 }, (e: Error | null) => (e ? rej(e) : res())));
    const slot = await withTimeout(got, 15_000, "gRPC");
    ok("gRPC stream", `${mod.providers.grpc_endpoint} · slot ${slot}`);
    stream.destroy?.();
  } catch (e) { fail("gRPC stream failed", `${(e as Error).message.slice(0, 160)}. Check providers.grpc_endpoint and GRPC_TOKEN; gRPC is usually a paid add-on (docs/tutorials/02-keys.md)`); }
} else skip("gRPC", mod.grpc ? "no key" : "feeds.grpc is off");

if (mod.websocket && lookup("websocket")) {
  try {
    const { default: WebSocket } = await import("ws");
    const id = await withTimeout(new Promise<number>((res, rej) => {
      const ws = new WebSocket(websocketUrl(mod.providers.websocket));
      ws.on("open", () => ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "slotSubscribe" })));
      ws.on("message", (b) => { const m = JSON.parse(String(b)); if (m.id === 1) { ws.close(); m.result != null ? res(m.result) : rej(new Error(JSON.stringify(m.error))); } });
      ws.on("error", rej);
    }), 10_000, "websocket");
    ok("websocket subscribes", `subscription ${id}`);
  } catch (e) { fail("websocket failed", `${(e as Error).message.slice(0, 160)}. Check WEBSOCKET_URL or HELIUS_API_KEY`); }
} else skip("websocket", mod.websocket ? "no key" : "feeds.websocket is off");

// ── Telegram ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\nTelegram");
if (mod.telegram && !mod.dry && lookup("telegram")) {
  const api = async (m: string, b: object) => (await fetch(`https://api.telegram.org/bot${secret("telegram")}/${m}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();
  const me = await api("getMe", {});
  if (!me.ok) fail("bot token rejected", "create a bot with @BotFather and put its token in TELEGRAM_BOT_TOKEN");
  else {
    ok("bot", `@${me.result.username}`);
    const chat = await api("getChat", { chat_id: mod.channel });
    if (!chat.ok) fail(`channel ${mod.channel} not found`, "set post.channel to your channel's @username (public) or numeric id, and add the bot to it");
    else {
      ok("channel", chat.result.title);
      const m = await api("getChatMember", { chat_id: mod.channel, user_id: me.result.id });
      const r = m.result ?? {};
      r.status === "administrator" && r.can_post_messages && r.can_edit_messages ? ok("bot is a channel admin", "can post and edit")
        : fail("bot can't post and edit in the channel", "channel settings → Administrators → add the bot with Post messages and Edit messages");
      const wh = await api("getWebhookInfo", {});
      wh.result?.url ? fail("the bot has a webhook set", "assay reads updates with getUpdates; remove it: curl https://api.telegram.org/bot<token>/deleteWebhook") : ok("no webhook (getUpdates works)");
      if (!chat.result.linked_chat_id) console.log("  · no discussion group linked · threads (comments) are off. Channel settings → Discussion to turn them on.");
      else {
        const g = await api("getChatMember", { chat_id: chat.result.linked_chat_id, user_id: me.result.id });
        g.result?.status === "administrator" ? ok("bot is an admin of the discussion group", "comments on") : fail("bot isn't an admin of the discussion group", "add it as an admin there too, or comments can't be threaded");
      }
    }
  }
} else skip("Telegram", !mod.telegram ? "post.telegram is off" : mod.dry ? "--dry" : "no token");

console.log(bad ? `\n${bad} problem${bad === 1 ? "" : "s"} to fix.\n` : "\nAll set. Start with: npm run silent -- --dry\n");
process.exit(bad ? 1 : 0);
