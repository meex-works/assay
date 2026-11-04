// SQLite store for the silent run. Everything the week's analysis needs is written here: every launch, the trades of
// each coin's first 30 minutes, a running summary of every wallet, every check evaluation, every post and edit, and
// every gap between the two feeds. Postgres replaces it once there's more than one process.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import type { Launch, Trade } from "./pump.ts";

const dir = new URL("../data/", import.meta.url);
mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(new URL("assay.db", dir).pathname);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS launches (
  mint TEXT PRIMARY KEY, sig TEXT, slot INTEGER, seen_ms INTEGER, creator TEXT, signer TEXT, name TEXT, symbol TEXT,
  uri TEXT, quote_mint TEXT, mayhem INTEGER, holder_reward INTEGER, cashback INTEGER, creator_fee_bps INTEGER,
  depth INTEGER, token_program TEXT, supply TEXT, grpc_ms INTEGER, helius_ms INTEGER,
  image_sha TEXT, meta_json TEXT,
  sym_n TEXT GENERATED ALWAYS AS (lower(replace(replace(symbol, '$', ''), ' ', ''))) VIRTUAL,
  name_n TEXT GENERATED ALWAYS AS (lower(replace(replace(replace(name, '$', ''), ' ', ''), '.', ''))) VIRTUAL
);
CREATE INDEX IF NOT EXISTS launches_sym_n ON launches(sym_n, seen_ms);
CREATE INDEX IF NOT EXISTS launches_name_n ON launches(name_n, seen_ms);
CREATE INDEX IF NOT EXISTS launches_creator ON launches(creator, seen_ms);
CREATE INDEX IF NOT EXISTS launches_uri ON launches(uri);
CREATE INDEX IF NOT EXISTS launches_image ON launches(image_sha);
CREATE TABLE IF NOT EXISTS trades (
  sig TEXT, mint TEXT, slot INTEGER, seen_ms INTEGER, user TEXT, is_buy INTEGER, tokens TEXT, quote TEXT, price REAL, ix TEXT,
  PRIMARY KEY (sig, mint, user, is_buy, tokens)
);
CREATE INDEX IF NOT EXISTS trades_mint ON trades(mint, seen_ms);
CREATE TABLE IF NOT EXISTS wallets (
  wallet TEXT PRIMARY KEY, first_trade_ms INTEGER, trades INTEGER DEFAULT 0, early_buys INTEGER DEFAULT 0,
  class TEXT, funder TEXT, first_active_s INTEGER, checked_ms INTEGER
);
CREATE INDEX IF NOT EXISTS wallets_funder ON wallets(funder);
CREATE TABLE IF NOT EXISTS early_buyers ( mint TEXT, wallet TEXT, first_ms INTEGER, slot_offset INTEGER, PRIMARY KEY (mint, wallet) );
CREATE INDEX IF NOT EXISTS early_buyers_wallet ON early_buyers(wallet);
CREATE TABLE IF NOT EXISTS checks ( mint TEXT, at_ms INTEGER, stage TEXT, pure INTEGER, result_json TEXT );
CREATE TABLE IF NOT EXISTS posts (
  mint TEXT PRIMARY KEY, posted_ms INTEGER, channel_msg INTEGER, group_msg INTEGER, text TEXT, state TEXT,
  broke_ms INTEGER, broke_reason TEXT, events INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS timeline ( mint TEXT, at_ms INTEGER, kind TEXT, text TEXT, posted INTEGER, latency_ms INTEGER );
CREATE TABLE IF NOT EXISTS gaps ( at_ms INTEGER, kind TEXT, sig TEXT, detail TEXT );
CREATE TABLE IF NOT EXISTS metrics ( at_ms INTEGER, json TEXT );
`);

const insLaunch = db.prepare(`INSERT OR IGNORE INTO launches (mint, sig, slot, seen_ms, creator, signer, name, symbol, uri,
  quote_mint, mayhem, holder_reward, cashback, creator_fee_bps, depth, token_program, supply, grpc_ms, helius_ms)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const setHelius = db.prepare(`UPDATE launches SET helius_ms = ? WHERE mint = ? AND helius_ms IS NULL`);
const setGrpc = db.prepare(`UPDATE launches SET grpc_ms = ? WHERE mint = ? AND grpc_ms IS NULL`);
export function saveLaunch(l: Launch, source: "grpc" | "helius") {
  const r = insLaunch.run(l.mint, l.sig, l.slot, l.seenMs, l.creator, l.signer, l.name, l.symbol, l.uri, l.quoteMint,
    +l.mayhem, +l.holderReward, +l.cashback, l.creatorFeeBps, l.depth, l.tokenProgram, l.supply.toString(),
    source === "grpc" ? l.seenMs : null, source === "helius" ? l.seenMs : null);
  if (!r.changes) (source === "grpc" ? setGrpc : setHelius).run(l.seenMs, l.mint);
  return r.changes > 0;
}

const insTrade = db.prepare(`INSERT OR IGNORE INTO trades VALUES (?,?,?,?,?,?,?,?,?,?)`);
const upWallet = db.prepare(`INSERT INTO wallets (wallet, first_trade_ms, trades) VALUES (?, ?, 1)
  ON CONFLICT(wallet) DO UPDATE SET trades = trades + 1`);
export function saveTrade(t: Trade, keep: boolean) {
  if (keep) insTrade.run(t.sig, t.mint, t.slot, t.seenMs, t.user, +t.isBuy, t.tokens.toString(), t.quote.toString(), t.price, t.ixName);
  upWallet.run(t.user, t.seenMs);
}

export const insEarly = db.prepare(`INSERT OR IGNORE INTO early_buyers VALUES (?,?,?,?)`);
export const bumpEarly = db.prepare(`UPDATE wallets SET early_buys = early_buys + 1 WHERE wallet = ?`);
export const getWallet = db.prepare(`SELECT * FROM wallets WHERE wallet = ?`);
export const setFunder = db.prepare(`UPDATE wallets SET class = ?, funder = ?, first_active_s = ?, checked_ms = ? WHERE wallet = ?`);
/** How many distinct coins a funder's wallets bought early in (the disperser test). */
export const funderCoins = db.prepare(`SELECT COUNT(DISTINCT e.mint) AS n FROM early_buyers e JOIN wallets w ON w.wallet = e.wallet WHERE w.funder = ?`);
export const creatorLaunches = db.prepare(`SELECT COUNT(*) AS n FROM launches WHERE (creator = ? OR signer = ?) AND seen_ms > ? AND mint != ?`);
export const sameUri = db.prepare(`SELECT mint FROM launches WHERE uri = ? AND mint != ? LIMIT 1`);
export const sameImage = db.prepare(`SELECT mint FROM launches WHERE image_sha = ? AND mint != ? ORDER BY seen_ms LIMIT 1`);
// a sibling: the same ticker or the same name once case, spaces, "$" and dots are ignored ("$Pins GTAPins" ~ "$GP GTA Pins")
export const sameTicker = db.prepare(`SELECT mint, creator, signer FROM launches
  WHERE (sym_n = lower(replace(replace(?, '$', ''), ' ', '')) OR name_n = lower(replace(replace(replace(?, '$', ''), ' ', ''), '.', '')))
  AND mint != ? AND seen_ms > ? ORDER BY seen_ms LIMIT 1`);
export const setMeta = db.prepare(`UPDATE launches SET image_sha = ?, meta_json = ? WHERE mint = ?`);
export const insCheck = db.prepare(`INSERT INTO checks VALUES (?,?,?,?,?)`);
export const insPost = db.prepare(`INSERT OR REPLACE INTO posts (mint, posted_ms, channel_msg, group_msg, text, state) VALUES (?,?,?,?,?,?)`);
export const setPostGroup = db.prepare(`UPDATE posts SET group_msg = ? WHERE channel_msg = ?`);
export const setPostBroke = db.prepare(`UPDATE posts SET state = 'broken', broke_ms = ?, broke_reason = ?, text = ? WHERE mint = ?`);
export const bumpPostEvents = db.prepare(`UPDATE posts SET events = events + 1 WHERE mint = ?`);
export const insTimeline = db.prepare(`INSERT INTO timeline VALUES (?,?,?,?,?,?)`);
export const insGap = db.prepare(`INSERT INTO gaps VALUES (?,?,?,?)`);
export const insMetric = db.prepare(`INSERT INTO metrics VALUES (?,?)`);
export const pruneTrades = db.prepare(`DELETE FROM trades WHERE seen_ms < ?`);

/** Run fn inside one transaction (the trade stream writes in batches). */
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}
