# Overlay and other surfaces

## The pump.fun extension

A Manifest V3 browser extension (Chrome, Brave, Firefox) that adds assay's report to pump.fun's own pages.

**On the board** (the coin grid): a small badge on each card showing the tier and a five-segment bar, one segment per
dimension. A content script collects the mints on screen with a `MutationObserver`, sends one `POST /v1/coins:batch`
per scroll settle, and caches results for the tier's `max-age`.

**On a coin page**: a panel next to the chart:

```
CHECKED · scoring 2026.11.1 · 4 min ago
Presence     ████████░░  78
Authenticity ███░░░░░░░  31   follower sample: 62% match a cluster seen on 410 other coins
Mindshare    █████░░░░░  52   41 distinct non-team authors in 24 h
Coverage     █░░░░░░░░░  10   press releases only (2 wires)
Chain        ██████░░░░  60   creator: 3 earlier coins, 1 graduated
⚑ X account was @otherhandle until 2026-11-01
```

Each line opens its evidence. Flags are shown above everything else.

**Rules the extension keeps:**
- Host permissions for pump.fun and the assay API only.
- No wallet access, no transaction building, no keys, no signing. It reads the page's mint from the URL and the DOM,
  nothing else. (Tooling that touches keys is what got an account flagged before; this stays as far from that as it
  can.)
- UI in a Shadow DOM so pump.fun's CSS and assay's never meet. When pump.fun's markup changes, the panel fails quietly
  and shows a "can't place on this page" chip; the selectors live in a remotely updated config, not in a release.
- No tracking. The only request is the lookup.

## Other surfaces, cheapest first

| surface | how |
|---|---|
| **userscript** | the same content script for Tampermonkey; ships before the store review finishes |
| **other frontends** | the same content script with per-site selectors for Axiom, GMGN, Photon, DexScreener, Birdeye |
| **share card** | `GET /v1/coins/{mint}/card.png`: an OG image of the panel, for posts and Telegram |
| **Telegram bot** | paste a mint, get the brief; a channel that posts every new `curated` coin with its note |
| **X account** | posts reviewer notes for new curated coins, and flags on coins above a size threshold |
| **public pages** | a page per coin, if the "purely a repo" scope ever changes; not in this plan |

## The harness side

An agent gets the same report through the MCP server or `?format=brief` ([api.md](api.md)). For a trading harness, the
useful pattern is a **gate**, not a signal: "only consider coins at `checked` or better with Authenticity ≥ 50 and no
flags", with `as_of` for the backtest.
