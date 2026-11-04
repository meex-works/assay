# Costs

assay is built to be good and fast, not cheap. Whoever runs it pays their own providers with their own keys (see
[architecture.md](architecture.md#bring-your-own-keys)); this page is how to work out what that comes to.

**X is first-party** (the official X API) until a measured cost estimate says otherwise. It's the biggest line by far,
and the one that sets how many coins the sweep can afford to look at closely.

## The stream, measured (2026-11-04)

| feed | rate | size per notification | per month |
|---|---|---|---|
| every pump-program transaction, failed included (`logsSubscribe` delivers all) | ~312/s, 85% failed | 4.2 KB successful, 1.2 KB failed | **~1.3 TB** |
| successful only (a gRPC `failed: false` filter) | ~46/s | ~4 KB | ~0.5 TB |
| launches only (the mint-authority account) | ~34/min | ~4 KB | ~6 GB |

The tape needs every successful trade on every coin (the wallet-reputation index is cross-coin). Failed transactions are
**not ingested**: 85% of the program's traffic, almost all of it sniper bots that lost the race, and nothing in it that
the successful trades don't already say. That's a decision about signal, not price; if a use turns up, it's one filter
flag. Scripts: `research/pump-verify/stream-size.mjs`, `stream-bytes.mjs`.

## Providers for that stream (prices as published, checked 2026-11-04)

| option | monthly | what it covers | fit |
|---|---|---|---|
| **Chainstack Growth + Yellowstone gRPC add-on** | $49 + $49 | gRPC with unlimited stream events, 2 concurrent streams, `failed: false` filtering, 20M request units for RPC calls ($15 per extra 1M) | **fits**: the whole successful stream plus funder lookups. Bandwidth metering isn't stated anywhere; confirm in week one |
| Helius Developer | $49 | 10M credits; standard and enhanced websockets metered at 20 credits/MB; webhooks 1 credit per event; gRPC mainnet not included | **doesn't fit the full stream** (~26M credits/month on logs); fits a launches-only feed (~0.12M credits) |
| Helius Business | $499 | 100M credits, LaserStream gRPC on mainnet, autoscaling | fits everything, at 10× the price |
| Triton | usage-based | reportedly ~$10 per million calls + ~$0.08/GB (a competitor's figures, unverified) | probably ~$40–100 for 0.5 TB plus calls; get a quote |
| Helius Free | $0 | 1M credits, standard websockets | fits a **launches-only second source** for reconciliation |

| **Alchemy Solana gRPC** | **$75 per TB streamed**, pay-as-you-go, no monthly minimum (not on the free tier) | Yellowstone-compatible gRPC, billed by bytes delivered; RPC calls separately (30M compute units free, then $0.52 per 1M) | **fits, and buys only the stream**: ~0.5 TB ≈ $38/month (an estimate from JSON sizes; gRPC is binary, so likely less) |

**Chosen mix for the silent week (2026-11-04):** pay only for the stream.

| job | provider | cost |
|---|---|---|
| the trade stream (gRPC, `failed: false`) | Alchemy Solana gRPC, on an app of its own | **measured 1.13 TB/month ≈ $85** (60 s sample; the silent week measures it properly) |
| the second, independent launch feed | Helius Free, websocket on the mint-authority account only | $0 (~0.12M of 1M credits) |
| funder lookups, metadata, supply | Alchemy (free compute units first), Helius Free as overflow | $0–20, measured in week one |

Measured, roughly $85–105 a month, about the same as Chainstack's flat $98; if the first bill runs higher, Chainstack is
the fallback. The stream has one paid provider; a second stream is worth adding before the channel goes live.

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
