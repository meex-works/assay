# Tutorial 7: operating it

How to read what assay is doing, look inside its database, and fix what goes wrong.

## The report

```sh
npm run report              # the summary
npm run report -- --posts   # plus every post and its timeline
```

```
window          2026-11-04T06:20:03Z → 2026-11-04T09:20:03Z (3.0 h)
launches        5210 (41680/day) · seen by both feeds 99.8% · gaps {"helius_only":1}
gRPC lead       median 125 ms over Helius
judged at 30 s  5050 · dead (<3 outside buyers) 2790 · pure + alive 52 (2.3% of live coins)
failed checks   original 1490 · dev_holding 1290 · clean_creator 920 · dev_buy 790 · no_known_actors 300 · no_bundle 120
posts           pure 18 · broken 23 · control 11
  posted        41 watched · broke 56.1% · broke within 5:00 41.5%
  control       11 watched · broke 45.5% · broke within 5:00 36.4%
break reasons   Dev sold their whole buy ×19 · Late bundle ×6 · Dev sold N of their buy ×3
edit latency    median 412 ms from the triggering trade (n=26)
last metrics    rpc 41210 calls (429 0) · funder lookups 18800 · meta 4710/5210 · 251 MB · grpc reconnects 0
```

*(Illustrative numbers.)*

| line | what to look for |
|---|---|
| `launches` | 30–60k a day is normal. Far less means a feed is down |
| `seen by both feeds` | should be above 99%. Lower means one feed is dropping launches; `gaps` says which |
| `gRPC lead` | gRPC normally sees launches 100–200 ms before the websocket |
| `judged … dead` | most coins are dead at 0:30; that's pump.fun, not a bug |
| `pure + alive` | typically 2–4% of live coins |
| `failed checks` | why coins fail. Relaunches and copies (`original`) and devs selling early (`dev_holding`) usually lead |
| `posted` vs `control` | **the question the silent run answers:** do posted coins break more often, or sooner, than coins nobody saw? |
| `break reasons` | what killed posted coins. Many "Dev sold" within seconds of 0:30 suggests raising `min_age` |
| `edit latency` | time from the trade that broke purity to the edited post. Under a second is normal |
| `429` | RPC rate limiting. A few is fine; a climbing count means you need a bigger RPC plan or `funding: false` |
| `meta` | metadata loaded. Below ~85% means IPFS gateways are struggling |
| `grpc reconnects` | a handful a day is normal; assay resumes from the last slot it saw |

## Looking inside the database

`data/assay.db` is SQLite. Open it read-only, which is safe while assay runs:

```sh
sqlite3 -readonly data/assay.db
```

| table | one row per |
|---|---|
| `launches` | launch: creator, signer, name, ticker, metadata URI, launch settings, when each feed saw it |
| `trades` | trade in a coin's first 30 minutes (pruned after `keep_trades_days`) |
| `wallets` | wallet ever seen trading: trade count, early buys, class, funder, first active |
| `early_buyers` | (coin, wallet) for first-minute buyers |
| `checks` | verdict at 0:30, with every check's result and fact as JSON |
| `posts` | pure coin: posted, held back (`control`), capped or unposted; whether and why it broke |
| `timeline` | event in a watched coin's life |
| `gaps` | launch only one feed saw |
| `metrics` | minute's status (the same numbers as the status line) |

Useful queries:

```sql
-- the last ten pure coins and what happened
SELECT l.symbol, p.state, p.broke_reason, (p.broke_ms - l.seen_ms) / 1000 AS broke_after_s
FROM posts p JOIN launches l USING (mint) ORDER BY p.posted_ms DESC LIMIT 10;

-- a coin's whole story
SELECT (t.at_ms - l.seen_ms) / 1000 AS s, t.text FROM timeline t JOIN launches l USING (mint)
WHERE l.symbol = 'SPACECENTER' ORDER BY t.at_ms;

-- wallets funding early buyers in the most coins (disperser candidates)
SELECT w.funder, COUNT(DISTINCT e.mint) AS coins FROM early_buyers e JOIN wallets w USING (wallet)
WHERE w.funder IS NOT NULL GROUP BY w.funder ORDER BY coins DESC LIMIT 10;

-- creators (or signers) with the most launches today
SELECT signer, COUNT(*) FROM launches WHERE seen_ms > (strftime('%s','now') - 86400) * 1000
GROUP BY signer ORDER BY 2 DESC LIMIT 10;
```

## Troubleshooting

| what you see | why | what to do |
|---|---|---|
| `[grpc] … UNAUTHENTICATED` | the gRPC token is wrong or gRPC isn't on your plan | `npm run doctor`; [Tutorial 2](02-keys.md#grpc) |
| status line shows `launches` climbing but `grpc 0` | the gRPC feed isn't delivering | check the endpoint and token; the websocket alone gives launches without trades |
| every coin is `dead` | no trades are arriving (gRPC off or failing) | as above |
| `meta` far below `launches` | IPFS gateways rate-limiting | it recovers on its own; `metadata: false` if it persists |
| `[telegram] sendMessage: 403 …` | the bot lost admin rights or was removed from the channel | re-add it ([Tutorial 3](03-telegram.md)); `npm run doctor` |
| `[telegram] … 429` | Telegram's rate limit | assay waits and retries; lower `max_posts_per_hour` if it's frequent |
| posts appear but no comments | no discussion group, or the bot isn't an admin there | `npm run doctor` says which |
| `config: … there's no setting …` | a typo in a `--set`, an `ASSAY_…` variable, or the file | the message lists the valid names |
| `missing key for …` | a module that needs a key is on, and the key isn't set | add it to `.env`, or switch the module off |
| memory keeps climbing past ~800 MB | shouldn't happen; coins are dropped after 30 minutes | `journalctl -u assay-silent` and open an issue with the status lines |
| the service restarts in a loop | an error at startup | `journalctl -u assay-silent -n 100`; run `npm run doctor` as the service's user |

## Logs

```sh
journalctl -u assay-silent -f                    # live
journalctl -u assay-silent --since "1 hour ago"  # recent
journalctl -u assay-silent | grep "\[post\]"     # every post
journalctl -u assay-silent | grep -E "error|failed"
```

## Costs to watch

- **gRPC** is the main cost: about 1.1 TB a month. Check the provider's usage page after the first day and multiply.
- **RPC** grows with the number of new wallets; most lookups are cached forever after the first.
- Everything else (the websocket, Telegram, Cloudflare's free plan) is free at this volume.

See [costs](../costs.md) for the measurements and the provider comparison.

## Feedback

Disagree with a rule or finding? Let's chat: [X](https://x.com/meexworks) · [Telegram](https://t.me/meex_the_dev) ·
or open an issue on the repo.
