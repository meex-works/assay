# API

One read API serves the harness, the overlay and anyone else. JSON over HTTPS, versioned in the path. The report shape
is [schema/report.v1.json](../schema/report.v1.json).

## Endpoints

```
GET  /v1/coins/{mint}                       the report: tier, dimensions, flags, top evidence, note
GET  /v1/coins/{mint}?as_of=2026-11-02T18:00Z   the report as assay knew it at that moment (see below)
GET  /v1/coins/{mint}?lens=volatility        the report read through a lens: passes, rank, why, outcome history
GET  /v1/lenses/{name}/passing?since=        coins currently passing a built-in lens, ranked
POST /v1/preflight                           run the launch-kit checks on a plan, before launch (docs/launch-kit.md)
POST /v1/declare                             store a passing plan, keyed by the mint's public key
GET  /v1/wallets/{wallet}                    a wallet's class and the history behind it
GET  /v1/callers/{x_user_id}                 a caller's history: their calls and what followed, with N
GET  /v1/coins/{mint}/evidence?dimension=authenticity&limit=50
GET  /v1/coins/{mint}/history?from=&to=     dimension snapshots over time
GET  /v1/coins/{mint}/related               same creator, same funding parent, same template, same follower cluster
POST /v1/coins:batch    {"mints": [...≤100]}   compact reports, for pages that list many coins
GET  /v1/feed?tier=curated&since=<cursor>   tier changes, newest first, cursor-paginated
GET  /v1/stream                             Server-Sent Events: coin.tiered, flag.raised, flag.cleared, dimension.moved, note.published
POST /v1/webhooks                           the same events, pushed, HMAC-signed
GET  /v1/creators/{wallet}                  a creator's lineage: every coin, how each ended
GET  /v1/narratives?window=24h              clusters, their coins, first movers
```

`GET /v1/coins/{mint}` on a coin assay has dropped or not reached returns the latest report straight away and emits
`assay.demand`, which puts the coin at the top of the next sweep. The response says so: `"pending": ["l2"]`, with
`Retry-After`.

## Point-in-time (`as_of`)

Every observation has `observed_at`. `as_of` rebuilds the report from observations observed at or before that moment,
with the scoring version that was live then. That gives a harness something it can backtest against without lookahead:
"what did assay say about this coin an hour after launch" has one answer, and it never changes later.

Corrections never rewrite history. A wrong observation gets a superseding observation (`supersedes: <id>`), and both
remain visible.

## For agents

- **The bus itself**: subscribe to NATS subjects directly; see [events.md](events.md).
- **MCP server** (`assay-mcp`): tools `assay_lookup(mint)`, `assay_batch(mints)`, `assay_feed(tier, since)`,
  `assay_explain(mint, dimension)`, which returns the evidence as short sentences with links, ready to quote.
- **One-call summary**: `GET /v1/coins/{mint}?format=brief` returns ≤ 600 characters of plain text: tier, the five
  dimensions, flags, and the three strongest observations. It fits in a prompt without a parser.
- **SDK**: a thin TypeScript client on npm, and a Python one. Both are generated from the schema.

## Auth and limits

- assay is self-hosted, so access is up to whoever runs the instance: open, API keys (`Authorization: Bearer`), or
  both. The reference config is open reads with a per-IP limit, which is what the free demo runs.
- `ETag` + `Cache-Control: max-age` per tier (unchecked 30 s, checked 5 min, curated 15 min); `If-None-Match` is free.
- An operator who wants to charge for their instance can put per-call payment (x402) or keys in front of it. The
  baseline doesn't.

## Versioning

`/v1` never changes a field's meaning. New fields can be added. The scoring version is a field in every report
(`scoring: "2026.11.1"`), so a change in weights is visible and replayable.
