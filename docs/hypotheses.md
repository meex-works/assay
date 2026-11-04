# Hypotheses

Things traders in the trenches believe, which assay should measure rather than assume. Each one becomes a trait or an
outcome-history statistic only once it holds up on assay's own data. Until then it's listed here with the test that
would settle it.

Every test is an **event study** over assay's own records: line up many coins (or many posts) on the moment of the
event, and look at what happened to holders, flow and price before and after, against a matched control set of coins
that didn't have the event.

## H1. Bundled coins move more

**Belief:** a heavy launch bundle means more price action and more volatility, in both directions.

**Why it might be true:** a bundle is a large, concentrated position that will be sold at a time of the bundler's
choosing. Until it's sold it's an overhang; when it's sold it's a cliff.

**Test:** realized volatility at 15 min / 1 h / 6 h for coins by bundle share (0–10 / 10–25 / 25–50 / 50%+), split by
whether the bundle has sold down. **Becomes:** `bundled`, `bundle_unsold_share`, and an outcome-history line for the
volatility lens.

## H2. Some traders are predators

**Belief:** certain wallets, entering after launch, take a large share of supply in whatever they touch and then
manipulate it. Their arrival is a warning.

**Test:** for every wallet in the trade stream, across every coin it touched: peak share of supply held, time from
entry to exit, how much of its exit sold into a rising tape, and what happened to holder count after it left. Look for
a cluster of wallets (and funding clusters, since predators rotate wallets) whose entries are followed by a sharp
holder exodus. **Becomes:** a wallet reputation class (see [signals.md](signals.md#6-wallet-reputation)) and the
`predator_entered` trait, live from the sweep loop.

## H3. A callout can be bearish

**Belief:** an influencer posting a coin often marks a top, not a start. The reason isn't settled. The candidates, and
how to tell them apart:

| hypothesis | mechanism | what the data would show |
|---|---|---|
| **exit liquidity** | the caller, or the team, bought before the post and sells into the followers it brings | wallets linked to or clustered with the caller buying minutes before the post; net selling from them after |
| **paid because demand was missing** | teams pay for calls when organic buyers have dried up | calls cluster after organic mention growth has flattened; paid-format posts more bearish than unpaid ones |
| **the call is late** | callers post what's already moving, so the post lands near the attention peak | the post's position on the coin's own mindshare curve (before/at/after its peak) explains the drop better than the caller does |
| **front-run by bots** | bots watching the caller buy within seconds of the post and sell to the slower humans | a burst of buys in the first 1–3 slots after the post from wallets that do this on every call by that caller |
| **attention ceiling** | one big post converts the caller's whole audience at once; after it, there are no new buyers | holder growth spikes and then flattens below the pre-call trend |
| **caller distribution** | most callers are paid and net-negative and a few aren't; the average hides the tail | per-caller distributions with deletion rate, rather than one pooled average |

**Test:** one table (author, post, time, mint, deleted?) joined to the trades. An event study on every call by authors above a reach threshold, aligned on the post time, with pre-call
buying by linked wallets, post position on the attention curve, first-slot bot buys, and paid-format detection as the
explanatory variables. **Becomes:** a per-caller history (median move and holder flow at +5 min / +1 h after their last
N calls, with N shown), and a `callout` trait carrying the caller's class. Mindshare counts callers by their history,
not their reach.

**And assay is a caller too.** The Telegram channel posts coins. assay measures its own posts with the same event
study and publishes the result on the demo, so if assay's own channel turns out to be a bearish signal, that's on the
record too.

## H4. Category sets the ceiling

**Belief:** tech and utility coins don't run as far or as high as memes that have the basics plus an influencer behind
them.

**Confound:** "meme with an influencer" already conditions on attention, and "tech" on pump is a claim that costs
nothing until a product backs it. **Test:** graduation, peak, time to peak and 7-day holders by category, crossed with `influencer_involved` and the
Presence dimension. **Becomes:** the category's outcome history on every report ("tech coins in the last 30 days:
median peak …, n = …") and the runner lens.

**Involved isn't the same as called.** `influencer_involved` means sustained: an author with real reach who posts about
the coin repeatedly across days, sits in its community, or holds from a linked wallet. One post is a callout (H3).

## H5. The market picks the right pairing

**Belief:** a meme coin that doesn't share its rewards, or isn't paired with the quote asset the current meta prefers,
gets passed over for a version that does, often a copy launched on purpose to fix exactly that.

**Test:** among near-duplicate launches within an hour (the vamp pipeline finds them), which version the market chose (most holders and volume
at +6 h), by quote asset, fee-sharing configuration and launchpad. **Becomes:** a rolling **meta preference** table
(recomputed daily, because the "right" pairing changes). Confound to separate: a non-SOL quote may lose because
bots and aggregators assume SOL, which is tooling, not preference and the `config_vs_meta` trait on every report: "this version
isn't fee-sharing; the version that is has 4× the holders".

## H6. Vamps follow runners

**Belief:** when a coin runs, copies of its ticker and image appear within minutes, and some traders trade the copies.

**Test:** vamp launches per hour around a coin's peak, and the vamps' own outcome history. **Becomes:** the beta lens,
and the `vamp_of` trait linked both ways (a runner's report lists its vamps).

## H8. Independent buy share separates demand from a pump

**Belief:** a move made by bundles and bots looks the same on a chart as one made by buyers, and the share of buying
that came from independent wallets tells them apart.

**Test:** for moves of 3× or more in the first hour, independent buy share during the move against what followed
(holder count and the movers' positions 15 minutes later). **Becomes:** the threshold that decides when the thread
names a move.

## H7. Pure launches die to late bundles

**Belief:** many pure launches die within five minutes because a bundle buys in after launch, runs the price, and
dumps on whoever arrived.

**Test:** for every pure launch, whether a late bundle crossed the threshold, how soon, and what happened to holder
count and the bundle's own position over the next 15 minutes. Separately: late-bundle rate on coins the channel posted
against pure coins it didn't. **Becomes:** the `late_bundle` trait, the post's watch window and confirmation times,
and the published measure of whether posting draws bundles.

## Assumptions under review

The design's own assumptions, stress-tested: see the review in [assumptions.md](assumptions.md).
