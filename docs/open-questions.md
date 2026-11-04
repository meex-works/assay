# Decisions

## Decided

| question | decision |
|---|---|
| shape | an event bus; layered loops that answer fast and refine; a sweep loop that covers as many coins as its window allows |
| who reviews | an agent (L4), within deterministic gates; the operator can override, on the record |
| interpretation | facts and traits are the same for everyone; lenses read them for different risk profiles ([lenses.md](lenses.md)) |
| social cadence vs chain | Chain updates per trade in seconds (the tape); X reads are gated on the chain and paced by the sweep |
| X data | first-party X API until a measured cost estimate exists |
| keys | supplied by whoever runs the instance; none ship with the repo |
| scope | the trenches: every launch, from the first second, not just graduated coins |
| speed vs cost | good and fast first; the budget is a setting |
| public surface | a free demo at assay.meex.work and a Telegram channel; no X account |
| the channel | posts pure launches, not good coins; no market details; edits a post in place when purity breaks ([pure.md](pure.md)) |
| X | one mindshare source among several, low trust and capped; optional |
| channel timing | post at 30 s; watch for 15 min, confirm at 5 and 15 min, edit within seconds if a late bundle breaks purity |
| the channel | **Assay Office**, [t.me/assayoffice](https://t.me/assayoffice) |
| the voice | deadpan details only: facts with their numbers, plain words ([pure.md](pure.md#voice)) |
| the thread | every posted coin's history under its post (comments by default); a price move only with what made it, and only when it isn't demand |
| launch kit | the creators' checklist + a read-only preflight + declared launches; free, never buys a post |
| speed | push, never poll: gRPC + websocket at `processed`, logs decoded directly, address webhooks for wallets and vaults |
| weights | public, in `config/weights.yaml` |
| repo | public, MIT; a baseline others clone and change |

## Still open

1. **Thresholds.** L0→L1 and L2→L3. Set them after a week of L0 data on the real launch rate.
2. **Window length and budget** for the demo instance's sweep loop (3 minutes is the starting guess).
3. **The demo's keys.** The demo runs on its operator's X, RPC and model keys, so its budget caps how much of the trenches
   it covers. Size it from the week-one measurement.
4. **Other launchpads.** The schema is launchpad-agnostic (`launchpad: "pump.fun"`). Bags, Bonk's launchpad and Meteora
   DBC are the obvious next ones.
5. **Name.**
6. **A launch page.** The kit is preflight-only. A page that builds the create transaction for the creator's own wallet
   to sign (assay never holding a key) would make a pure launch one click; it also makes assay part of the launch
   path. Later, if at all. `assay` is a working name.
