# Scoring

## Principles

1. **Evidence first.** A score with no observations behind it is a bug. Every number in a report links to the
   observations that produced it, and each observation links to its raw capture.
2. **Weigh by cost to fake.** A signal's weight is its cost-to-fake class (see [signals.md](signals.md)), not how
   predictive it looked in a backtest. Whatever looks predictive this month gets gamed next month; what is expensive to
   fake stays expensive.
3. **Absence is information, but separate.** "No website" and "we couldn't fetch the website" are different
   observations. A missing signal lowers *confidence*, not the score.
4. **No single number on the front.** The overlay shows a tier and five dimensions. A composite exists in the API for
   sorting, labelled as a composite, and is never the headline.
5. **Facts, not verdicts.** The report says "the creator wallet launched 14 coins in 30 days; 13 never left the curve".
   It never says "scam" or "rug". Reviewers can write opinions, signed with their name, in the note.

## Dimensions

Each dimension is 0–100 with a confidence of 0–1 (how many of its signals were actually observed, weighted).

```
dimension = Σ (signal_value × weight) / Σ weight          over observed signals only
weight    = cost_class_weight × freshness_decay(age of observation)
confidence= Σ weight(observed) / Σ weight(all signals in the dimension)
```

`cost_class_weight`: low 1, medium 3, high 9. Starting values, to be tuned (below), never on price outcomes.

`signal_value` is read against the **base rate** in the coin's category: a signal almost no pump coin has (a reporter's
byline, a five-year-old account) is normalised so its absence doesn't sink every coin, while its presence still counts.

`freshness_decay`: half-life per signal type (follower sample 7 d, mindshare 24 h, domain age never decays).

## Flags and risk traits

Two different things, kept apart because traders read them differently (see [lenses.md](lenses.md)).

**Integrity flags** are facts every lens shows first. Each is a specific, checkable fact:

- the website or X account shows a different mint than this coin
- it claims an affiliation and the affiliated party's official accounts say nothing (or deny it)
- the X account linked was renamed from an unrelated account within 7 days of launch
- the linked X account deleted posts promising something (listings, burns, partnerships) after the claim was made
- it promises fee sharing or buybacks in its description or site, and the fee config or the creator wallet's behaviour
  says otherwise
- the coin's own text (description, site, posts, image) contains instructions aimed at an AI reviewer

**Risk traits** are descriptive, and each lens decides what they mean. The curator lens treats every one as a red flag:

- `serial_creator`: the creator wallet, or its funding parent, launched ≥ N coins in the past 30 days that never
  graduated
- `bundled`: launch bundle above X% of supply from one funding cluster, with how much of it is still unsold
- `predator_entered`: a wallet or cluster with a predator history bought a large share after launch
- `vamp_of` / `relaunch_of` / `web_image`: a copied image, ticker or name (classes in [signals.md](signals.md#vamp-detection-tickers-images-text-in-images))
- `callout` by a caller whose history makes the call a warning

Each flag and trait is shown with its evidence. Only the operator of an instance can clear an integrity flag, with a
written reason that stays on the record. The review agent can raise flags, never clear them.

## Tiers

The tier is the **curator** lens's reading, and the default everywhere. Other lenses gate and rank on the same
observations and traits without changing it.

| tier | rule |
|---|---|
| `unchecked` | only L0 (and maybe L1) has run; the score is `provisional` (see [architecture.md](architecture.md)) |
| `checked` | the sweep loop has seen it at least once; no red flag |
| `curated` | the review agent (L4) promoted it and wrote a note; every gate passed |
| `flagged` | any integrity flag or risk trait, until the operator clears it |

## Scores refine, they don't wait

Each layer recomputes the dimensions from every observation so far. An L0 score has a Chain dimension and almost nothing
else, with low confidence, and it's marked `provisional`. L1 adds Presence. The sweep loop moves Mindshare and Chain
every pass. L3 fills in Authenticity and Coverage. A consumer that needs an answer in a second takes L0's and knows its
confidence; a consumer that can wait listens for the next `assay.score`.

Curated is earned per period: a curated coin is re-reviewed when any dimension moves more than 20 points or a new flag
appears, and it drops back to `checked` if nobody re-reviews it within 14 days.

## The review agent

L4 is an agent loop reading evidence bundles. Its queue is sorted by evidence, not by price: the highest
Authenticity × Mindshare coins with confidence above 0.7.

Its note is short and specific: what's real, what isn't, what to watch, citing the observation ids it relied on. Notes
are public, versioned, and signed `agent:<model>@<prompt version>`. The operator can override any decision with a note of
their own, signed with their name. An operator who holds the coin says so in it. Nobody running an instance takes
payment from a coin for its tier.

## Category baselines

A dimension is read against the coin's category. A tech coin's Presence counts a working product, a repo with
commits and a team that ships; a meme's counts reach. The curator lens compares each coin with others in its category,
and the report says which category it was judged against.

## Calibration

Weights are tuned against **behavioural outcomes** that exist for every coin and aren't price: the dev sold more than
X% in the first hour, the bundle dumped, the coin migrated, holders at day 7, the pool still funded. A smaller set of
coins classified by hand (real project / impersonation) covers what behaviour can't, with each label recorded *before*
anyone looks at the scores. Price outcomes are not labels. "Went up" is not a quality, and calibrating to it turns this into a signal service.

Other lenses can read outcome history (what coins with these traits did before). The curator lens and the tier can't.
See [lenses.md](lenses.md#what-a-lens-may-use).
