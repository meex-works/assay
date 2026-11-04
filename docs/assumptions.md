# Assumptions

The design's load-bearing assumptions, each given a verdict by an adversarial review (Nov 2026), and what changed
because of it. Claims about pump.fun's program marked **verify** come from the review and get checked against the
current IDL and on-chain accounts before any code depends on them.

## The verdicts

| assumption | verdict | what changed |
|---|---|---|
| A launch is one shape: 1B supply, SOL quote, one creator fee | **wrong in detail** | `create_v2` (Token-2022, metadata in the mint extension) is the live path. Its arguments reportedly carry a holder-reward switch, a quote mint (SOL for nearly all, some USDC and whitelisted pump coins), a creator-fee setting for custom pairs, and a "mayhem" mode that mints extra supply to a program vault. **verify** each. The trade event now carries `quote_mint` + `quote_amount`, and holder maths nets out every program-held balance (curve, pool, vaults), or a mayhem coin reads as a 50% whale. |
| The creator fee is one known number | **wrong** | Fees come from a fee config, and a per-mint sharing config can split the creator fee and be made permanent; unclaimed fees sit in the curve's vault before migration and in the pool's after. **verify**. Configuration signals ([signals.md](signals.md#9-configuration-pairing-and-rewards)) read all of these, from both places. |
| Launch volume is manageable | **true, but large** | Reportedly ~100k mints a day, most never hold a meaningful balance, ~1% graduate. **Measure it in week one.** L0 is cache-only, no network calls; L1 is gated on the curve coming alive. |
| L0 can hash the image within 1.5 s | **doubtful** | The image needs the metadata JSON and then a gateway fetch. Image work moved to L1. L0 reads only on-chain arguments and in-memory caches. |
| Same-slot buys from one funder = a bundle | **partly** | The dev's own buy in the create transaction is normal, and sniper bots hit every launch in the first slots. A bundle is now a funding cluster plus wallet-age and amount similarity plus no prior selling, not a slot. Failed snipe transactions are counted too: they're an attention signal. |
| First-party X API is affordable at this depth | **doubtful, the biggest risk** | Every X read is gated on the chain: L1 spends at most one user lookup, and only on coins whose curve holds ≥ x SOL from ≥ y independent funding sources. Followers and search are L3 only. The design has to be useful with X switched off. Real prices measured before sizing ([costs.md](costs.md)). |
| Handle history is observable | **wrong at the start** | The API gives the creation date and current handle, never the history. assay's snapshots start empty, so the first coin an account appears on can't trip the rename check, which is exactly the case that matters. Proxies added: the user ID's creation date against the handle's first archive appearance, post count far below the account's age, the oldest visible post much newer than the account. Third-party handle histories exist; licensing to be checked. |
| Free sources are reliable | **mixed** | RDAP is fine. crt.sh times out at volume (best-effort). Wayback almost never has a memecoin domain before the coin, so it's an impersonation check, not Presence. Hosted subdomains (Vercel, Framer, Lovable) have no RDAP or cert of their own. pump.fun's frontend API changes without notice: best-effort only, never load-bearing. |
| A 3-minute sweep fits the trenches | **wrong for trench traders** | A coin's tradeable life is often under 10 minutes. The Chain dimension is now event-driven from the trade stream and updates in seconds (**the tape**). The sweep loop is the cadence for social reads, which cost money. |
| A quality gate is what traders want | **half** | "checked, Authenticity ≥ 50" first exists minutes after launch and favours aged accounts, which on pump are rare. Trench traders want facts in seconds: bundle share, who just entered, the dev's history, which copy is the real one. The evidence layer and the lenses serve them; the tier serves the curator. |
| Cost-to-fake weights + hand labels calibrate it | **partly** | Cost-to-fake ignores base rates: a signal no pump coin has ranks nothing. A few hundred hand labels overfit 60+ signals. Calibration now uses behavioural outcomes that exist for every coin and aren't price: dev sold > X% in hour 1, bundle dumped, migrated, holders at day 7, pool still funded. Hand labels are kept for impersonation and real-project classes. |
| The review agent is reproducible | **doubtful** | The exact model ID is pinned in the note's signature, and the deterministic gates are re-run before a note is trusted. "Curated 11 minutes after launch" was impossible when L3 needs a follower sample: 30–90 minutes is realistic, and the docs now say so. |
| The terms are compatible | **mostly** | The follower index (X user IDs across coins) is the moat and the exposure: user IDs are personal data. The index stores hashed ID sets for overlap, raw IDs only transiently, with a scheduled deletion-compliance sweep. The overlay reads the DOM only; the extension store allows a remote selector config, not remote code. |

## On the new rules

| rule | the review's sharpening |
|---|---|
| bundles = volatility, and some want that | "Bundled" is three different things: hidden dev supply (dump risk), a launch service running a scripted arc, and sniper bots (not a bundle at all). Emit the facts separately: bundle share, wallets, funding sources, sold-down over time, age. |
| predatory traders | Three kinds: bots that enter everything (no edge), callers whose cluster enters minutes before their post, and farm clusters that pump with their own wallets and dump. Label the funding cluster, not the wallet; fresh wallets are free. An entry ledger per wallet with ≥ 20 entries records what followed at 10 / 30 / 60 min. |
| callouts can be bearish | Five testable hypotheses, one table (author, post, time, mint, deleted?) joined to trades. Added to [hypotheses.md](hypotheses.md#h3-a-callout-can-be-bearish): the **caller distribution** case, where most callers are paid and net-negative and a few aren't, so the average hides the tail. |
| category sets the ceiling | Confounded: "meme with an influencer" already conditions on attention, and "utility" on pump costs nothing to claim. The category is `tech (claimed)` until a product or repo backs it. |
| the market picks the right pairing | Testable with the copy detector: among near-duplicates within an hour, does the holder-reward / shared / SOL version win? Confound: non-SOL quotes may lose because bots and aggregators assume SOL. That's tooling, not preference, and the test has to separate them. |
| vamps: reverse image + OCR | Yes, in order of cost: identical metadata URI or CID, pHash, DINOv2/CLIP embeddings (threshold per narrative, or every Pepe is one cluster), OCR, and external reverse search only for "is this a brand or a person" (their indexes don't hold pump images). The hard part is the index, not the matcher: backfill every historical launch image before day one. Report "first seen" and "largest" separately; the biggest coin was often itself a copy. Reusing a dead ticker is normal: a fact, not a flag. |

## Open, from the review

- **What the Telegram channel is.** A channel listing coins is a call channel whatever its wording, and it will move
  what it posts. Options: measure that effect and publish it (planned either way), post with a delay, or post evidence
  and flags only. See [open-questions.md](open-questions.md).
