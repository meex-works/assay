# Tutorial 2: getting the keys

assay talks to three kinds of Solana provider, plus Telegram. Each is needed only if the module that uses it is on.

| key | module | needed for | cost |
|---|---|---|---|
| [gRPC](#grpc) | `feeds.grpc` | every pump.fun trade; without it, nothing after launch is seen | paid: ~$85/month measured |
| [websocket](#websocket) | `feeds.websocket` | a second, independent feed of launches | free tier is enough |
| [RPC](#rpc) | `funding` | where early buyers' SOL came from; quote-coin names | free tier usually enough |
| [Telegram](03-telegram.md) | `post.telegram` | posting | free |

All keys go in `.env` at the repo root (copy it from `.env.example`). Run `npm run doctor` after adding each one.

---

## gRPC

**What it is.** Yellowstone gRPC is a stream of Solana transactions, filtered on the provider's side. assay asks for
every *successful* transaction that touches pump.fun's event account, which is every launch and every trade:
about **55 transactions a second, ~1.1 TB a month** (measured 2026-11-04). Failed transactions are filtered out at the
source; they're mostly sniper bots that lost the race and tell assay nothing.

**Providers that work** (any Yellowstone-compatible endpoint does):

| provider | pricing shape | notes |
|---|---|---|
| **Alchemy** | $75 per TB streamed, pay-as-you-go, no minimum | needs a paid (pay-as-you-go) plan; the API key is the token. What Assay Office uses. |
| Chainstack | $49/month plan + $49/month gRPC add-on | flat price, unlimited events |
| Triton | usage-based | ask for a quote |
| Helius (LaserStream) | from the $499/month plan | mainnet gRPC isn't on cheaper plans |

**Alchemy, step by step:**

1. Sign up at [alchemy.com](https://www.alchemy.com) and switch the account to **Pay As You Go** (billing settings).
2. **Create an app** just for assay (keeping it separate makes its usage easy to read). Choose **Solana** and
   **Mainnet**.
3. Turn on **Solana gRPC** for the app, if it's listed as an add-on.
4. Copy the app's **API key** into `.env`:
   ```sh
   ALCHEMY_API_KEY=your-key
   ```
   assay uses it as the gRPC token *and* builds the RPC URL from it, so this one line covers gRPC and RPC.

**Any other provider:** put the endpoint in `config/assay.yaml` and the token in `.env`:

```yaml
providers:
  grpc_endpoint: https://your-provider-endpoint:443
```
```sh
GRPC_TOKEN=your-token
```

**Check it:** `npm run doctor` should print `✓ gRPC stream · <endpoint> · slot <number>`.

**If it fails:** `UNAUTHENTICATED` means the token is wrong or gRPC isn't enabled on the plan; a timeout usually means
the endpoint URL is wrong (check whether your provider wants a port such as `:443`).

---

## websocket

**What it is.** A standard Solana websocket. assay subscribes to the logs of pump.fun's mint-authority account, which
only create transactions touch, so it carries launches only: about 6 GB a month. It's there to cross-check the gRPC
feed: every launch one feed sees and the other doesn't is logged as a gap.

**Helius, step by step:**

1. Sign up at [helius.dev](https://www.helius.dev). The **free** plan is enough: the feed uses roughly 0.12M of its
   1M monthly credits.
2. Copy your **API key** into `.env`:
   ```sh
   HELIUS_API_KEY=your-key
   ```

**Any other provider:** give the full websocket URL instead:

```sh
WEBSOCKET_URL=wss://your-provider/?api-key=...
```

**Check it:** `npm run doctor` should print `✓ websocket subscribes · subscription <number>`.

**Don't have one?** Switch it off: `feeds.websocket: false` in `config/assay.yaml`. You lose the cross-check, nothing
else.

---

## RPC

**What it is.** Ordinary Solana JSON-RPC over HTTPS. assay uses it to find where an early buyer's SOL came from (two
calls per new wallet, cached forever after) and to name the coin a launch is quoted in. On a busy day that's tens of
thousands of calls.

**Options:**

- If you set `ALCHEMY_API_KEY`, you already have it.
- Any other provider: `RPC_URL=https://...` in `.env`.
- Free tiers rate-limit. assay backs off automatically (the `429` count in the status line), but if that number keeps
  climbing, move to a paid tier.

**Check it:** `npm run doctor` should print `✓ RPC answers · slot <number>`.

**Don't want the cost?** Switch funding off (`funding: false`). The bundle rules that depend on funding are skipped;
bundles that buy in the launch's first slots are still caught. See [Tutorial 4](04-configuration.md).

---

## Where keys are read from

In order: the environment (including `.env`), then the macOS Keychain (or, on Linux, a file in `~/.secrets/` read by
a `security` stand-in; see [Tutorial 5](05-server.md)). The doctor says which source each key came from.

| key | `.env` names (first one found wins) | Keychain service / account |
|---|---|---|
| gRPC | `GRPC_TOKEN`, `ALCHEMY_API_KEY` | `assay-alchemy` / `assay` |
| RPC | `RPC_URL`, `ALCHEMY_API_KEY` | `assay-alchemy` / `assay` |
| websocket | `WEBSOCKET_URL`, `HELIUS_API_KEY` | `assay-helius` / `assay` |
| Telegram | `TELEGRAM_BOT_TOKEN` | `desk-telegram-bot` / `desk` |
| site API | `ASSAY_API_KEY` | `assay-api-key` / `assay` |

**Next:** [Tutorial 3: your Telegram channel](03-telegram.md).
