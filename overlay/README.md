# The pump.fun overlay

A userscript that puts assay's verdict on pump.fun: a colour-coded badge on every coin link (pure coins' cards glow
green), a panel with the checklist and the timeline on every coin page, and a toast with Open / New tab buttons the
moment a coin is posted pure to Assay Office. Read-only: no wallet access, no prices. Install page: **https://assay.meex.work/overlay**.

- `assay.user.js` is the source. `npm run web` copies it to `web/public/` and deploys the site, so the installed copy
  updates itself (`@updateURL`).
- It finds coins by their `/coin/<mint>` links rather than by pump.fun's CSS classes, so a redesign doesn't break it; the
  panel floats in a corner rather than being placed inside pump.fun's layout.
- It calls two read-only endpoints: `GET /api/batch?mints=a,b,…` (up to 100) for badges and `GET /api/coin/<mint>` for the
  panel. An absent mint in a batch means "not seen", never "pure".
- Tested against mocked pump.fun pages with real mints (pump.fun's bot check stops a headless browser from loading the
  real site). If a page on pump.fun shows no badges, open an issue with the page's URL.

A browser extension (Manifest V3) built from the same code is next; it won't need a userscript manager.
