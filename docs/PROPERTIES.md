[← Back to Docs Index](./README.md) | Prev: [Engine FSM](./engine-fsm.md)

# Correctness Properties Ledger

> 17 properties define what "correct" means for the ACE-SSM engine. Each property is a universal statement — it must hold for ALL valid inputs, not just specific test cases. They're verified using [fast-check](https://github.com/dubzzz/fast-check) property-based tests.

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

**Statement:** *For any* valid `ISSMState` and `ITaskStructure`, the Goal Generator SHALL return exactly one EXPAND goal for each (node, relation) pair where: (a) the relation's `from` matches the node's `type`, AND (b) no edge exists in the SSM with `source === node.id` and `relationType === relation.type`. Additionally, nodes with status UNKNOWN that have an edge for a given relation SHALL NOT generate a goal for that relation (the gap is considered closed).

**Validates:** Requirements 6.1, 6.2, 6.3, 6.4, 13.1

**Enforced by:** `src/app/operators/goal-generator.ts` — `generateGoals()` function

**Tested in:** `src/app/operators/goal-generator.spec.ts`

**Generator strategy:** Generate random SSM states (0–10 nodes with random types from a generated entityTypes list, 0–15 edges with random source/target/relationType) and random Task Structures (2–5 entity types, 1–8 relations). Compute expected EXPAND goals manually and compare.

---

## Property 8: Goal Generator Idempotence

**Statement:** *For any* valid `ISSMState` and `ITaskStructure`, calling `generateGoals` twice with the same inputs SHALL produce structurally equivalent results (same count, same anchor-node/relation/type tuples, ignoring generated UUIDs).

**Validates:** Requirements 6.6

**Enforced by:** `src/app/operators/goal-generator.ts` — `generateGoals()` function (pure, no side effects)

**Tested in:** `src/app/operators/goal-generator.spec.ts`

**Generator strategy:** Same generators as P7. Call `generateGoals` twice, compare results by (anchorNodeId, targetRelation, targetType) tuples, ignoring the `id` field (which contains a fresh UUID each call).

---

## Property 9: Search Operator Scoring Formula

**Statement:** *For any* non-empty list of EXPAND goals, valid SSM, KB, and Strategy, the Search Operator SHALL compute each goal's raw score as: `(MAX(urgency) × 100 × urgency_weight) + (parsimony_bonus × parsimony_weight) - (MEAN(inquiryCost) × 100 × costAversion_weight)`, where `parsimony_bonus` is 50 if the SSM already contains a node of the goal's target type, else 0. For goals anchored by UNKNOWN-status nodes, the total score SHALL equal `rawScore × unknownPenalty`. The returned goal SHALL be the one with the highest total score.

**Validates:** Requirements 7.1, 7.2, 7.3, 7.5, 13.2, 13.4

**Enforced by:** `src/app/operators/search-operator.ts` — `scoreGoals()` function

**Tested in:** `src/app/operators/search-operator.spec.ts`

**Generator strategy:** Generate 1–10 EXPAND goals with random anchor nodes, random SSM states, random KB fragments (ensuring some match the goals' labels/relations), and random Strategy weights (0.1–5.0). Independently compute expected scores and verify the winner matches.

---

## Property 10: Rationale Factor Sum Invariant

**Statement:** *For any* scored goal returned by the Search Operator, the sum of all `factor.impact` values in the Rationale Packet SHALL equal the raw score (before UNKNOWN_Anchor_Penalty is applied). Every ReasoningStep SHALL contain a non-empty `factors` array and a valid `strategyName`.

**Validates:** Requirements 7.8, 14.1

**Enforced by:** `src/app/operators/search-operator.ts` — `scoreGoals()` function

**Tested in:** `src/app/operators/search-operator.spec.ts`

**Generator strategy:** Same generators as P9. For the winning goal's rationale, sum all `factor.impact` values and compare to the raw score. Verify `factors.length > 0` and `strategyName` is non-empty.

---

## Property 11: Knowledge Operator Match Completeness

**Statement:** *For any* EXPAND goal and Knowledge Base, the Knowledge Operator SHALL return a PATCH containing exactly `N` HYPOTHESIS nodes and `N` edges, where `N` is the number of KB fragments where `fragment.subject === goal.anchorLabel` AND `fragment.relation === goal.targetRelation`. Each node's `label` SHALL equal the matching fragment's `object`, and each node's `type` SHALL equal the fragment's `objectType`.

**Validates:** Requirements 8.1, 8.2, 8.5

**Enforced by:** `src/app/operators/knowledge-operator.ts` — `resolveGoal()` function

**Tested in:** `src/app/operators/knowledge-operator.spec.ts`

**Generator strategy:** Generate random EXPAND goals and KB fragment arrays with varying match counts (0–10 matches). For non-zero matches, verify the PATCH has exactly N nodes and N edges with correct labels and types.

---

## Property 12: Knowledge Operator Inquiry on No Match

**Statement:** *For any* EXPAND goal where no KB fragment has `subject === goal.anchorLabel` AND `relation === goal.targetRelation`, the Knowledge Operator SHALL return `INQUIRY_REQUIRED` with the original goal.

**Validates:** Requirements 8.3

**Enforced by:** `src/app/operators/knowledge-operator.ts` — `resolveGoal()` function

**Tested in:** `src/app/operators/knowledge-operator.spec.ts`

**Generator strategy:** Generate EXPAND goals with anchor labels and target relations that deliberately don't match any fragment in the generated KB. Verify the result type is `INQUIRY_REQUIRED` and the goal is preserved.

---

## Property 13: Inquiry Resolution Updates Node and History

**Statement:** *For any* SSM containing a QUESTION node, dispatching `resolveInquiry` with status CONFIRMED and a new label SHALL update that node's status to CONFIRMED and its label to the provided value, and append exactly one ReasoningStep to history. Dispatching with status UNKNOWN SHALL update the node's status to UNKNOWN without changing the label, and also append one ReasoningStep.

**Validates:** Requirements 12.3, 12.4, 12.5

**Enforced by:** `src/app/store/ssm/ssm.reducer.ts` — `resolveInquiry` handler

**Tested in:** `src/app/store/ssm/ssm.reducer.spec.ts`

**Generator strategy:** Generate SSM states containing at least one QUESTION node. Generate random resolution actions (CONFIRMED with random label, or UNKNOWN with null label). Apply the reducer and verify node status/label changes and history growth.

---

## Property 14: History Is Append-Only and Valid

**Statement:** *For any* sequence of SSM-mutating actions (applyPatch, applyStatusUpgrade, openInquiry, resolveInquiry), the history array length SHALL be monotonically non-decreasing, and every entry SHALL contain a valid timestamp (> 0), a non-empty `factors` array, and a non-empty `actionTaken` string.

**Validates:** Requirements 14.2, 14.4

**Enforced by:** `src/app/store/ssm/ssm.reducer.ts` — all mutation handlers append to history

**Tested in:** `src/app/store/ssm/ssm.reducer.spec.ts`

**Generator strategy:** Generate random sequences of 1–20 SSM-mutating actions (mix of applyPatch, applyStatusUpgrade, openInquiry, resolveInquiry). Apply them in order, checking after each that history length is ≥ previous length and all entries pass validation.

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
