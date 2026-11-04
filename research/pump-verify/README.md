# pump-verify

Read-only checks of assay's assumptions about pump.fun against mainnet. No keys; any Solana RPC URL works (a free tier
is slow but enough).

```sh
npm install && sh ../../scripts/fetch-idl.sh
RPC=<mainnet url> node sample-launches.mjs --pages 45 --sample 400   # launch rate by hour + decoded launch configs
RPC=<mainnet url> node inspect.mjs                                    # quote-mint names, real supply of mayhem coins
RPC=<mainnet url> node early-trades.mjs --coins 40 --window 60        # first-minute buyers, net positions, funders
RPC=<mainnet url> node hubs.mjs <address>…                            # what a recurring wallet or funder is
```

`scripts/fetch-idl.sh` (repo root) downloads pump.fun's published IDL at the pinned commit (639b87f); it isn't vendored because that repo has no license. `results/` holds the summaries the write-up in
[docs/verified.md](../../docs/verified.md) quotes. `out/` (ignored) holds full runs.
