# Adversarial

Once assay matters, coins will be built to score well. Every signal gets gamed; the plan is to make that cost more
than it's worth, and to notice when it happens.

| attack | what it fakes | counter |
|---|---|---|
| bought followers | Presence | follower sampling + cross-coin overlap; the farm's followers are already in the index |
| aged accounts bought and renamed | account age | handle history from our own `user_id → handle` snapshots; a rename near launch is a flag |
| engagement pods / reply bots | Authenticity | reply text clustering, repliers who reply to every coin, burst timing |
| paid KOL calls | Mindshare | author history: posts and deletes, posts every coin, timing against creator-wallet transfers; paid authors weigh ~0 |
| press-release wires and syndication | Coverage | outlet class table; wires are labelled as wires, whatever page they're republished on |
| templated / AI websites | Presence | template fingerprint clusters; boilerplate classifier |
| fresh-wallet holder spreading | Chain | funding diversity, not holder count |
| wash trading | Chain | trade graph cycles across a funded cluster |
| celebrity / brand impersonation | everything | affiliation check against the party's official accounts; "unofficial" is written plainly |
| gaming assay itself: looking up your own coin to force T2 | cost | demand escalation is rate-limited per key and per IP; T2 runs once per window whatever the demand |
| pressuring a reviewer | Curated | reviewers are never paid by coins, disclose holdings, sign notes; a second reviewer on any coin above a size threshold |
| learning the weights | everything | weights are public (it's evidence, not a secret), but cost-to-fake weighting means the cheap fixes don't move the score |

**Drift watch**: every week, compare the distribution of each signal across new coins with the previous four weeks.
A signal that suddenly gets better across the board is being gamed, not improving. Its weight drops until a reviewer
looks.

**Publishing the weights is a choice, not an accident.** Hidden weights invite "how do I get a better score" requests;
public weights backed by cost-to-fake make the answer "do the expensive real thing".
