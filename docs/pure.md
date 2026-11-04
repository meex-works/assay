# Pure launches

The Telegram channel posts **pure** launches, not good coins. A pure launch is one whose structure is honest: no hidden
supply, no bundle, no copied identity, no known bad actors at the start, and links that say what they claim. It says
nothing about whether the coin is worth buying. The post carries **no market details**: no price, no market cap, no
volume, no holder count, no chart. Whoever wants those goes and looks, and does their own research while they're there.

Purity is a checklist of facts, so it can be decided fast: everything on it comes from L0, the tape and L1, within
seconds of launch.

## The checklist

Every line must pass. Each is a fact with evidence, the same as anywhere else in assay.

| check | pure means | decided by |
|---|---|---|
| dev buy | the creator's own buy, in the create transaction, at or under `dev_buy_max` of supply | L0 |
| no bundle | no other wallet funded from the creator's cluster bought in the opening slots | L0 + the tape |
| no known bad actors early | no `bundler` or `predator` funding cluster among the first buyers (generic sniper bots are everywhere; they're counted, not disqualifying) | the tape + wallet reputation |
| clean creator | not a serial creator; the creator's funding doesn't trace to a cluster with a rug or predator history within `trace_hops` | L0 (cached lineage and clusters) |
| original | no metadata URI or CID reuse, no image match to a living or recently run coin, not `vamp_of` or `relaunch_of`. A dead coin's ticker reused is allowed, and said | L0 + L1 |
| honest links | any linked site or account resolves and shows this mint; no unconfirmed affiliation claim; no text aimed at an AI reviewer | L1 |
| honest config | the fee and reward setup matches anything the description promises; no launch mode that mints supply the description doesn't mention | L0 |
| alive | at least `independent_buyers_min` buyers from distinct funding clusters (used to keep the channel from posting every pure launch; **never shown** in the post) | the tape |

A coin with **no socials at all** can be pure. Purity is about structure, not presence.

## The post

```
PURE LAUNCH  $TICKER  Name
<mint>

Dev bought 2.1% in the create transaction, nothing since.
No bundle. No known bundler or predator wallets among the first buyers.
Creator's first launch, funded from an exchange.
Original image and metadata.
The site and X account show this mint.

x.com/…  t.me/…  site
Pure as of 0:34 after launch. Not a recommendation: do your own research.
assay.meex.work/c/<mint>
```

## Purity can break, and the post says so

Purity is measured at launch. A patient operator can launch clean and buy in later from wallets that don't link back,
or the dev can sell everything at minute 9. So the tape keeps watching every posted coin, and when a check stops
holding, **the original message is edited in place**:

```
No longer pure at 14:02 after launch: the dev sold 80% of their buy.
```

A coin is posted once. It's never re-posted, and a broken coin is never quietly deleted. The edit history is the
record.

## What to watch for

- **The channel becomes a sniper feed.** Bots will subscribe and buy every post within a second, which is a market
  effect assay created. The tape measures it on every post (buys in the first seconds after the post from wallets that
  do it every time), and the demo publishes the result. `post_min_age` is the lever: posting at 30 seconds is fastest
  and draws the most bots; requiring a coin to stay pure for 5 minutes posts fewer coins and draws fewer bots.
- **Purity is cheap to manufacture once people know the checklist.** That's fine: the checklist is public, it costs
  the operator their bundle, and the edit-in-place catches whoever cheats after the post.
- **Volume.** Pure launches may run to many per hour. The `alive` gate and `max_posts_per_hour` keep the channel
  readable; the full list is on the bus and the API (`assay.lens.pure`).

## Config

```yaml
# config/lenses/pure.yaml
lens: pure
version: 1
show_integrity_flags: true
uses_outcome_history: false
post:
  channel: telegram
  market_details: false        # never: no price, mcap, volume, holders, chart
  min_age: 30s                 # how long after launch before a coin can be posted
  stay_pure_for: 0s            # require the checklist to hold this long first
  max_posts_per_hour: 30
  edit_on_break: true
```
