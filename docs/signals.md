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
| image hash (perceptual, pHash) and its first-seen coin | our own index | low to change, but a reused image is evidence of a copy |
| name/ticker collisions with earlier coins | our own index | n/a: this is the *copy* detector |
| claims an affiliation (a person, brand, game, company, other chain) | model extraction from name + description | low |
| the claimed affiliation's official accounts mention the coin | X/web lookup of the official accounts | **high**; this is how "unofficial" gets written, as with the Kojima coin |

## 1. Presence: does anything exist off-chain

### X account

| signal | source | cost to fake |
|---|---|---|
| account exists, resolves, not suspended | X user lookup | low |
| **user ID creation date** | X user lookup | high if old, *but see handle history* |
| **handle history** (same user ID, earlier handles) | our own snapshots of `user_id → handle`, plus third-party history where licensed | high; an old account renamed yesterday is a bought account |
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
| hosting (Vercel/Netlify subdomain vs own domain) | DNS | low |
| **template fingerprint**: DOM structure hash, asset hashes, the same Lovable/v0/Framer template seen on N other coins | our own crawl index | low per site, but the *cluster* is high-signal |
| content mentions the mint, and the mint is right | fetch | low; a wrong mint is a hard flag |
| original text vs boilerplate ("roadmap: phase 1 launch, phase 2 CEX listings") | model classification + n-gram overlap with the corpus | low |
| Wayback Machine snapshots before the coin | archive.org CDX API | high |
| dead links, placeholder `#` hrefs | fetch | low |

### Other presence

| signal | source | cost to fake |
|---|---|---|
| GitHub org/repo, commits by distinct authors over time | GitHub API | medium to high |
| Farcaster account / channel, Neynar user score | Neynar | medium |
| YouTube / TikTok / Instagram accounts from the metadata or site | page fetch | low |
| pump.fun livestream held, viewer counts | pump.fun frontend API (unofficial) | low |
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

| signal | method | cost to fake |
|---|---|---|
| distinct authors mentioning `$TICKER` or the mint, per hour | X search (recent), deduplicated by author | low raw / **high** when weighted by author quality |
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
| **bundle at launch**: wallets buying in the create transaction or the same slot, funded from one source | slot analysis + funding trace | medium to hide |
| sniper share in the first N slots | same | n/a |
| holder distribution: top-10 share net of the curve/pool, the Gini coefficient | holders snapshot | low to fake *wide*, high to fake *diverse* |
| **holder funding diversity**: how many independent funding sources the top 100 holders trace back to | funding trace | **high** |
| fresh-wallet share among holders (wallets with no history before this coin) | wallet first-seen | medium |
| volume authenticity: wash patterns (A→B→A, round sizes, self-trades across a funded cluster) | trade graph | medium |
| creator behaviour: dev sold (how much, when), creator fees claimed vs left, any buyback | creator wallet + vault | high to hide |
| curve progress, graduation to PumpSwap, time to graduate | pump program accounts | n/a |
| holders who stayed through the largest drawdown | snapshot series | high |

🔴 Trade parsing traps already paid for once (from the Ampd/sigil build): an indexer's "interpreted" token transfers can
smear router legs into the wrong wallet and misprice by orders of magnitude. Derive trades from raw pre/post balances,
reconcile every one, and refuse a number that doesn't reconcile.

## 6. Narrative: where it sits in the market's story

| signal | method |
|---|---|
| narrative cluster (the meta: AI agents, a news event, a celebrity, an animal) | embeddings over name + description + first posts, clustered hourly |
| first-mover vs copy within the cluster | launch order + image/name similarity |
| the real-world event it references, and whether that event is real | news lookup |

Narrative is descriptive. It labels a coin, it never scores it.
