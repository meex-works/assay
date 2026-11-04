# Data retention

Three layers, kept for different lengths because they cost different amounts and carry different obligations.

| layer | what | where | kept |
|---|---|---|---|
| **raw captures** | HTTP responses, page HTML, metadata JSON, page screenshots, API payloads | R2, content-addressed | 90 d hot; then site/metadata captures go to cold storage indefinitely; **platform content per the platform's terms (below)** |
| **observations** | dated, sourced facts derived from captures | Postgres | forever; append-only; superseded, never deleted |
| **reports** | dimension snapshots, flags, tier changes, notes | Postgres | forever; each change is a row |

Shared caches (follower class per user ID, author quality, wallet funding parent, template fingerprints) are
observations too, and keep their history.

## Why keep everything

- **Point-in-time answers** ([api.md](api.md)) and bus replay ([events.md](events.md)) need every observation, with the time it was made.
- **Deleted promises** are evidence. A capture of a post saying "CEX listing Friday" matters most after it's deleted.
- **Lineage** compounds. A creator wallet's coin from March is what flags its coin in November.
- The corpus (templates, bot followers, paid callers, wire outlets) is the moat. It gets cheaper and better with
  every coin.

## What the platforms allow

This is the part that constrains the design, so it gets settled before code. Raised once here:

- **X**: the developer terms require removing content a user has deleted or made private when it was obtained through
  the API, and they restrict what can be redistributed. So assay stores X *observations* (counts, IDs, timestamps,
  classifications, "a post by user ID N referencing this mint existed at T") and, for X content itself, a hash rather
  than the text once it has been deleted. The public evidence for a deleted promise is "a post by the linked account
  that existed at T was deleted by T+1", not the text. Get the exact terms read before launch.
- **Telegram**: public channel counts are fine. Reading group messages needs a member account. Store aggregate counts
  and per-sender classifications, not message text beyond the window needed to classify it.
- **Websites and metadata**: public, the coin's own claim about itself; keep the captures.
- **News**: store URL, headline, outlet, byline, date and the outlet class. No article bodies beyond what
  classification needs.
- **Chain**: public, permanent anyway.

## People

assay reports on coins and the public accounts they link, never on private individuals behind them. It doesn't resolve
wallets to names or publish anyone's location. X user IDs are personal data too, and the follower index needs them
across coins, so the index stores **hashed** ID sets (enough to compute overlap), handles raw IDs only transiently,
and runs a scheduled deletion-compliance sweep.
A creator wallet's history is reported as a wallet's history.

A takedown/correction address is published, and every correction is a superseding observation that stays on the
record.
