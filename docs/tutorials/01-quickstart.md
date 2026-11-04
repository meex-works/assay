# Tutorial 1: your first dry run

**You'll end up with:** assay running on your own computer, watching every pump.fun launch live, judging each one at
30 seconds, and printing the posts it *would* make. Nothing gets posted anywhere.

**Time:** about 20 minutes, most of it getting two keys.

**You need:** a computer with macOS, Linux or Windows (WSL), and the ability to open a terminal.

---

## 1. Install Node.js and git

assay is written in TypeScript and runs directly on **Node.js 22.18 or newer** (no build step).

Check what you have:

```sh
node --version     # needs to print v22.18.0 or higher
git --version      # any version
```

If `node` is missing or older: install the current LTS from [nodejs.org](https://nodejs.org), or with a version
manager (`nvm install 22`). If `git` is missing: [git-scm.com](https://git-scm.com/downloads).

## 2. Get the code

```sh
git clone https://github.com/meex-works/assay.git
cd assay
npm install
npm run idl
```

- `npm install` downloads the libraries assay uses (about 150 MB into `node_modules/`).
- `npm run idl` downloads pump.fun's program interface (the IDL), pinned to the exact version assay was verified
  against. It isn't stored in the repo because pump.fun's repo has no license.

You should see `idl/ at pump-fun/pump-public-docs@639b87f`.

## 3. Get two keys

For a dry run you need two of them:

| key | what it's for | quickest way |
|---|---|---|
| a **gRPC** token | the stream of every pump.fun transaction | Alchemy: a paid pay-as-you-go account with Solana gRPC on ([Tutorial 2](02-keys.md#grpc)) |
| a **websocket** | a second, independent feed of launches | Helius: a free account ([Tutorial 2](02-keys.md#websocket)) |

The Alchemy key also serves as your **RPC** key, which funding lookups use. So with an Alchemy key and a Helius key,
everything in a dry run works.

> [!TIP]
> No gRPC yet? You can still run with launches only: `--set feeds.grpc=false`. It's useful to check your setup, but
> without trades every coin reads as dead at 0:30, so you'll see launches and no verdicts.

## 4. Put the keys in `.env`

```sh
cp .env.example .env
```

Open `.env` in any text editor and fill in:

```sh
ALCHEMY_API_KEY=your-alchemy-api-key
HELIUS_API_KEY=your-helius-api-key
```

`.env` is ignored by git: it stays on your machine. Never paste keys anywhere else.

## 5. Run the doctor

```sh
npm run doctor
```

It checks your Node version, the IDL, each key, and that each provider actually answers. A healthy result for a dry
run looks like this:

```
keys (from .env or the Keychain)
  ✓ Yellowstone gRPC token (feeds.grpc) · from ALCHEMY_API_KEY
  ✓ Solana websocket (feeds.websocket) · from HELIUS_API_KEY
  ✓ Solana RPC (funding lookups, quote-coin names) · from ALCHEMY_API_KEY
  · Telegram bot token (post.telegram) · skipped (post.telegram (and not --dry) is off)

providers (live)
  ✓ RPC answers · slot 465209657
  ✓ gRPC stream · https://solana-mainnet.streaming.alchemy.com · slot 465209661
  ✓ websocket subscribes · subscription 9305697
```

Every `✗` comes with a `fix:` line that says exactly what to do. Run the doctor again until there are none. (The
Telegram lines are skipped until you set up a channel in [Tutorial 3](03-telegram.md); that's expected.)

To skip the Telegram check while you're only doing dry runs, run it as `npm run doctor -- --dry`.

## 6. Start it in dry mode

```sh
npm run silent -- --dry
```

The first lines tell you what's on:

```
assay silent run · config config/assay.yaml · DRY (printing posts)
  feeds: grpc on, websocket on · funding on · metadata on · watch on · control 20%
  checks off: none · min_age 30s · watch 15m
```

Then, once a minute, a status line:

```
[06:23:24] launches 59 (grpc 59, helius 58) · judged 18 · dead 25 · pure+alive 1 (posted 1, control 0, capped 0) · meta 53/59 · rpc 318 (429 0) · watches 1 · 165 MB
```

| part | means |
|---|---|
| `launches 59 (grpc 59, helius 58)` | launches seen in total, and by each feed |
| `judged 18 · dead 25` | coins checked at 0:30, and coins with fewer than three outside buyers (not checked further) |
| `pure+alive 1` | coins that passed every check and had enough independent buyers |
| `posted 1, control 0` | of those: "posted" (printed, in dry mode) and held back as the comparison set |
| `meta 53/59` | metadata files that loaded |
| `rpc 318 (429 0)` | RPC calls so far, and how many were rate-limited |

Pure launches are rare: around 2–4% of coins with real buyers. Within a few minutes you'll see a printed post:

```
[dry post]
PURE LAUNCH  $SPACECENTER  Space Center
HtyXwAXRFncW5sTUuZBsBU1vw5LPrpWqnnB84w9Mpump

Dev bought 2.9%, nothing sold.
No bundle among the first buyers.
...
```

…and, quite often, a printed edit a few seconds later when the dev sells.

Stop it any time with **Ctrl+C**. Everything it saw is kept in `data/assay.db`, and the next run picks up where it
left off.

## 7. Read the report

In a second terminal, from the same folder:

```sh
npm run report -- --posts
```

```
launches        712 (39534/day) · seen by both feeds 100.0% · gaps {}
gRPC lead       median 125 ms over Helius
judged at 30 s  688 · dead (<3 outside buyers) 379 · pure + alive 7 (2.3% of live coins)
failed checks   original 204 · dev_holding 177 · clean_creator 126 · dev_buy 108 · ...
```

[Tutorial 7](07-operating.md) explains every line.

## It worked if…

- `npm run doctor` shows no `✗` (Telegram lines skipped).
- The status line's `launches` count goes up every minute, roughly 25–50 per minute depending on the time of day.
- `judged` goes up too, and within 10–20 minutes you've seen at least one `[dry post]`.

**Next:** [Tutorial 2: getting the keys](02-keys.md) for the details of each provider, or
[Tutorial 3: your Telegram channel](03-telegram.md) to post for real.
