# Implementation Plan: ACE-SSM Core Inference Engine

## Overview

Build the ACE-SSM Core Inference Engine as an Angular v19+ application with NgRx state management and RxJS reactive orchestration. The implementation follows a bottom-up dependency order: Scaffolding & Models → Pure Operators (with PBT) → NgRx Store Slices → Orchestrator & Services. Each task is independently testable and builds on the previous steps.

## Tasks

- [x] 1. Scaffold Angular project and define all data models
  - [x] 1.1 Generate Angular v19+ project with standalone components, OnPush change detection, NgRx Store, and RxJS dependencies
    - Configure `app.config.ts` with `provideStore()` and `provideEffects()`
    - Create blank `AppComponent` shell with OnPush change detection
    - Verify project compiles and serves
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 Create all TypeScript model interfaces
    - Create `src/app/models/task-structure.model.ts` with `ITaskStructure`, `IRelation`
    - Create `src/app/models/knowledge-base.model.ts` with `IKnowledgeFragment`, `IFragmentMetadata`
    - Create `src/app/models/ssm.model.ts` with `NodeStatus`, `ISSMNode`, `ISSMEdge`, `ISSMState`, `GoalKind`, `IGoal`
    - Create `src/app/models/strategy.model.ts` with `IStrategy`, `IStrategyWeights`, `IRationaleFactor`, `IReasoningStep`
    - Create `src/app/models/engine.model.ts` with `EngineState` enum, `IPatchResult`, `IStatusUpgradePatchResult`, `IInquiryRequiredResult`, `KnowledgeOperatorResult`
    - _Requirements: 1.4_

  - [x] 1.3 Create sample domain test fixtures
    - Create `src/app/fixtures/task-structure.fixture.ts` with medical domain Task Structure (4 entity types, 5 relations including CONFIRMED_BY)
    - Create `src/app/fixtures/knowledge-base.fixture.ts` with 6+ Knowledge Fragments covering multi-hypothesis, inquiry, and confirmation chain scenarios
    - Create `src/assets/task-structure.json` and `src/assets/knowledge-base.json` with the same data as static assets
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 1.4 Write unit tests for fixture validation
    - Verify Task Structure has ≥3 entity types and ≥3 relation types forming a connected graph
    - Verify Knowledge Base has ≥5 fragments covering multiple relation types
    - Verify at least one scenario triggers INQUIRY_REQUIRED (no KB match for a valid goal)
    - Verify at least one scenario produces multi-node PATCH (multiple KB matches for one goal)
    - Test file: `src/app/fixtures/fixtures.spec.ts`
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 2. Implement pure operator functions with property-based tests
  - [x] 2.1 Implement Goal Generator operator
    - Create `src/app/operators/goal-generator.ts` with `generateGoals(ssm, taskStructure)` pure function
    - Implement EXPAND goal detection: for each SSM node, find Task Structure relations where `from === node.type` and no edge exists for that relation
    - Implement STATUS_UPGRADE goal detection: for each HYPOTHESIS node, check if all CONFIRMED_BY targets are CONFIRMED
    - Return combined array of EXPAND and STATUS_UPGRADE goals
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.5_

  - [x] 2.2 Write property test: Goal Generator Completeness and Soundness
    - **Property 7: Goal Generator Completeness and Soundness**
    - Generate random ISSMState + ITaskStructure combinations
    - Assert exactly one EXPAND goal per (node, relation) pair where relation.from matches node.type and no edge exists
    - Assert UNKNOWN nodes with existing edges do not regenerate goals
    - Test file: `src/app/operators/goal-generator.spec.ts`
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 13.1**

  - [x] 2.3 Write property test: Goal Generator Idempotence
    - **Property 8: Goal Generator Idempotence**
    - Call generateGoals twice with identical inputs, assert structurally equivalent results (same count, same anchor/relation/type tuples, ignoring UUIDs)
    - Test file: `src/app/operators/goal-generator.spec.ts`
    - **Validates: Requirements 6.6**

  - [x] 2.4 Implement Search Operator
    - Create `src/app/operators/search-operator.ts` with `scoreGoals(goals, ssm, kb, strategy, unknownPenalty)` pure function
    - Implement scoring formula: `(MAX(urgency) × 100 × urgency_weight) + (parsimony_bonus × parsimony_weight) - (MEAN(inquiryCost) × 100 × costAversion_weight)`
    - Implement STATUS_UPGRADE scoring with 200 × parsimony_weight
    - Implement UNKNOWN_Anchor_Penalty multiplier (default 0.05)
    - Return winning goal with Rationale Packet (factors, totalScore, strategyName)
    - Stable sort: highest score first, ties broken by array order
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 2.5 Write property test: Search Operator Scoring Formula
    - **Property 9: Search Operator Scoring Formula**
    - Generate random EXPAND goals, SSM, KB, and Strategy
    - Assert raw score matches formula: `(MAX(urgency) × 100 × urgency_weight) + (parsimony_bonus × parsimony_weight) - (MEAN(inquiryCost) × 100 × costAversion_weight)`
    - Assert UNKNOWN-anchored goals have totalScore = rawScore × unknownPenalty
    - Assert returned goal has the highest totalScore
    - Test file: `src/app/operators/search-operator.spec.ts`
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5, 13.2, 13.4**

  - [x] 2.6 Write property test: Rationale Factor Sum Invariant
    - **Property 10: Rationale Factor Sum Invariant**
    - Assert sum of factor.impact values equals raw score (before UNKNOWN penalty)
    - Assert every ReasoningStep has non-empty factors array and valid strategyName
    - Test file: `src/app/operators/search-operator.spec.ts`
    - **Validates: Requirements 7.8, 14.1**

  - [x] 2.7 Implement Knowledge Operator
    - Create `src/app/operators/knowledge-operator.ts` with `resolveGoal(goal, kb)` pure function
    - Implement STATUS_UPGRADE bypass: return STATUS_UPGRADE_PATCH directly
    - Implement label-based KB matching: filter fragments by `subject === goal.anchorLabel` AND `relation === goal.targetRelation`
    - Implement multi-hypothesis spawning: ALL matches become HYPOTHESIS nodes in one PATCH
    - Return INQUIRY_REQUIRED when no fragments match
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 2.8 Write property test: Knowledge Operator Match Completeness
    - **Property 11: Knowledge Operator Match Completeness**
    - Generate random EXPAND goals + KB with varying match counts
    - Assert PATCH contains exactly N HYPOTHESIS nodes and N edges where N = number of matching fragments
    - Assert each node's label equals matching fragment's object, type equals objectType
    - Test file: `src/app/operators/knowledge-operator.spec.ts`
    - **Validates: Requirements 8.1, 8.2, 8.5**

  - [x] 2.9 Write property test: Knowledge Operator Inquiry on No Match
    - **Property 12: Knowledge Operator Inquiry on No Match**
    - Generate EXPAND goals with no KB matches
    - Assert result is INQUIRY_REQUIRED with the original goal
    - Test file: `src/app/operators/knowledge-operator.spec.ts`
    - **Validates: Requirements 8.3**

- [x] 3. Checkpoint — Verify all operators and PBT tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement NgRx store slices
  - [x] 4.1 Implement Task Structure store slice
    - Create `src/app/store/task-structure/task-structure.actions.ts` with `loadTaskStructure`, `loadTaskStructureSuccess`, `loadTaskStructureFailure`
    - Create `src/app/store/task-structure/task-structure.reducer.ts` with validation logic (reject relations referencing unknown entity types)
    - Create `src/app/store/task-structure/task-structure.selectors.ts` with `selectTaskStructure`, `selectEntityTypes`, `selectRelations`
    - Register slice in app.config.ts
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.2 Write property test: Task Structure Validation Rejects Invalid Relations
    - **Property 2: Task Structure Validation Rejects Invalid Relations**
    - Generate ITaskStructure with deliberately broken relation references
    - Assert validation error identifying missing entity type, store remains unchanged
    - Test file: `src/app/store/task-structure/task-structure.reducer.spec.ts`
    - **Validates: Requirements 2.2**

  - [x] 4.3 Implement Knowledge Base store slice
    - Create `src/app/store/knowledge-base/knowledge-base.actions.ts` with `loadKnowledgeBase`, `loadKnowledgeBaseSuccess`, `loadKnowledgeBaseFailure`
    - Create `src/app/store/knowledge-base/knowledge-base.reducer.ts` with metadata validation (reject fragments with values outside [0, 1])
    - Create `src/app/store/knowledge-base/knowledge-base.selectors.ts` with `selectAllFragments`, `selectFragmentsBySubjectAndRelation`
    - Register slice in app.config.ts
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.4 Write property test: KB Metadata Validation Rejects Out-of-Range Values
    - **Property 3: KB Metadata Validation Rejects Out-of-Range Values**
    - Generate IKnowledgeFragment with metadata outside [0.0, 1.0]
    - Assert validation error identifying invalid field, store remains unchanged
    - Test file: `src/app/store/knowledge-base/knowledge-base.reducer.spec.ts`
    - **Validates: Requirements 3.2**

  - [x] 4.5 Write property test: KB Filter Selector Correctness
    - **Property 4: KB Filter Selector Correctness**
    - Generate random fragment sets + random query strings
    - Assert selector returns exactly those fragments where subject === s AND relation === r
    - Test file: `src/app/store/knowledge-base/knowledge-base.reducer.spec.ts`
    - **Validates: Requirements 3.4**

  - [x] 4.6 Implement SSM store slice
    - Create `src/app/store/ssm/ssm.actions.ts` with `applyPatch`, `openInquiry`, `resolveInquiry`, `applyStatusUpgrade`, `resetSSM`, `restoreSSM`
    - Create `src/app/store/ssm/ssm.reducer.ts` with all reducer transitions per design (append-only patches, status upgrade, inquiry open/resolve, reset, restore)
    - Create `src/app/store/ssm/ssm.selectors.ts` with `selectAllNodes`, `selectAllEdges`, `selectHistory`, `selectIsRunning`, `selectWaitingForUser`, `selectSSMState`
    - Register slice in app.config.ts
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.7 Write property test: SSM Patch Is Append-Only
    - **Property 5: SSM Patch Is Append-Only**
    - Generate random initial ISSMState + random patches
    - Assert all previous nodes/edges preserved, new ones appended, history grows by exactly one entry
    - Test file: `src/app/store/ssm/ssm.reducer.spec.ts`
    - **Validates: Requirements 4.2, 4.3, 14.3**

  - [x] 4.8 Write property test: SSM Reset Restores Initial State
    - **Property 6: SSM Reset Restores Initial State**
    - Generate random non-empty ISSMState, dispatch resetSSM
    - Assert result equals initialSSMState
    - Test file: `src/app/store/ssm/ssm.reducer.spec.ts`
    - **Validates: Requirements 4.5**

  - [x] 4.9 Write property test: Inquiry Resolution Updates Node and History
    - **Property 13: Inquiry Resolution Updates Node and History**
    - Generate SSM with QUESTION nodes, dispatch resolveInquiry with CONFIRMED/UNKNOWN
    - Assert node status and label updated correctly, history grows by one
    - Test file: `src/app/store/ssm/ssm.reducer.spec.ts`
    - **Validates: Requirements 12.3, 12.4, 12.5**

  - [x] 4.10 Write property test: History Is Append-Only and Valid
    - **Property 14: History Is Append-Only and Valid**
    - Generate random sequences of SSM-mutating actions
    - Assert history length is monotonically non-decreasing, every entry has valid timestamp > 0, non-empty factors, non-empty actionTaken
    - Test file: `src/app/store/ssm/ssm.reducer.spec.ts`
    - **Validates: Requirements 14.2, 14.4**

  - [x] 4.11 Implement Strategy store slice
    - Create `src/app/store/strategy/strategy.actions.ts` with `updateStrategy`, `updatePacerDelay`
    - Create `src/app/store/strategy/strategy.reducer.ts` with initial state (name: 'Balanced', weights: {1,1,1}, pacerDelay: 500)
    - Create `src/app/store/strategy/strategy.selectors.ts` with `selectStrategy`, `selectWeights`, `selectPacerDelay`
    - Register slice in app.config.ts
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.12 Write property test: Strategy Update Replaces Values
    - **Property 17: Strategy Update Replaces Values**
    - Generate random weight/delay values
    - Assert updateStrategy replaces weights, updatePacerDelay replaces delay, selectors return new values
    - Test file: `src/app/store/strategy/strategy.reducer.spec.ts`
    - **Validates: Requirements 5.2, 5.3**

  - [x] 4.13 Implement Engine FSM store slice
    - Create `src/app/store/engine/engine.actions.ts` with `engineStart`, `enginePause`, `engineInquiry`, `engineResolved`, `engineReset`
    - Create `src/app/store/engine/engine.reducer.ts` with FSM transitions per design (IDLE↔THINKING, THINKING→INQUIRY, THINKING→RESOLVED, any→IDLE on reset)
    - Create `src/app/store/engine/engine.selectors.ts` with `selectEngineState`
    - Register slice in app.config.ts
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 4.14 Write property test: Engine FSM Transition Correctness
    - **Property 15: Engine FSM Transition Correctness**
    - Generate random (state, action) pairs
    - Assert: reset→IDLE from any state, start from IDLE→THINKING, inquiry from THINKING→INQUIRY, resolved from THINKING→RESOLVED, pause from THINKING→IDLE, inquiry-answered from INQUIRY→IDLE
    - Test file: `src/app/store/engine/engine.reducer.spec.ts`
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.6, 11.7**

- [x] 5. Checkpoint — Verify all store slices and PBT tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement services and orchestrator
  - [x] 6.1 Implement SSM Serializer Service
    - Create `src/app/services/ssm-serializer.service.ts` with `serialize(state)` and `deserialize(json)` methods
    - Implement structural validation on deserialize (nodes[], edges[], history[] arrays, isRunning/waitingForUser booleans, node field validation)
    - Return `{ error: string }` for invalid input, never throw
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 6.2 Write property test: SSM Serialization Round-Trip
    - **Property 1: SSM Serialization Round-Trip**
    - Generate random ISSMState with 0–20 nodes, 0–20 edges, 0–10 history entries
    - Assert serialize then deserialize produces deeply equal ISSMState
    - Test file: `src/app/services/ssm-serializer.service.spec.ts`
    - **Validates: Requirements 16.1, 16.2, 16.3**

  - [x] 6.3 Write property test: Invalid JSON Deserialization Returns Error
    - **Property 16: Invalid JSON Deserialization Returns Error**
    - Generate random non-JSON strings and structurally invalid JSON
    - Assert deserialize returns descriptive error string, does not throw
    - Test file: `src/app/services/ssm-serializer.service.spec.ts`
    - **Validates: Requirements 16.4**

  - [x] 6.4 Implement Heartbeat Pacer Service
    - Create `src/app/services/pacer.service.ts` with BehaviorSubject-based mode$/delay$ and derived pulse$ observable
    - Implement Run mode: continuous timer with switchMap on delay changes
    - Implement Step mode: emit one pulse then auto-pause
    - Implement Pause mode: emit EMPTY
    - Implement setDelay with clamping to [0, 2000] ms
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.5 Write unit tests for Pacer Service
    - Test Step mode emits exactly one pulse then pauses
    - Test Pause mode emits zero pulses
    - Test Run mode emits continuously (timing-based with fakeAsync)
    - Test delay change takes effect within one cycle
    - Test delay clamping to [0, 2000]
    - Test file: `src/app/services/pacer.service.spec.ts`
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.6 Implement Inference Engine Service (Orchestrator)
    - Create `src/app/services/inference-engine.service.ts` with `orchestrate$` observable
    - Wire pulse$ → withLatestFrom(store selectors) → filter(THINKING state) → Triple-Operator cycle
    - Implement PATCH dispatch path: applyPatch with reasoningStep
    - Implement STATUS_UPGRADE_PATCH dispatch path: applyStatusUpgrade with reasoningStep
    - Implement INQUIRY_REQUIRED dispatch path: openInquiry + engineInquiry + pacer.pause()
    - Implement empty goals path: engineResolved + pacer.pause()
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 12.1, 12.2_

  - [x] 6.7 Write unit tests for Inference Engine Service
    - Test operator call order: Goal Generator → Search Operator → Knowledge Operator
    - Test PATCH result triggers correct store dispatch with reasoningStep
    - Test INQUIRY_REQUIRED triggers pause + QUESTION node creation + FSM transition to INQUIRY
    - Test empty goals triggers RESOLVED state + pause
    - Test STATUS_UPGRADE_PATCH triggers applyStatusUpgrade dispatch
    - Test file: `src/app/services/inference-engine.service.spec.ts`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 7. Checkpoint — Verify all services and orchestrator tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integration tests and final wiring
  - [x] 8.1 Wire all store slices and services into app.config.ts
    - Ensure all feature stores are registered with provideStore
    - Ensure InferenceEngineService orchestrate$ is subscribed on app init
    - Verify the full app compiles and bootstraps without errors
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 8.2 Write integration tests for multi-pulse scenario
    - Load fixtures, run 3–5 pulses, verify SSM grows with HYPOTHESIS nodes
    - Verify multi-hypothesis spawning (Fever → Bacterial Meningitis + Influenza)
    - Test file: `src/app/services/inference-engine.service.spec.ts`
    - _Requirements: 10.1, 10.2, 10.5, 8.2_

  - [x] 8.3 Write integration tests for inquiry and UNKNOWN flows
    - Run until INQUIRY, answer question with CONFIRMED, resume, verify SSM reflects answer
    - Run until INQUIRY, mark UNKNOWN, resume, verify UNKNOWN_Anchor_Penalty suppresses downstream goals
    - Test file: `src/app/services/inference-engine.service.spec.ts`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 13.1, 13.2, 13.3, 13.4_

  - [x] 8.4 Write integration test for confirmation chain
    - Set up scenario with HYPOTHESIS nodes having CONFIRMED_BY edges
    - Verify STATUS_UPGRADE goals fire and promote nodes through transitive chain
    - Test file: `src/app/services/inference-engine.service.spec.ts`
    - _Requirements: 10.5, 6.1_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required — no optional tasks
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate the 17 universal correctness properties defined in the design document using fast-check
- Unit tests validate specific examples, edge cases, and timing-dependent behavior
- Integration tests validate multi-pulse scenarios and end-to-end flows
- All operators are pure functions — test them in isolation before wiring into the store/orchestrator
- The implementation language is TypeScript (Angular v19+ with NgRx)
