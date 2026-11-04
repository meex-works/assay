# Costs

assay is built to be good and fast, not cheap. Whoever runs it pays their own providers with their own keys (see
[architecture.md](architecture.md#bring-your-own-keys)); this page is how to work out what that comes to.

**X is first-party** (the official X API) until a measured cost estimate says otherwise. It's the biggest line by far,
and the one that sets how many coins the sweep can afford to look at closely.

## By provider

| need | provider | pricing shape | status |
|---|---|---|---|
| X reads: profiles, timelines, followers, search | X API (first-party) | per resource read; tiers and pay-per-use have both existed, and follower endpoints may need a higher tier | **measure first**: see below. The biggest risk to the design, so every read is gated on the chain |
| launch stream | Yellowstone gRPC (Triton, Helius, or your own node); PumpPortal websocket as a free cross-check | monthly plan | verify |
| RPC + history | any Solana RPC provider | credits per call | verify. 🔴 Monitor credits, not health: an exhausted key can still answer `getHealth: ok` |
| model calls: classification, extraction, review | a small fast model for bulk L1–L3 classification; a stronger one for L4 review | per token | verify; batch where latency allows |
| embeddings | an API, or a local model | per token / free | local is fine at this volume |
| news | a news search API; crypto outlet RSS and Google News RSS (free) | per call / free | verify |
| domains | RDAP, crt.sh, Wayback CDX | free, rate-limited | — |
| Telegram | Bot API | free | — |
| store, bus, compute | Postgres, NATS, one server | flat | small |

## By layer

The figures to measure in the first week, with the X API's real prices:

| layer | coins per day | X reads per coin | model tokens per coin | cost per coin |
|---|---|---|---|---|
| L0 | every launch | 0 | 0 | RPC only |
| L1 | coins whose curve came alive | ≤ 1 | ~2k | |
| L2 | the watch set, per pass | 0–5 per pass (deltas only) | ~1k per pass | × passes |
| L3 | promoted coins | 50–200 | ~30k | |
| L4 | review queue | 0 | ~15k | |

## How to measure it

1. Run L0 + L1 for a week with the X key, L2–L4 off. Record the launch rate, the L1 pass rate, and X reads per coin.
2. Turn L2 on with a small window budget. `assay.sweep` publishes reads per window; multiply it out.
3. Turn L3 + L4 on for a fixed number of promotions per hour.
4. Fill in the table above with real numbers and a date.

## The two levers

- **The promotion thresholds** (L1→watch, L2→L3): how many coins get the expensive pass.
- **The shared-cache hit rate**: follower classes, author quality, funding parents and templates are cached across
  coins. The 500th coin followed by the same bot farm costs almost nothing to classify. This number should rise every
  week; if it doesn't, something isn't being cached.
