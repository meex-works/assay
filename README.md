<p align="center">
  <img src="docs/img/hero.svg" alt="assay: evidence for the trenches" width="100%">
</p>

<p align="center">
  <img alt="status: design" src="https://img.shields.io/badge/status-design-D9A441?style=flat-square">
  <img alt="license: MIT" src="https://img.shields.io/badge/license-MIT-5B93C7?style=flat-square">
  <img alt="chain: Solana" src="https://img.shields.io/badge/chain-Solana-62A872?style=flat-square">
  <img alt="launchpad: pump.fun" src="https://img.shields.io/badge/launchpad-pump.fun-62A872?style=flat-square">
  <img alt="bus: NATS JetStream" src="https://img.shields.io/badge/bus-NATS%20JetStream-8A9099?style=flat-square">
  <img alt="agents: MCP" src="https://img.shields.io/badge/agents-MCP-8A9099?style=flat-square">
  <img alt="keys: bring your own" src="https://img.shields.io/badge/keys-bring%20your%20own-8A9099?style=flat-square">
  <img alt="contracts: none" src="https://img.shields.io/badge/contracts-none-8A9099?style=flat-square">
</p>

<p align="center">
  <b>Curation scoring for pump.fun coins, from the first second.</b><br>
  Social presence, how real it is, mindshare, news and the chain, measured as evidence<br>
  and served to your agent, a Telegram channel and the pump.fun page itself.
</p>

<p align="center">
  <a href="#how-it-works">How it works</a> ·
  <a href="#the-rule">The rule</a> ·
  <a href="#what-you-get">What you get</a> ·
  <a href="#for-agents">For agents</a> ·
  <a href="#run-your-own">Run your own</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#docs">Docs</a>
</p>

---

> [!NOTE]
> **This repo is the design. There's no code yet.** It's published so the design can be read, argued with and built
> against. The [roadmap](#roadmap) says what lands first.

## Why

Most pump.fun coins list an X account, a Telegram and a website, with nothing behind them. The few that have something
behind them are hard to tell apart from the many with bought followers, a templated site and a paid press release, and
the difference has to be found in minutes, because that's how long a coin in the trenches stays relevant.

assay is a baseline for finding it: an open, forkable scoring system that an agent can listen to, a person can read,
and anyone can change.

## How it works

<p align="center">
  <img src="docs/img/layers.svg" alt="The five layers: L0 reflex under 1.5 s, L1 glance under 30 s, L2 sweep every 3 minutes, L3 deep, L4 review agent" width="100%">
</p>

Every launch goes onto an **event bus**. Five layers listen to it, and each one answers faster than the next:

- **L0 reflex** scores a coin within a second of its create transaction, from the chain alone: who created it, what
  else they've launched, where their SOL came from, whether the launch was bundled, whether the image is a copy.
- **L1 glance** follows its links within 30 seconds. Does the X account exist, and has it always been this account?
  Was the website registered yesterday? Does it show the right mint?
- **L2 sweep** is a loop. Every few minutes it works through the watch set, ranked by activity and staleness, and
  measures as many coins as its budget allows. More budget means more coins and fresher data.
- **L3 deep** spends real money on the coins that earn it: follower samples, reply clustering, mindshare net of the
  team, news sorted by whether the outlet sells placement, full funding traces, wash detection.
- **L4 review** is an agent that reads the evidence, as data, and decides whether a coin is `curated`. It writes a
  signed note. It can't promote past a failed gate, and it can't clear a flag.

No layer waits for the next one. A consumer that needs an answer in a second takes L0's, along with its confidence; a
consumer that can wait listens for the next score. [Architecture →](docs/architecture.md)

## The rule

**Weigh every signal by what it costs to fake.**

| cheap to fake | expensive to fake |
|---|---|
| 10,000 followers | a 2019 X account that has only ever had one handle |
| 500 replies saying "LFG" | 200 distinct authors with histories of *not* posting every coin |
| a press release on a newswire | a story by a named reporter at an outlet that doesn't sell placement |
| a thousand holders | a thousand holders funded from a thousand different places |
| a slick website | a domain with a Wayback history from before the coin existed |

Whatever looks predictive this month gets gamed next month. What's expensive to fake stays expensive. That's why the
weights are public: the only way to move the score is to do the expensive, real thing. [Signals →](docs/signals.md) ·
[How it gets gamed →](docs/adversarial.md)

## What you get

Every coin gets a **tier** and five **dimensions**, each with a confidence and the evidence behind it.

<p>
  <img alt="unchecked" src="https://img.shields.io/badge/-UNCHECKED-8A9099?style=for-the-badge">
  <img alt="checked" src="https://img.shields.io/badge/-CHECKED-5B93C7?style=for-the-badge">
  <img alt="curated" src="https://img.shields.io/badge/-CURATED-62A872?style=for-the-badge">
  <img alt="flagged" src="https://img.shields.io/badge/-FLAGGED-D6604A?style=for-the-badge">
</p>

| dimension | asks |
|---|---|
| **Presence** | Does anything exist off-chain? X, Telegram, a website, GitHub, Farcaster |
| **Authenticity** | Is that presence real? Follower quality, overlap with known farms, reply patterns, renamed accounts |
| **Mindshare** | Are people outside the team talking about it, and are they people whose attention costs something? |
| **Coverage** | Has anyone credible written about it, or is it press releases only? |
| **Chain** | The creator's history, funding sources, launch bundles, holder diversity, wash trading |

The unit underneath is the **observation**: a dated, sourced fact with a pointer to what it was read from. Scores are
built from observations and always link back to them.

> *The linked X account (created 2021-03-09) was @otherhandle until 2026-11-01.*
> `x.handle_history` · cost to fake: high · L1 · observed 2026-11-03T09:05Z

Hard red flags (wrong mint on the site, a celebrity link the celebrity never mentions, a renamed account, a serial
creator, a bundled launch, a copied image, deleted promises, text written to manipulate an AI reviewer) override every
score. [Scoring →](docs/scoring.md)

assay never says buy, sell, or what a coin is worth. It says what's there.

## Where it shows up

<p align="center">
  <img src="docs/img/overlay.svg" alt="Mockup of the assay panel next to a pump.fun coin page" width="100%">
</p>

| surface | |
|---|---|
| **pump.fun overlay** | a browser extension: a badge on every coin card, the evidence panel on every coin page. No wallet access, ever. |
| **Telegram channel** | every coin the review agent promotes, in one message, with its note and the strongest evidence |
| **free demo** | assay.meex.work: the live tape of launches and decisions, a page per coin, the sweep's real stats |
| **your agent** | the bus, the API, or the MCP server |

[Overlay, demo and channel →](docs/overlay.md)

## For agents

Three ways in, from fastest to simplest.

**Subscribe to the bus.** Every observation, score, flag and tier change as it happens, with replay from any point in
time.

```ts
const sub = await js.subscribe("assay.tier", { config: { durable_name: "my-agent" } });
for await (const m of sub) { const e = m.json(); if (e.data.to === "curated") consider(e.mint); m.ack(); }
```

**Call the API.** One coin, a batch of 100, a feed, a stream. `as_of` returns what assay knew at any past moment, so a
backtest never sees the future.

```sh
curl https://assay.meex.work/v1/coins/<mint>?format=brief
```
```
LANTERN · FLAGGED · L3 · 47 min
Presence 78 · Authenticity 31 · Mindshare 52 · Coverage 10 · Chain 60
⚑ X account was @otherhandle until 2026-11-01
62% of a follower sample also follows 410 other coin accounts.
41 non-team authors in 24 h. Press releases only.
```

**Plug in the MCP server.** `assay_lookup`, `assay_batch`, `assay_feed`, `assay_explain`, which returns the evidence as
sentences your agent can quote.

The intended use in a trading harness is a **gate**, not a signal: *only look at coins that are `checked` or better,
with Authenticity ≥ 50 and no flags.* [API →](docs/api.md) · [Events →](docs/events.md)

## Run your own

assay is a baseline. Clone it, point your agent at it, change the weights, add signals, drop the ones you don't trust.

You bring the keys; none ship with the repo:

| key | turns on |
|---|---|
| `SOLANA_RPC_URL` + `SOLANA_GRPC_URL` or `SOLANA_WS_URL` | the launch stream, L0, the Chain dimension |
| `X_BEARER_TOKEN` | Presence, Authenticity and Mindshare on X (first-party X API) |
| `MODEL_API_KEY` | classification, extraction, the L4 review agent |
| `NEWS_API_KEY` | Coverage |
| `TELEGRAM_BOT_TOKEN` · `NEYNAR_API_KEY` | Telegram counts and the channel · Farcaster |

A missing key switches its signals off and lowers confidence. A run without X data never passes itself off as one
with it. Every weight, threshold and budget lives in one file, `config/weights.yaml`. [Costs →](docs/costs.md)

## Roadmap

- [x] Design: signals, scoring, layers, bus, API, retention, overlay
- [ ] `bus` + `ingest`: pump program listener, decoders, NATS adapter
- [ ] **L0 reflex** with creator lineage, funding parents, bundles, image hashes
- [ ] Week-one measurement: launch rate, L1 pass rate, X reads per coin → real numbers in [costs](docs/costs.md)
- [ ] **L1 glance** + the API + `?format=brief`
- [ ] **L2 sweep loop** with window budgets and `assay.sweep` stats
- [ ] **L3 deep** + **L4 review agent**
- [ ] MCP server, Telegram channel, free demo at assay.meex.work
- [ ] pump.fun overlay (userscript first, then the store extension)
- [ ] More launchpads

## Docs

| | |
|---|---|
| [architecture](docs/architecture.md) | the bus, the five layers, the sweep loop, the review agent, bring-your-own keys |
| [events](docs/events.md) | topics, envelope, examples, subscribing and replay |
| [signals](docs/signals.md) | every signal, its source, what it costs to fake |
| [scoring](docs/scoring.md) | observations → dimensions → tiers; red flags; calibration |
| [api](docs/api.md) | REST, batch, stream, webhooks, MCP, point-in-time |
| [retention](docs/retention.md) | what's kept, for how long, and what each platform's terms allow |
| [overlay](docs/overlay.md) | the extension, the demo, the Telegram channel |
| [adversarial](docs/adversarial.md) | every way it gets gamed, and the counter |
| [costs](docs/costs.md) | providers, cost per layer, how to measure it |
| [decisions](docs/open-questions.md) | what's settled and what's still open |
| [schema](schema/report.v1.json) · [example](examples/report.example.json) | the report as JSON Schema, and a filled-in fictional coin |

## Principles

- **Evidence, not verdicts.** Every number links to the facts behind it. Facts say "this creator launched 14 coins in
  30 days", never "scam".
- **Read-only.** No contracts, no transactions, no wallets, no keys of yours beyond the API keys you choose to give
  your own instance.
- **Calibrated on quality, not price.** Weights are tuned against coins a person classified by hand. "Went up" isn't a
  quality.
- **Nothing rewritten.** Corrections add a new observation; the old one stays on the record.

## License

[MIT](LICENSE) © 2026 SHYGUY LLC
