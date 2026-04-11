# Requirements Document

## Introduction

This document specifies the requirements for the ACE-SSM Core Inference Engine and State Management system (Spec #1). ACE-SSM (Architectural Component Ensemble — Situation Specific Model) is a "Logical Glass Box" inference engine that externalizes expert-level cognitive processes into a traceable, reactive state-space search. This spec covers the pure inference logic (Triple Operators), NgRx state management, the RxJS heartbeat/pacer service, the Inquiry mechanism, UNKNOWN state logic, Angular project scaffolding, and sample medical domain test fixtures. It explicitly excludes all D3.js visualization and UI components (covered by a separate Spec #2).

## Glossary

- **SSM (Situation_Specific_Model):** The dynamic, evolving graph of the current reasoning case, consisting of nodes and edges held in NgRx state (Layer 3 — Working Memory).
- **Task_Structure:** A static JSON schema defining the legal entity types and the valid relations between them (Layer 1 — The Rules).
- **Knowledge_Base:** A repository of domain-specific fact fragments that obey the Task_Structure schema (Layer 2 — The Library).
- **Knowledge_Fragment:** A single fact entry in the Knowledge_Base, linking a subject to an object via a typed relation, with urgency, specificity, and inquiry cost metadata.
- **Goal:** A data object representing a logical gap in the SSM — a valid relation (per the Task_Structure) that does not yet have a corresponding edge.
- **Goal_Generator:** The first operator in the Triple-Operator cycle; a pure function that compares SSM nodes against Task_Structure relations to identify Goals (gaps).
- **Search_Operator:** The second operator; a pure function that scores all active Goals using weighted heuristics and selects the highest-scoring Goal.
- **Knowledge_Operator:** The third operator; a pure function that attempts to resolve the selected Goal by matching it against Knowledge_Base fragments.
- **Rationale_Packet:** A data structure recording the heuristic factors, scores, and explanation for every decision made by the Search_Operator.
- **Reasoning_Step:** A timestamped entry in the SSM history log containing the selected Goal, total score, Rationale factors, strategy name, and action taken.
- **Strategy:** A configuration object containing heuristic weight multipliers (urgency, parsimony, costAversion) and the pacer delay value.
- **Heartbeat:** An RxJS timer-based pulse that is the sole driver of the inference cycle.
- **Pacer:** The service controlling the Heartbeat interval, supporting Run, Step, and Pause modes.
- **Inquiry:** A first-class SSM node with status QUESTION, representing a point where the engine requires human input.
- **UNKNOWN_Status:** A node status indicating the user could not provide an answer; the node closes its gap but applies a heavy penalty to downstream goals.
- **PATCH:** The output of the Knowledge_Operator when a Knowledge_Base match is found — contains new nodes and edges to add to the SSM.
- **Engine_FSM:** The finite state machine governing engine operational states: IDLE, THINKING, INQUIRY, RESOLVED.
- **Searchlight:** The engine's current focus — the anchor node of the winning Goal selected by the Search_Operator.
- **UNKNOWN_Anchor_Penalty:** A configurable multiplier (default 0.05) applied to the score of Goals anchored by UNKNOWN-status nodes.

## Requirements

### Requirement 1: Angular Project Scaffolding

**User Story:** As a developer, I want a greenfield Angular v19+ project with NgRx and RxJS configured, so that I have a stable foundation for the inference engine.

#### Acceptance Criteria

1. THE Scaffolding SHALL generate an Angular v19+ project using standalone components and OnPush change detection as the default strategy.
2. THE Scaffolding SHALL include NgRx Store as a dependency with a root store module configured.
3. THE Scaffolding SHALL include RxJS as a dependency available for reactive orchestration.
4. THE Scaffolding SHALL define TypeScript interfaces for ISSMNode, ISSMEdge, ISSMState, ITaskStructure, IKnowledgeFragment, IGoal, IStrategy, IRationaleFactor, and IReasoningStep matching the Data Trinity contracts.

### Requirement 2: Task Structure Data Loading

**User Story:** As a developer, I want to load a Task Structure JSON definition into NgRx state, so that the engine has access to the domain grammar for gap detection.

#### Acceptance Criteria

1. WHEN a valid Task_Structure JSON is provided, THE Task_Structure_Store SHALL parse the JSON and store the entity types and relations in NgRx state.
2. WHEN a Task_Structure JSON contains a relation referencing an entity type not present in the entityTypes array, THE Task_Structure_Store SHALL reject the JSON and return a validation error describing the missing entity type.
3. THE Task_Structure_Store SHALL expose an NgRx selector that returns the complete list of entity types and relations.

### Requirement 3: Knowledge Base Data Loading

**User Story:** As a developer, I want to load Knowledge Base fragments into NgRx state, so that the Knowledge Operator can match goals against domain facts.

#### Acceptance Criteria

1. WHEN a valid Knowledge_Base JSON array is provided, THE KB_Store SHALL parse the array and store all Knowledge_Fragment entries in NgRx state.
2. WHEN a Knowledge_Fragment has metadata values outside the 0.0 to 1.0 range for urgency, specificity, or inquiryCost, THE KB_Store SHALL reject that fragment and return a validation error identifying the invalid field.
3. THE KB_Store SHALL expose an NgRx selector that returns all Knowledge_Fragment entries.
4. THE KB_Store SHALL expose an NgRx selector that filters Knowledge_Fragment entries by subject and relation type.

### Requirement 4: SSM State Management

**User Story:** As a developer, I want the SSM graph state managed immutably in NgRx, so that every mutation is traceable and the history log is append-only.

#### Acceptance Criteria

1. THE SSM_Store SHALL maintain an immutable state containing nodes, edges, history, isRunning, and waitingForUser fields.
2. WHEN a PATCH action is dispatched, THE SSM_Store SHALL append the new nodes and edges to the existing SSM state without mutating prior entries.
3. WHEN a PATCH action is dispatched, THE SSM_Store SHALL append the accompanying Reasoning_Step to the history array.
4. THE SSM_Store SHALL expose NgRx selectors for: all nodes, all edges, the full history log, the isRunning flag, and the waitingForUser flag.
5. WHEN a reset action is dispatched, THE SSM_Store SHALL clear all nodes, edges, and history, and set isRunning to false and waitingForUser to false.

### Requirement 5: Strategy State Management

**User Story:** As a developer, I want the Strategy configuration managed in NgRx state, so that heuristic weights and pacer delay can be updated at runtime.

#### Acceptance Criteria

1. THE Strategy_Store SHALL maintain a state containing urgency, parsimony, and costAversion weight values, and a pacerDelay value.
2. WHEN an update-strategy action is dispatched with new weight values, THE Strategy_Store SHALL replace the current weights with the provided values.
3. WHEN an update-pacer-delay action is dispatched, THE Strategy_Store SHALL update the pacerDelay value to the provided value.
4. THE Strategy_Store SHALL expose NgRx selectors for the complete Strategy object, individual weight values, and the pacerDelay value.

### Requirement 6: Goal Generator Operator

**User Story:** As a developer, I want a pure function that identifies logical gaps in the SSM by comparing it against the Task Structure, so that the engine knows what to investigate next.

#### Acceptance Criteria

1. WHEN the Goal_Generator receives an SSM state and a Task_Structure, THE Goal_Generator SHALL return a Goal for every SSM node where a valid relation (per the Task_Structure) does not have a corresponding edge in the SSM.
2. WHEN the SSM contains no nodes, THE Goal_Generator SHALL return an empty array.
3. WHEN all valid relations for every SSM node already have corresponding edges, THE Goal_Generator SHALL return an empty array.
4. THE Goal_Generator SHALL produce Goals containing the anchor node ID, the target relation type, and the target entity type.
5. THE Goal_Generator SHALL be a pure function with no side effects, depending only on its SSM state and Task_Structure inputs.
6. FOR ALL valid SSM and Task_Structure inputs, generating Goals and then generating Goals again from the same unchanged inputs SHALL produce an equivalent result (idempotence property).

### Requirement 7: Search Operator

**User Story:** As a developer, I want a pure function that scores and ranks all active goals using weighted heuristics, so that the engine pursues the most strategically valuable path.

#### Acceptance Criteria

1. WHEN the Search_Operator receives a non-empty list of Goals, an SSM state, a Knowledge_Base, and a Strategy, THE Search_Operator SHALL compute a TotalScore for each Goal using the formula: TotalScore = (Urgency × urgency_weight) + (Parsimony × parsimony_weight) - (Cost × costAversion_weight).
2. THE Search_Operator SHALL derive Urgency and Cost values from Knowledge_Base fragment metadata via a lightweight read-only aggregation: for each Goal, it SHALL query KB fragments matching the anchor node's label and the Goal's target relation, using MAX(metadata.urgency) for Urgency and MEAN(metadata.inquiryCost) for Cost.
3. WHEN the Search_Operator has scored all Goals, THE Search_Operator SHALL return the Goal with the highest TotalScore along with its Rationale_Packet.
4. WHEN two or more Goals have identical highest TotalScores, THE Search_Operator SHALL select one deterministically (by stable sort order).
5. WHEN a Goal is anchored by a node with UNKNOWN status, THE Search_Operator SHALL multiply that Goal's TotalScore by the UNKNOWN_Anchor_Penalty (default 0.05).
6. THE Search_Operator SHALL produce a Rationale_Packet containing the label, numeric impact, and textual explanation for each heuristic factor.
7. THE Search_Operator SHALL be a pure function with no side effects, depending only on its Goals, SSM state, Knowledge_Base, and Strategy inputs.
8. FOR ALL valid inputs, the Rationale_Packet's factor impacts SHALL sum to the reported TotalScore before the UNKNOWN_Anchor_Penalty is applied.

### Requirement 8: Knowledge Operator

**User Story:** As a developer, I want a pure function that resolves the winning goal by matching it against the Knowledge Base, so that the SSM can grow with new facts or trigger an inquiry.

#### Acceptance Criteria

1. WHEN the Knowledge_Operator receives a Goal and a Knowledge_Base, THE Knowledge_Operator SHALL perform instance-level matching using the anchor node's label and the Goal's target relation.
2. WHEN one or more Knowledge_Fragment entries match, THE Knowledge_Operator SHALL return a PATCH containing a new HYPOTHESIS node for each matching fragment and corresponding edges.
3. WHEN no Knowledge_Fragment entries match, THE Knowledge_Operator SHALL return an INQUIRY_REQUIRED result containing the unresolved Goal.
4. THE Knowledge_Operator SHALL be a pure function with no side effects, depending only on its Goal and Knowledge_Base inputs.
5. FOR ALL Goals where the Knowledge_Base contains matching fragments, the PATCH SHALL contain exactly one new node and one new edge per matching fragment.

### Requirement 9: Heartbeat Pacer Service

**User Story:** As a developer, I want an RxJS timer-based heartbeat service that drives the inference cycle, so that reasoning proceeds at a configurable pace.

#### Acceptance Criteria

1. THE Pacer SHALL use an RxJS timer as the sole driver of inference cycle execution.
2. WHEN the Pacer is in Run mode, THE Pacer SHALL emit pulses continuously at the interval specified by the Strategy's pacerDelay value.
3. WHEN the Pacer is in Step mode, THE Pacer SHALL emit exactly one pulse and then pause.
4. WHEN the Pacer is in Pause mode, THE Pacer SHALL emit no pulses.
5. WHEN the pacerDelay value changes while the Pacer is in Run mode, THE Pacer SHALL adjust the pulse interval to the new value within one pulse cycle.
6. THE Pacer SHALL accept pacerDelay values in the range of 0 milliseconds to 2000 milliseconds.

### Requirement 10: Inference Cycle Orchestration

**User Story:** As a developer, I want each heartbeat pulse to execute the full Triple-Operator cycle in strict sequence, so that the engine reasons correctly and traceably.

#### Acceptance Criteria

1. WHEN a heartbeat pulse fires, THE Inference_Engine SHALL execute the operators in the strict immutable sequence: Goal_Generator, then Search_Operator, then Knowledge_Operator.
2. WHEN the Knowledge_Operator returns a PATCH, THE Inference_Engine SHALL dispatch the PATCH and its accompanying Reasoning_Step to the SSM_Store.
3. WHEN the Knowledge_Operator returns INQUIRY_REQUIRED, THE Inference_Engine SHALL halt the Heartbeat, set the SSM waitingForUser flag to true, and create a QUESTION node in the SSM.
4. WHEN the Goal_Generator returns an empty array, THE Inference_Engine SHALL halt the Heartbeat and transition the Engine_FSM to the RESOLVED state.
5. WHEN a PATCH introduces HYPOTHESIS nodes, THE Goal_Generator on the next pulse SHALL generate confirmation goals for those HYPOTHESIS nodes based on the Task_Structure. Confirmation MUST be modeled as a first-class relation type in the Task_Structure (e.g., CONFIRMED_BY) to maintain domain-agnosticism — the engine SHALL NOT hardcode any confirmation behavior.

### Requirement 11: Engine Finite State Machine

**User Story:** As a developer, I want the engine to operate as a finite state machine with well-defined states and transitions, so that the engine's operational status is always deterministic.

#### Acceptance Criteria

1. THE Engine_FSM SHALL support exactly four states: IDLE, THINKING, INQUIRY, and RESOLVED.
2. WHEN a run or step command is issued while in IDLE state, THE Engine_FSM SHALL transition to THINKING state.
3. WHEN the Knowledge_Operator returns INQUIRY_REQUIRED while in THINKING state, THE Engine_FSM SHALL transition to INQUIRY state.
4. WHEN the Goal_Generator returns an empty goal list while in THINKING state, THE Engine_FSM SHALL transition to RESOLVED state.
5. WHEN a pause command is issued while in THINKING state, THE Engine_FSM SHALL transition to IDLE state.
6. WHEN the user answers an Inquiry while in INQUIRY state, THE Engine_FSM SHALL transition to IDLE state.
7. WHEN a reset command is issued from any state, THE Engine_FSM SHALL transition to IDLE state.

### Requirement 12: Inquiry Lifecycle

**User Story:** As a developer, I want inquiries to be first-class SSM nodes that compete with inference goals, so that the engine can intelligently decide when to ask the user for information.

#### Acceptance Criteria

1. WHEN the Knowledge_Operator returns INQUIRY_REQUIRED, THE Inference_Engine SHALL create a new SSM node with status QUESTION linked to the anchor node via the target relation.
2. WHILE the Engine_FSM is in INQUIRY state, THE Inference_Engine SHALL halt the Heartbeat and wait for user input.
3. WHEN the user provides an answer to a QUESTION node, THE Inference_Engine SHALL transform the QUESTION node status to CONFIRMED and update the node label with the provided answer.
4. WHEN the user marks a QUESTION node as "Unknown", THE Inference_Engine SHALL transform the QUESTION node status to UNKNOWN.
5. WHEN a QUESTION node is resolved (to CONFIRMED or UNKNOWN), THE Inference_Engine SHALL record the resolution in the history log as a Reasoning_Step.

### Requirement 13: UNKNOWN State Logic

**User Story:** As a developer, I want UNKNOWN nodes to close their gap but heavily penalize downstream reasoning, so that the engine deprioritizes uncertain branches without permanently blocking them.

#### Acceptance Criteria

1. WHEN a node is marked as UNKNOWN, THE Goal_Generator SHALL treat the corresponding edge as existing and not regenerate a Goal for that gap.
2. WHEN a Goal is anchored by a node with UNKNOWN status, THE Search_Operator SHALL multiply the Goal's TotalScore by the configurable UNKNOWN_Anchor_Penalty factor (default 0.05).
3. THE Search_Operator SHALL recalculate the UNKNOWN_Anchor_Penalty on every pulse without caching or inheriting penalty values from prior pulses.
4. WHEN all non-penalized goals are exhausted, THE Search_Operator SHALL allow UNKNOWN-anchored goals to win the Searchlight (resurrection).
5. THE UNKNOWN_Anchor_Penalty factor SHALL be configurable at runtime.

### Requirement 14: Rationale and Audit Trail

**User Story:** As a developer, I want every engine decision to produce a Rationale Packet saved to an append-only history log, so that the reasoning process is fully traceable.

#### Acceptance Criteria

1. WHEN the Search_Operator selects a winning Goal, THE Inference_Engine SHALL create a Reasoning_Step containing the timestamp, selected Goal, total score, heuristic factors, strategy name, and action taken.
2. THE SSM_Store SHALL maintain the history log as an append-only array that is never modified or truncated during a session.
3. WHEN a PATCH is applied to the SSM, THE SSM_Store SHALL append the corresponding Reasoning_Step to the history log in the same dispatch.
4. FOR ALL Reasoning_Steps in the history log, each entry SHALL contain a valid timestamp, a non-empty factors array, and a non-empty actionTaken string.

### Requirement 15: Sample Domain Data Fixtures

**User Story:** As a developer, I want sample medical domain data (Task Structure and Knowledge Base) as test fixtures, so that I can validate the engine against a realistic scenario.

#### Acceptance Criteria

1. THE Test_Fixtures SHALL include a Task_Structure JSON file defining at least three entity types and at least three relation types forming a connected reasoning graph.
2. THE Test_Fixtures SHALL include a Knowledge_Base JSON file containing at least five Knowledge_Fragment entries that cover multiple relation types from the Task_Structure.
3. THE Test_Fixtures SHALL include at least one scenario where the Knowledge_Base has no matching fragment for a valid Goal, triggering the INQUIRY_REQUIRED path.
4. THE Test_Fixtures SHALL include at least one scenario where multiple Knowledge_Fragment entries match a single Goal, producing a multi-node PATCH.
5. THE Test_Fixtures SHALL conform to the ITaskStructure and IKnowledgeFragment TypeScript interfaces defined in the Data Trinity contracts.

### Requirement 16: SSM State Serialization

**User Story:** As a developer, I want to serialize and deserialize the SSM state to and from JSON, so that sessions can be saved and restored.

#### Acceptance Criteria

1. THE SSM_Serializer SHALL convert the complete ISSMState (nodes, edges, history, isRunning, waitingForUser) into a valid JSON string.
2. WHEN a valid SSM JSON string is provided, THE SSM_Serializer SHALL parse the JSON and restore the complete ISSMState into the SSM_Store.
3. FOR ALL valid ISSMState objects, serializing then deserializing SHALL produce an ISSMState equivalent to the original (round-trip property).
4. WHEN an invalid or malformed JSON string is provided, THE SSM_Serializer SHALL return a descriptive error without modifying the current SSM_Store state.
