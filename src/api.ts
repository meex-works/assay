// Read-only JSON over the silent run's database, for the front end at assay.meex.work. A separate process from the run,
// so a busy site can never slow the poster. Listens on 127.0.0.1 only; reached through the box's Cloudflare tunnel by
// the site's Worker, which sends a shared key and caches every response for a few seconds.
//
//   node src/api.ts            (systemd: assay-api)
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { secret } from "./keys.ts";
import { mod } from "./config.ts";

const PORT = Number(process.env.PORT ?? mod.api.port);
const KEY = secret("api");
const db = new DatabaseSync(mod.dbPath, { readOnly: true });
const all = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[];
const one = (sql: string, ...a: any[]) => db.prepare(sql).get(...a) as any;
const med = (a: number[]) => (a.length ? a.sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null);
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

function summary() {
  const since = Date.now() - 86_400_000;
  const start = one(`SELECT MIN(seen_ms) t FROM launches`)?.t ?? null;
  const l = one(`SELECT COUNT(*) n, SUM(grpc_ms IS NOT NULL AND helius_ms IS NOT NULL) both FROM launches WHERE seen_ms > ?`, since);
  const lead = all(`SELECT helius_ms - grpc_ms d FROM launches WHERE seen_ms > ? AND grpc_ms IS NOT NULL AND helius_ms IS NOT NULL`, since).map((r) => r.d);
  const gaps = Object.fromEntries(all(`SELECT kind, COUNT(*) n FROM gaps WHERE at_ms > ? GROUP BY kind`, since).map((g) => [g.kind, g.n]));
  const j = one(`SELECT COUNT(*) n, SUM(result_json LIKE '%"dead":true%') dead, SUM(pure) pure FROM checks WHERE stage = 't30' AND at_ms > ?`, since);
  const fails = all(`SELECT j.value ->> 'check' c, COUNT(*) n FROM checks, json_each(checks.result_json, '$.checks') j
    WHERE checks.at_ms > ? AND j.value ->> 'result' = 'fail' GROUP BY c ORDER BY n DESC LIMIT 8`, since);
  const watched = (posted: boolean) => {
    const rows = all(`SELECT p.broke_ms, l.seen_ms FROM posts p JOIN launches l USING (mint) WHERE p.posted_ms > ? AND p.state != 'capped' AND (p.channel_msg IS ${posted ? "NOT " : ""}NULL)`, since);
    return { n: rows.length, broke: rows.filter((r) => r.broke_ms).length, broke5: rows.filter((r) => r.broke_ms && r.broke_ms - r.seen_ms <= 300_000).length };
  };
  const lat = all(`SELECT latency_ms l FROM timeline WHERE posted = 1 AND kind IN ('late_bundle', 'dev_sold') AND at_ms > ?`, since).map((r) => r.l);
  const m = parse(one(`SELECT json FROM metrics ORDER BY at_ms DESC LIMIT 1`)?.json ?? null);
  const lastMetric = one(`SELECT at_ms FROM metrics ORDER BY at_ms DESC LIMIT 1`)?.at_ms ?? null;
  return {
    now: Date.now(), runningSince: start, window: "24h",
    launches: l.n, bothFeeds: l.n ? l.both / l.n : null, gaps, leadMs: med(lead),
    judged: j.n, dead: j.dead ?? 0, pureAlive: j.pure ?? 0, fails,
    posted: watched(true), control: watched(false), editLatencyMs: med(lat),
    feedback: mod.feedback,
    health: { lastMetric, rssMb: m?.rssMb ?? null, grpcReconnects: m?.feeds?.grpc?.reconnects ?? null, metaOk: m?.meta ? m.meta.ok / Math.max(1, m.meta.ok + m.meta.failed) : null },
  };
}

function tape(limit: number) {
  return all(`SELECT c.mint, c.at_ms, c.pure, c.result_json, l.symbol, l.name, l.seen_ms, l.mayhem FROM checks c JOIN launches l USING (mint)
    WHERE c.stage = 't30' ORDER BY c.at_ms DESC LIMIT ?`, limit).map((r) => {
    const v = parse(r.result_json) ?? {};
    const fails = (v.checks ?? []).filter((x: any) => x.result === "fail").map((x: any) => ({ check: x.check, fact: x.fact }));
    return { mint: r.mint, symbol: r.symbol, name: r.name, at: r.at_ms, launched: r.seen_ms, mayhem: !!r.mayhem,
      verdict: v.dead ? "dead" : r.pure ? "pure" : fails.length ? "impure" : "not_alive", buyers: v.dead ? v.buyers : null,
      independent: v.independent ?? null, fails };
  });
}

function timelineOf(mint: string) {
  return all(`SELECT at_ms, kind, text FROM timeline WHERE mint = ? ORDER BY at_ms`, mint);
}

function posts(limit: number) {
  return all(`SELECT p.mint, p.posted_ms, p.channel_msg, p.state, p.broke_ms, p.broke_reason, p.events, l.symbol, l.name, l.seen_ms
    FROM posts p JOIN launches l USING (mint) WHERE p.state != 'capped' ORDER BY p.posted_ms DESC LIMIT ?`, limit).map((p) => ({
    mint: p.mint, symbol: p.symbol, name: p.name, launched: p.seen_ms, posted: p.posted_ms, channelMsg: p.channel_msg,
    kind: p.channel_msg ? "posted" : "control", state: p.state === "broken" ? "broken" : "pure", broke: p.broke_ms, reason: p.broke_reason,
    timeline: timelineOf(p.mint),
  }));
}

function coin(mint: string) {
  const l = one(`SELECT mint, sig, slot, seen_ms, creator, signer, name, symbol, uri, quote_mint, mayhem, holder_reward, creator_fee_bps, depth, meta_json FROM launches WHERE mint = ?`, mint);
  if (!l) return null;
  const c = one(`SELECT at_ms, pure, result_json FROM checks WHERE mint = ? ORDER BY at_ms DESC LIMIT 1`, mint);
  const p = one(`SELECT posted_ms, channel_msg, text, state, broke_ms, broke_reason FROM posts WHERE mint = ?`, mint);
  const early = one(`SELECT COUNT(*) n FROM early_buyers WHERE mint = ?`, mint).n;
  return {
    launch: { ...l, meta_json: undefined, meta: parse(l.meta_json), mayhem: !!l.mayhem, holder_reward: !!l.holder_reward },
    check: c ? { at: c.at_ms, pure: !!c.pure, ...parse(c.result_json) } : null,
    post: p ? { ...p, kind: p.channel_msg ? "posted" : p.state === "capped" ? "capped" : "control" } : null,
    timeline: timelineOf(mint), earlyBuyers: early,
  };
}

const json = (res: any, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  try {
    if (req.headers["x-assay-key"] !== KEY) return json(res, 401, { error: "unauthorized" });
    const u = new URL(req.url ?? "/", "http://x");
    const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit") ?? 50) || 50));
    if (u.pathname === "/api/summary") return json(res, 200, summary());
    if (u.pathname === "/api/tape") return json(res, 200, tape(limit));
    if (u.pathname === "/api/posts") return json(res, 200, posts(limit));
    const m = /^\/api\/coin\/([^/]+)$/.exec(u.pathname);
    if (m) {
      if (!MINT.test(m[1])) return json(res, 400, { error: "not a mint address" });
      const c = coin(m[1]);
      return c ? json(res, 200, c) : json(res, 404, { error: "assay hasn't seen this mint" });
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    console.error(`[api] ${(e as Error).message}`);
    json(res, 500, { error: "internal" });
  }
}).listen(PORT, mod.api.host, () => console.log(`assay api on ${mod.api.host}:${PORT}`));
