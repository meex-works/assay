// Keys. Read from the environment first (a .env file at the repo root is loaded automatically), then from the macOS
// Keychain (or the `security` stand-in on a Linux box, which reads ~/.secrets/<service>.<account>). Never printed,
// never written, never passed in argv. Each key is needed only if the module that uses it is switched on.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

type Key = { env: string[]; keychain: [service: string, account: string]; what: string; how: string };
export const KEYS = {
  rpc: { env: ["RPC_URL", "ALCHEMY_API_KEY"], keychain: ["assay-alchemy", "assay"], what: "Solana RPC (funding lookups, quote-coin names)",
    how: "RPC_URL=https://... (any Solana RPC), or ALCHEMY_API_KEY=... (an Alchemy app with Solana enabled)" },
  grpc: { env: ["GRPC_TOKEN", "ALCHEMY_API_KEY"], keychain: ["assay-alchemy", "assay"], what: "Yellowstone gRPC token (feeds.grpc)",
    how: "GRPC_TOKEN=... for your gRPC provider (Alchemy uses your API key as the token)" },
  websocket: { env: ["WEBSOCKET_URL", "HELIUS_API_KEY"], keychain: ["assay-helius", "assay"], what: "Solana websocket (feeds.websocket)",
    how: "WEBSOCKET_URL=wss://... or HELIUS_API_KEY=... (a free Helius account works)" },
  telegram: { env: ["TELEGRAM_BOT_TOKEN"], keychain: ["desk-telegram-bot", "desk"], what: "Telegram bot token (post.telegram)",
    how: "TELEGRAM_BOT_TOKEN=123456:ABC... from @BotFather; the bot must be an admin of your channel" },
  api: { env: ["ASSAY_API_KEY"], keychain: ["assay-api-key", "assay"], what: "shared key between the front end and the API",
    how: "ASSAY_API_KEY=<any long random string>, e.g. from `openssl rand -hex 24`" },
} satisfies Record<string, Key>;
export type KeyName = keyof typeof KEYS;

function keychain(service: string, account: string): string | null {
  try {
    return execFileSync("security", ["find-generic-password", "-a", account, "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch { return null; }
}

/** The raw value and which env var (or the Keychain) it came from; null if absent. */
export function lookup(name: KeyName): { value: string; from: string } | null {
  const k = KEYS[name];
  for (const e of k.env) if (process.env[e]?.trim()) return { value: process.env[e]!.trim(), from: e };
  const v = keychain(...k.keychain);
  return v ? { value: v, from: `keychain ${k.keychain[0]}` } : null;
}

export function secret(name: KeyName): string {
  const f = lookup(name);
  if (!f) throw new Error(`missing key for ${KEYS[name].what}. Set ${KEYS[name].how}`);
  return f.value;
}

/** Full URLs built from whichever form of key was given. */
export function rpcUrl(): string {
  const f = lookup("rpc");
  if (!f) return secret("rpc");
  return f.value.startsWith("http") ? f.value : `https://solana-mainnet.g.alchemy.com/v2/${f.value}`;
}
export function websocketUrl(base: string): string {
  const f = lookup("websocket");
  if (!f) return secret("websocket");
  return f.value.startsWith("ws") ? f.value : `${base.replace(/\/$/, "")}/?api-key=${f.value}`;
}
