// The silent run's report, straight from data/assay.db.
//   node src/report.ts            the summary since the run started
//   node src/report.ts --posts    plus every post, its state and its timeline
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(new URL("../data/assay.db", import.meta.url).pathname, { readOnly: true });
const one = (sql: string, ...a: any[]) => db.prepare(sql).get(...a) as any;
const all = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[];
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");

const span = one(`SELECT MIN(seen_ms) a, MAX(seen_ms) b, COUNT(*) n FROM launches`);
const hours = (span.b - span.a) / 3.6e6;
const both = one(`SELECT COUNT(*) n FROM launches WHERE grpc_ms IS NOT NULL AND helius_ms IS NOT NULL`).n;
const lead = all(`SELECT helius_ms - grpc_ms d FROM launches WHERE grpc_ms IS NOT NULL AND helius_ms IS NOT NULL ORDER BY d`);
const gaps = all(`SELECT kind, COUNT(*) n FROM gaps GROUP BY kind`);
const judged = one(`SELECT COUNT(*) n, SUM(result_json LIKE '%"dead":true%') dead, SUM(pure) pure FROM checks WHERE stage = 't30'`);
const fails = all(`SELECT j.value ->> 'check' c, COUNT(*) n FROM checks, json_each(checks.result_json, '$.checks') j
  WHERE j.value ->> 'result' = 'fail' GROUP BY c ORDER BY n DESC`);
const posts = all(`SELECT state, COUNT(*) n FROM posts GROUP BY state`);
const broke = all(`SELECT p.mint, p.posted_ms, p.broke_ms, p.broke_reason, l.seen_ms FROM posts p JOIN launches l USING (mint) WHERE p.broke_ms IS NOT NULL`);
const byState = (s: string) => all(`SELECT p.mint, p.broke_ms, l.seen_ms FROM posts p JOIN launches l USING (mint) WHERE p.state = ? OR (p.state = 'broken' AND p.channel_msg ${s === "control" ? "IS NULL" : "IS NOT NULL"})`, s);
const lat = all(`SELECT latency_ms l FROM timeline WHERE kind IN ('late_bundle','dev_sold') AND posted = 1 ORDER BY l`);
const med = (a: number[]) => (a.length ? a[Math.floor((a.length - 1) / 2)] : null);
const m = one(`SELECT json FROM metrics ORDER BY at_ms DESC LIMIT 1`);

console.log(`window          ${new Date(span.a).toISOString()} → ${new Date(span.b).toISOString()} (${hours.toFixed(1)} h)`);
console.log(`launches        ${span.n} (${Math.round(span.n / hours * 24)}/day) · seen by both feeds ${pct(both, span.n)} · gaps ${JSON.stringify(Object.fromEntries(gaps.map((g) => [g.kind, g.n])))}`);
console.log(`gRPC lead       median ${med(lead.map((x) => x.d))} ms over Helius`);
console.log(`judged at 30 s  ${judged.n} · dead (<3 outside buyers) ${judged.dead} · pure + alive ${judged.pure} (${pct(judged.pure, judged.n - judged.dead)} of live coins)`);
console.log(`failed checks   ${fails.map((f) => `${f.c} ${f.n}`).join(" · ")}`);
console.log(`posts           ${posts.map((p) => `${p.state} ${p.n}`).join(" · ")}`);
for (const [label, rows] of [["posted", byState("pure")], ["control", byState("control")]] as const) {
  const b = rows.filter((r) => r.broke_ms);
  const fast = b.filter((r) => r.broke_ms - r.seen_ms <= 5 * 60_000);
  console.log(`  ${label.padEnd(8)}      ${rows.length} watched · broke ${pct(b.length, rows.length)} · broke within 5:00 ${pct(fast.length, rows.length)}`);
}
console.log(`break reasons   ${Object.entries(broke.reduce((a: Record<string, number>, r) => { const k = r.broke_reason.split(":")[0].replace(/\d+(\.\d+)?%?/g, "N").replace(/\.$/, ""); a[k] = (a[k] ?? 0) + 1; return a; }, {})).map(([k, n]) => `${k} ×${n}`).join(" · ") || "none"}`);
console.log(`edit latency    median ${med(lat.map((x) => x.l))} ms from the triggering trade (n=${lat.length})`);
if (m) { const j = JSON.parse(m.json); console.log(`last metrics    rpc ${j.rpc.calls} calls (429 ${j.rpc.throttled}) · funder lookups ${j.funding.lookups} · meta ${j.meta?.ok}/${(j.meta?.ok ?? 0) + (j.meta?.failed ?? 0)} · ${j.rssMb} MB · grpc reconnects ${j.feeds.grpc.reconnects}`); }

if (process.argv.includes("--posts")) {
  for (const p of all(`SELECT p.*, l.symbol, l.seen_ms FROM posts p JOIN launches l USING (mint) ORDER BY p.posted_ms`)) {
    console.log(`\n${p.state.toUpperCase().padEnd(8)} ${p.symbol} ${p.mint} · posted ${((p.posted_ms - p.seen_ms) / 1000).toFixed(0)} s after launch${p.channel_msg ? ` · msg ${p.channel_msg}` : ""}`);
    for (const t of all(`SELECT * FROM timeline WHERE mint = ? ORDER BY at_ms`, p.mint)) console.log(`   ${((t.at_ms - p.seen_ms) / 1000).toFixed(0).padStart(5)} s  ${t.text}${t.latency_ms != null ? `  (${t.latency_ms} ms)` : ""}`);
  }
}
