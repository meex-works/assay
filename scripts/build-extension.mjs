#!/usr/bin/env node
// Builds the Manifest V3 browser extension from overlay/assay.user.js, so the two never drift apart.
//   node scripts/build-extension.mjs     → extension/dist/ (load unpacked) and extension/assay-extension.zip (for the stores)
// The userscript's GM_* calls are replaced by a small shim over chrome.storage and fetch (the API sends
// Access-Control-Allow-Origin: *, and the manifest's host_permissions cover assay.meex.work).
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const user = readFileSync(new URL("overlay/assay.user.js", root), "utf8");
const version = /@version\s+([\d.]+)/.exec(user)[1];
const body = user.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n/, "");
const shim = `// Built from overlay/assay.user.js by scripts/build-extension.mjs. Edit the userscript, not this file.
const __store = {};
chrome.storage.local.get(null, (all) => Object.assign(__store, all));
const GM_getValue = (k, d) => (k in __store ? __store[k] : d);
const GM_setValue = (k, v) => { __store[k] = v; chrome.storage.local.set({ [k]: v }); };
const GM_registerMenuCommand = () => {};   // the extension's popup-free version: badges are always on
const GM_xmlhttpRequest = (o) => fetch(o.url, { signal: AbortSignal.timeout(o.timeout ?? 10000) })
  .then(async (r) => o.onload({ status: r.status, response: await r.json().catch(() => null) }))
  .catch(() => (o.onerror ?? (() => {}))());
`;
const dist = new URL("extension/dist/", root);
rmSync(dist, { recursive: true, force: true });
mkdirSync(new URL("icons/", dist), { recursive: true });
// wait for chrome.storage before running, so a collapsed panel stays collapsed
writeFileSync(new URL("content.js", dist), `${shim}\nchrome.storage.local.get(null, (all) => { Object.assign(__store, all);\n${body}\n});\n`);
writeFileSync(new URL("manifest.json", dist), JSON.stringify({
  manifest_version: 3,
  name: "assay for pump.fun",
  version,
  description: "assay's verdict on every pump.fun coin: a badge on each coin, the evidence on each coin page. Read-only: no wallet access, no prices.",
  homepage_url: "https://assay.meex.work/overlay",
  icons: { 16: "icons/16.png", 48: "icons/48.png", 128: "icons/128.png" },
  content_scripts: [{ matches: ["https://pump.fun/*"], js: ["content.js"], run_at: "document_idle" }],
  host_permissions: ["https://assay.meex.work/*"],
  permissions: ["storage"],
}, null, 2) + "\n");
for (const s of [16, 48, 128]) execFileSync("sips", ["-z", String(s), String(s), new URL("brand/logo.png", root).pathname, "--out", new URL(`icons/${s}.png`, dist).pathname], { stdio: "ignore" });
const zip = new URL("extension/assay-extension.zip", root).pathname;
rmSync(zip, { force: true });
execFileSync("zip", ["-qr", zip, "."], { cwd: dist.pathname });
console.log(`extension ${version} → extension/dist/ and extension/assay-extension.zip`);
