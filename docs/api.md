# API

One read API serves the harness, the overlay and anyone else. JSON over HTTPS, versioned in the path. The report shape
is [schema/report.v1.json](../schema/report.v1.json).

## Endpoints

```
GET  /v1/coins/{mint}                       the report: tier, dimensions, flags, top evidence, note
GET  /v1/coins/{mint}?as_of=2026-11-02T18:00Z   the report as assay knew it at that moment (see below)
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

`GET /v1/coins/{mint}` on a coin assay hasn't checked returns the T0 report straight away and queues T2 (demand
escalation). The response says so: `"pending": ["t2"]`, with `Retry-After`.

## Point-in-time (`as_of`)

Every observation has `observed_at`. `as_of` rebuilds the report from observations observed at or before that moment,
with the scoring version that was live then. That gives a harness something it can backtest against without lookahead:
"what did assay say about this coin an hour after launch" has one answer, and it never changes later.

Corrections never rewrite history. A wrong observation gets a superseding observation (`supersedes: <id>`), and both
remain visible.

## For agents

- **MCP server** (`assay-mcp`): tools `assay_lookup(mint)`, `assay_batch(mints)`, `assay_feed(tier, since)`,
  `assay_explain(mint, dimension)`, which returns the evidence as short sentences with links, ready to quote.
- **One-call summary**: `GET /v1/coins/{mint}?format=brief` returns ≤ 600 characters of plain text: tier, the five
  dimensions, flags, and the three strongest observations. It fits in a prompt without a parser.
- **SDK**: a thin TypeScript client on npm, and a Python one. Both are generated from the schema.

## Auth and limits

- API keys (header `Authorization: Bearer`). A free key for the overlay and light use; paid keys lift the limits and
  unlock `evidence`, `history`, `as_of`, `stream` and webhooks.
- `ETag` + `Cache-Control: max-age` per tier (unchecked 30 s, checked 5 min, curated 15 min); `If-None-Match` is free.
- Payment by API key and card to start. Per-call payment over x402 (USDC, no account) is a natural second option for
  agents: it's a payment header, not a contract.

## Versioning

`/v1` never changes a field's meaning. New fields can be added. The scoring version is a field in every report
(`scoring: "2026.11.1"`), so a change in weights is visible and replayable.
