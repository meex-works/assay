# Open questions

The decisions to make before code, roughly in the order they block things.

1. **Who reviews?** `curated` needs a named person. One reviewer caps throughput at maybe 20–40 coins a day. Is it
   one person, a small paid group, or invited community reviewers with a reputation of their own?
2. **X data source.** First-party X API (clean terms, the price per read sets T2's depth) or a third-party X data API
   (cheaper, terms murkier for a service that redistributes). This decision sizes the whole budget.
3. **Thresholds.** T0→T1 and T1→T2. Set them after a week of T0 data on the real launch rate, not before.
4. **Free vs paid line.** What the free key gets (tier + dimensions? flags?) and what it doesn't (evidence,
   history, `as_of`, stream). The overlay needs the free tier to be useful, or nobody installs it.
5. **Public weights.** [adversarial.md](adversarial.md) argues for publishing them. Agree or not?
6. **Repo visibility.** Plan public now, code public later? Or private until there's something to run?
7. **Graduated coins only?** Starting with coins that graduated to PumpSwap cuts volume by orders of magnitude and
   still covers what most people look at. The cost is missing the early hours, which is when the overlay is most
   useful.
8. **Other launchpads.** The schema is chain-and-launchpad agnostic (`launchpad: "pump.fun"`). Bags, Bonk launchpad,
   Meteora DBC, and Base's launchers are the obvious next ones. In scope for v1 or not?
9. **Name.** `assay` is a working name.
