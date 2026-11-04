# Verified against mainnet

The plan's claims about pump.fun, checked against the program's published interface and against real launches. The
scripts are in [research/pump-verify](../research/pump-verify) and anyone can re-run them with an RPC URL; nothing
they do needs a key.

**Sources:** pump.fun's published IDLs ([pump-fun/pump-public-docs](https://github.com/pump-fun/pump-public-docs),
`idl/` at commit `639b87f`, 2026-10-13), and mainnet launches sampled through the program's mint-authority account,
which only create transactions touch.

**Sample (2026-11-04):** 41,510 successful launches over 20.75 hours (2026-11-03 07:10 → 2026-11-04 03:55 UTC), with
398 of them decoded in full, spread evenly across the window. One day is one day: the rates below get re-measured
weekly.

## Verdicts

| claim in the plan | verdict | what mainnet shows |
|---|---|---|
| ~100k launches a day | **wrong** | **~48,000 a day.** 1,088 in the quietest hour (07:00 UTC), 2,723 in the busiest (19:00 UTC). A further 7.8% of create attempts fail. |
| launches use `create_v2` (Token-2022) | **mostly** | 99.5% `create_v2` on Token-2022. Legacy `create` (classic SPL) still happens: 2 of 398. |
| legacy `create` coins can't be bought | **contradicted** | both legacy launches in the sample include a buy in their own transaction. To check against later trades. |
| events can be decoded straight from the program logs | **verified, with a caveat** | in 398 of 398 launches, `CreateEvent` and `TradeEvent` appear in the logs (`Program data:`) *and* as self-CPI inner instructions. No log truncation in create transactions. In the live trade stream, 0.3% of transactions had truncated logs with the event only in the inner instructions, so the decoder reads inner instructions first ([live feeds](#the-live-feeds-2026-11-04-60-s-researchstream-smoke)). |
| `create_v2` carries launch config | **verified, and there's more** | arguments: `is_mayhem_mode`, `is_cashback_enabled`, `creator_fee_bps`, `is_holder_reward`. `CreateEvent` adds `quote_mint` and `depth`. |
| mayhem mode mints extra supply | **verified** | every mayhem coin checked has **2,000,000,000** tokens on-chain; `CreateEvent.token_total_supply` says 1,000,000,000 for all coins. Supply must be read from the mint, not the event. |
| mayhem is a corner case | **wrong** | **36%** of launches are mayhem. |
| nearly all coins are quoted in SOL | **wrong** | **71% SOL** (the quote mint is the system program's address as a sentinel). 29% are quoted in something else: $PUMP (9%), tokenized stocks (DJT, AMD and the `Xs…` xStocks), other pump coins (curve `depth` 1), USDC (0.5%). |
| holder rewards, custom creator fees | **verified** | holder rewards on 20%. A custom creator fee on 24%, most of those at the 300 bps maximum. Cashback: 0 of 398. |
| fee sharing via a per-mint config | **verified in the IDL** | `SharingConfig { mint, admin, admin_revoked, shareholders[{address, share_bps}] }` in the fees program; trade events carry the shareholder list. No create transaction in the sample set shareholders at launch. Also in the fees program: social-fee and donation-fee accounts. |
| the dev's buy is in the create transaction | **verified** | 77% of launches include exactly one buy, by the signer, in the create transaction. 23% have no dev buy. Median dev buy 0.35% of supply; top tenth above 12.6%; largest 79%. |
| a bundle shows up as buys in the create transaction | **wrong** | 2 of 398 had more than one buy in the create transaction. Bundles are separate transactions. See [early trades](#early-trades). |
| the creator is the signer | **not always** | 20% of launches are signed by a different wallet than the `creator` field: a launch service creating on someone's behalf. Purity checks have to look at both. |
| the create is a top-level instruction | **not always** | 30% of creates are made through another program (a launch tool's contract). Decoding top-level instructions alone misses them; the event-based decoder doesn't. |
| (not in the plan) transaction versions | **new** | **64% of launches are version-1 transactions**, which `@solana/web3.js` 1.x refuses to deserialize. The decoder reads raw JSON-RPC. |
| (not in the plan) mint addresses end in `pump` | **mostly** | 77%. The rest use a mint keypair the creator supplied. |
| (not in the plan) the launch tool is visible | **new** | the metadata URI's host names it: pump.fun's own uploader (`ipfs.io`, 62%), `metadata.j7tracker.io` (19%), `meta.uxento.io`, `m.rapidlaunch.io`, `ipfs.launchblitz.ai`, and dozens of small hosts. Mayhem launches come almost entirely through pump.fun's own uploader; launches signed by a third party mostly through j7tracker. A `launch_tool` trait. |

## Early trades

The first 60 seconds of trading on two spread samples of launches at least an hour old (40 coins each; 75 analysed,
5 skipped because they had more than 4,000 transactions). For every early buyer: net position at the end of the minute,
the slot it bought in relative to the create, and its funder (the account whose SOL fell most in the wallet's earliest
transaction). Raw results in [research/pump-verify/results](../research/pump-verify/results).

| finding | what it means for the plan |
|---|---|
| **Most launches are dead on arrival.** Median 3 buyers in the first minute; a quarter had none. | The `alive` gate is what keeps the pure channel and the funder tracing affordable. |
| **One wallet buys into most mayhem coins.** `BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s` bought 14 of the sampled mayhem coins within 1–5 s of launch, up to 11% of supply. It holds ~66,000 SOL, sends ~760 transactions a minute, and calls the mayhem program. It's pump's mayhem agent. | A new wallet class, `mayhem_agent`, known by address. Without it, every mayhem coin reads as bundled. |
| **A funder shared by slot-0 buyers is real and catches bundles.** In `9nGAGV…`, three wallets bought 14.2% of supply in the create's own slot, all funded by `5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`: an ordinary wallet (4 SOL, ~0.1 transactions a minute) that funded 15 early buyers across the sample. A second, `9yg57cFdiUoszxspvceVcZgMbw6H1LeXVBzAV6cXd6Xg`, funded 13. | Verified. These are **dispersers**: wallets that seed bundle wallets across many coins. A new class, and the cross-coin index makes them cheap to recognise: the second time a disperser shows up, it's already known. |
| **A funder alone misses bundles too.** In `9RnrGaZX…`, 4 brand-new wallets bought 49.7% of supply in the create's slot, each funded from a different source. | Verified the review's warning. Same-slot + fresh-wallet timing caught what funding missed. The late-bundle clustering ([pure.md](pure.md#bundles-that-arrive-after-the-post)) needs all its signals, not just a shared parent. |
| **Some buyers are funded from a program.** One funder (`5cMKyZ…`) is an account owned by a program named `mixp…`, funding 4 early buyers. | A `mixer_funded` signal once the program is identified. |
| **The one-hop funder heuristic breaks on busy wallets.** For a wallet with more than ~3,000 transactions, the earliest reachable transaction isn't its first, so the "funder" is wrong (it named a pump-program account as the mayhem agent's funder). | Busy wallets get classed by activity (`sniper`, `mayhem_agent`, `router`), never by funder. Funder tracing is only for wallets young enough to have a first transaction in reach, which is exactly the bundle case. |
| **Cost.** Median 33–55 RPC calls per coin for its first minute plus one-hop funders of every early buyer; maximum 264. 196 funder lookups in run two came down to 79 distinct funders. | In production the trade stream is free; funder lookups are the cost (~2 calls per new wallet), cached across coins. At ~48k launches a day, tracing only coins past the `alive` gate is what makes it affordable. A free RPC tier can't run it live. |

## The live feeds (2026-11-04, 60 s, [research/stream-smoke](../research/stream-smoke))

Both feeds running at once: Alchemy Yellowstone gRPC (every successful pump transaction, `processed`) and a Helius
websocket on the mint-authority account (launches only).

| check | result |
|---|---|
| launches seen | **22 by both, 0 by only one.** The two sources reconcile. |
| which saw each launch first | **gRPC, all 22**, by a median of **167 ms** |
| successful pump transactions | 55.5/s, of which 39/s are trades |
| gRPC bandwidth | **437 KB/s ≈ 1.13 TB a month**, about twice the logs-based estimate: gRPC carries the whole transaction, balances and inner instructions |
| transactions with no pump event in their logs | 14%. Of those: most never call pump (they only list its address, through a bot's router or a memo); most of the rest are fee instructions or PumpSwap events (a different IDL); **0.3% had truncated logs** and their pump event existed only as an inner instruction |

So events are read from the inner instructions first (gRPC delivers them) and from the logs as a fallback; and the
subscription filters on pump's **event authority** account rather than the program address, which drops the
transactions that never call pump.

## What changed in the plan because of this

- L0's decoder reads raw JSON-RPC (version-1 transactions) and decodes events, not top-level instructions (creates
  through other programs).
- Supply and every holder share come from the mint account, never from `CreateEvent` (mayhem doubles it).
- Sizing uses ~48k launches a day, peaking near 2,700 an hour.
- New wallet classes: `mayhem_agent` (by address), `disperser` (funds bundle wallets across coins), and
  `mixer_funded`. Busy wallets are classed by activity, never by funder.
- Bundle detection uses shared funders *and* same-slot fresh wallets; each catches bundles the other misses.
- New traits: `launch_tool` (from the metadata host and the calling program), `signer_is_creator`, `quote_mint` with
  its class (SOL, $PUMP, stock, pump coin, stablecoin), `mayhem`, `holder_reward`, `creator_fee_bps`.
