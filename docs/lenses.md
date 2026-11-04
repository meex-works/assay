# Lenses

The same fact means different things to different traders. A launch where 40% of supply went to one funding cluster
is a reason to stay away for one person, and the reason to show up for another: bundled coins move harder, both ways,
and some people are there for exactly that.

So assay keeps three things apart:

| layer | what it is | who decides it |
|---|---|---|
| **observations** | dated, sourced facts: "4 wallets funded from one parent bought 38% of supply in the create slot" | the chain and the web |
| **traits** | descriptive labels built from observations: `bundled(38%)`, `vamp_of(<mint>)`, `category: meme`, `predator_entered` | assay's rules, the same for everyone |
| **lenses** | an interpretation: which traits and dimensions a trader wants, avoids or ignores, and how to rank what's left | whoever writes the lens |

The tier (`unchecked` / `checked` / `curated` / `flagged`) is what the **curator** lens says. It's the default, not the
only reading.

## Two kinds of flag

- **Integrity flags** are facts every lens is shown, first: the site shows the wrong mint, an affiliation the
  affiliated party never made, an account renamed near launch, deleted promises, text written to manipulate an AI
  reviewer. A lens can choose to trade through one, but it can't hide one.
- **Risk traits** (bundled, sniped, serial creator, predator entered, vamp) are inputs. The curator lens treats them as
  red flags. A volatility lens may treat them as the point.

## Built-in lenses

| lens | for | wants | avoids |
|---|---|---|---|
| **curator** (default) | "is there something real here?" | high Authenticity, Mindshare net of the team, clean creator history | every risk trait |
| **volatility** | traders who want price action and accept the reason for it | `bundled`, heavy sniping, thin holder base, high recent realized volatility | integrity flags only |
| **runner** | memes with the basics and someone with reach behind them | `category: meme`, `influencer_involved`, the preferred pairing and reward config for the current meta, Presence ≥ 60 | `category: tech` unless Mindshare is exceptional; predators |
| **clean book** | not being someone else's exit | no `predator_entered`, bundle < 10% and sold down, no caller with a front-running history | — |
| **beta** | plays on a coin that's already running | `vamp_of` or narrative siblings of a coin in its first run, the fastest sibling with the preferred config | relaunches by the original's creator |
| **original** | only the first of a narrative | first in its cluster, `vamp_of` empty, image not seen before | every copy |

These are starting points. Writing a new one is the expected way to use assay.

## A lens file

```yaml
# config/lenses/volatility.yaml
lens: volatility
version: 1
show_integrity_flags: true          # always true; listed so nobody wonders
gate:                               # every condition must hold
  - trait: bundled
    min: 0.20                       # 20% of supply or more in the launch bundle
  - dimension: chain
    confidence_min: 0.6
prefer:                             # ranking, as weights
  realized_vol_1h: 3
  sniper_share: 2
  bundle_unsold_share: 2            # bundle still holding = an overhang that will move
  mindshare: 1
ignore: [authenticity, coverage]
```

A lens is applied server-side for the built-in lenses (`GET /v1/coins/{mint}?lens=volatility`, and `assay.lens.<name>`
events on the bus) and anywhere else for your own: the lens file and the evaluator are a small package, so a harness
can run its lens locally over the stream.

## What a lens may use

Observations and traits are **price-blind**: they describe what is there, never what it did to the price. A lens may
also read **outcome history**: descriptive statistics about the past, computed from assay's own records, such as
"coins with this trait set in the last 30 days: median peak 3.1× launch, median time to peak 22 min" or "after this
caller's last 50 posts, the median move in the next hour". That's the history of other coins and other posts, published
with its sample size and window. It isn't a prediction about this coin, and the report never presents it as one.

The curator lens never reads outcome history. That's what keeps the tier honest: it can't drift into "curated means
went up".
