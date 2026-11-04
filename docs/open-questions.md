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
| weights | public, in `config/weights.yaml` |
| repo | public, MIT; a baseline others clone and change |

## Still open

1. **What the Telegram channel is.** A channel listing coins moves what it lists. Measure that effect and publish it
   (planned either way), and choose: post curated coins as they're promoted, post with a delay, or post evidence and
   flags only.
2. **Verify the pump.fun program details** the review raised (launch modes, quote mints, fee and sharing configs)
   against the current IDL before the decoders are written.
3. **Thresholds.** L0→L1 and L2→L3. Set them after a week of L0 data on the real launch rate.
4. **Window length and budget** for the demo instance's sweep loop (3 minutes is the starting guess).
5. **The demo's keys.** The demo runs on its operator's X, RPC and model keys, so its budget caps how much of the trenches
   it covers. Size it from the week-one measurement.
6. **Other launchpads.** The schema is launchpad-agnostic (`launchpad: "pump.fun"`). Bags, Bonk's launchpad and Meteora
   DBC are the obvious next ones.
7. **Name.** `assay` is a working name.
