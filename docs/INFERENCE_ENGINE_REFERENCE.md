# ACE-SSM Inference Engine Reference

This document captures the complete business logic of the ACE-SSM (Adaptive Clinical Engine — Situation Specific Model) inference engine. It is a "Glass Box" diagnostic reasoning system that builds an evolving graph of hypotheses, confirmed facts, and open questions by cycling through three pure operators on a heartbeat clock.

---

## 1. Conceptual Architecture

### 1.1 The Data Trinity

The engine operates on three layers of data, each with a distinct role:

| Layer | Name | Role | Mutability |
|-------|------|------|------------|
| Layer 1 | **Task Structure** | The grammar — defines what entity types exist and how they may relate | Immutable after load |
| Layer 2 | **Knowledge Base (KB)** | The fact library — domain knowledge fragments encoding directed relationships with metadata | Immutable after load; treated as ground truth |
| Layer 3 | **SSM (Situation Specific Model)** | Working memory — the evolving graph of nodes, edges, and reasoning history | Append-only for nodes/edges; status-mutable for nodes |

### 1.2 The Triple-Operator Cycle

On every heartbeat pulse, the engine executes three operators in strict sequence:

```
Goal Generator → Search Operator → Knowledge Operator
```

- **Goal Generator** reads Layer 1 (Task Structure) + Layer 3 (SSM) to detect gaps.
- **Search Operator** reads Layer 2 (KB) + Layer 3 (SSM) to score and rank goals.
- **Knowledge Operator** reads Layer 2 (KB) + Layer 3 (SSM nodes, for deduplication) to resolve the winning goal.

Each operator is a **pure function** with no side effects. The orchestrator (Inference Engine Service) is the only component that dispatches state mutations.

### 1.3 The "One Winner Per Heartbeat" Rule

Each pulse selects a single winning goal and resolves it, producing one primary SSM mutation. If the resolution spawns a confirmable node, a second mutation (the finding inquiry) may also be dispatched in the same pulse, pausing the engine for user input. This keeps the reasoning trace linear and auditable — every goal resolution maps to exactly one ReasoningStep, and finding inquiries produce their own separate ReasoningStep.

---

## 2. Data Models

### 2.1 Task Structure (Layer 1)

Defines the domain grammar. Domain-agnostic — entity types are plain strings, not enums.

**Entity Types:** A flat array of string labels (e.g., `["FINDING", "ETIOLOGIC_AGENT", "PHYSIOLOGIC_STATE", "TREATMENT"]`).

**Relations:** Directed relation types with `from`/`to` constraints referencing entity types.

| Field | Description |
|-------|-------------|
| `type` | Relation label (e.g., `CAUSES`, `INDUCES`, `CONFIRMED_BY`, `TREATS`) |
| `from` | Source entity type — only nodes of this type may originate this relation |
| `to` | Target entity type — the relation points to nodes of this type |

**Validation:** On load, every relation's `from` and `to` must reference entries in `entityTypes`. If any relation references an unknown type, the entire load is rejected.

**Goal Constraints:** Optional array of declarative goal constraints that the SSM must satisfy. See Section 4.12 for details.

### 2.2 Knowledge Base (Layer 2)

A flat array of fragments. Each fragment encodes one directed relationship between two domain concepts.

**Fragment fields:**

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `subject` | Domain label of the source concept (e.g., "Fever") |
| `subjectType` | Entity type of the source (must match a Task Structure entity type) |
| `relation` | Relation type (e.g., "CAUSES") |
| `object` | Domain label of the target concept (e.g., "Bacterial Meningitis") |
| `objectType` | Entity type of the target |
| `metadata` | Heuristic metadata for scoring |
| `canBeConfirmed` | (Optional) Controls whether HYPOTHESIS nodes spawned from this fragment require user confirmation. For **forward-spawned** nodes (object side), defaults to `true` — inferred findings are confirmable unless opted out. For **reverse-spawned** nodes (subject side, abductive reasoning), defaults to `false` — explanatory entities like diseases are confirmed indirectly via STATUS_UPGRADE. See Section 5.1 for details. |

**Fragment Metadata** (all values bounded to [0.0, 1.0]):

| Field | Description | Aggregation in Scoring |
|-------|-------------|----------------------|
| `urgency` | Clinical risk / priority (0 = none, 1 = life-threatening) | MAX across matching fragments |
| `specificity` | Diagnostic discriminating power (0 = non-specific, 1 = pathognomonic) | Used as initial CF for spawned HYPOTHESIS nodes |
| `inquiryCost` | Cost of asking the user about this relationship (0 = trivial, 1 = invasive) | MEAN across matching fragments |

**Validation:** On load, all metadata fields must be numbers in [0, 1]. If any field is out of range, the entire KB load is rejected.

**Ground Truth Principle:** The KB is treated as ground truth. If no KB fragments match a goal, the engine silently skips that goal rather than asking the user to validate the relationship. The engine assumes that if a relationship is not in the KB, it does not exist in the domain.

### 2.3 SSM — Situation Specific Model (Layer 3)

The evolving graph that represents the engine's current reasoning state.

#### 2.3.1 Node Statuses

| Status | Description | Created By |
|--------|-------------|------------|
| `HYPOTHESIS` | Spawned from KB fragments; not yet confirmed | Knowledge Operator (PATCH) |
| `CONFIRMED` | User-confirmed or promoted via STATUS_UPGRADE | User action or STATUS_UPGRADE |
| `QUESTION` | Represents a gap the user must fill (legacy) | Inference Engine (openInquiry) |
| `UNKNOWN` | User explicitly marked as unknown; blocks promotion chains | User action |
| `REFUTED` | User explicitly rejected this finding; applies a 99% penalty to all downstream goals | User action (Refute button) |
| `SKIPPED` | User deferred judgment; loses urgency bonus for the current cycle but branch is not killed | User action (Unknown/Skip button) |

#### 2.3.2 Node Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (`node_${UUID}`) |
| `label` | Human-readable domain term (e.g., "Fever"). Used alongside the node `id` as a bridge to the KB — matching tries both label and ID |
| `type` | Entity type from the Task Structure |
| `status` | Current lifecycle status |
| `canBeConfirmed` | (Optional) When `true` and status is `HYPOTHESIS`, the Searchlight landing on this node triggers a finding-confirmation inquiry |
| `cf` | (Optional) Certainty factor (0.0 to 1.0). Seed nodes default to 1.0. HYPOTHESIS nodes derive CF from KB fragment `specificity`. Graph-merged nodes combine CFs using cf1+cf2*(1−cf1). Used by the diagnostic differential for "strongest candidate" ranking and by the Search Operator as a scoring bonus. |

#### 2.3.3 Edge Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (`edge_${UUID}`) |
| `source` | ID of the source node |
| `target` | ID of the target node |
| `relationType` | Relation type from the Task Structure |

#### 2.3.4 SSM State Shape

| Field | Description |
|-------|-------------|
| `nodes` | All nodes (append-only via PATCH; status-mutable) |
| `edges` | All edges (strictly append-only) |
| `history` | Ordered list of every ReasoningStep (the "Glass Box" audit trail) |
| `isRunning` | Whether the engine is actively running |
| `waitingForUser` | Whether the engine is paused for user input |
| `pendingFindingNodeId` | ID of a HYPOTHESIS node awaiting user confirmation, or null |

#### 2.3.5 Append-Only Invariant

Nodes and edges are never deleted from the SSM. Nodes can only change status. This preserves the full reasoning trail and supports auditability.

### 2.4 Goals

A goal represents a single unit of work for the inference engine.

**Goal Kinds:**

| Kind | Description |
|------|-------------|
| `EXPAND` | Seek new KB fragments to grow the SSM graph (fill a gap) |
| `STATUS_UPGRADE` | Promote a HYPOTHESIS to CONFIRMED (all CONFIRMED_BY targets are CONFIRMED) |

**Goal Direction** (EXPAND goals only):

| Direction | Description | KB Matching |
|-----------|-------------|-------------|
| `forward` | Anchor is the `from` side of the relation | `fragment.subject` matches anchor label or anchor node ID |
| `reverse` | Anchor is the `to` side (abductive reasoning) | `fragment.object` matches anchor label or anchor node ID |

**Goal Fields:**

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `kind` | `EXPAND` or `STATUS_UPGRADE` |
| `anchorNodeId` | ID of the SSM node this goal is anchored to |
| `anchorLabel` | Cached label of the anchor node (for KB matching) |
| `targetRelation` | Relation type to explore (or literal `"STATUS_UPGRADE"`) |
| `targetType` | Entity type of the expected target node |
| `direction` | `forward` or `reverse` |

### 2.5 Strategy

Controls HOW the engine reasons, not WHAT it reasons about.

**Strategy Weights** (unbounded, non-negative):

| Weight | Effect |
|--------|--------|
| `urgency` | Multiplier for clinical urgency score. Higher = prioritize dangerous possibilities first ("Safety-First") |
| `parsimony` | Multiplier for parsimony bonus. Higher = prefer goals that converge the model |
| `costAversion` | Multiplier for inquiry cost penalty. Higher = avoid goals that require user interruption |

**Pacer Delay:** Time between heartbeat pulses in milliseconds (clamped to [0, 2000]).

**Goal Ordering (S_L):** Optional map of entity types to ordered arrays of relation types, specifying the priority order for pursuing subgoals per entity type. See Section 4.10 for details.

**Default Strategy:** "Balanced" — all weights at 1.0, pacer delay 1500ms, no goal ordering.

**Strategy Naming:** The strategy is auto-named based on the dominant weight:
- Highest `urgency` → "Urgency-Focused"
- Highest `parsimony` → "Parsimony-Focused"
- Highest `costAversion` → "Cost-Averse"

### 2.6 Reasoning Step (Audit Trail Entry)

Every SSM mutation produces exactly one ReasoningStep appended to the history.

| Field | Description |
|-------|-------------|
| `timestamp` | Unix timestamp (ms) when scored |
| `selectedGoal` | The goal that won the scoring competition |
| `totalScore` | Final score after all factors and penalties |
| `factors` | (Optional) Breakdown of every factor that contributed to the score |
| `strategyName` | Name of the active strategy |
| `actionTaken` | Human-readable description of what the engine did |

---

## 3. Operator Logic

### 3.1 Goal Generator (Operator 1)

**Input:** SSM state snapshot + Task Structure definition.
**Output:** Array of goals (EXPAND + STATUS_UPGRADE + constraint-based goals from Section 4.12).

#### 3.1.1 EXPAND Goal Detection (Gap Detection)

For each node in the SSM:

1. **Forward goals:** Find all Task Structure relations where `relation.from === node.type`. For each such relation, check if an edge already exists with `source === node.id && relationType === relation.type`. If no such edge exists, emit an EXPAND goal with `direction: 'forward'`.

2. **Reverse goals (abductive):** Find all Task Structure relations where `relation.to === node.type`. For each such relation, check if an edge already exists with `target === node.id && relationType === relation.type`. If no such edge exists, emit an EXPAND goal with `direction: 'reverse'`. This enables "what explains this symptom?" reasoning.

**Directional Locking:** Nodes with status `REFUTED` are excluded from reverse goal generation. A refuted finding should not drive backward reasoning. CONFIRMED nodes still generate reverse goals because abductive reasoning ("what explains this confirmed observation?") is the primary driver of diagnostic inference — especially for seed nodes. Circular re-spawning of already-settled nodes is prevented by the Knowledge Operator's status-aware deduplication filter, not by the Goal Generator.

#### 3.1.2 STATUS_UPGRADE Goal Detection

For each HYPOTHESIS node:

1. Find all outgoing `CONFIRMED_BY` edges (`source === node.id && relationType === 'CONFIRMED_BY'`).
2. If at least one CONFIRMED_BY edge exists AND every target node has status `CONFIRMED`, emit a STATUS_UPGRADE goal.

**Key rules:**
- A HYPOTHESIS with zero CONFIRMED_BY edges can never be promoted (prevents vacuous truth).
- The check is non-recursive — it only looks at immediate targets. Transitivity emerges naturally over multiple pulses.

### 3.2 Search Operator (Operator 2)

**Input:** Array of goals + SSM state + KB fragments + Strategy.
**Output:** The single highest-scoring goal + its Rationale Packet.

#### 3.2.1 Scoring Formula for EXPAND Goals

```
rawScore = (MAX(urgency) × 100 × weights.urgency)
         + (parsimony_bonus × weights.parsimony)
         + (anchor_cf × 20 × weights.parsimony)
         + (focus_bonus × weights.parsimony)
         + (ordering_bonus × weights.parsimony)
         - (MEAN(inquiryCost) × 100 × weights.costAversion)
```

Where:
- **MAX(urgency):** The highest urgency value across all KB fragments matching this goal's anchor (by label or node ID) + target relation. The Search Operator uses the same cascading match as the Knowledge Operator (exact relation first, then broad fallback). Uses MAX (not MEAN) because the engine must pivot to the most dangerous possibility immediately.
- **Parsimony bonus:** 50 points (before weight) if the SSM already contains at least one node of the target entity type. Additionally, for reverse goals, a multi-evidence bonus of 30 points per additional CONFIRMED node that the candidate explains is added. This prioritizes Conditions that unify multiple confirmed findings (e.g., a Condition explaining both Meningism and Thunderclap_Headache scores higher than one explaining only Meningism).
- **Certainty bonus:** `anchor.cf × 20 × weights.parsimony`. Goals anchored on high-certainty nodes score higher, ensuring the engine prefers to expand well-supported hypotheses over uncertain ones.
- **Focus bonus:** 25 points (before weight) if the goal's anchor node is within the currently focused SSM subgraph (see Section 4.9). This keeps the engine focused on one candidate solution at a time.
- **S_L ordering bonus:** Up to 40 points (before weight) based on the goal's relation type position in the entity-type-specific ordering defined by `strategy.goalOrdering` (see Section 4.10). First position = 40, second = 30, third = 20, fourth = 10. Goals with relations not in the ordering get 0. This implements the paper's "test before refine" and similar local strategic principles.
- **MEAN(inquiryCost):** Average inquiry cost across matching KB fragments. Uses MEAN (not MAX) because cost is an expected-value calculation.

#### 3.2.2 Scoring Formula for STATUS_UPGRADE Goals

```
rawScore = 200 × weights.parsimony
```

The fixed 200-point base (vs. 50 for EXPAND parsimony) ensures promotion is strongly preferred when conditions are met. This implements the "confirm before explore" heuristic.

#### 3.2.3 Anchor Status Penalties

| Anchor Status | Effect on Score | Rationale |
|---------------|----------------|-----------|
| `REFUTED` | `totalScore = rawScore × 0.01` (99% reduction) | User explicitly rejected this finding — the entire branch is effectively dead |
| `UNKNOWN` | `totalScore = rawScore × 0.05` (95% reduction) | Finding is unresolved — downstream reasoning is heavily suppressed |
| `SKIPPED` | `totalScore = rawScore - urgencyScore` (urgency zeroed) | User deferred judgment — the goal loses its urgency bonus for this cycle but parsimony and cost scores remain intact |

All penalties are applied after the raw score is computed. REFUTED and UNKNOWN use multiplicative penalties that cannot be overcome by high urgency. SKIPPED uses a subtractive penalty that only removes the urgency component, allowing the goal to still compete on parsimony.

#### 3.2.4 Tie-Breaking

Goals are sorted by `totalScore` descending. Ties are broken by array order, which means EXPAND goals (generated first) are preferred over STATUS_UPGRADE goals at equal scores.

#### 3.2.5 Rationale Packet

The Search Operator produces a Rationale Packet for the winning goal containing:
- Scored factors: Clinical Urgency, Parsimony, Inquiry Cost, Certainty, Solution Focus, S_L Ordering (each with label, numeric impact, and explanation). Not all factors are present on every goal — focus and ordering bonuses only appear when applicable.
- The `actionTaken` field is left empty — the orchestrator fills it in after the Knowledge Operator returns

### 3.3 Knowledge Operator (Operator 3)

**Input:** The winning goal + all KB fragments + existing SSM nodes (for deduplication).
**Output:** A discriminated union result.

#### 3.3.1 STATUS_UPGRADE Goals

Bypasses the KB entirely. Returns `STATUS_UPGRADE_PATCH` with the node ID to promote. The Goal Generator already verified the promotion conditions.

#### 3.3.2 EXPAND Goals — KB Matching

Filters KB fragments by anchor identity using a cascading search with two priority levels:

**Priority 1 — Exact Relation Match:**
- **Forward:** `(fragment.subject matches anchor) && fragment.relation === goal.targetRelation`
- **Reverse:** `(fragment.object matches anchor) && fragment.relation === goal.targetRelation`

**Priority 2 — Broad Fallback (any relation):**
If Priority 1 returns zero matches, the operator falls back to matching any fragment where the anchor appears on the correct side, regardless of relation type:
- **Forward:** `fragment.subject matches anchor` (any relation)
- **Reverse:** `fragment.object matches anchor` (any relation)

This prevents the engine from stalling when the KB uses a different but logically equivalent relation name (e.g., `CONFIRMED_BY` instead of `EXPLAINS`) for the same structural relationship.

Anchor matching uses dual keys: both the goal's `anchorLabel` and `anchorNodeId` are checked against the fragment's subject/object fields.

**Deduplication and Graph Merging:** After matching, the Knowledge Operator checks each fragment's target against existing SSM nodes. If the target already exists, the operator creates an edge to the existing node (graph merging) and combines CFs using the conjunctive formula `cf_combined = cf1 + cf2 * (1 - cf1)`. If the target is new, a HYPOTHESIS node is spawned with `cf` set from the fragment's `specificity` metadata. A PATCH result can therefore contain a mix of new nodes and edges to existing nodes.

**If matches found → PATCH result (with graph merging):**
- For each matching fragment, the operator checks if the target node already exists in the SSM.
- **New target:** A HYPOTHESIS node is spawned and an edge is created.
- **Existing target:** Only an edge to the existing node is created (graph merging — no duplicate node).
- For forward goals: edges go from anchor to target node.
- For reverse goals: edges go from target node to anchor.

**If no matches found (or all filtered out) → NO_MATCH result:**
- The KB is ground truth, so a missing match means this relation doesn't exist (or all targets are already settled).
- The engine silently skips the goal.

#### 3.3.3 Multi-Hypothesis Spawning

When multiple KB fragments match, ALL are instantiated as HYPOTHESIS nodes in a single PATCH. The engine doesn't pick the "best" match — branching is immediate. Prioritization happens on the NEXT pulse when the Search Operator scores the new goals emanating from each hypothesis.

---

## 4. Engine Orchestration

### 4.1 Engine Finite State Machine

```
IDLE → THINKING     (user clicks Run or Step)
THINKING → IDLE     (user clicks Pause)
THINKING → INQUIRY  (finding confirmation triggered)
THINKING → RESOLVED (Goal Generator returns zero goals)
INQUIRY → IDLE      (user resolves the inquiry)
ANY → IDLE          (user clicks Reset)
```

Invalid transitions are silently ignored.

### 4.2 Pacer (Heartbeat Clock)

The Pacer is the sole timing driver. Three modes:

| Mode | Behavior |
|------|----------|
| **Run** | Continuous pulses at configurable delay (0–2000ms) |
| **Step** | Emit exactly one pulse, then auto-pause |
| **Pause** | Emit nothing |

The Inference Engine only processes pulses when the FSM is in `THINKING` state. Pulses in other states are silently dropped.

### 4.3 Pulse Processing Pipeline

On each pulse:

1. **Snapshot** all store slices (SSM, Task Structure, KB, Strategy, Engine State).
2. **Gate check:** Only proceed if engine is in `THINKING` state.
3. **Goal Generation:** Run the Goal Generator.
   - If zero goals → dispatch `engineResolved`, pause the pacer, return.
4. **Goal Scoring:** Run the Search Operator to pick the winner.
5. **Searchlight:** Dispatch `setActiveGoal` so the UI highlights the anchor node. The Searchlight is rendered as a dedicated SVG layer on top of all nodes and edges — a pulsing cyan ring with a glow effect that tracks the active goal's anchor node on every simulation tick.
6. **Goal Resolution:** Run the Knowledge Operator.
7. **Dispatch** based on result type:

| Result Type | Action |
|-------------|--------|
| `PATCH` | Append new HYPOTHESIS nodes + edges to SSM |
| `STATUS_UPGRADE_PATCH` | Promote the target node from HYPOTHESIS to CONFIRMED |
| `NO_MATCH` | Insert a placeholder edge to mark the goal as explored (prevents retry) |
| `INQUIRY_REQUIRED` (legacy) | Same as NO_MATCH — skip silently |

8. **Finding Confirmation Check:** After every Knowledge Operator PATCH, the engine checks if any of the **newly spawned nodes** have `canBeConfirmed === true`. It also checks the anchor node from the current SSM snapshot. If any confirmable HYPOTHESIS node is found:
   - Dispatch `openFindingInquiry` (sets `waitingForUser = true`, records `pendingFindingNodeId`)
   - Transition engine to `INQUIRY` state
   - Pause the pacer

### 4.4 NO_MATCH Handling (Placeholder Edges)

When the Knowledge Operator returns NO_MATCH, the engine creates a placeholder edge to mark the goal as explored:
- For forward goals: `source = anchorNodeId`, `target = placeholder_UUID`
- For reverse goals: `source = placeholder_UUID`, `target = anchorNodeId`

This prevents the Goal Generator from detecting the same gap again on subsequent pulses.

### 4.5 Goal Relation Coverage (Exhaustion)

When the Knowledge Operator's cascading fallback resolves a goal using a different relation type than the goal requested (e.g., goal asked for `EXPLAINS` but the broad fallback matched `CONFIRMED_BY`), the resulting PATCH edges may not cover the original goal relation. Without intervention, the Goal Generator would see the original relation as still unexplored and regenerate the same goal — causing an infinite loop.

To prevent this, after every PATCH dispatch, the engine checks whether any of the result edges match the goal's `targetRelation`. If not, it inserts an additional placeholder edge for the original relation, marking that specific goal as exhausted.

### 4.6 Graph Merging

When the Knowledge Operator finds KB fragments whose target node already exists in the SSM, it creates an edge to the existing node instead of spawning a duplicate. This merges subgraphs — for example, if `Subarachnoid_Hemorrhage` already exists from one reasoning chain, and a second chain discovers it via a different finding, the engine draws a new edge to the existing node rather than creating a second copy.

**CF combination:** When graph merging occurs, the Knowledge Operator computes updated certainty factors using the conjunctive formula `cf_combined = cf_old + cf_new × (1 − cf_old)`. These updates are returned as a `cfUpdates` map (node ID → new CF) on the PATCH result — the operator never mutates store objects. The orchestrator passes `cfUpdates` through the `applyPatch` action payload, and the SSM reducer applies them immutably by spreading new node objects with the updated `cf` values.

A PATCH result can therefore contain a mix of new nodes (for genuinely new concepts), edges-only (for connections to existing nodes), and CF updates (for existing nodes whose certainty increased due to additional evidence).

### 4.7 Stall Detection (Loop Break)

The engine tracks consecutive pulses that produce zero new nodes. If 10 consecutive pulses fire without growing the graph (only placeholder edges or edges to existing nodes), the engine forces a transition to RESOLVED, pauses the pacer, and logs a `Logic exhaustion` warning to the console. The stall counter resets whenever a pulse spawns at least one new node.

### 4.8 Diagnostic Differential (G_g Termination)

[Ref: Paper 1 Sec 3.2.1 / Paper 2 Sec 3.1 g3-g4]

After each pulse (and after stall detection), the engine computes the diagnostic differential — the set of competing candidate solutions. A candidate is a node of the "root" entity type (the type that appears as `from` in Task Structure relations but never as `to` — e.g., `Condition`).

For each candidate, the engine traces edges transitively to count how many seed findings (leaf-type CONFIRMED nodes) it covers. Candidates are ranked by:
1. Coverage count (how many seed findings are reachable)
2. Certainty factor (CF) as tiebreaker

If any candidate achieves **complete coverage** (covers ALL seed findings), the engine declares it the winner and transitions to RESOLVED. This implements the paper's global goal constraint G_g: "the root of an SSM sub-graph depicting the disease process sought must cover every abnormal finding known to be present."

The differential is displayed in the UI via the Differential Panel component, showing each candidate's label, coverage bar, CF value, and WINNER/candidate badge.

### 4.9 Solution Focus — Global Strategic Principles (S_G)

[Ref: Paper 1 Sec 3.2.3 / Paper 2 Sec 3.2 / Gap Analysis Gap 2]

After computing the differential, the engine evaluates global strategic principles (S_G) to determine which candidate solution to focus on. The `solutionFocusNodeId` in the engine state tracks the root node of the currently pursued SSM subgraph.

**S_G evaluation rules (simplified from the paper's s1-s6):**
1. If no current focus exists, pick the strongest candidate (highest coverage + CF)
2. If the current focus is no longer in the differential, switch to the strongest
3. If another candidate has become *significantly* stronger than the current focus (exceeds by more than 0.5 strength units), switch to it. This hysteresis threshold prevents thrashing on marginal differences — the paper states that S_G principles "take effect only occasionally, when certain changes to the SSM require to divert attention."
4. Otherwise, stay on the current focus

**Effect on scoring:** Goals whose anchor node is within the focused subgraph receive a +25 parsimony-weighted bonus. This keeps the engine focused on one candidate solution at a time rather than jumping erratically between unrelated branches.

Focus switches are logged to the console for debugging: `[ACE-SSM] Solution focus switched: "X" → "Y"`.

### 4.10 Local Strategic Principles (S_L) — Goal Ordering

[Ref: Paper 1 Sec 3.2.3 / Paper 2 Sec 3.2 Fig 7-8 / Gap Analysis Gap 3]

Local strategic principles prescribe the order of pursuing different types of subgoals for each entity type. The paper's node-chain matrix (Fig 7b) expresses these as ordered sets:

```
{?→D→?: D→?F ≻ ?Dg→D ≻ D→?Ds ≻ ?A→D}
```

Meaning for a Disease focus node: test it (find findings) before generalizing, before refining (subtypes), before finding its agent.

**Implementation:** The `goalOrdering` field on `IStrategy` maps entity types to ordered arrays of relation types. For example:

```json
{
  "Condition": ["CAUSED_BY", "TREATED_BY"],
  "Clinical_Finding": ["EXPLAINS", "CONFIRMED_BY"]
}
```

**Effect on scoring:** Goals whose `targetRelation` appears in the ordering for the anchor node's entity type receive a position-based bonus:
- Position 0 (first/highest priority): +40 × parsimony weight
- Position 1: +30 × parsimony weight
- Position 2: +20 × parsimony weight
- Position 3: +10 × parsimony weight
- Not in ordering: +0

This is additive with all other scoring factors. If `goalOrdering` is absent or empty for a given entity type, all relation types are treated equally (no ordering bonus).

**Domain authors** can configure S_L ordering in the domain JSON's `strategy` section. If omitted, the engine uses the default strategy with no ordering preferences.

### 4.11 Domain Validation

[Ref: Paper 2 Sec 4.3 / Gap Analysis Gap 7]

When a domain JSON is loaded, the engine runs validation checks and logs warnings to the console. These checks implement a simplified version of the SSM-DKM validation stage:

- **Task Structure completeness:** entity types must exist, relations must exist, no orphan entity types
- **KB coverage:** every relation in the Task Structure should have at least one KB fragment
- **KB consistency:** fragment subject/object types must match the relation's from/to types
- **SSM seed nodes:** at least one seed node should exist, seed node types must be in entityTypes
- **Seed node reachability:** seed nodes should be of leaf types (targets of relations) so abductive reasoning can reach them

Warnings are non-blocking — the domain loads regardless, but the console output helps domain authors identify issues.

### 4.12 Declarative Goal Constraints

[Ref: Paper 1 Sec 3.2.1 / Paper 2 Sec 4.1 / Gap Analysis Gap 8]

Domain authors can define custom goal constraints in the Task Structure's optional `goalConstraints` array. Each constraint specifies that every node of a given type must have a specific relation:

```json
{
  "goalConstraints": [
    { "nodeType": "Condition", "requiredRelation": "TREATED_BY", "direction": "forward" }
  ]
}
```

The Goal Generator evaluates these constraints in addition to its built-in gap detection. For each node matching the constraint's `nodeType` (and optional `onlyStatus`), if the required edge doesn't exist, an EXPAND goal is emitted.

This makes the engine extensible without code changes — domain authors can add reasoning rules that are specific to their domain's ontology.

### 4.13 Pending Goals Visualization

[Ref: Paper 1 Sec 3.2 / Gap Analysis Gap 5]

Nodes that have unsatisfied goals (pending subgoals) can be visually indicated in the SSM graph with a dashed pulsing outline. The `pendingGoalNodeIds` input on the graph component accepts a set of node IDs to highlight.

This implements a lightweight version of the paper's concept of "unsatisfied node-chains posted in the SSM" — rather than persisting unbound nodes in the state, we show which bound nodes still have work to do.

### 4.14 Meta-SSM — Reasoning Chains

[Ref: Paper 1 Sec 5.3 / Gap Analysis Gap 6]

The `buildReasoningChains()` function groups consecutive ReasoningSteps into higher-level "reasoning chains" based on context switches (user action vs. system reasoning). Each chain has a label, type, time range, and the steps it contains.

This is a simplified version of the paper's full Meta-SSM concept. The paper envisions a meta-system that creates its own SSM for modeling what the object system is doing, with nodes representing lines of reasoning and edges representing S_G-triggered switches. Our implementation provides the data structure for this view; a full Meta-SSM tab could be added as a future enhancement.

---

## 5. Inquiry System (Finding Confirmation)

### 5.1 Trigger Condition

The inquiry modal triggers when ANY of the following are true after a pulse:
1. A Knowledge Operator PATCH spawns new HYPOTHESIS nodes where `canBeConfirmed === true`
2. The active goal's anchor node is `HYPOTHESIS` with `canBeConfirmed === true`

The first confirmable node found is presented to the user. The engine transitions to INQUIRY state, the pacer is paused, and the Searchlight parks on the finding until the user responds.

The `canBeConfirmed` flag is direction-dependent:
- **Forward-spawned nodes** (the object side of a KB fragment — e.g., a Finding discovered because a Disease CAUSES it): inherit `canBeConfirmed` from the fragment, defaulting to `true` if omitted. This means inferred findings pause the engine for user confirmation unless the fragment explicitly opts out.
- **Reverse-spawned nodes** (the subject side, via abductive reasoning — e.g., a Disease discovered because it CAUSES a known Finding): default to `false`. Explanatory entities like diseases are not directly observable; they are confirmed indirectly via STATUS_UPGRADE when their evidence is confirmed. A fragment can explicitly set `canBeConfirmed: true` to override this for special cases.

This directional rule is domain-independent and consistent with the paper's G_L2 constraint: "every SSM node depicting an **inferred abnormal finding** must be verified with the patient." The paper's inquiry system only asks about findings (observable symptoms), never about diseases (explanatory hypotheses). [Ref: Paper 1 Sec 3.2.1 G_L2]

The flag can also originate from:
- **Seed nodes:** Set directly in the domain JSON on SSM nodes
- **KB fragments:** The Knowledge Operator propagates the fragment's `canBeConfirmed` value to the spawned node (subject to the directional rule above)

The inquiry does NOT trigger for KB relationship validation. The KB is treated as ground truth.

### 5.2 Modal Presentation

The modal displays:

> **Observation Required**
>
> **[Node Label]**. Can you confirm this finding?
>
> [Confirm] [Refute] [Unknown / Skip]

### 5.3 User Actions

| Action | Node Status After | Engine Effect |
|--------|-------------------|---------------|
| **Confirm** | `CONFIRMED` | Engine resumes. Downstream goals score normally. Enables STATUS_UPGRADE promotion chains. |
| **Refute** | `REFUTED` | Engine resumes. All downstream goals receive a 99% multiplicative penalty (0.01×), effectively killing the branch. |
| **Unknown / Skip** | `SKIPPED` | Engine resumes. The goal loses its urgency bonus for the current cycle (urgency score zeroed) but parsimony and cost scores remain. The branch is deprioritized, not killed. |

All three actions clear `waitingForUser`, clear `pendingFindingNodeId`, and transition the engine from INQUIRY → IDLE.

### 5.4 Auto-Resume After Inquiry

After any inquiry resolution, the facade automatically resumes continuous inference (`engineStart` + `pacer.run()`). The engine keeps processing goals — including NO_MATCH placeholders and low-value forward goals — until it hits the next confirmable node or exhausts all goals. This prevents the engine from stalling between inquiry pauses on goals that produce no visible output.

### 5.5 Audit Trail

Confirm, Refute, and Skip actions each produce a ReasoningStep in the history:
- Confirm: `"User confirmed finding: "[Node Label]""`
- Refute: `"User refuted finding: "[Node Label]""`
- Skip: `"User skipped finding: "[Node Label]""`

---

## 6. State Management (NgRx Store)

### 6.1 Store Slices

| Slice | Feature Key | Contents |
|-------|-------------|----------|
| **SSM** | `ssm` | Nodes, edges, history, flags (`waitingForUser`, `pendingFindingNodeId`) |
| **Engine** | `engine` | FSM state (`IDLE`/`THINKING`/`INQUIRY`/`RESOLVED`), active goal, solution focus node ID |
| **Task Structure** | `taskStructure` | Entity types, relations, goal constraints, loaded flag, error |
| **Knowledge Base** | `knowledgeBase` | Fragments, loaded flag, error |
| **Strategy** | `strategy` | Name, weights, pacer delay, goal ordering (S_L) |

### 6.2 SSM Actions

| Action | Payload | Effect |
|--------|---------|--------|
| `applyPatch` | nodes, edges, reasoningStep | Append nodes + edges; append history entry |
| `applyStatusUpgrade` | nodeId, reasoningStep | Set target node status to CONFIRMED; append history |
| `openInquiry` | questionNode, edge, reasoningStep | Append question node + edge; set `waitingForUser = true`; append history |
| `resolveInquiry` | nodeId, newStatus, newLabel, reasoningStep | Update node status + optional label; clear `waitingForUser`; append history |
| `openFindingInquiry` | nodeId, reasoningStep | Set `pendingFindingNodeId`; set `waitingForUser = true`; append history |
| `confirmFinding` | nodeId, reasoningStep | Set node status to CONFIRMED; clear `pendingFindingNodeId`; clear `waitingForUser`; append history |
| `refuteFinding` | nodeId, reasoningStep | Set node status to REFUTED; clear `pendingFindingNodeId`; clear `waitingForUser`; append history |
| `skipFinding` | nodeId, reasoningStep | Set node status to SKIPPED; clear `pendingFindingNodeId`; clear `waitingForUser`; append history |
| `resetSSM` | (none) | Reset to initial empty state |
| `restoreSSM` | ssmState | Replace entire state wholesale |

### 6.3 Engine Actions

| Action | Valid From | Transitions To |
|--------|-----------|----------------|
| `engineStart` | IDLE | THINKING |
| `enginePause` | THINKING | IDLE |
| `engineInquiry` | THINKING | INQUIRY |
| `engineResolved` | THINKING | RESOLVED |
| `engineInquiryAnswered` | INQUIRY | IDLE |
| `engineReset` | ANY | IDLE |
| `setActiveGoal` | ANY | (updates `activeGoal` field only) |
| `setSolutionFocus` | ANY | (updates `solutionFocusNodeId` field only — see Section 4.9) |

---

## 7. User-Facing Operations (Facade)

The Facade Service is the single API surface for all user actions.

| Method | Description |
|--------|-------------|
| `run()` | Start continuous inference (IDLE → THINKING, pacer runs) |
| `pause()` | Pause inference (THINKING → IDLE, pacer pauses) |
| `step()` | Execute one pulse then auto-pause |
| `reset()` | Reset engine + SSM to initial state |
| `setSpeed(ms)` | Update pacer delay |
| `loadDomain(json)` | Load a complete domain (Task Structure + KB + optional SSM + optional Strategy) |
| `exportDomain(id, name)` | Export current session as JSON |
| `seedFinding(label, type)` | Manually add a CONFIRMED seed node to the SSM |
| `confirmFinding(nodeId, label)` | Confirm a HYPOTHESIS finding (from inquiry modal) |
| `refuteFinding(nodeId, label)` | Refute a HYPOTHESIS finding — applies 99% penalty to downstream goals |
| `skipFinding(nodeId, label)` | Skip a finding inquiry — deprioritizes by removing urgency bonus |
| `resolveInquiry(nodeId, status, label, text)` | Resolve a legacy QUESTION node |
| `updateStrategy(weights)` | Update heuristic weights (auto-names the strategy) |
| `selectNode(nodeId)` | Select a node for inspection in the UI |

### 7.1 Domain Loading

When a domain JSON is loaded:

1. Parse the JSON.
2. Validate that `structure` and `knowledgeBase` fields exist.
3. Dispatch `loadTaskStructure` (triggers inline validation of entity types + relations).
4. Dispatch `loadKnowledgeBase` (triggers inline validation of metadata bounds).
5. If `ssm` is present, normalize it (handle alternate field names like `auditTrail` → `history`, fill missing fields with defaults) and dispatch `restoreSSM`.
6. If `strategy` is present, dispatch `updateStrategy` + `updatePacerDelay`.
7. Run domain validation (Section 4.11) and log any warnings to the console.

### 7.2 Seed Findings

Users can manually seed CONFIRMED nodes into the SSM. These serve as the starting points for inference. A seeded finding:
- Has status `CONFIRMED`
- Produces a ReasoningStep with `strategyName: 'Manual'` and `actionTaken: 'Seeded finding: [label] ([type])'`
- Triggers gap detection on the next pulse (the Goal Generator will find unexplored relations for this node)

---

## 8. Serialization

### 8.1 SSM Serializer

Provides `serialize(state) → JSON string` and `deserialize(json) → ISSMState | { error }`.

**Deserialization validation (in order):**
1. JSON.parse succeeds
2. `nodes`, `edges`, `history` are arrays
3. `isRunning` and `waitingForUser` are booleans
4. Each node has `id`, `label`, `type`, and `status` fields

The serializer does NOT validate referential integrity (e.g., that edge sources point to existing nodes). That is the store's responsibility.

### 8.2 Domain Export

Captures the complete session state: Task Structure, KB, SSM (nodes/edges/history), and Strategy. The resulting JSON can be saved to a file and loaded later to resume the session.

---

## 9. Example Domain (Medical Diagnosis)

The bundled fixture demonstrates a medical diagnosis domain:

**Entity Types:** FINDING, ETIOLOGIC_AGENT, PHYSIOLOGIC_STATE, TREATMENT

**Relations:**
- FINDING → CAUSES → ETIOLOGIC_AGENT
- ETIOLOGIC_AGENT → INDUCES → PHYSIOLOGIC_STATE
- TREATMENT → TREATS → ETIOLOGIC_AGENT
- ETIOLOGIC_AGENT → CONFIRMED_BY → FINDING
- PHYSIOLOGIC_STATE → CONFIRMED_BY → FINDING

**KB Fragments (6 total):**

| ID | Subject | Relation | Object | Urgency | Inquiry Cost |
|----|---------|----------|--------|---------|-------------|
| kb_001 | Fever | CAUSES | Bacterial Meningitis | 1.0 | 0.1 |
| kb_002 | Fever | CAUSES | Influenza | 0.4 | 0.2 |
| kb_003 | Bacterial Meningitis | INDUCES | Neck Stiffness | 0.9 | 0.3 |
| kb_004 | Bacterial Meningitis | CONFIRMED_BY | Lumbar Puncture | 0.8 | 0.7 |
| kb_005 | Influenza | INDUCES | Myalgia | 0.2 | 0.1 |
| kb_006 | Influenza | CONFIRMED_BY | Rapid Flu Test | 0.3 | 0.4 |

**Example reasoning trace** (starting from a seeded "Fever" FINDING node):

1. Goal Generator detects forward CAUSES gap on Fever + reverse goals for CAUSES (Fever is CONFIRMED — reverse goals are allowed for abductive reasoning) → EXPAND goals created
2. Search Operator scores them (urgency=1.0 from Meningitis fragment dominates)
3. Knowledge Operator matches both kb_001 and kb_002 → multi-hypothesis PATCH spawns "Bacterial Meningitis" and "Influenza" as HYPOTHESIS nodes
4. Finding Confirmation Check triggers for the first confirmable node — engine pauses for user input
5. User confirms/refutes/skips → engine auto-resumes with continuous run
6. Next pulse: Goal Generator detects INDUCES gap on Bacterial Meningitis + INDUCES gap on Influenza + CONFIRMED_BY gaps on both + reverse goals on unsettled nodes
7. Search Operator picks the highest-scoring goal (likely Meningitis INDUCES due to urgency=0.9)
8. Cycle continues until all gaps are filled or no goals remain (RESOLVED)

---

## 10. Key Design Invariants

1. **One winner per pulse.** Each heartbeat selects and resolves exactly one goal. If the resolution spawns a confirmable node, a second dispatch (the finding inquiry) occurs in the same pulse, producing two ReasoningSteps. All other pulses produce exactly one.
2. **Append-only graph.** Nodes and edges are never deleted. Nodes can only change status.
3. **Dual-key KB matching.** The Knowledge Operator and Search Operator match KB fragments against both the node's `label` and its `id`. This supports KB fragments authored with either human-readable labels (e.g., `"Stiff Neck"`) or identifier-style keys (e.g., `"Stiff_Neck"`), making the KB flexible across different authoring conventions.
4. **KB is ground truth.** If no KB fragments match a goal, the relation is assumed not to exist. The engine skips silently.
5. **Every mutation is explained.** Every SSM action (except reset/restore) carries a ReasoningStep that is appended to the history.
6. **Pure operators.** All three operators are pure functions with no side effects. Only the orchestrator dispatches actions.
7. **Clock-driven inference.** The Pacer is the sole timing driver. The engine never calls operators directly — it only reacts to pulse emissions.
8. **Status-based scoring penalties.** REFUTED anchors receive a 99% penalty (0.01×), UNKNOWN anchors receive a 95% penalty (0.05×), and SKIPPED anchors lose their urgency bonus. These penalties shape the engine's exploration priority based on user feedback.
9. **Confirm before explore.** STATUS_UPGRADE goals score 200 × parsimony weight (vs. 50 for EXPAND parsimony), strongly preferring promotion when conditions are met.
10. **Finding confirmation is user-driven and direction-aware.** The inquiry modal only triggers for HYPOTHESIS nodes with `canBeConfirmed: true`. Forward-spawned nodes (findings, symptoms) default to confirmable; reverse-spawned nodes (diseases, explanations) default to non-confirmable. This ensures the engine asks about observable findings, not explanatory hypotheses. [Ref: Paper 1 G_L2]
