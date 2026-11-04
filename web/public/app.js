// Assay Office front end. Every string from a coin (name, ticker, facts) is untrusted: it goes in with textContent,
// never innerHTML. Polls the Worker's /api while the tab is visible.
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};
const api = async (p) => { const r = await fetch(`/api/${p}`); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0)}%`);
const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
const ticker = (s) => (s?.startsWith("$") ? s : `$${s ?? "?"}`);
const LABEL = {
  dev_buy: "Dev bought over 5%", dev_holding: "Dev sold their buy", no_bundle: "Bundle among first buyers",
  no_known_actors: "Known disperser wallets", clean_creator: "Serial creator", original: "Copy of an earlier coin",
  telegram: "Telegram link broken", honest_config: "Fee promise not kept",
};
const VERDICT = { pure: "Pure", impure: "Not pure", dead: "Dead", not_alive: "Too few buyers" };
const pill = (kind, text) => el("span", { class: `pill ${kind}`, text });

function setLive(s) {
  const live = $("#live");
  if (!live) return;
  const fresh = s?.health?.lastMetric && Date.now() - s.health.lastMetric < 150_000;
  live.className = `live ${fresh ? "on" : "off"}`;
  live.lastElementChild.textContent = fresh ? "live" : "feed paused";
}

// ── the tape page ─────────────────────────────────────────────────────────────────────────────────────────────────
function renderStats(s) {
  const live = s.judged - s.dead;
  const tiles = [
    ["Launches", s.launches.toLocaleString(), `seen by both feeds ${pct(s.bothFeeds)}`],
    ["Live at 0:30", live.toLocaleString(), `of ${s.judged.toLocaleString()} judged; ${s.dead.toLocaleString()} had under 3 outside buyers`],
    ["Pure", s.pureAlive.toLocaleString(), `${pct(live ? s.pureAlive / live : null)} of live coins`],
    ["Posted", s.posted.n.toLocaleString(), `${pct(s.posted.n ? s.posted.broke5 / s.posted.n : null)} broke within 5:00`],
    ["Held back", s.control.n.toLocaleString(), `${pct(s.control.n ? s.control.broke5 / s.control.n : null)} broke within 5:00`],
    ["Edit speed", s.editLatencyMs == null ? "—" : `${(s.editLatencyMs / 1000).toFixed(1)} s`, "from the trade that broke purity"],
  ];
  $("#stats").replaceChildren(...tiles.map(([k, v, sub]) => el("div", { class: "stat" }, el("span", { class: "k", text: k }), el("span", { class: "v", text: v }), el("span", { class: "s", text: sub }))));
  const gaps = Object.values(s.gaps ?? {}).reduce((a, b) => a + b, 0);
  $("#window").textContent = `Last 24 hours · gRPC ahead of the websocket by ${s.leadMs ?? "—"} ms (median) · ${gaps} feed gaps · running since ${s.runningSince ? new Date(s.runningSince).toUTCString().slice(5, 22) + " UTC" : "—"}`;
  const max = Math.max(1, ...s.fails.map((f) => f.n));
  $("#reasons").replaceChildren(...(s.fails.length ? s.fails.map((f) => el("div", { class: "reason" },
    el("span", { text: LABEL[f.c] ?? f.c }),
    el("span", { class: "bar", role: "img", "aria-label": `${f.n} coins` }, (() => { const i = el("i"); i.style.width = `${(100 * f.n) / max}%`; return i; })()),
    el("span", { class: "n", text: String(f.n) }))) : [el("p", { class: "empty", text: "No failed checks yet." })]));
}

function renderPosts(ps) {
  if (!ps.length) { $("#posts").replaceChildren(el("p", { class: "empty", text: "No pure launches yet in this window." })); return; }
  $("#posts").replaceChildren(...ps.map((p) => {
    const last = p.timeline[p.timeline.length - 1];
    const state = p.kind === "control" ? ["control", p.state === "broken" ? "Held back · broke" : "Held back"] : p.state === "broken" ? ["broken", "Broken"] : ["pure", Date.now() - p.launched < 15.5 * 60_000 ? "Watching" : "Held up"];
    return el("a", { class: "post", href: `/c/${p.mint}` },
      el("div", { class: "row" }, el("span", { class: "sym", text: ticker(p.symbol) }), el("span", { class: "name", text: p.name }), pill(state[0], state[1]), el("span", { class: "when", text: `posted ${ago(p.posted)}` })),
      el("div", { class: "last", text: last ? `${clock(last.at_ms - p.launched)}  ${last.text}` : `Pure at ${clock(p.posted - p.launched)}. Nothing since.` }));
  }));
}

function renderTape(rows) {
  if (!rows.length) { $("#tape").replaceChildren(el("tr", {}, el("td", { colspan: "4", class: "empty", text: "Nothing judged yet." }))); return; }
  $("#tape").replaceChildren(...rows.map((r) => {
    const why = r.verdict === "dead" ? `${r.buyers ?? 0} outside buyers` : r.verdict === "pure" ? `${r.independent} independent buyers` : r.verdict === "not_alive" ? `${r.independent ?? 0} independent buyers` : r.fails[0]?.fact ?? "";
    const tr = el("tr", { class: "go", tabindex: "0" },
      el("td", { class: "t", text: ago(r.at) }),
      el("td", { class: "sym" }, el("a", { href: `/c/${r.mint}`, text: ticker(r.symbol) })),
      el("td", {}, pill(r.verdict, VERDICT[r.verdict])),
      el("td", { class: "why hide-s", text: why }));
    const go = () => { location.href = `/c/${r.mint}`; };
    tr.addEventListener("click", (e) => { if (e.target.tagName !== "A") go(); });
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    return tr;
  }));
}

async function tapePage() {
  const [s, ps, t] = await Promise.all([api("summary"), api("posts?limit=25"), api("tape?limit=60")]);
  setLive(s); renderStats(s); renderPosts(ps); renderTape(t);
}

// ── a coin ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function coinPage() {
  const mint = location.pathname.split("/")[2] ?? "";
  let c;
  try { c = await api(`coin/${encodeURIComponent(mint)}`); }
  catch { $("#head").replaceChildren(el("h1", { text: "assay hasn't seen this coin." }), el("p", { class: "sub", text: "Only launches since the silent run started (4 November 2026) are here." })); return; }
  const l = c.launch;
  document.title = `${ticker(l.symbol)} · Assay Office`;
  const chips = [l.mayhem && "Mayhem mode", l.quote_mint !== "11111111111111111111111111111111" && "Quoted in another coin", l.holder_reward && "Holder rewards", l.creator_fee_bps && `Creator fee ${+(l.creator_fee_bps / 100).toFixed(2)}%`].filter(Boolean);
  const copy = el("button", { class: "copy", type: "button", text: "Copy" });
  copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(l.mint); copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1500); } catch {} });
  $("#head").replaceChildren(
    el("h1", {}, el("span", { class: "sym", text: ticker(l.symbol) }), l.name),
    el("div", { class: "mint" }, el("span", { text: l.mint }), copy, el("a", { href: `https://solscan.io/token/${l.mint}`, text: "Solscan" })),
    el("div", { class: "chips" }, el("span", { class: "chip", text: `Launched ${new Date(l.seen_ms).toUTCString().slice(5, 25)} UTC` }), ...chips.map((x) => el("span", { class: "chip", text: x }))));

  const ch = c.check;
  if (!ch) $("#checks").replaceChildren(el("li", { class: "empty", text: "Not judged: launched less than 30 seconds ago." }));
  else if (ch.dead) { $("#checked-at").textContent = `Judged ${clock(ch.at - l.seen_ms)} after launch.`; $("#checks").replaceChildren(el("li", {}, el("span", { class: "mark unknown", text: "dead" }), el("span", { text: `${ch.buyers ?? 0} outside buyers at 0:30. Fewer than three: not checked further.` }))); }
  else {
    $("#checked-at").textContent = `Judged ${clock(ch.at - l.seen_ms)} after launch · ${ch.independent} independent buyers · ${ch.pure ? "pure" : "not pure"}.`;
    $("#checks").replaceChildren(
      ...ch.checks.map((x) => el("li", {}, el("span", { class: `mark ${x.result}`, text: x.result }), el("span", { text: x.fact }))),
      ...(ch.facts ?? []).map((f) => el("li", {}, el("span", { class: "mark fact", text: "fact" }), el("span", { text: f }))));
  }
  const p = c.post;
  $("#post-state").textContent = !p ? "Not posted." : p.kind === "control" ? "Pure, held back as part of the comparison set: watched, not posted." : p.kind === "capped" ? "Pure, not posted: the hourly cap was reached." : p.state === "broken" ? `Posted, then edited: ${p.broke_reason}` : "Posted to Assay Office.";
  $("#posttext").textContent = p?.text ?? "—";
  $("#timeline").replaceChildren(...(c.timeline.length ? c.timeline.map((t) => el("li", {}, el("span", { class: "at", text: clock(t.at_ms - l.seen_ms) }), el("span", { text: t.text }))) : [el("li", { class: "empty", text: "No events." })]));
  api("summary").then(setLive).catch(() => setLive(null));
}

// ── boot ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const page = document.body.dataset.page;
const run = page === "tape" ? tapePage : page === "coin" ? coinPage : () => api("summary").then(setLive);
const loop = () => run().catch((e) => { console.error(e); setLive(null); });
loop();
if (page !== "how") setInterval(() => { if (!document.hidden) loop(); }, page === "tape" ? 5000 : 10000);
