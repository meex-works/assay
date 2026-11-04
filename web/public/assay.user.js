// ==UserScript==
// @name         assay overlay for pump.fun
// @namespace    https://assay.meex.work
// @version      0.2.0
// @description  assay's verdict on every pump.fun coin: a badge on each coin link, and the evidence on each coin page. Read-only: no wallet access, no prices.
// @author       SHYGUY LLC
// @license      MIT
// @homepageURL  https://github.com/meex-works/assay
// @supportURL   https://github.com/meex-works/assay/issues
// @match        https://pump.fun/*
// @connect      assay.meex.work
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @downloadURL  https://assay.meex.work/assay.user.js
// @updateURL    https://assay.meex.work/assay.user.js
// ==/UserScript==

/*
 * How it works, so you can check it does nothing else:
 *  - It reads the page's links to /coin/<mint>, asks assay.meex.work what it found for those mints (one request per
 *    batch of up to 100), and draws a small badge on each link.
 *  - On a coin page it shows a panel with the checklist, the post if there was one, and the timeline.
 *  - It never reads or touches your wallet, never signs anything, never sends anything but mint addresses.
 *  - Everything it draws lives in a Shadow DOM, so pump.fun's styles and its own never mix. Coin names are untrusted
 *    text and are only ever set with textContent.
 */
(function () {
  "use strict";
  const API = "https://assay.meex.work/api";
  const SITE = "https://assay.meex.work";
  const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const TTL = 30_000;                       // re-ask about a mint after 30 s (verdicts change during the watch)
  const cache = new Map();                  // mint → { at, data|null }
  let badgesOn = GM_getValue("badges", true);
  let showUnseen = GM_getValue("unseen", false);   // coins assay hasn't seen (most of pump.fun's front page) get no badge by default

  GM_registerMenuCommand(`${badgesOn ? "Hide" : "Show"} assay badges`, () => { GM_setValue("badges", !badgesOn); location.reload(); });
  GM_registerMenuCommand(`${showUnseen ? "Hide" : "Show"} "not seen" badges`, () => { GM_setValue("unseen", !showUnseen); location.reload(); });

  // The glow on a pure coin's card lives in the page (the card is pump.fun's element), under one prefixed attribute.
  const PAGE_CSS = `
    [data-assay-card="pure"] { box-shadow: 0 0 0 2px #22c55e, 0 0 22px 2px rgba(34,197,94,.55) !important; border-radius: 10px; }
    [data-assay-card="watch"] { box-shadow: 0 0 0 2px #22c55e, 0 0 22px 2px rgba(34,197,94,.55) !important; border-radius: 10px; animation: assay-glow 2.4s ease-in-out infinite; }
    [data-assay-card="broken"] { box-shadow: 0 0 0 1px rgba(239,68,68,.75) !important; border-radius: 10px; }
    @keyframes assay-glow { 50% { box-shadow: 0 0 0 2px #4ade80, 0 0 34px 6px rgba(74,222,128,.75); } }
    @media (prefers-reduced-motion: reduce) { [data-assay-card="watch"] { animation: none; } }`;
  document.head.append(Object.assign(document.createElement("style"), { textContent: PAGE_CSS }));

  // ── data ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const get = (url) => new Promise((resolve) => {
    GM_xmlhttpRequest({ method: "GET", url, timeout: 10_000, responseType: "json",
      onload: (r) => resolve(r.status === 200 ? (typeof r.response === "object" ? r.response : JSON.parse(r.responseText)) : null),
      onerror: () => resolve(null), ontimeout: () => resolve(null) });
  });

  let queued = new Set(), timer = null;
  function want(mint) {
    const c = cache.get(mint);
    if (c && Date.now() - c.at < TTL) return;
    queued.add(mint);
    timer ??= setTimeout(flush, 400);
  }
  async function flush() {
    timer = null;
    const mints = [...queued].slice(0, 100);
    mints.forEach((m) => queued.delete(m));
    if (queued.size) timer = setTimeout(flush, 400);
    if (!mints.length) return;
    const res = await get(`${API}/batch?mints=${mints.join(",")}`);
    const now = Date.now();
    for (const m of mints) cache.set(m, { at: now, data: res ? res[m] ?? null : undefined });
    paint();
  }

  // ── look ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const CSS = `
    :host { all: initial; }
    .b { font: 800 11.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; text-transform: uppercase;
         padding: 5px 9px; border-radius: 999px; white-space: nowrap; display: inline-flex; gap: 5px; align-items: center;
         cursor: help; box-shadow: 0 1px 3px rgba(0,0,0,.5); }
    .b::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .pure, .watch { background: #22c55e; color: #052e14; box-shadow: 0 0 12px 2px rgba(34,197,94,.7), 0 1px 3px rgba(0,0,0,.5); }
    .watch { animation: g 2.4s ease-in-out infinite; }
    @keyframes g { 50% { box-shadow: 0 0 20px 5px rgba(74,222,128,.85), 0 1px 3px rgba(0,0,0,.5); } }
    .broken { background: #dc2626; color: #fff; } .impure { background: #f97316; color: #1c0a00; }
    .pending { background: #d9a441; color: #1a1d22; }
    .dead, .not_alive { background: #374151; color: #cbd5e1; opacity: .8; } .unseen { background: #1f2937; color: #9ca3af; opacity: .7; }
    @media (prefers-reduced-motion: reduce) { .watch { animation: none; } }
    .p { position: fixed; right: 16px; bottom: 16px; width: 340px; max-height: 70vh; overflow: auto; z-index: 2147483647;
         background: #1c2025; color: #ece6d8; border: 1px solid #d9a44180; border-radius: 12px; box-shadow: 0 10px 40px #0008;
         font: 13px/1.5 -apple-system, system-ui, "Segoe UI", sans-serif; }
    .p header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #31373f; position: sticky; top: 0; background: #1c2025; }
    .p header b { font: 500 16px Georgia, serif; } .p header .x { margin-left: auto; background: none; border: 0; color: #868d97; font-size: 16px; cursor: pointer; }
    .p section { padding: 10px 12px; border-bottom: 1px solid #31373f; } .p section:last-child { border: 0; }
    .p h4 { margin: 0 0 6px; font: 600 10.5px ui-monospace, Menlo, monospace; text-transform: uppercase; letter-spacing: .08em; color: #868d97; }
    .row { display: grid; grid-template-columns: 54px 1fr; gap: 8px; padding: 3px 0; }
    .m { font: 600 10px/1.9 ui-monospace, Menlo, monospace; text-transform: uppercase; }
    .m.pass { color: #9fd3ab; } .m.fail { color: #f0a193; } .m.unknown, .m.fact { color: #868d97; }
    .t { font: 12px/1.5 ui-monospace, Menlo, monospace; color: #bdb6a8; } .t i { font-style: normal; color: #e8c47a; margin-right: 6px; }
    a { color: #e8c47a; } .small { color: #868d97; font-size: 12px; }
    .min { width: auto; } .min section { display: none; }
  `;
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  function label(d) {
    if (d === undefined) return null;                       // the request failed: draw nothing rather than guess
    if (d === null) return showUnseen ? ["unseen", "not seen", "assay hasn't seen this coin (launched before assay started, or just now)"] : null;
    if (d.post?.state === "dead") return ["broken", "died", d.post.reason];
    if (d.post?.state === "broken") return ["broken", "broke", d.post.reason];
    if (d.post && Date.now() - d.launched < 15.5 * 60_000) return ["watch", "pure · watching", "Pure at 0:30, watched for 15 minutes"];
    const map = { pure: ["pure", "pure", "Pure at 0:30"], impure: ["impure", "not pure", d.reason], dead: ["dead", "dead", d.reason], not_alive: ["not_alive", "few buyers", "Under 10 independent buyers at 0:30"], pending: ["pending", "judging", "Judged 30 s after launch"] };
    return map[d.verdict] ?? null;
  }

  // ── badges on coin links ──────────────────────────────────────────────────────────────────────────────────────────
  const BADGE = "data-assay-badge";
  function mintOf(a) {
    const m = /\/coin\/([^/?#]+)/.exec(a.getAttribute("href") || "");
    return m && MINT.test(m[1]) ? m[1] : null;
  }
  function scan() {
    if (!badgesOn) return;
    for (const a of document.querySelectorAll('a[href*="/coin/"]')) { const m = mintOf(a); if (m) want(m); }
  }
  function paint() {
    if (!badgesOn) return;
    for (const a of document.querySelectorAll('a[href*="/coin/"]')) {
      const m = mintOf(a); if (!m) continue;
      const c = cache.get(m); if (!c) continue;
      const lab = label(c.data);
      const card = lab && (lab[0] === "pure" || lab[0] === "watch" || lab[0] === "broken") ? lab[0] : null;
      if (card) a.setAttribute("data-assay-card", card); else a.removeAttribute("data-assay-card");
      let host = a.querySelector(`:scope > [${BADGE}]`);
      if (!lab) { host?.remove(); continue; }
      if (!host) {
        host = document.createElement("span");
        host.setAttribute(BADGE, "");
        host.style.cssText = "position:absolute;top:6px;right:6px;z-index:5;pointer-events:auto;";
        if (getComputedStyle(a).position === "static") a.style.position = "relative";
        const root = host.attachShadow({ mode: "open" });
        root.append(Object.assign(document.createElement("style"), { textContent: CSS }), h("span", "b"));
        a.append(host);
      }
      const b = host.shadowRoot.querySelector(".b");
      if (b.textContent !== lab[1] || !b.classList.contains(lab[0])) { b.className = `b ${lab[0]}`; b.textContent = lab[1]; }
      b.title = `assay: ${lab[2] ?? lab[1]}`;
    }
  }

  // ── the panel on a coin page ──────────────────────────────────────────────────────────────────────────────────────
  let panelFor = null, panelHost = null;
  async function coinPage() {
    const m = /^\/coin\/([^/?#]+)/.exec(location.pathname)?.[1];
    if (!m || !MINT.test(m)) { panelHost?.remove(); panelHost = null; panelFor = null; return; }
    if (panelFor === m && panelHost?.isConnected) return;
    panelFor = m;
    const c = await get(`${API}/coin/${m}`);
    if (panelFor !== m) return;
    panelHost?.remove();
    panelHost = document.createElement("div");
    const root = panelHost.attachShadow({ mode: "open" });
    const p = h("div", `p${GM_getValue("min", false) ? " min" : ""}`);
    const head = h("header"); head.append(h("b", null, "assay"));
    const close = h("button", "x", GM_getValue("min", false) ? "+" : "–"); close.title = "Collapse";
    close.onclick = () => { const min = !p.classList.contains("min"); p.classList.toggle("min", min); close.textContent = min ? "+" : "–"; GM_setValue("min", min); };
    root.append(Object.assign(document.createElement("style"), { textContent: CSS }), p);
    if (!c) {
      head.append(h("span", "b unseen", "not seen"), close); p.append(head);
      const s = h("section"); s.append(h("div", "small", "assay hasn't seen this coin. It only knows launches since 4 November 2026."));
      p.append(s); document.body.append(panelHost); return;
    }
    const lab = label(cache.get(m)?.data ?? (await get(`${API}/batch?mints=${m}`))?.[m] ?? null) ?? ["pending", "judging"];
    head.append(h("span", `b ${lab[0]}`, lab[1]), close); p.append(head);
    const ch = c.check, launched = c.launch.seen_ms;
    const s1 = h("section"); s1.append(h("h4", null, ch ? `Checklist at ${clock(ch.at - launched)}` : "Checklist"));
    if (!ch) s1.append(h("div", "small", "Judged 30 seconds after launch."));
    else if (ch.dead) s1.append(h("div", "small", ch.reason === "mc" ? `Market cap about $${Math.round(ch.mcUsd).toLocaleString("en-US")} at 0:30: dead on arrival.` : `${ch.buyers ?? 0} outside ${ch.buyers === 1 ? "buyer" : "buyers"} at 0:30: dead on arrival.`));
    else for (const x of [...(ch.checks ?? []), ...(ch.facts ?? []).map((f) => ({ result: "fact", fact: f }))]) { const r = h("div", "row"); r.append(h("span", `m ${x.result}`, x.result), h("span", null, x.fact)); s1.append(r); }
    p.append(s1);
    if (c.timeline?.length) {
      const s2 = h("section"); s2.append(h("h4", null, "Since launch"));
      for (const t of c.timeline) { const d = h("div", "t"); d.append(h("i", null, clock(t.at_ms - launched)), document.createTextNode(t.text)); s2.append(d); }
      p.append(s2);
    }
    const s3 = h("section"); const a = h("a", null, "The full evidence on assay.meex.work"); a.href = `${SITE}/c/${m}`; a.target = "_blank"; a.rel = "noopener";
    s3.append(a, h("div", "small", "No prices. Not a recommendation: do your own research."));
    p.append(s3);
    document.body.append(panelHost);
  }

  // ── run ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  let pending = false;
  new MutationObserver(() => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; scan(); paint(); }); })
    .observe(document.body, { childList: true, subtree: true });
  let last = "";
  setInterval(() => { if (location.pathname !== last) { last = location.pathname; coinPage(); } scan(); }, 1000);   // SPA navigation
  scan(); coinPage();
})();
