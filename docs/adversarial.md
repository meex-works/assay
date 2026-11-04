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
| gaming assay itself: looking up your own coin to force a sweep | cost | demand is rate-limited per key and per IP; a coin gets at most one priority bump per window |
| **prompt injection**: instructions aimed at the review agent, hidden in the description, website, posts or image text | Curated | the agent sees coin content only as fenced, labelled, untrusted data and answers in a fixed schema; it can't promote past a failed deterministic gate or clear a flag; an injection attempt detected by a classifier is itself a red flag (`prompt_injection`) |
| bribing an operator | Curated | operator overrides are signed observations, public on the report, and can't be removed |
| predators rotating to fresh wallets | `predator_entered` | the funding trail: new wallets are classed by their funding parent's history, so a fresh wallet inherits its parent's class until it earns its own |
| fake fee sharing: "fees go to holders" in the description, nothing in the config | Configuration | promised vs actual is checked against the config accounts and where claimed fees actually went; a broken promise is an integrity flag |
| beating the vamp check: crops, mirrors, AI re-draws, new ticker | identity | embeddings and OCR catch what hashes miss; reverse image search catches art lifted from the web; the `template` list keeps common memes from matching everything |
| callers gaming their own history: deleting bad calls, posting from a second account | callouts | assay captures the call when it's made; a deleted call stays in the caller's history as "deleted"; second accounts are linked by shared wallets and posting patterns |
| declaring a clean plan, then launching differently | pure | L0 compares the launch with the plan field by field; a mismatch is an observation on the record, and the live checks decide purity regardless |
| a late bundle timed for the channel's readers | pure | the tape breaks purity within seconds of the bundle's buys and the post is edited; posted vs unposted late-bundle rates are published |
| learning the weights | everything | weights are public (it's evidence, not a secret), but cost-to-fake weighting means the cheap fixes don't move the score |

**Drift watch**: every week, compare the distribution of each signal across new coins with the previous four weeks.
A signal that suddenly gets better across the board is being gamed, not improving. Its weight drops until the operator
looks.

**Publishing the weights is a choice, not an accident.** Hidden weights invite "how do I get a better score" requests;
public weights backed by cost-to-fake make the answer "do the expensive real thing".
