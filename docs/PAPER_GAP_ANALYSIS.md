# ACE-SSM Paper Gap Analysis

Mapping between the original papers and our implementation.
This document serves as the implementation roadmap for closing each gap.

**Paper references:**
- **Paper 1:** Benaroch, M. (1998). Goal-Directed Reasoning with ACE-SSM. *IEEE Transactions on Knowledge and Data Engineering*, Vol. 10, No. 5, pp. 706-726.
- **Paper 2:** Benaroch, M. (1998). Knowledge Modeling Directed by Situation-Specific Models. *Int. J. Human-Computer Studies*, 49, 121-157.

---

## Alignment Summary

| Paper Concept | Our Implementation | Status |
|---|---|---|
| Three knowledge types (G, K, S) | Task Structure, KB, Strategy | ✅ Aligned |
| SSM as explicit directed graph | NgRx SSM state (nodes, edges, history) | ✅ Aligned |
| Three-step iterative cycle | Triple-Operator cycle (Goal Gen → Search → Knowledge) | ✅ Aligned |
| Goal constraints detect gaps → post subgoals | Goal Generator detects missing edges → emits EXPAND goals | ✅ Aligned |
| K-operators resolve subgoals against KB | Knowledge Operator matches KB fragments | ✅ Aligned |
| S-operators select which subgoal to pursue | Search Operator scores and ranks goals | ✅ Aligned |
| Append-only SSM with full audit trail | History array with ReasoningSteps | ✅ Aligned |
| Task ontology as ER diagram | Task Structure view (entity types + relations) | ✅ Aligned |
| KB as relational networks | KB fragments with subject/relation/object | ✅ Aligned |
| Domain- and task-independence | Domain JSON loading, generic operators | ✅ Aligned |
| Explicit SSMs for explanation | Audit Trail + Copy to Markdown | ✅ Aligned |
| SSM-DKM conceptualization stage | Domain JSON schema (structure + KB + SSM) | ✅ Partial |
| Diagnostic Differential (G_g) | `computeDifferential()` + Differential Panel | ✅ Implemented |

---

## Gap 1: Diagnostic Differential (Global Goal Constraint G_g) — IMPLEMENTED

**Paper 1 (Sec 3.2.1, p.10) / Paper 2 (Sec 3.1, g3-g4):**

G_g termination conditions:
1. The root must be the most specific disease (Condition) possible
2. The root must cover (explain) every abnormal finding known to be present

**Implementation:** `computeDifferential()` in `ssm.selectors.ts` dynamically identifies root entity types (types that appear as `from` but never as `to` in the Task Structure), traces edges transitively from each root-type node to find which seed findings it covers, and marks candidates as `isComplete` when they cover all seeds. The inference engine checks the differential after each pulse and transitions to RESOLVED when a winner is found. The Differential Panel component displays the ranked list in the UI.

**Status:** ✅ IMPLEMENTED

---

## Gap 2: Global Strategic Principles (S_G) — Solution Focus Switching

**Paper 1 (Sec 3.2.3, p.12-15) / Paper 2 (Sec 3.2, s1-s6):**

S_G tells which candidate solution (SSM subgraph) the solver should focus on. Six global strategic principles (s1-s6) switch the "solution focus" between competing SSM subgraphs based on specific events:

- (s1) Switch to strongest D in differential if current D*'s strength dropped
- (s2) Switch if a new D was added from an unconsidered category
- (s3) Stay on child of D* after specialization
- (s4) Switch to sibling of D* after testing and specializing
- (s5) Switch to other D in differential if D* and all siblings were pursued
- (s6) Switch to ancestor if every differential was pursued

**Paper 2 insight (Sec 3.2):** Global strategic principles take effect conditionally on specific changes to the SSM, whose occurrence is checked for after each time the SSM grows a new node-chain instance. These specific changes to the SSM could indicate that the strength of the currently pursued SSM sub-graph dropped below that of another sub-graph, or that the currently pursued sub-graph no longer can be expanded.

**Paper 2 formalization (Sec 4.2):**
- (s1') ∀D is-focus(D) ∧ (∃D₁ in-differential(D₁) ∧ strongest-belief(D₁) ∧ (D ≠ D₁)) ⇒ is-focus(D₁)
- (s3') ∀D is-focus(D) ∧ (∃D₁ child(D₁, D) ∧ ¬pursued(D₁)) ⇒ is-focus(D₁)
- (s4') ∀D is-focus(D) ∧ pursued(D) ∧ (∃D₁ sibling(D₁, D) ∧ ¬pursued(D₁)) ⇒ is-focus(D₁)

**Our current state:** The Search Operator scores ALL goals globally and picks the highest. There is no concept of a "solution focus" or deliberate switching between candidate subgraphs.

**Implementation plan:**
- Add `solutionFocusNodeId: string | null` to the engine state
- After each pulse, evaluate S_G principles against the differential to determine if focus should switch
- Add a "focus bonus" to the Search Operator: goals within the focused subgraph score higher
- Log solution focus switches in the audit trail as distinct ReasoningSteps

**Priority:** MEDIUM — improves reasoning coherence but the engine works without it

---

## Gap 3: Focus Node and Object-Centered Control (S_L)

**Paper 1 (Sec 3.2.3, p.13) / Paper 2 (Sec 3.2, Fig 7):**

At any moment ACE-SSM focuses on one specific bound node, termed the *focus node* f. Principles in S_L prescribe the order of pursuing subgoals in G(o), for every ontological object o.

**Paper 2 provides the concrete formalization (Sec 4.2):**

Local object-centered principles are expressed as ordered sets of node-chains:
```
{?→D→?: D→?F ≻ ?Dg→D ≻ D→?Ds ≻ ?A→D}
```
Meaning for a Disease focus node: test it (find findings) before generalizing, before refining (subtypes), before finding its agent.

Local attribute-centered principles act as tie-breakers:
```
{F: F[abnormal] ≻ F[soft] ≻ F[hard] ≻ F[other]}
```
Meaning: always pursue abnormal findings first.

**Paper 2 key insight (Sec 3.2):** Object-centered principles can be contingent on attributes of the focus node. For example, if f is an observed (hard) finding, generalize it before mapping it to causing diseases; if f is an abnormal finding, map it to causing diseases before generalizing it.

**Our current state:** The Search Operator uses a flat scoring formula (urgency + parsimony - cost) with no concept of a focus node or object-type-specific subgoal ordering.

**Implementation plan:**
- Define S_L ordering rules per entity type in the Strategy model, stored as ordered arrays of relation types
- Track `focusNodeId` in the engine state
- In the Search Operator, add a bonus for goals that match the current S_L ordering position
- When all subgoals for the current focus node are satisfied, advance focus to the next unsatisfied node

**Priority:** MEDIUM — improves reasoning order

---

## Gap 4: Certainty Factors (CFs) on SSM Nodes

**Paper 1 (Sec 3.2.2, p.11-12):**

A node n∈N is a tuple (o i [a] ⟨t⟩), where ⟨t⟩ is a truth value or certainty factor (CF). For conjunctive networks, CFs combine as cf1+cf2*(1−cf1). For disjunctive networks, the CF is max(cf_j).

**Paper 2 (Sec 3.2, s1):** The "strength" of a candidate solution D* is the degree of belief (e.g. certainty factor) in its sub-graph being the solution sought. Strength can also be measured by the number of abnormal findings covered by the SSM sub-graph D* spans.

**Our current state:** Nodes have a `status` but no numeric certainty factor. We use `coveredSeedCount` in the differential as a proxy for "strength."

**Implementation plan:**
- Add optional `cf: number` field to `ISSMNode` (0.0 to 1.0)
- When spawning HYPOTHESIS nodes, set CF from KB fragment metadata
- When multiple fragments support the same node (graph merging), combine CFs
- Use CF in the differential ranking: strongest candidate = highest CF
- Display CF as a visual indicator on nodes

**Priority:** MEDIUM — enables the differential's "strongest candidate" concept

---

## Gap 5: Unsatisfied Node-Chains as First-Class SSM Elements

**Paper 1 (Sec 3.2, p.8-9) / Paper 2 (Sec 2.2):**

An edge with a terminal node is equivalent to an *unsatisfied node-chain* with one unbound node. Subgoals are literally posted in the SSM as unbound nodes.

ACE-SSM follows the principle: *post all potentially relevant subgoals in the SSM and worry later about which of them to pursue and when.*

**Our current state:** Goals are ephemeral — regenerated each pulse.

**Recommendation:** Keep our current approach. Regenerating goals each pulse is simpler and equivalent. The paper's approach was designed for 1998-era systems. However, we could add a "pending goals" ghost visualization to the SSM view.

**Priority:** LOW — architectural difference, not a functional gap

---

## Gap 6: Meta-SSM for "Why" Explanations of Behavior

**Paper 1 (Sec 5.3, p.24-25):**

A meta-system creates its own SSM for modeling what the object system is doing during problem solving. Each node corresponds to a line of reasoning, each link corresponds to a triggered global strategic principle.

**Depends on:** Gap 2 (S_G solution focus switching)

**Priority:** LOW

---

## Gap 7: SSM-DKM Knowledge Modeling Methodology (NEW — from Paper 2)

**Paper 2 (Sec 3-5):**

SSM-DKM provides a structured methodology for creating knowledge models:

1. **Conceptualization** — elicit goal model (G), domain model (K), strategy model (S) using:
   - Object-relation matrix (Table 2): entity types × entity types, filled with relation types
   - Node-chain matrix (Fig 7b): for each entity type, ordered list of subgoal types
   - Object-attribute matrix (Fig 8b): for each entity type with attributes, ordered list of attribute priorities
   - Integrated matrix (Table 3): combines all of the above with global strategic events

2. **Formalization** — express all models in first-order predicate calculus:
   - Goal constraints as quantified logic sentences
   - Strategic principles as ordered sets (local) or predicate calculus (global)
   - Domain model as relational network signatures

3. **Validation** — check consistency, compactness, completeness using logic-based techniques

**Our current state:** We have no tooling for knowledge modeling. Domain authors create JSON files manually (or with Gemini's help). There's no validation beyond the KB reducer's metadata bounds check.

**Implementation plan:**
- Add a "Domain Editor" UI that guides users through the SSM-DKM stages
- Stage 1: Entity type editor + relation matrix builder (generates Task Structure)
- Stage 2: KB fragment editor with templates derived from the Task Structure
- Stage 3: Strategy editor with node-chain ordering per entity type
- Validation: check that every relation in the Task Structure has at least one KB fragment, check that every entity type has at least one relation, etc.

**Priority:** LOW for engine correctness, HIGH for usability

---

## Gap 8: Formalized Goal Constraints as Predicate Logic (NEW — from Paper 2)

**Paper 2 (Sec 4.1):**

Goal constraints are formalized as first-order predicate calculus:
- (g1') ∀F abnormal(F) ∧ observed(F) ⇒ ∃D cause(D, F)
- (g2') ∀F abnormal(F) ∧ observed(F) ∧ (∃D cause(D, F)) ⇒ ∃Q asked(Q, F)

Every local goal constraint inspects properties of a single ontological object that is the focus node in the SSM and returns exactly one unsatisfied node-chain (sub-goal) associated with this object.

**Our current state:** Goal constraints are implicit in the Goal Generator's gap detection logic. They're hardcoded as "if no edge exists with this source + relationType, emit a goal." There's no way for domain authors to define custom goal constraints.

**Implementation plan (future):**
- Allow the Task Structure to include explicit goal constraints as declarative rules
- The Goal Generator would evaluate these rules against the SSM instead of using hardcoded gap detection
- This would make the engine truly domain-agnostic — the same code could power medical diagnosis, mechanical diagnosis, cybersecurity triage, etc.

**Priority:** LOW — the current hardcoded gap detection works for all domains that use the same ontological pattern (entity types + directed relations)

---

## Implementation Order

1. ~~**Gap 1: Diagnostic Differential**~~ — ✅ IMPLEMENTED
2. ~~**Gap 4: Certainty Factors**~~ — ✅ IMPLEMENTED
3. ~~**Gap 2: Global Strategic Principles (S_G)**~~ — ✅ IMPLEMENTED
4. ~~**Gap 3: Focus Node / S_L**~~ — ✅ IMPLEMENTED
5. ~~**Gap 7: SSM-DKM Domain Validation**~~ — ✅ IMPLEMENTED
6. ~~**Gap 5: Pending Goals Visualization**~~ — ✅ IMPLEMENTED (CSS + input, lightweight)
7. ~~**Gap 6: Meta-SSM Reasoning Chains**~~ — ✅ IMPLEMENTED (data structure + grouping function)
8. ~~**Gap 8: Declarative Goal Constraints**~~ — ✅ IMPLEMENTED
