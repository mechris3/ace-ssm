[← Back to Docs Index](./README.md)

# Correctness Properties Ledger

> 23 properties define what "correct" means for the ACE-SSM engine. Each property is a universal statement — it must hold for ALL valid inputs, not just specific test cases. They're verified using [fast-check](https://github.com/dubzzz/fast-check) property-based tests.

## Summary Table

| Property | Title | Requirements | Source File | Test File |
|----------|-------|-------------|-------------|-----------|
| P1 | SSM Serialization Round-Trip | 16.1, 16.2, 16.3 | `src/app/services/ssm-serializer.service.ts` | `src/app/services/ssm-serializer.service.spec.ts` |
| P2 | Task Structure Validation Rejects Invalid Relations | 2.2 | `src/app/store/task-structure/task-structure.reducer.ts` | `src/app/store/task-structure/task-structure.reducer.spec.ts` |
| P3 | KB Metadata Validation Rejects Out-of-Range Values | 3.2 | `src/app/store/knowledge-base/knowledge-base.reducer.ts` | `src/app/store/knowledge-base/knowledge-base.reducer.spec.ts` |
| P4 | KB Filter Selector Correctness | 3.4 | `src/app/store/knowledge-base/knowledge-base.selectors.ts` | `src/app/store/knowledge-base/knowledge-base.reducer.spec.ts` |
| P5 | SSM Patch Is Append-Only | 4.2, 4.3, 14.3 | `src/app/store/ssm/ssm.reducer.ts` | `src/app/store/ssm/ssm.reducer.spec.ts` |
| P6 | SSM Reset Restores Initial State | 4.5 | `src/app/store/ssm/ssm.reducer.ts` | `src/app/store/ssm/ssm.reducer.spec.ts` |
| P7 | Goal Generator Completeness and Soundness | 6.1, 6.2, 6.3, 6.4, 13.1 | `src/app/operators/goal-generator.ts` | `src/app/operators/goal-generator.spec.ts` |
| P8 | Goal Generator Idempotence | 6.6 | `src/app/operators/goal-generator.ts` | `src/app/operators/goal-generator.spec.ts` |
| P9 | Search Operator Scoring Formula | 7.1, 7.2, 7.3, 7.5, 13.2, 13.4 | `src/app/operators/search-operator.ts` | `src/app/operators/search-operator.spec.ts` |
| P10 | Rationale Factor Sum Invariant | 7.8, 14.1 | `src/app/operators/search-operator.ts` | `src/app/operators/search-operator.spec.ts` |
| P11 | Knowledge Operator Match Completeness | 8.1, 8.2, 8.5 | `src/app/operators/knowledge-operator.ts` | `src/app/operators/knowledge-operator.spec.ts` |
| P12 | Knowledge Operator Inquiry on No Match | 8.3 | `src/app/operators/knowledge-operator.ts` | `src/app/operators/knowledge-operator.spec.ts` |
| P13 | Inquiry Resolution Updates Node and History | 12.3, 12.4, 12.5 | `src/app/store/ssm/ssm.reducer.ts` | `src/app/store/ssm/ssm.reducer.spec.ts` |
| P14 | History Is Append-Only and Valid | 14.2, 14.4 | `src/app/store/ssm/ssm.reducer.ts` | `src/app/store/ssm/ssm.reducer.spec.ts` |
| P15 | Engine FSM Transition Correctness | 11.2–11.7 | `src/app/store/engine/engine.reducer.ts` | `src/app/store/engine/engine.reducer.spec.ts` |
| P16 | Invalid JSON Deserialization Returns Error | 16.4 | `src/app/services/ssm-serializer.service.ts` | `src/app/services/ssm-serializer.service.spec.ts` |
| P17 | Strategy Update Replaces Values | 5.2, 5.3 | `src/app/store/strategy/strategy.reducer.ts` | `src/app/store/strategy/strategy.reducer.spec.ts` |
| P18 | Certainty Factor Combination | — | `src/app/operators/knowledge-operator.ts` | `src/app/operators/knowledge-operator.spec.ts` |
| P19 | Diagnostic Differential Coverage | — | `src/app/store/ssm/ssm.selectors.ts` | `src/app/store/ssm/ssm.selectors.spec.ts` |
| P20 | Solution Focus Evaluation (S_G) | — | `src/app/operators/solution-focus.ts` | `src/app/operators/solution-focus.spec.ts` |
| P21 | S_L Goal Ordering Bonus | — | `src/app/operators/search-operator.ts` | `src/app/operators/search-operator.spec.ts` |
| P22 | Declarative Goal Constraint Generation | — | `src/app/operators/goal-generator.ts` | `src/app/operators/goal-generator.spec.ts` |
| P23 | Domain Validation Completeness | — | `src/app/operators/domain-validator.ts` | `src/app/operators/domain-validator.spec.ts` |

---

## Property 1: SSM Serialization Round-Trip

**Statement:** *For any* valid `ISSMState` object (with arbitrary nodes, edges, history entries, and boolean flags), serializing it to JSON and then deserializing the result SHALL produce an `ISSMState` deeply equal to the original.

**Validates:** Requirements 16.1, 16.2, 16.3

**Enforced by:** `src/app/services/ssm-serializer.service.ts` — `serialize()` and `deserialize()` methods

**Tested in:** `src/app/services/ssm-serializer.service.spec.ts`

**Generator strategy:** Generate random `ISSMState` with 0–20 nodes (random id, label, type, status), 0–20 edges (random id, source, target, relationType), 0–10 history entries (random IReasoningStep), and random boolean flags for `isRunning` and `waitingForUser`.

---

## Property 2: Task Structure Validation Rejects Invalid Relations

**Statement:** *For any* `ITaskStructure` where at least one relation references an entity type not present in the `entityTypes` array, loading it into the store SHALL produce a validation error identifying the missing entity type, and the store SHALL remain unchanged.

**Validates:** Requirements 2.2

**Enforced by:** `src/app/store/task-structure/task-structure.reducer.ts` — validation logic in the `loadTaskStructureSuccess` handler

**Tested in:** `src/app/store/task-structure/task-structure.reducer.spec.ts`

**Generator strategy:** Generate `ITaskStructure` objects where at least one relation's `from` or `to` field is a string not present in the `entityTypes` array. Verify the reducer dispatches a failure action and the state remains at its initial value.

---

## Property 3: KB Metadata Validation Rejects Out-of-Range Values

**Statement:** *For any* `IKnowledgeFragment` where at least one metadata field (`urgency`, `specificity`, or `inquiryCost`) is outside the [0.0, 1.0] range, loading it SHALL produce a validation error identifying the invalid field, and the store SHALL remain unchanged.

**Validates:** Requirements 3.2

**Enforced by:** `src/app/store/knowledge-base/knowledge-base.reducer.ts` — metadata range validation in the load handler

**Tested in:** `src/app/store/knowledge-base/knowledge-base.reducer.spec.ts`

**Generator strategy:** Generate `IKnowledgeFragment` objects with at least one metadata value drawn from outside [0, 1] (e.g., negative numbers, values > 1, NaN). Verify the reducer rejects the fragment.

---

## Property 4: KB Filter Selector Correctness

**Statement:** *For any* set of `IKnowledgeFragment` entries loaded into the store, and *for any* subject string `s` and relation string `r`, the `selectFragmentsBySubjectAndRelation(s, r)` selector SHALL return exactly those fragments where `fragment.subject === s` AND `fragment.relation === r`.

**Validates:** Requirements 3.4

**Enforced by:** `src/app/store/knowledge-base/knowledge-base.selectors.ts` — `selectFragmentsBySubjectAndRelation` selector

**Tested in:** `src/app/store/knowledge-base/knowledge-base.reducer.spec.ts`

**Generator strategy:** Generate random sets of fragments with varied subject/relation strings, plus random query strings `s` and `r`. Apply the selector and verify the result matches a manual filter.

---

## Property 5: SSM Patch Is Append-Only

**Statement:** *For any* existing `ISSMState` and *for any* valid PATCH (nodes, edges, reasoningStep), dispatching `applyPatch` SHALL result in a new state where: (a) all previous nodes and edges are preserved unchanged, (b) the new nodes and edges are appended, and (c) the history array grows by exactly one entry equal to the provided reasoningStep.

**Validates:** Requirements 4.2, 4.3, 14.3

**Enforced by:** `src/app/store/ssm/ssm.reducer.ts` — `applyPatch` handler

**Tested in:** `src/app/store/ssm/ssm.reducer.spec.ts`

**Generator strategy:** Generate random initial `ISSMState` (0–10 nodes, 0–10 edges, 0–5 history entries) and a random PATCH (1–5 new nodes, 1–5 new edges, one IReasoningStep). Apply the reducer and verify preservation + append.

---

## Property 6: SSM Reset Restores Initial State

**Statement:** *For any* non-empty `ISSMState`, dispatching `resetSSM` SHALL produce a state equal to `initialSSMState` (empty nodes, empty edges, empty history, isRunning=false, waitingForUser=false).

**Validates:** Requirements 4.5

**Enforced by:** `src/app/store/ssm/ssm.reducer.ts` — `resetSSM` handler

**Tested in:** `src/app/store/ssm/ssm.reducer.spec.ts`

**Generator strategy:** Generate random non-empty `ISSMState` objects. Apply `resetSSM` and deep-equal against `initialSSMState`.

---

## Property 7: Goal Generator Completeness and Soundness

**Statement:** *For any* valid `ISSMState` and `ITaskStructure`, the Goal Generator SHALL return:

1. **Forward EXPAND goals:** Exactly one goal for each (node, relation) pair where `relation.from === node.type` AND no edge exists with `source === node.id && relationType === relation.type`.
2. **Reverse EXPAND goals (abductive):** Exactly one goal for each (node, relation) pair where `relation.to === node.type` AND no edge exists with `target === node.id && relationType === relation.type`. Nodes with status `REFUTED` SHALL NOT generate reverse goals (directional locking). [Ref: MD Sec 3.1.1]
3. **STATUS_UPGRADE goals:** Exactly one goal for each HYPOTHESIS node that has ≥1 CONFIRMED_BY edge where ALL targets are CONFIRMED. [Ref: MD Sec 3.1.2]
4. **Declarative constraint goals:** One goal for each (node, constraint) pair from `taskStructure.goalConstraints` where the node matches the constraint's `nodeType` (and optional `onlyStatus`) and the required edge does not exist. [Ref: MD Sec 4.12]

**Validates:** Requirements 6.1, 6.2, 6.3, 6.4, 13.1

**Enforced by:** `src/app/operators/goal-generator.ts` — `generateGoals()` function

**Tested in:** `src/app/operators/goal-generator.spec.ts`

**Generator strategy:** Generate random SSM states (0–10 nodes with random types and statuses from a generated entityTypes list, 0–15 edges with random source/target/relationType) and random Task Structures (2–5 entity types, 1–8 relations, 0–3 goal constraints). Compute expected goals manually (forward + reverse + upgrade + constraint) and compare.

---

## Property 8: Goal Generator Idempotence

**Statement:** *For any* valid `ISSMState` and `ITaskStructure`, calling `generateGoals` twice with the same inputs SHALL produce structurally equivalent results (same count, same anchor-node/relation/type tuples, ignoring generated UUIDs).

**Validates:** Requirements 6.6

**Enforced by:** `src/app/operators/goal-generator.ts` — `generateGoals()` function (pure, no side effects)

**Tested in:** `src/app/operators/goal-generator.spec.ts`

**Generator strategy:** Same generators as P7. Call `generateGoals` twice, compare results by (anchorNodeId, targetRelation, targetType) tuples, ignoring the `id` field (which contains a fresh UUID each call).

---

## Property 9: Search Operator Scoring Formula

**Statement:** *For any* non-empty list of goals, valid SSM, KB, and Strategy, the Search Operator SHALL compute scores as follows:

**EXPAND goals** — raw score is the sum of six terms: [Ref: MD Sec 3.2.1]
```
rawScore = (MAX(urgency) × 100 × weights.urgency)
         + (parsimony_bonus × weights.parsimony)
         + (anchor_cf × 20 × weights.parsimony)
         + (focus_bonus × weights.parsimony)
         + (ordering_bonus × weights.parsimony)
         - (MEAN(inquiryCost) × 100 × weights.costAversion)
```
Where:
- `parsimony_bonus` = 50 if SSM contains a node of the goal's target type, else 0. For reverse goals, an additional +30 per extra CONFIRMED node the candidate explains.
- `anchor_cf` = the anchor node's certainty factor (default 0.5).
- `focus_bonus` = 25 if the anchor is within the solution-focus subgraph, else 0.
- `ordering_bonus` = position-based bonus from `strategy.goalOrdering` (40/30/20/10 by position, 0 if not listed).

**STATUS_UPGRADE goals** — `rawScore = 200 × weights.parsimony`. [Ref: MD Sec 3.2.2]

**Anchor status penalties** (applied after raw score): [Ref: MD Sec 3.2.3]
- `REFUTED`: `totalScore = rawScore × 0.01` (99% reduction)
- `UNKNOWN`: `totalScore = rawScore × 0.05` (95% reduction)
- `SKIPPED`: `totalScore = rawScore - urgencyScore` (urgency zeroed, parsimony intact)

The returned goal SHALL be the one with the highest `totalScore`.

**Validates:** Requirements 7.1, 7.2, 7.3, 7.5, 13.2, 13.4

**Enforced by:** `src/app/operators/search-operator.ts` — `scoreGoals()` function

**Tested in:** `src/app/operators/search-operator.spec.ts`

**Generator strategy:** Generate 1–10 goals (mix of EXPAND and STATUS_UPGRADE) with random anchor nodes (varying statuses including REFUTED, UNKNOWN, SKIPPED), random SSM states, random KB fragments (ensuring some match the goals' labels/relations), random Strategy weights (0.1–5.0), optional `goalOrdering`, and optional `solutionFocusNodeId`. Independently compute expected scores for all six terms and three penalty types, and verify the winner matches.

---

## Property 10: Rationale Factor Sum Invariant

**Statement:** *For any* scored goal returned by the Search Operator, the sum of all `factor.impact` values in the Rationale Packet SHALL equal the raw score (before anchor status penalties are applied). The `factors` array SHALL contain at minimum the three base factors (Clinical Urgency, Parsimony, Inquiry Cost) for EXPAND goals, or the single Status Upgrade Parsimony factor for STATUS_UPGRADE goals. Additional factors (Certainty, Solution Focus, S_L Ordering, Refuted Anchor Penalty, Skipped Anchor) SHALL be present only when their conditions are met. Every ReasoningStep SHALL contain a valid `strategyName`.

**Validates:** Requirements 7.8, 14.1

**Enforced by:** `src/app/operators/search-operator.ts` — `scoreGoals()` function

**Tested in:** `src/app/operators/search-operator.spec.ts`

**Generator strategy:** Same generators as P9. For the winning goal's rationale, sum all `factor.impact` values and compare to the raw score. Verify `factors.length > 0`, `strategyName` is non-empty, and that conditional factors (focus, ordering, penalties) only appear when their preconditions hold.

---

## Property 11: Knowledge Operator Match Completeness (with Graph Merging)

**Statement:** *For any* EXPAND goal, Knowledge Base, and set of existing SSM nodes, the Knowledge Operator SHALL use a cascading KB match (exact relation first, then broad fallback) with dual-key anchor matching (label + node ID). [Ref: MD Sec 3.3.2]

For each matching fragment:
- If the target node **does not** exist in the SSM → spawn a new HYPOTHESIS node + edge. The node's `label` SHALL equal the fragment's object (forward) or subject (reverse), `type` SHALL match the fragment's objectType/subjectType, `cf` SHALL be set from `fragment.metadata.specificity` (default 0.5), and `canBeConfirmed` SHALL default to `true` unless the fragment opts out. [Ref: MD Sec 3.3.3]
- If the target node **already exists** in the SSM → create only an edge to the existing node (graph merging) and combine CFs using `cf_combined = cf1 + cf2 × (1 − cf1)`. [Ref: MD Sec 4.6]

The PATCH SHALL therefore contain `M` new nodes and `N` edges where `M ≤ N` (M = new targets, N = all matches). If zero fragments match after both cascade levels, the result SHALL be `NO_MATCH`.

**Validates:** Requirements 8.1, 8.2, 8.5

**Enforced by:** `src/app/operators/knowledge-operator.ts` — `resolveGoal()` function

**Tested in:** `src/app/operators/knowledge-operator.spec.ts`

**Generator strategy:** Generate random EXPAND goals and KB fragment arrays with varying match counts (0–10 matches), plus existing SSM nodes that overlap with some fragment targets. Verify: (a) new nodes are spawned only for genuinely new targets, (b) existing targets get edges only, (c) CFs are combined correctly for graph-merged nodes, (d) edge directions respect goal direction (forward vs. reverse).

---

## Property 12: Knowledge Operator NO_MATCH on Empty KB Coverage

**Statement:** *For any* EXPAND goal where no KB fragment matches the anchor (by label or node ID) on the correct side — neither at the exact-relation level nor at the broad-fallback level — the Knowledge Operator SHALL return `NO_MATCH` with the original goal preserved. [Ref: MD Sec 3.3.2, MD Sec 10 Invariant 4]

The engine treats the KB as ground truth: a missing match means the relation does not exist in the domain. The orchestrator inserts a placeholder edge to prevent the Goal Generator from retrying the same goal.

**Validates:** Requirements 8.3

**Enforced by:** `src/app/operators/knowledge-operator.ts` — `resolveGoal()` function

**Tested in:** `src/app/operators/knowledge-operator.spec.ts`

**Generator strategy:** Generate EXPAND goals with anchor labels and node IDs that deliberately don't match any fragment in the generated KB (neither subject nor object). Verify the result type is `NO_MATCH` and the goal is preserved.

---

## Property 13: Inquiry Resolution Updates Node and History

**Statement:** The SSM reducer SHALL correctly handle all inquiry resolution actions: [Ref: MD Sec 5.3, MD Sec 6.2]

1. **Legacy `resolveInquiry`:** For any SSM containing a QUESTION node, dispatching with status CONFIRMED and a new label SHALL update that node's status to CONFIRMED and its label to the provided value, and append exactly one ReasoningStep. Dispatching with status UNKNOWN SHALL update status to UNKNOWN without changing the label.

2. **`confirmFinding`:** For any SSM with a `pendingFindingNodeId`, dispatching SHALL set the target node's status to `CONFIRMED`, set its `cf` to `1.0`, clear `pendingFindingNodeId`, clear `waitingForUser`, and append one ReasoningStep.

3. **`refuteFinding`:** SHALL set the target node's status to `REFUTED`, clear `pendingFindingNodeId`, clear `waitingForUser`, and append one ReasoningStep.

4. **`skipFinding`:** SHALL set the target node's status to `SKIPPED`, clear `pendingFindingNodeId`, clear `waitingForUser`, and append one ReasoningStep.

**Validates:** Requirements 12.3, 12.4, 12.5

**Enforced by:** `src/app/store/ssm/ssm.reducer.ts` — `resolveInquiry`, `confirmFinding`, `refuteFinding`, `skipFinding` handlers

**Tested in:** `src/app/store/ssm/ssm.reducer.spec.ts`

**Generator strategy:** Generate SSM states containing at least one QUESTION node (for legacy) or a `pendingFindingNodeId` pointing to a HYPOTHESIS node (for finding inquiry). Generate random resolution actions across all four variants. Apply the reducer and verify node status/label/cf changes, flag clearing, and history growth.

---

## Property 14: History Is Append-Only and Valid

**Statement:** *For any* sequence of SSM-mutating actions (applyPatch, applyStatusUpgrade, openInquiry, resolveInquiry, openFindingInquiry, confirmFinding, refuteFinding, skipFinding), the history array length SHALL be monotonically non-decreasing, and every entry SHALL contain a valid timestamp (> 0), a non-empty `actionTaken` string, and a valid `strategyName`. The `factors` array is optional — it MAY be present on engine-scored steps and absent on user-action steps (confirm/refute/skip).

**Validates:** Requirements 14.2, 14.4

**Enforced by:** `src/app/store/ssm/ssm.reducer.ts` — all mutation handlers append to history

**Tested in:** `src/app/store/ssm/ssm.reducer.spec.ts`

**Generator strategy:** Generate random sequences of 1–20 SSM-mutating actions (mix of all eight action types). Apply them in order, checking after each that history length is ≥ previous length and all entries pass validation.

---

## Property 15: Engine FSM Transition Correctness

**Statement:** *For any* current `EngineState`, dispatching `engineReset` SHALL transition to IDLE. Dispatching `engineStart` from IDLE SHALL transition to THINKING. Dispatching `engineInquiry` from THINKING SHALL transition to INQUIRY. Dispatching `engineResolved` from THINKING SHALL transition to RESOLVED. Dispatching `enginePause` from THINKING SHALL transition to IDLE. Dispatching inquiry-answered from INQUIRY SHALL transition to IDLE.

**Validates:** Requirements 11.2, 11.3, 11.4, 11.5, 11.6, 11.7

**Enforced by:** `src/app/store/engine/engine.reducer.ts` — all transition handlers

**Tested in:** `src/app/store/engine/engine.reducer.spec.ts`

**Generator strategy:** Generate random (currentState, action) pairs from all 4 states × all 6 actions. For each pair, apply the reducer and verify the resulting state matches the expected transition table. Invalid transitions should leave the state unchanged.

---

## Property 16: Invalid JSON Deserialization Returns Error

**Statement:** *For any* string that is not valid JSON, or valid JSON that does not conform to the `ISSMState` structure (missing `nodes`, `edges`, `history` arrays or `isRunning`/`waitingForUser` booleans), the SSM Serializer SHALL return a descriptive error string and SHALL NOT modify the current store state.

**Validates:** Requirements 16.4

**Enforced by:** `src/app/services/ssm-serializer.service.ts` — `deserialize()` method

**Tested in:** `src/app/services/ssm-serializer.service.spec.ts`

**Generator strategy:** Generate random strings (non-JSON garbage, valid JSON objects missing required fields, valid JSON with wrong types for required fields). Verify `deserialize()` returns `{ error: string }` and never throws.

---

## Property 17: Strategy Update Replaces Values

**Statement:** *For any* valid strategy weights and pacer delay value, dispatching `updateStrategy` SHALL replace the current weights with the provided values, and dispatching `updatePacerDelay` SHALL replace the current delay. Subsequent selector reads SHALL return the new values.

**Validates:** Requirements 5.2, 5.3

**Enforced by:** `src/app/store/strategy/strategy.reducer.ts` — `updateStrategy` and `updatePacerDelay` handlers

**Tested in:** `src/app/store/strategy/strategy.reducer.spec.ts`

**Generator strategy:** Generate random weight triples (urgency, parsimony, costAversion as positive floats) and random delay values (0–2000). Apply the reducer and verify the resulting state matches the provided values exactly.

---

## Property 18: Certainty Factor Combination

**Statement:** *For any* Knowledge Operator PATCH where a matching KB fragment's target already exists in the SSM (graph merging), the existing node's CF SHALL be updated using the conjunctive combination formula: `cf_combined = cf_old + cf_new × (1 − cf_old)`, where `cf_new` is the fragment's `metadata.specificity` (default 0.5). The combined CF SHALL always be in [0.0, 1.0] and SHALL be monotonically non-decreasing (adding evidence never reduces certainty). For newly spawned HYPOTHESIS nodes, `cf` SHALL equal `fragment.metadata.specificity` (default 0.5). For CONFIRMED seed nodes, `cf` SHALL default to 1.0. [Ref: MD Sec 2.3.2, Paper 1 Sec 3.2.2, Gap 4]

**Enforced by:** `src/app/operators/knowledge-operator.ts` — pure CF computation in `resolveGoal()` returns `cfUpdates` map on PATCH result; `src/app/store/ssm/ssm.reducer.ts` — `applyPatch` handler applies `cfUpdates` immutably; `src/app/store/ssm/ssm.reducer.ts` — `confirmFinding` sets `cf: 1.0`

**Tested in:** `src/app/operators/knowledge-operator.spec.ts`

**Generator strategy:** Generate EXPAND goals with KB fragments where some targets already exist in the SSM with known CF values. Verify: (a) the conjunctive formula is applied correctly, (b) the result is in [0, 1], (c) `cf_combined ≥ cf_old` always holds, (d) new nodes get CF from specificity.

---

## Property 19: Diagnostic Differential Coverage

**Statement:** *For any* SSM with at least one root-type node (a type that appears as `from` but never as `to` in the Task Structure) and at least one seed node (CONFIRMED, leaf-type), `computeDifferential()` SHALL: [Ref: MD Sec 4.8, Paper 1 Sec 3.2.1, Gap 1]

1. Identify root entity types dynamically from the Task Structure relations.
2. Identify seed nodes as CONFIRMED nodes whose type is a leaf type (appears as `to` but never as `from`).
3. For each non-REFUTED root-type node, trace edges transitively (both directions) to count reachable seed nodes.
4. Mark a candidate as `isComplete` when `coveredSeedCount >= totalSeedCount`.
5. Sort candidates by coverage count descending, then by CF descending as tiebreaker.

The function SHALL be pure (no side effects) and SHALL return an empty array when there are no root-type nodes or no seed nodes.

**Enforced by:** `src/app/store/ssm/ssm.selectors.ts` — `computeDifferential()` function

**Tested in:** `src/app/store/ssm/ssm.selectors.spec.ts`

**Generator strategy:** Generate SSM graphs with known topology (root nodes connected to seed nodes via intermediate nodes). Verify coverage counts match manual BFS, `isComplete` flags are correct, and sorting order is stable.

---

## Property 20: Solution Focus Evaluation (S_G)

**Statement:** *For any* diagnostic differential and current solution focus node ID, `evaluateSolutionFocus()` SHALL: [Ref: MD Sec 4.9, Paper 1 Sec 3.2.3, Gap 2]

1. If no current focus exists → return the strongest candidate (first in the sorted differential).
2. If the current focus is no longer in the differential → switch to the strongest candidate.
3. If another candidate has become stronger (higher coverage + CF) than the current focus → switch to it.
4. Otherwise → stay on the current focus (return the same node ID).

The function SHALL return `null` when the differential is empty. It SHALL be pure (no side effects).

**Enforced by:** `src/app/operators/solution-focus.ts` — `evaluateSolutionFocus()` function

**Tested in:** `src/app/operators/solution-focus.spec.ts`

**Generator strategy:** Generate differential arrays with varying candidate strengths and a current focus node ID that may or may not be present. Verify the returned focus matches the expected S_G principle for each scenario.

---

## Property 21: S_L Goal Ordering Bonus

**Statement:** *For any* EXPAND goal where the Strategy defines a `goalOrdering` for the anchor node's entity type, the Search Operator SHALL add a position-based bonus: [Ref: MD Sec 4.10, Paper 2 Sec 3.2 Fig 7, Gap 3]

- Position 0 (first/highest priority): `+40 × weights.parsimony`
- Position 1: `+30 × weights.parsimony`
- Position 2: `+20 × weights.parsimony`
- Position 3: `+10 × weights.parsimony`
- Not in ordering: `+0`

If `goalOrdering` is absent or empty for the anchor's entity type, all relation types SHALL receive zero ordering bonus (treated equally).

**Enforced by:** `src/app/operators/search-operator.ts` — S_L ordering bonus calculation in `scoreGoals()`

**Tested in:** `src/app/operators/search-operator.spec.ts`

**Generator strategy:** Generate goals with known anchor types and target relations, plus strategies with explicit `goalOrdering` maps. Verify the ordering bonus matches the expected position-based value for each goal. Test edge cases: missing entity type in ordering, empty ordering array, relation not in ordering.

---

## Property 22: Declarative Goal Constraint Generation

**Statement:** *For any* Task Structure with `goalConstraints` and *for any* SSM state, the Goal Generator SHALL emit one EXPAND goal for each (node, constraint) pair where: [Ref: MD Sec 4.12, Paper 2 Sec 4.1, Gap 8]

1. `node.type === constraint.nodeType`
2. If `constraint.onlyStatus` is set, `node.status === constraint.onlyStatus`
3. The required edge does not exist (checked by direction: forward checks `source === node.id`, reverse checks `target === node.id`)

Constraint goals SHALL have the correct `targetRelation`, `targetType` (derived from the matching Task Structure relation), and `direction`. If no Task Structure relation matches the constraint's `requiredRelation`, no goal SHALL be emitted for that constraint.

**Enforced by:** `src/app/operators/goal-generator.ts` — declarative constraint goals section in `generateGoals()`

**Tested in:** `src/app/operators/goal-generator.spec.ts`

**Generator strategy:** Generate Task Structures with 1–3 goal constraints, SSM states with nodes of matching and non-matching types/statuses, and edges that satisfy some constraints but not others. Verify the correct constraint goals are emitted and no spurious goals appear.

---

## Property 23: Domain Validation Completeness

**Statement:** *For any* combination of Task Structure, Knowledge Base, and SSM seed nodes, `validateDomain()` SHALL return warnings for all of the following conditions: [Ref: MD Sec 4.11, Paper 2 Sec 4.3, Gap 7]

1. Empty entity types or relations in the Task Structure.
2. Orphan entity types (types with no relations).
3. Task Structure relations with no corresponding KB fragments.
4. KB fragments whose subject/object types don't match the relation's from/to types.
5. KB fragments referencing entity types not in the Task Structure.
6. Empty SSM (no seed nodes).
7. Seed nodes with types not in the Task Structure.
8. Seed nodes whose type is not a leaf type (not reachable by abductive reasoning).

The function SHALL be pure, return an empty array for valid domains, and SHALL NOT block domain loading (warnings are non-fatal).

**Enforced by:** `src/app/operators/domain-validator.ts` — `validateDomain()` function

**Tested in:** `src/app/operators/domain-validator.spec.ts`

**Generator strategy:** Generate domains with deliberate violations of each condition (one at a time and in combination). Verify the correct warnings are returned. Also generate fully valid domains and verify zero warnings.
