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

`cost_class_weight`: low 1, medium 3, high 9. Starting values, to be tuned on the reviewed set (below), never on price
outcomes.

`freshness_decay`: half-life per signal type (follower sample 7 d, mindshare 24 h, domain age never decays).

## Red flags (hard gates)

A red flag puts the coin in `flagged`, whatever the dimensions say. Each is a specific, checkable fact:

- the website or X account shows a different mint than this coin
- it claims an affiliation and the affiliated party's official accounts say nothing (or deny it)
- the X account linked was renamed from an unrelated account within 7 days of launch
- the creator wallet, or its funding parent, launched ≥ N coins in the past 30 days that never graduated
- launch bundle above X% of supply from one funding source
- the image is a byte-for-byte or perceptual match of an earlier coin, and this coin presents itself as the original
- the linked X account deleted posts promising something (listings, burns, partnerships) after the claim was made

Each flag is shown with its evidence, and a flag can be cleared by a reviewer, with a written reason that stays on the
record.

## Tiers

| tier | rule |
|---|---|
| `unchecked` | only T0 (see [pipeline.md](pipeline.md)) has run |
| `checked` | T1 and T2 ran; no red flag |
| `curated` | a reviewer approved it, wrote a note, and named themselves |
| `flagged` | any red flag, until a reviewer clears it |

Curated is earned per period: a curated coin is re-reviewed when any dimension moves more than 20 points or a new flag
appears, and it drops back to `checked` if nobody re-reviews it within 14 days.

## The reviewer

Automation finds candidates; a person makes the call that goes on the record as `curated`. The reviewer's queue is
sorted by evidence, not by price: the highest Authenticity × Mindshare coins with confidence above 0.7.

A reviewer's note is short and specific, in the house voice: what's real, what isn't, what to watch. Notes are public,
versioned, and attributed. A reviewer who holds the coin says so in the note. A reviewer is never paid by a coin.

## Calibration

Weights are tuned against a **labelled set**: coins a reviewer classified by hand (real project / low-effort /
coordinated farm / impersonation), with the label recorded *before* anyone looks at the scores. Price outcomes are
not labels. "Went up" is not a quality, and calibrating to it turns this into a signal service.
