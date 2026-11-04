# Architecture

assay is built for the trenches: coins minutes old, scored while they still matter. Speed comes from a fixed rule: the
first answer is fast and rough, and every later loop makes it better. No layer waits for the one after it.

## The shape

```mermaid
flowchart LR
  subgraph chain[Solana]
    P[pump program<br/>create / create_v2 / trades / migrate]
  end
  P -->|gRPC / websocket| I[ingest]
  I -->|pump.launch<br/>pump.trade<br/>pump.migrated| BUS[(event bus<br/>NATS JetStream)]
  BUS --> L0[L0 reflex<br/>&lt; 1.5 s]
  L0 -->|assay.obs · assay.score| BUS
  BUS --> L1[L1 glance<br/>&lt; 30 s]
  L1 --> BUS
  BUS --> L2[L2 sweep loop<br/>every 3 min]
  L2 --> BUS
  BUS --> L3[L3 deep<br/>minutes]
  L3 --> BUS
  BUS --> L4[L4 review agent]
  L4 --> BUS
  BUS --> API[API · SSE · MCP]
  BUS --> TG[Telegram channel]
  BUS --> YOU[your agent]
  API --> OV[pump.fun overlay]
```

Everything goes over the bus, in both directions. A layer reads events, writes **observations** and **score
snapshots** back to it, and moves on. The API, the Telegram channel, the overlay and anyone's agent are all just
consumers of the same bus.

## The event bus

**NATS JetStream** by default: a single binary, durable streams, consumers that resume where they stopped, and replay
from any point in time. Replay matters twice: a new layer can be backfilled by replaying a week of launches through
it, and an agent can rewind the tape to see what assay knew at the time. A Redis Streams adapter can come later.
The bus interface is small enough that swapping it out is a single file.

Topics, envelope and examples: [events.md](events.md).

## The layers

Each layer has a **latency budget**, a set of signals it's allowed to read, and a **decision** it must make before its
budget runs out: `drop` (cold: rechecked only on activity or a lookup), `watch` (into the sweep set), or `promote` (to
the next layer now).

| layer | budget | reads | decides |
|---|---|---|---|
| **L0 reflex** | p95 < 1.5 s after the create tx lands | on-chain arguments only (launch config, quote, holder-reward and sharing settings), in-memory caches: creator lineage, funding clusters, ticker collisions (with homoglyphs), metadata URI/CID reuse, wallet classes of the first buyers. No network calls | drop / watch / promote |
| **L1 glance** | < 30 s, **only once the curve is alive** (≥ x SOL from ≥ y independent funding sources) | metadata JSON (socials), image hash + embedding + OCR, **at most one X user lookup**, website fetch + RDAP, Telegram count, mint-on-site, link shape, category | drop / watch / promote |
| **L2 sweep** | a loop, every 3 min (configurable): the cadence for **social reads** | every coin in the watch set that fits the window's budget: new mentions and callouts, X engagement deltas, Telegram growth, sibling versions | demote / hold / promote |
| **L3 deep** | minutes | follower sample, reply clustering, mindshare search (the only layer that reads followers or searches X), news + outlet class, full funding trace, wash analysis, reverse image search, callout event study | flag / hold / promote to review |
| **L4 review** | minutes; a coin realistically reaches it 30–90 min after launch | the whole evidence bundle, as quoted data | `curated` or not, with a written note |

### The tape

Alongside the layers, **the tape** processes every `pump.trade` as it arrives and keeps the Chain dimension current
within seconds: classed wallets entering (`predator_entered`), bundle and dev sells, fee claims, holder growth net of
program-held balances. It's the cheapest part of assay and the part trench traders need first, so it never waits for
a sweep. The sweep loop is for what costs money to read: social data.

**Decisions are taken for every enabled lens, not just the curator.** A coin is dropped only when no enabled lens
could want it. A heavy bundle sends a coin out of the curator's path and straight into the volatility lens's, so it
stays on the watch set. An instance that only runs the curator lens drops more and spends less.

L0 makes no network calls. Everything it needs is in the create transaction or already in memory; the metadata JSON
and the image are L1's. A late answer from a layer is never thrown away; it updates the coin's
score whenever it lands.

### The sweep loop

The core of it, and the part that does the most work. Every window (default 3 minutes):

1. Take the watch set and rank it by **priority** = activity since the last pass (new holders, volume, new mentions,
   lookups) × staleness of the coin's last observations.
2. Work down the ranking until the **window budget** runs out. The budget is time, X reads and model tokens, all
   configured by whoever runs it.
3. Whatever doesn't fit rolls over. Staleness keeps rising, so a quiet coin works its way back up and nothing starves.
4. Publish the window's stats (`assay.sweep`): coins seen, coins skipped, reads spent, median age of the data. That
   tells you how big the budget needs to be.

More budget means more coins per window and fresher data on each one. That's the one setting that scales assay from
a laptop up to a fleet, and the reason spending more money buys more coverage.

### The review agent (L4)

The `curated` tier is decided by an agent reading the evidence, not by a person on a rota:

- It sees the evidence bundle as **quoted data** (the coin's own text is fenced and labelled as untrusted), and answers
  in a fixed schema: decision, note, which observations it relied on.
- It can only promote a coin whose deterministic gates already pass (no open flags, confidence ≥ 0.7 on every
  dimension). It can raise a flag. It can't clear one.
- The note is signed `agent:<model>@<prompt version>`, so a change of model or prompt shows up on every report it
  touches.
- The exact model ID is part of that signature, and the deterministic gates are re-run before any note is trusted.
- Whoever runs the instance can override any decision. The override is a signed observation that stays on the record.

## The cross-coin indexes

What makes assay better every week is what it learns across coins, kept as shared indexes that every layer reads:

| index | built from | feeds |
|---|---|---|
| wallet reputation (wallet and funding cluster → class) | every pump.fun trade since launch, plus a backfill | L0 first buyers, `predator_entered`, `bundled`, Chain |
| creator lineage | every launch | `serial_creator`, `relaunch_of` |
| image index (hashes + embedding vectors) | every coin image | the vamp pipeline |
| author index (X user ID → quality, caller history, handle history) | every author assay has read | Mindshare, callouts, `influencer_involved` |
| follower classes | every follower sampled | Authenticity |
| outcome history (traits × outcomes, by window) | assay's own records | lenses only; never the curator lens |
| meta preference (pairing and fee config → what the market chose) | narrative clusters with several versions, daily | `config_vs_meta` |
| templates (site fingerprints, meme templates) | every crawl and image | Presence, vamp `template` class |

### Backfill before day one

L0 is only as good as its caches. Before an instance goes live, it backfills every historical pump.fun launch: creators,
tickers, metadata URIs, images (hashes and embeddings), and the funding clusters of early buyers. Empty caches make
lineage, copies and relaunches invisible on day one. Follower overlap can't be backfilled; until it has history, its
confidence says so.

## Lenses

Lenses ([lenses.md](lenses.md)) run after scoring: a small evaluator reads observations, traits and dimensions, applies
a lens file, and emits `assay.lens.<name>`. The built-in lenses run on the instance; a harness can run its own over the
stream with the same package.

## Where it runs

| part | where |
|---|---|
| ingest, L0, L1 | one long-running process near a good RPC; hot caches in memory, warmed from Postgres at boot |
| L2, L3, L4 | workers that consume the bus; scale by adding consumers |
| bus | NATS JetStream (one node is fine to start) |
| store | Postgres: `observations` (append-only, partitioned by day), `scores`, `flags`, plus the shared caches |
| raw captures | any S3-compatible bucket, content-addressed |
| API | a stateless service over Postgres + the bus; cacheable at an edge |

The baseline is TypeScript: the language most agents read and change fastest. If the L0 hot path needs to go faster,
it's the one piece worth rewriting in Rust.

## Repo layout (planned)

```
packages/
  bus/          the bus interface + NATS adapter + in-memory adapter for tests
  ingest/       pump program listener, decoders for create / create_v2 / trade / migrate
  signals/      one module per signal: read → observation
  layers/       l0-reflex, l1-glance, l2-sweep, l3-deep, l4-review
  score/        observations → traits, dimensions, flags, tiers
  lens/         the lens evaluator (also published on its own, for harnesses)
  index/        wallet reputation, image index, author index, outcome history, meta preference
  store/        Postgres schema + migrations, capture bucket
  api/          REST + SSE + webhooks
  mcp/          the MCP server
  telegram/     the channel poster
  overlay/      the browser extension
config/
  weights.yaml  every weight, threshold and budget, in one file
  lenses/       curator, volatility, runner, clean-book, beta, original
.env.example    every key, supplied by whoever runs it
```

## Bring your own keys

assay ships with no keys and no hosted dependency. Whoever runs an instance supplies their own:

| key | for | required |
|---|---|---|
| `SOLANA_RPC_URL` | reads, history | yes |
| `SOLANA_GRPC_URL` / `SOLANA_WS_URL` | the launch stream | one of them |
| `X_BEARER_TOKEN` | X profile, timeline, followers, search (first-party X API) | for L1+ social signals |
| `MODEL_API_KEY` + `MODEL_*` | classification, extraction, the review agent | for L1+ text signals and L4 |
| `NEWS_API_KEY` | news search | for Coverage |
| `TELEGRAM_BOT_TOKEN` | channel counts, the calls channel | optional |
| `NEYNAR_API_KEY` | Farcaster | optional |

A missing key turns its signals off; it doesn't fail the run. The report says which signals were off
(`confidence` drops), so a run without X data can't pass itself off as one with it.
