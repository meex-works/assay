# Pipeline

## Ingestion

- **Launches**: subscribe to the pump program (create / create_v2 instructions) through a Yellowstone gRPC stream or a
  Helius/Triton websocket. A second, independent source (PumpPortal's public websocket) reconciles the first; a launch
  seen by only one source is logged as a gap.
- **Trades and holders**: the same stream for curve trades; PumpSwap after graduation. Holder snapshots on a schedule,
  never computed from the trade stream alone.
- **Metadata**: fetch the URI on launch, again at +1 h and +24 h (teams edit metadata after launch, and the edit is a
  signal).

Measure the actual launch rate in week one before sizing anything. The funnel below is designed so that cost scales
with the coins that survive, not with launches.

## The triage funnel

Every coin enters at T0. It moves up when it crosses an escalation rule and drops back when it goes quiet.

| tier | runs on | what runs | cost per coin |
|---|---|---|---|
| **T0** | every launch | metadata parse, image hash, name/ticker collision, creator lineage, launch bundle, link shape | RPC + our index only |
| **T1** | coins with a resolving off-chain link **and** (N distinct holders or $X volume or N minutes alive) | X user lookup (1 call), Telegram count, RDAP, CT log, website fetch + template fingerprint, mint-on-site check, affiliation claim extraction | a few X reads, one cheap model call |
| **T2** | T1 coins past a second threshold, or anything a user looked up | follower sample, replies sample, timeline, mindshare search over 24 h, news search, holder funding trace, wash analysis | the expensive tier: tens of X reads, model classification, tracing |
| **T3** | coins in the reviewer queue and every `curated` coin | everything in T2 on a schedule, plus the human review | reviewer time |

**Demand escalation**: a lookup through the API or the overlay of a coin below T2 queues it for T2 at high priority.
What people look at gets checked, which keeps the expensive tier pointed at the coins that matter.

## Recheck cadence

| age of coin | T1 | T2 |
|---|---|---|
| < 6 h | every 30 min | every 2 h |
| < 3 d | every 6 h | every 12 h |
| < 30 d | daily | every 3 d |
| older | weekly, while alive | on demand |

"Alive" = traded in the last 72 h or mentioned by a non-team author in the last 7 d. A dead coin keeps its last report,
stamped with the date it went quiet.

## Where it runs

| part | where | why |
|---|---|---|
| chain stream, crawlers, follower sampling, tracing | the Hetzner box (long-running processes, outbound IP control) | websockets and long crawls don't fit a Worker |
| observation store | Postgres (on the box or a managed one) with a time-partitioned `observations` table; ClickHouse later if the trade series outgrows it | point-in-time queries are plain SQL |
| raw captures | R2, content-addressed (`sha256/…`) | cheap, immutable, deduplicated |
| API edge | Cloudflare Worker + KV cache in front of Postgres | the overlay's read volume never touches the box |
| queue | Postgres `SKIP LOCKED` to start; a real queue only if it hurts | one less service |
| reviewer UI | a small internal page on the Worker, access-gated | — |

## Jobs, in one table

| job | trigger | writes |
|---|---|---|
| `launch.ingest` | stream event | coin row, T0 observations |
| `meta.fetch` | launch, +1 h, +24 h | metadata observations, diff |
| `x.profile` | T1 entry, schedule | profile + handle snapshot |
| `x.followers.sample` | T2, schedule | sample + per-follower class (cached per follower ID across coins) |
| `x.mentions` | T2, schedule | mention rows, author IDs |
| `author.score` | new author seen | author quality (cached; shared across every coin) |
| `site.crawl` | T1, weekly | capture, fingerprint, mint check |
| `news.search` | T2, daily | article rows with outlet class |
| `chain.trace` | T2 | funding graph edges (cached per wallet) |
| `score.compute` | any new observation | dimension snapshot if anything moved |
| `flag.check` | any new observation | flag rows |

The caches that matter (follower class per X user ID, author quality, wallet funding parent, outlet class, template
fingerprints) are **shared across coins**. That's what makes T2 cheaper over time: the 500th coin with the same bot
followers costs almost nothing to classify.
