# assay

A curation service for pump.fun coins. It watches every launch, works out which coins have a real presence behind them,
and serves what it found as evidence through an API. An agent harness reads it in one call; a browser overlay reads it
on pump.fun itself.

This repo is the plan. There is no code yet, and nothing here is a contract: assay reads chains and the web, it never
signs a transaction.

## The idea in one paragraph

Most pump.fun coins have three links in their metadata (an X account, a Telegram, a website) and nothing behind them.
The few that do have something behind them are hard to tell apart from the many that have bought followers, a templated
site and a paid press release. assay's job is to measure the difference, and the rule that makes this possible is
simple: **weigh each signal by what it costs to fake.** Followers are cheap. A five-year-old X account that has had
one handle the whole time is not. A press release on a paid wire is cheap. A story by a named reporter at an outlet
that doesn't sell placement is not. A thousand holders is cheap. A thousand holders whose wallets were funded from
different places, and who held through a 50% drawdown, are not.

## What comes out

Every coin gets a **report**: a tier, five dimensions, and the evidence behind each one. The unit of the system is the
*observation*: a dated, sourced fact ("the X account linked in the metadata was created 2019-04-02 and has been
@handle since 2026-10-30"). A score is a view over observations; it is never stored without them.

| tier | means |
|---|---|
| `unchecked` | launched; only the free on-chain pass has run |
| `checked` | every automated pass has run; no reviewer has looked |
| `curated` | a reviewer read the evidence and wrote a note, signed with their name |
| `flagged` | at least one hard red flag, shown first, with its evidence |

The five dimensions are **Presence** (does it exist off-chain), **Authenticity** (is that presence real), **Mindshare**
(are people who aren't the team talking about it), **Coverage** (has anyone credible written about it) and **Chain**
(what the creator, the holders and the trading actually look like).

assay never says buy, sell, or what a coin is worth. It says what is there.

## The plan

| doc | covers |
|---|---|
| [docs/signals.md](docs/signals.md) | every signal, where it comes from, what it costs to fake |
| [docs/scoring.md](docs/scoring.md) | how observations become dimensions, tiers and red flags; the reviewer's job |
| [docs/pipeline.md](docs/pipeline.md) | ingestion, the triage funnel, recheck cadence, where it runs |
| [docs/api.md](docs/api.md) | REST, batch, stream, webhooks, MCP, point-in-time queries |
| [docs/retention.md](docs/retention.md) | what is kept, for how long, and what the platforms' terms allow |
| [docs/overlay.md](docs/overlay.md) | the pump.fun extension and the other ways the report gets seen |
| [docs/adversarial.md](docs/adversarial.md) | how each signal gets gamed, and the counter |
| [docs/costs.md](docs/costs.md) | what each tier costs to run, per coin and per month |
| [docs/open-questions.md](docs/open-questions.md) | the decisions that need making before code |
| [schema/report.v1.json](schema/report.v1.json) | the report, as a JSON Schema |
| [examples/report.example.json](examples/report.example.json) | a filled-in report (fictional coin) |

## License

MIT. See [LICENSE](LICENSE).
