# Costs

The brief allows real spending, so the question isn't "free or not" but "spent where it buys the most". Prices change.
Every line marked **verify** gets checked against the provider's current page before build, and the result goes in
this table with the date.

## By provider

| need | options | pricing shape | status |
|---|---|---|---|
| X reads (profiles, timelines, followers, search) | X API pay-per-use (the Meexworks app already has prepaid credits); third-party X data APIs | per resource read | **verify**: the biggest line, and the one that decides how deep T2 can go |
| Solana stream | Yellowstone gRPC (Triton / Helius / own node), PumpPortal websocket (free) | monthly plan | **verify** |
| Solana RPC + history | Helius / Alchemy / Triton | credits per call | **verify**; 🔴 an exhausted Helius key still answers `getHealth: ok`, so monitor credits, not health |
| model calls (classification, extraction, clustering) | a small fast model for bulk classification, a larger one only for reviewer briefs | per token | **verify**; batch API halves bulk cost |
| embeddings (narratives, text similarity) | any embedding API, or a local model on the box | per token / free | local is fine at this volume |
| news | news search API, crypto outlet RSS (free), Google News RSS (free) | per call / free | **verify** |
| domains | RDAP (free), crt.sh (free), Wayback CDX (free) | free, rate-limited | — |
| Telegram | Bot API (free), a member account for groups | free | — |
| Farcaster | Neynar | plan | existing key |
| storage | R2, Postgres | per GB | small: observations are rows, captures dedupe |
| compute | the Hetzner box, Workers Paid (already paid) | flat | existing |
| reviewer time | people | per hour | the real cost of `curated` |

## By tier (to fill in once prices are verified)

| tier | coins per day | reads per coin | model tokens per coin | cost per coin | per month |
|---|---|---|---|---|---|
| T0 | every launch | 0 X | 0 | RPC only | |
| T1 | | ~3 X | ~2k | | |
| T2 | | ~50–200 X | ~30k | | |
| T3 | | T2 on schedule | + reviewer brief | + reviewer time | |

The two levers: the **T1→T2 threshold** (how many coins get the expensive pass) and **cache hit rate** (follower and
author classes shared across coins). Track both from day one; the second should climb every week.
