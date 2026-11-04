# Events

The bus is assay's main public interface. If your agent can subscribe to NATS, it gets every observation the moment it
exists. If it can't, `/v1/stream` (SSE) and webhooks carry the same events.

## Envelope

```json
{
  "v": 1,
  "id": "01JC9Z8Q4T6V3W2X1Y0Z9A8B7C",
  "type": "assay.score",
  "mint": "<base58 mint>",
  "at": "2026-11-03T14:10:02.114Z",
  "slot": 381234567,
  "layer": "l1",
  "data": { }
}
```

`id` is a ULID (sortable by time). `slot` is set when the event comes from the chain. `layer` is the layer that wrote it.

## Topics

| subject | from | data |
|---|---|---|
| `pump.launch` | ingest | mint, creator, signature, slot, name, symbol, uri, token program, quote mint, holder-reward / fee-sharing / mode arguments, buys in the create tx |
| `pump.trade` | ingest | mint, wallet, side, `quote_mint`, `quote_amount`, tokens, curve state after; failed snipe attempts too (an attention signal) |
| `pump.migrated` | ingest | mint, pool, slot |
| `assay.obs.<signal>` | any layer | one observation (shape in [schema/report.v1.json](../schema/report.v1.json) `$defs/observation`) |
| `assay.score` | score | dimensions, composite, confidence, `provisional: true` until L2 has seen the coin once |
| `assay.decision` | each layer | `drop` / `watch` / `promote` / `demote`, with the rule that fired |
| `assay.flag` | score, L3, L4 | a raised or cleared integrity flag |
| `assay.trait` | any layer | a trait added, changed or removed (`bundled`, `predator_entered`, `vamp_of`…) |
| `assay.lens.<name>` | lens evaluator | a coin started or stopped passing a built-in lens, with its rank |
| `assay.tier` | score | old → new tier |
| `assay.note` | L4, operator | the review note |
| `assay.demand` | API, overlay | someone looked this coin up; L2 bumps its priority |
| `assay.sweep` | L2 | per window: seen, skipped, X reads, tokens, median data age |

Subscribe to `assay.>` for everything assay says, `assay.tier` for just the tier changes, `assay.lens.volatility` for
one lens, `assay.trait` to watch for `predator_entered`, or `assay.obs.x.>` for every X observation.

## Examples

**L0 decides in a second:**

```json
{ "type": "assay.decision", "layer": "l0", "mint": "…", "data": {
  "decision": "drop",
  "rule": "serial_creator",
  "because": "creator wallet launched 14 coins in 30 days; 0 graduated" } }
```

**L1 fills in the socials:**

```json
{ "type": "assay.obs.x.handle_history", "layer": "l1", "mint": "…", "data": {
  "text": "The linked X account (user id 14…, created 2021-03-09) was @otherhandle until 2026-11-01.",
  "cost_to_fake": "high", "source": "x", "method": "api" } }
```

**A flag lands:**

```json
{ "type": "assay.flag", "layer": "l1", "mint": "…", "data": {
  "code": "handle_renamed_near_launch", "raised": true, "evidence": ["01JC9Z…"] } }
```

## Consuming it from an agent

```ts
import { connect } from "nats";
const nc = await connect({ servers: process.env.ASSAY_NATS });
const js = nc.jetstream();
const sub = await js.subscribe("assay.tier", { config: { durable_name: "my-agent" } });
for await (const m of sub) {
  const e = m.json();
  if (e.data.to === "curated") console.log(e.mint, "curated");
  m.ack();
}
```

Replay a day: create the consumer with `deliver_policy: "by_start_time"` and `opt_start_time`. Every event comes back
in order, exactly as it was emitted.
