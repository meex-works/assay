# Signals

Every signal below lists where it comes from, and its **cost to fake**: low (a few dollars or minutes), medium (real
money or days of work), high (months, or money that would cost more than the coin is likely to make). The scoring
weights in [scoring.md](scoring.md) follow that column.

Every observation records `source`, `observed_at`, `method` (api, fetch, chain, model, agent, operator) and a pointer to the
raw capture it was read from (see [retention.md](retention.md)).

## 0. Identity: what the coin says it is

The pump.fun metadata is the starting point, and the coin's own claim about where it lives.

| signal | source | cost to fake |
|---|---|---|
| name, ticker, description, image | metadata URI (IPFS/Arweave) or Token-2022 `tokenMetadata` extension | low |
| linked X / Telegram / website fields | metadata JSON | low |
| shape of the X link: profile, single post, or X Community (`x.com/i/communities/…`) | parse | low; a Community link is the most common shape and carries the least evidence |
| image match against every earlier coin and the open web | the vamp pipeline below | low to change, but a reused image is evidence of a copy |
| name/ticker collisions with earlier coins | exact, fuzzy and homoglyph match (Cyrillic `а` for Latin `a`) against our own index | n/a: this is the *copy* detector |
| claims an affiliation (a person, brand, game, company, other chain) | model extraction from name + description | low |
| the claimed affiliation's official accounts mention the coin | X/web lookup of the official accounts | **high**; this is how "unofficial" gets written, as with the Kojima coin |

### Vamp detection: tickers, images, text in images

New coins routinely copy an older coin's ticker and image. Catching it takes several methods, because each one misses
something different:

| step | layer | method | catches | misses |
|---|---|---|---|---|
| metadata URI / CID | L0 | identical metadata URI or IPFS CID (free, on-chain) | the same upload reused | any re-upload |
| exact hash | L1 | sha256 of the image bytes | the same file re-uploaded | any re-encode |
| perceptual hash | L1 | pHash + dHash against every image assay has seen (in memory) | resizes, re-encodes, light edits | crops, mirrors, recolours |
| embedding | L1 | DINOv2 or CLIP vector, nearest neighbours in a vector index, threshold set per narrative | crops, recolours, a new pose of the same character | two different coins built on one meme template |
| OCR | L1 | a vision model or PaddleOCR over the image | a ticker or mint written into the image; an image that names a different coin | stylised lettering |
| reverse image search | L3 | Google Cloud Vision web detection, TinEye; only to answer "is this a brand, a person, or someone's art" | an image taken from the open web | pump coin images: these indexes don't hold them, which is why assay's own index matters most |
| ticker and name | L0 | exact, fuzzy, homoglyph | `$H1DEO`, `$HIDE0`, a Cyrillic look-alike | a new ticker on a copied image (the image steps catch that) |

The result is a classification, not a yes/no:

| class | means |
|---|---|
| `original` | first coin with this image and ticker; image not found earlier on the web, or found only on the coin's own accounts |
| `vamp_of(<mint>)` | a copy of the image, or of the ticker and name, of a coin that's alive or recently ran, by a different creator. The report names both the **first seen** and the **largest** earlier coin: the biggest one was often a copy itself |
| `ticker_reused(<mint>)` | the same ticker as a dead coin, nothing else copied. Normal on pump; a fact with the predecessor's outcome, not a flag |
| `relaunch_of(<mint>)` | the same creator, or a wallet in its funding cluster, launching again |
| `cto_of(<mint>)` | a community takeover that says so in its own description and links |
| `template` | built on a common meme template (Pepe, Wojak, Doge…) shared by thousands of coins; matches against the template are down-weighted to nothing |
| `web_image` | the image exists on the open web, belonging to someone else; reported with the earliest source found |

The hard part is the index, not the matcher: every historical launch image is backfilled before day one
([architecture.md](architecture.md#backfill-before-day-one)).

Failure modes worth designing for: a template that matches thousands of coins (keep a template list, and match on
what differs from it); AI-generated variations of the same character, which embeddings catch and hashes don't; animated
images (hash every Nth frame); and "first seen on-chain" is not "original" when the art came from an artist on X first.
That last one is what the reverse image search is for.

## 1. Presence: does anything exist off-chain

### X account

| signal | source | cost to fake |
|---|---|---|
| account exists, resolves, not suspended | X user lookup | low |
| **user ID creation date** | X user lookup (also derivable from the user ID itself) | high if old, *but see handle history* |
| **handle history** (same user ID, earlier handles) | our own snapshots of `user_id → handle`, plus third-party history where licensed. 🔴 The API never returns history and our snapshots start empty, so on an account's *first* coin use the proxies: the handle's first archive appearance much later than the account's creation, post count far below the account's age, oldest visible post much newer than the account | high; an old account renamed yesterday is a bought account |
| bio / display name changes over time | snapshots | n/a: churn is the signal |
| post count, and posts before the coin existed | timeline | medium |
| the account posted the mint address itself | timeline search | low, but its absence is a flag |
| verification type (none, paid blue, organization) | user lookup | low (paid) / high (org) |
| X Community: member count, creation date, admins and how many other coins' Communities they run | Community endpoints / page | low / medium / **high** (the admin overlap catches launch farms) |

### Telegram

| signal | source | cost to fake |
|---|---|---|
| channel or group exists; member count | Bot API `getChatMemberCount` on a public username; t.me page | low |
| messages per day from distinct senders (groups) | a read-only member account or bot in the group | medium |
| share of messages from accounts younger than the coin | same | medium |
| admin overlap with other coins' groups | same | **high** |

### Website

| signal | source | cost to fake |
|---|---|---|
| domain registration date and registrar | RDAP (free, standard) | medium if old |
| first-seen in certificate transparency logs (crt.sh) | CT logs | medium |
| hosting (Vercel/Netlify/Framer/Lovable subdomain vs own domain) | DNS | low; a hosted subdomain has no RDAP or certificate of its own, so those signals are off, not zero |
| **template fingerprint**: DOM structure hash, asset hashes, the same Lovable/v0/Framer template seen on N other coins | our own crawl index | low per site, but the *cluster* is high-signal |
| content mentions the mint, and the mint is right | fetch | low; a wrong mint is a hard flag |
| original text vs boilerplate ("roadmap: phase 1 launch, phase 2 CEX listings") | model classification + n-gram overlap with the corpus | low |
| Wayback Machine snapshots of the domain | archive.org CDX API | an impersonation check (was this domain someone else's?), not Presence: memecoin domains almost never have history |
| dead links, placeholder `#` hrefs | fetch | low |

### Other presence

| signal | source | cost to fake |
|---|---|---|
| GitHub org/repo, commits by distinct authors over time | GitHub API | medium to high |
| Farcaster account / channel, Neynar user score | Neynar | medium |
| YouTube / TikTok / Instagram accounts from the metadata or site | page fetch | low |
| pump.fun livestream held, viewer counts | pump.fun frontend API (unofficial, changes without notice: best-effort, never load-bearing) | low |
| pump.fun comment thread: distinct commenters, wallet ages | pump.fun frontend API | low |

## 2. Authenticity: is that presence real

This is where the money goes, and it is what makes assay worth paying for.

| signal | method | cost to fake |
|---|---|---|
| **follower sample quality**: age, default avatar, post count, follower/following ratio, handle pattern (name + 8 digits) | sample N followers (not all), classify | medium |
| **follower overlap across coins**: the same follower set across many unrelated coin accounts | the sample against our own follower index | **high**: the strongest bot-farm fingerprint there is |
| engagement per post vs follower count, and its variance | timeline | medium |
| **reply composition**: unique repliers, reply text similarity, emoji-only and "LFG 🚀" replies, repliers who reply to every coin | replies sample + text clustering | medium |
| engagement timing: likes arriving in a burst in the first 60 s | per-post metrics over time (two reads) | medium |
| team-adjacent amplification: the same 20 accounts quote every post | quote/retweet graph | medium |
| deleted posts: posts that existed at snapshot T and are gone at T+1 | snapshot diff | n/a: deleting promises is the signal |
| Telegram member growth curve: steps of exactly N members | count series | medium |

## 3. Mindshare: are other people talking about it

Mindshare is measured **net of the team**: anything posted by the coin's own accounts, its X Community admins, or
accounts in its amplification cluster is excluded before counting.

**X is one source, not the source.** It's the largest and the most manipulated: bought followers, reply farms, paid
calls, engagement pods. So assay uses X mainly for identity (does the linked account exist, how old is it, was it
renamed) and for the author index, and caps how much X can contribute to Mindshare. Mindshare has to be computable
with X switched off.

| source | trust | why | what counts |
|---|---|---|---|
| **on-chain attention** | highest | it costs money | independent buyers (distinct funding clusters), holder growth net of program-held supply, failed snipe attempts (people tried) |
| **Farcaster** | medium-high | Neynar's user scores filter most sybils | casts by scored users, channel activity |
| **Telegram** | medium | members are cheap, conversation isn't | distinct senders per hour, sender account age, messages not from the team |
| **Reddit** | medium | account age and karma are visible and slow to fake | posts and comments by aged accounts, outside shill subs |
| **YouTube / TikTok** | medium-low | views are buyable, comments less so | distinct commenters, channel age |
| **pump.fun comments, livestream viewers** | low | free and botted | distinct commenting wallets with history |
| **X** | **low by default, capped** | the most manipulated ocean | only authors with an established quality score in the author index; never more than `x_share_max` of the dimension (config) |
| **paid placement** (DexScreener boosts, paid trending, paid calls) | zero | it's an ad | reported as a fact ("boosted at +4 min"), never counted |

Weights per source live in `config/weights.yaml` (`source_trust`), so an operator who trusts X more, or less, can say so.

| signal | method | cost to fake |
|---|---|---|
| distinct authors mentioning `$TICKER` or the mint, per hour, per source | each source's search, deduplicated by author | low raw / **high** when weighted by author quality and source trust |
| author-quality-weighted mentions: account age, follower quality, history of *not* posting every coin | author scoring, cached per author | high |
| **paid-call detection**: the author's history of posting a coin then deleting the post, the "not financial advice, DYOR, CA:" format, a post minutes after the creator wallet funded something | author history + chain timing | medium |
| first organic mention timestamp vs launch | search | n/a |
| share of mindshare within its narrative cluster (all coins in the same meta that hour) | our own counts | n/a |
| Farcaster casts, Reddit posts/comments, YouTube titles, TikTok captions mentioning it | each platform's search | medium |
| retention of attention: mentions at day 1, 3, 7, 30 | the series | high |

The ticker-collision problem is real: `$HIDEO` is also other coins. A mention counts for a coin only if it carries the
mint, a link to its pages, or it comes from an author whose other posts disambiguate it. Unresolved mentions go to a
`ambiguous` bucket that is shown, not counted.

## 4. Coverage: has anyone credible written about it

| signal | method | cost to fake |
|---|---|---|
| news articles naming the coin or mint | news search API, RSS from crypto outlets, Google News | — |
| **outlet class**: editorial / sponsored / press-release wire / syndicated PR / content farm | a maintained outlet table (GlobeNewswire, Accesswire, PR Newswire, Benzinga PR, "Digital Journal" and the other syndication networks are wires; Yahoo Finance pages republishing a wire are wires) | wire: low / editorial: **high** |
| named author with a history at the outlet | byline lookup | high |
| "sponsored" / "paid" / "press release" disclosure on the page | page fetch | n/a |
| mentions by the affiliated party itself (the brand, the person) | their official accounts and press pages | **high** |
| podcast / Spaces appearances | search, review agent | medium |

A coin whose only coverage is wire releases is reported as "press releases only", which is accurate and means a lot.

## 5. Chain: what the creator, holders and trading look like

Read straight from Solana. Cheap compared with the rest, and the hardest to argue with.

| signal | method | cost to fake |
|---|---|---|
| **creator lineage**: every earlier coin this creator wallet launched, and how each one ended | our own launch index | high to hide (it takes fresh wallets, which the next row catches) |
| creator funding source, traced back to a CEX hot wallet, a bridge, a mixer, or another creator wallet | transfer tracing, N hops | high |
| **bundle at launch**: a funding cluster that bought early, with similar wallet ages and amounts and no prior selling. Not "same slot": the dev's own buy in the create tx is normal, and sniper bots hit every launch. Reported separately: bundle share, wallets, funding sources, sold-down over time | funding trace + wallet classes | medium to hide (bundlers fund from several CEX withdrawals) |
| sniper share in the first N slots | same | n/a |
| holder distribution: top-10 share **net of every program-held balance** (curve, pool, fee and mode vaults), the Gini coefficient | holders snapshot | low to fake *wide*, high to fake *diverse* |
| **holder funding diversity**: how many independent funding sources the top 100 holders trace back to | funding trace | **high** |
| fresh-wallet share among holders (wallets with no history before this coin) | wallet first-seen | medium |
| volume authenticity: wash patterns (A→B→A, round sizes, self-trades across a funded cluster) | trade graph | medium |
| **independent buy share**: the share of buy volume in a window from wallets in no cluster and of no bot class, each from a distinct funding source. The difference between demand and a manufactured move | the tape, per window | high: faking it takes many wallets with unrelated funding and histories |
| **late bundle**: a group of wallets that buys a large share *after* launch, clustered by shared funding, funding received in the same few minutes, adjacent slots, similar amounts and ages, no history ([pure.md](pure.md#bundles-that-arrive-after-the-post)) | the tape, every trade | medium to hide |
| creator behaviour: dev sold (how much, when), creator fees claimed vs left, any buyback | creator wallet + vault | high to hide |
| curve progress, graduation to PumpSwap, time to graduate | pump program accounts | n/a |
| holders who stayed through the largest drawdown | snapshot series | high |

🔴 Trade parsing traps already paid for once (from the Ampd/sigil build): an indexer's "interpreted" token transfers can
smear router legs into the wrong wallet and misprice by orders of magnitude. Derive trades from raw pre/post balances,
reconcile every one, and refuse a number that doesn't reconcile.

## Cross-coin signals

Four signal families that aren't easy to read off any single coin. Each needs assay's history across many coins. Each
one comes from a belief listed in [hypotheses.md](hypotheses.md) and is treated as a hypothesis until assay's own data
backs it up.

### 6. Wallet reputation

assay ingests every trade on every pump.fun coin from the moment it launches, so it sees each wallet's whole
history on the launchpad, not a sample. (An earlier indexer was built on a few hundred hand-picked wallets and turned
out to contain none of the holders that mattered. Complete coverage from day one avoids that, plus a backfill of the
months before assay started.)

Every **funding cluster** gets a class from its behaviour across coins (fresh wallets cost nothing, so the cluster carries the reputation, and a new wallet inherits its parent's class until it earns its own). For every cluster with ≥ 20 entries, an **entry ledger** records what followed each entry at 10 / 30 / 60 minutes: cluster-mates entering, holder flow, its own exit:

| class | behaviour |
|---|---|
| `sniper` | buys in the first slots of many launches, sells within minutes |
| `bundler` | buys in the create transaction or slot, funded from the creator's cluster |
| `predator` | enters after launch, takes a large share of supply (often split across a funding cluster), and exits into the buyers it attracted; the coins it touches lose holders after it leaves. Three variants: farm clusters that pump with their own wallets and dump; callers' clusters that enter minutes before the call; and bots that enter everything (classed `sniper`, since they carry no information) |
| `farmer` | many tiny buys across many coins: volume and holder-count padding |
| `organic` | none of the above |

| signal | method | cost to fake |
|---|---|---|
| `predator_entered`: a predator wallet or cluster bought into this coin, with its share and when | the trade stream against the reputation index; caught live by the sweep loop, which is the only layer that sees entries after launch | high: a predator has to build a new history to look organic, and its funding trail links the new wallets to the old |
| share of supply held by each class, now | holders × classes | high |
| a predator's exit, once it starts | the trade stream | n/a |

### 7. Callouts

A **callout** is one post about the coin by an author with reach, as distinct from `influencer_involved`, which means
sustained involvement (see [hypotheses.md](hypotheses.md#h4-category-sets-the-ceiling)).

| signal | method |
|---|---|
| callout: author, time, reach, paid format (CA + "NFA/DYOR", sponsored label) | mindshare search + author index |
| where the post landed on the coin's own attention curve (before / at / after its mindshare peak) | the mention series |
| wallets linked to or clustered with the caller that bought before the post | the caller's published wallets, plus funding clusters |
| first-slot buys after the post from wallets that do it on every call by this caller | the trade stream |
| the caller's history: median move and holder flow at +5 min / +1 h after their last N calls, with N | outcome history, for lenses only (see [lenses.md](lenses.md#what-a-lens-may-use)) |

A callout carries no weight in Mindshare by reach alone. The caller's history sets its weight, and for some callers
that history makes the call a warning.

### 8. Category

| signal | method |
|---|---|
| category: `meme`, `tech (claimed)` until a product, repo or working agent backs it, then `tech`; `culture` (a person, a show, a game), `event` (a news story), `community` (CTO), `other` | model classification over name, description, site and first posts, with the evidence quoted |
| `influencer_involved`: an author with real reach posting about the coin across days, in its community, or holding from a linked wallet | author index + the mention series + linked wallets |
| the category's outcome history: peak, time to peak, 7-day survival, with and without an involved influencer | outcome history, for lenses only |

Category changes how everything else reads. A tech coin should have a working product, a repo and a team that ships.
A meme should have reach. The curator lens judges each against its own category, and the runner lens prefers memes.

### 9. Configuration: pairing and rewards

| signal | method |
|---|---|
| launchpad, quote mint (SOL, USDC, a whitelisted pump coin…), launch mode, and the pool it migrated to | the `create_v2` arguments, the migration event (**verify** the current argument list against the IDL) |
| creator fee configuration: holder-reward mode, the per-mint sharing config (recipients, shares, whether it was made permanent), any buyback-and-burn | the fee and sharing config accounts, unclaimed fees in **both** the curve's vault and the pool's after migration (reading one gives a confident zero), and the creator wallet's actual behaviour |
| promised vs actual: the description or site says "fees go to holders"; do they? | the config, plus where claimed fees actually went |
| `config_vs_meta`: how this coin's pairing and fee setup compare with the setups the market is choosing this week | the rolling meta-preference table ([hypotheses.md](hypotheses.md#h5-the-market-picks-the-right-pairing)) |
| version siblings: other coins on the same narrative, ticker or image, and which of them the market is choosing | narrative clusters + the vamp pipeline |

The "right" pairing isn't hard-coded, because it changes. assay measures which configurations the market is choosing
now and reports each coin against that.

## 10. Narrative: where it sits in the market's story

| signal | method |
|---|---|
| narrative cluster (the meta: AI agents, a news event, a celebrity, an animal) | embeddings over name + description + first posts, clustered hourly |
| first-mover vs copy within the cluster | launch order + image/name similarity |
| the real-world event it references, and whether that event is real | news lookup |

Narrative is descriptive. It labels a coin, it never scores it.
