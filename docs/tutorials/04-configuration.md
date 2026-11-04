# Tutorial 4: configuration

assay has two config files:

| file | holds |
|---|---|
| [`config/assay.yaml`](../../config/assay.yaml) | what runs: feeds, funding, metadata, each check, posting, the watch, storage, the API, feedback links, providers |
| [`config/lenses/pure.yaml`](../../config/lenses/pure.yaml) | the checklist's thresholds and the post and watch timings |

Keys never go in either file: they go in `.env` ([Tutorial 2](02-keys.md)).

## Changing a setting

Three ways, from most permanent to least:

```sh
# 1. edit config/assay.yaml (applies to every run)

# 2. an environment variable: ASSAY_<SECTION>_<KEY>, in .env or on the command line
ASSAY_CHECKS_LINKS=false npm run silent

# 3. a flag, for this run only
npm run silent -- --set checks.links=false --set post.control_share=0
```

If the same setting is given more than once, **the flag wins over the environment, and the environment wins over the
file.** Two shortcuts: `--dry` (same as `--set post.dry=true`) and `--config <file>` (use a different instance file;
handy for running a test instance next to a real one).

A typo stops the run with one line that lists the real settings:

```
config: --set post.drry=1: there's no setting "post.drry" in config/assay.yaml. Settings in "post": telegram, dry, channel, control_share
```

The first lines of every run print what's on and off, so you can always see what you're running.

## `config/assay.yaml`, setting by setting

### `feeds`

| setting | default | on | off |
|---|---|---|---|
| `feeds.grpc` | `true` | every successful pump.fun transaction: launches and trades | launches only (from the websocket); nothing after launch is seen, so every coin reads as dead at 0:30 |
| `feeds.websocket` | `true` | a second, independent feed of launches; gaps between the two are logged | the gRPC feed alone, no cross-check |

At least one must be on.

### `funding`

One-hop lookups of where each early buyer's SOL came from (two RPC calls per new wallet, cached).

| when on | when off |
|---|---|
| all four bundle rules run: creator-funded, shared funder, funded within minutes of each other, fresh wallets in the first slots | only "wallets buying in the launch's first two slots" runs (any wallets, since freshness isn't known) |
| the known-disperser check runs | skipped |
| "independent buyers" means distinct funding sources | it means distinct wallets |

Off is cheaper and less accurate. Bundles funded from several exchange withdrawals that buy a few slots in are missed.

### `metadata`

| when on | when off |
|---|---|
| each launch's metadata JSON and image are fetched (pump.fun's gateway, then public IPFS gateways), the image is hashed, links are checked | originality rests on the on-chain metadata URI and the name/ticker; no image comparison, no link checks, no "honest config" check |

### `checks`

Each rule of the [pure checklist](../pure.md) has its own switch. **A check that's off is skipped, never failed.**

| check | the rule |
|---|---|
| `dev_buy` | the creator (or the wallet that signed the launch) bought `dev_buy_max` of supply or less |
| `dev_holding` | the dev hasn't sold half or more of their buy |
| `bundle` | no bundle among the first-minute buyers holding 3% or more |
| `known_actors` | no early buyers funded by a known disperser (needs `funding`) |
| `clean_creator` | the creator or signer hasn't launched 3+ other coins in the last 24 hours (as far as this instance has seen) |
| `original` | no earlier coin with the same metadata, the same image, or the same name or ticker within 24 hours |
| `links` | a linked Telegram exists (needs `metadata`) |
| `honest_config` | a description that promises holder rewards matches the launch's setting (needs `metadata`) |
| `alive` | at least `independent_buyers_min` independent buyers; keeps the channel from posting every quiet coin |

### `post`

| setting | default | does |
|---|---|---|
| `post.telegram` | `true` | post pure launches. Off = judge and watch only; the database and site still fill |
| `post.dry` | `false` | print posts, edits and comments to the console instead of sending them |
| `post.channel` | `"@assayoffice"` | your channel's `@username` or numeric id |
| `post.control_share` | `0.2` | the share of pure coins held back as a comparison set: watched exactly the same, never posted. `0` posts all of them |

### `watch`

`true`: each pure coin is watched for `watch_for` (15 minutes), its post edited if purity breaks, events threaded as
comments. `false`: post once and never edit.

### `store`, `api`, `feedback`, `providers`

| setting | default | does |
|---|---|---|
| `store.path` | `data/assay.db` | the SQLite file. **Never delete it on a running instance**: originality and serial-creator checks need its history |
| `store.keep_trades_days` | `8` | raw trades older than this are pruned (launches, verdicts and posts are kept) |
| `api.port`, `api.host` | `8791`, `127.0.0.1` | where `src/api.ts` listens ([Tutorial 6](06-website.md)) |
| `feedback.text`, `.x`, `.telegram` | Meex's | the "Let's chat" line and buttons under every post |
| `providers.grpc_endpoint` | Alchemy's | any Yellowstone gRPC endpoint |
| `providers.websocket` | Helius's | the base URL used with `HELIUS_API_KEY`; ignored if you give a full `WEBSOCKET_URL` |

## `config/lenses/pure.yaml`

| setting | default | does |
|---|---|---|
| `gate` → `dev_buy_share.max` | `0.05` | the largest dev buy a pure coin can have (5% of supply) |
| `gate` → `independent_buyers_min` | `10` | the `alive` threshold |
| `post.min_age` | `30s` | when a coin is judged and posted |
| `post.max_posts_per_hour` | `30` | beyond this, pure coins are recorded as "capped" and not posted |
| `post.watch_for` | `15m` | how long a posted coin is watched |
| `post.confirm_at` | `[5m, 15m]` | when "Still pure at …" is threaded |
| `post.late_bundle_share_max` | `0.10` | a late group holding this share of supply breaks purity |
| `thread.move_min` | `3` | a price move is mentioned only at 3× or more… |
| `thread.independent_share_max` | `0.10` | …and only when less than 10% of the buying was independent |
| `thread.coalesce`, `thread.max_events` | `10s`, `12` | events within 10 s are merged; at most 12 per coin |

## Recipes

**Watch, don't post** (collect data, fill the site):
```sh
npm run silent -- --set post.telegram=false
```

**Post everything pure** (no comparison set):
```sh
npm run silent -- --set post.control_share=0
```

**Low cost** (no funding lookups; gRPC is still the main cost):
```sh
npm run silent -- --set funding=false
```

**Stricter:** in `config/lenses/pure.yaml`, set `dev_buy_share.max` to `0.02`, `independent_buyers_min` to `20`, and
`min_age` to `60s`. A longer `min_age` means fewer posts that break seconds after posting (a dev who holds through 0:30
and sells at 0:32 is common).

**A test instance next to a real one:** copy `config/assay.yaml` to `config/test.yaml`, change `store.path` to
`data/test.db` and `post.channel` to a private channel, then:
```sh
npm run silent -- --config config/test.yaml
```

## Constants in the code

A few operational numbers live at the bottom of [`src/config.ts`](../../src/config.ts), because changing them changes
what the checks *mean*: the first-buyer window (60 s), what counts as a fresh wallet (first active under an hour
before buying), "funded together" (within 3 minutes), the minimum bundle share (3%), the serial-creator count (3 in
24 h), the disperser threshold (3 coins), and how long a coin is tracked (30 minutes). Each has a comment saying what
it does.

**Next:** [Tutorial 5: running it on a server](05-server.md).
