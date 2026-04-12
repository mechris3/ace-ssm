# Implementation Plan: ACE-SSM D3 Visualization Layer

## Overview

This plan implements the D3 Visualization Layer as a reactive three-column dashboard on top of the existing ACE-SSM NgRx store. Tasks follow the dependency chain: store modifications → FacadeService → CSS architecture → dashboard shell → simple components → D3 graph → inspector/audit → inquiry overlay → cross-linking → integration wiring. All components use OnPush change detection and communicate exclusively through the FacadeService.

## Tasks

- [x] 1. Install D3.js and extend the Engine store slice
  - [x] 1.1 Install D3.js v7 and type definitions
    - Run `npm install d3` and `npm install --save-dev @types/d3`
    - Verify the packages are added to `package.json`
    - _Requirements: 6.1, 8.1_

  - [x] 1.2 Add `activeGoal` to Engine store slice
    - Add `activeGoal: IGoal | null` field to `EngineSliceState` in `src/app/store/engine/engine.reducer.ts`
    - Update `initialEngineState` to include `activeGoal: null`
    - Add `setActiveGoal` action to `src/app/store/engine/engine.actions.ts` with `props<{ goal: IGoal | null }>()`
    - Add reducer handler: `on(EngineActions.setActiveGoal, (s, { goal }) => ({ ...s, activeGoal: goal }))`
    - Modify `engineReset` handler to clear `activeGoal: null`
    - Modify `engineResolved` handler to clear `activeGoal: null`
    - Add `selectActiveGoal` selector to `src/app/store/engine/engine.selectors.ts`
    - _Requirements: 8.1, 8.2_

  - [x] 1.3 Add Audit Trail selectors to SSM selectors
    - Add `selectRecentHistory` selector returning `history.slice(-50)` to `src/app/store/ssm/ssm.selectors.ts`
    - Add `selectRenderedHistory` selector returning `history.slice(-20)` to `src/app/store/ssm/ssm.selectors.ts`
    - _Requirements: 9.4_

  - [x] 1.4 Modify InferenceEngineService to dispatch `setActiveGoal`
    - In `processPulse()`, after `scoreGoals()` returns and before `resolveGoal()`, dispatch `EngineActions.setActiveGoal({ goal: selectedGoal })`
    - In the `goals.length === 0` branch, dispatch `EngineActions.setActiveGoal({ goal: null })` before `engineResolved()`
    - _Requirements: 8.2_

- [x] 2. Checkpoint — Verify store modifications compile
  - Ensure the project compiles with `ng build` and all existing tests pass. Ask the user if questions arise.

- [x] 3. Implement FacadeService
  - [x] 3.1 Create the FacadeService
    - Create `src/app/services/facade.service.ts` as an `@Injectable({ providedIn: 'root' })` service
    - Inject `Store` and `PacerService`
    - Implement command methods: `run()`, `pause()`, `step()`, `reset()`, `setSpeed(ms)`
    - Implement `loadTaskStructure(json)`, `loadKnowledgeBase(json)`, `seedFinding(label, type)`
    - Implement `resolveInquiry(nodeId, newStatus, newLabel, auditText)` — dispatches `resolveInquiry` action + `engineInquiryAnswered`
    - Implement `updateStrategy(weights)` — derives strategy name from weights + dispatches `updateStrategy`
    - Implement `selectNode(nodeId | null)` — updates a local `BehaviorSubject<string | null>` (not NgRx)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9_

  - [x] 3.2 Implement the `viewModel$` observable
    - Combine SSM state, engine state, active goal, strategy, selected node ID, task structure loaded/error, KB loaded/error, and entity types into a single `IViewModel` emission using `combineLatest` with NgRx selectors and the local `selectedNodeId$` BehaviorSubject
    - Export the `IViewModel` interface
    - _Requirements: 1.6_

  - [x] 3.3 Write unit tests for FacadeService
    - Test that `run()` dispatches `engineStart` and calls `pacer.run()`
    - Test that `pause()` dispatches `enginePause` and calls `pacer.pause()`
    - Test that `reset()` dispatches `engineReset`, `resetSSM`, and calls `pacer.pause()`
    - Test that `resolveInquiry()` dispatches both `resolveInquiry` and `engineInquiryAnswered`
    - Test that `selectNode()` updates the BehaviorSubject and emits through `viewModel$`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8_

- [x] 4. Create CSS architecture and global styles
  - [x] 4.1 Create global CSS variables and animations
    - Create `src/styles/variables.css` with the full Clinical Slate palette, status colors, action colors, impact bar colors, searchlight color, layout dimensions, and typography variables as defined in the design
    - Create `src/styles/animations.css` with `@keyframes searchlight-pulse`, `@keyframes heartbeat-flash`, and any shared transition utilities
    - Import both files in `src/styles.css`
    - _Requirements: 2.4, 2.5, 2.6, 8.5_

  - [x] 4.2 Create dashboard grid layout styles
    - Create `src/app/components/dashboard/dashboard.component.css` with the CSS Grid layout: 3 columns (`--sidebar-left-width 1fr --sidebar-right-width`), 3 rows (`--control-bar-height 1fr --status-bar-height`), `height: 100vh`, `overflow: hidden`
    - Include the collapsed sidebar rule where `--sidebar-left-width` becomes `0px`
    - _Requirements: 2.1, 2.6, 2.8_

- [x] 5. Implement DashboardComponent shell
  - Create `src/app/components/dashboard/dashboard.component.ts` as a standalone OnPush component
  - Inject `FacadeService` and subscribe to `viewModel$`
  - Render the CSS Grid shell with named grid areas for all child components
  - Pass sliced viewModel data as inputs to each child component
  - Wire child component outputs to FacadeService command methods
  - Update `AppComponent` to import and render `DashboardComponent` (replace the placeholder `<h1>` tag)
  - _Requirements: 2.1, 2.2, 2.3, 13.1, 13.4_

- [x] 6. Implement simple sidebar and bar components
  - [x] 6.1 Implement ControlBarComponent
    - Create `src/app/components/control-bar/control-bar.component.ts` as standalone OnPush
    - Inputs: `engineState`, `pacerDelay`
    - Outputs: `onRun`, `onStep`, `onPause`, `onReset`, `onSpeedChange`
    - Render four buttons (Run, Step, Pause, Reset) with disabled states derived from `engineState`
    - Render a range slider (0–2000ms) for pacer speed
    - Create `control-bar.component.css` with button styling using CSS variables
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 13.1_

  - [x] 6.2 Implement StatusBarComponent
    - Create `src/app/components/status-bar/status-bar.component.ts` as standalone OnPush
    - Inputs: `engineState`, `nodeCount`, `edgeCount`, `pacerDelay`
    - Render engine state badge (color-coded: IDLE=gray, THINKING=blue, INQUIRY=amber, RESOLVED=green)
    - Render node count, edge count, pacer delay display
    - Render heartbeat indicator with CSS animation class toggled on reasoning step emission
    - Create `status-bar.component.css`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 13.1_

  - [x] 6.3 Implement StrategyPanelComponent
    - Create `src/app/components/strategy-panel/strategy-panel.component.ts` as standalone OnPush
    - Inputs: `weights: IStrategyWeights`
    - Outputs: `onWeightsChange`
    - Render three labeled range sliders (0.0–5.0, step 0.1) with numeric readouts
    - Emit on every `input` event for real-time feedback
    - Create `strategy-panel.component.css`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 13.1_

  - [x] 6.4 Implement DomainConsoleComponent
    - Create `src/app/components/domain-console/domain-console.component.ts` as standalone OnPush
    - Inputs: `entityTypes`, `taskStructureError`, `kbError`
    - Outputs: `onLoadTaskStructure`, `onLoadKnowledgeBase`, `onSeedFinding`, `onResetOnLoadChange`
    - Render two textareas with "Load" buttons for Task Structure and Knowledge Base JSON
    - Render seed-finding form: text input + entity type dropdown + "Add" button
    - Render "Reset on Load" toggle (checked by default)
    - Render error display areas in red for validation failures
    - Render collapse/expand toggle button
    - Embed `StrategyPanelComponent` within the sidebar
    - Create `domain-console.component.css`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 13.1_

- [x] 7. Checkpoint — Verify shell and simple components render
  - Ensure the project compiles and the dashboard shell renders with all simple components wired. Ask the user if questions arise.

- [x] 8. Implement SSMGraphComponent with D3 force simulation
  - [x] 8.1 Create the SSMGraphComponent scaffold and D3 initialization
    - Create `src/app/components/ssm-graph/ssm-graph.component.ts` as standalone OnPush
    - Inputs: `nodes`, `edges`, `activeGoal`, `selectedNodeId`, `highlightNodeId`
    - Outputs: `onNodeClick`
    - In `ngAfterViewInit`, initialize the SVG element, create the D3 force simulation with `forceLink`, `forceManyBody(-300)`, `forceCenter`, `forceCollide(40)`
    - Render a subtle grid-dot background pattern on the SVG canvas
    - Create `ssm-graph.component.css` with SVG styling and the searchlight-active class
    - _Requirements: 6.1, 6.7, 6.9, 13.1, 13.2_

  - [x] 8.2 Implement D3 enter/update/exit pattern for nodes and edges
    - In `ngOnChanges`, implement the full enter/update/exit cycle
    - `enter()`: Create `<g>` group per node with `<circle>` + `<text>` label; create `<line>` per edge with `marker-end` arrowhead + `<text>` relation label
    - `update`: Transition fill color based on `node.status` using CSS variables; update label text
    - `exit()`: Remove elements on SSM reset
    - Define SVG `<defs>` with arrowhead marker
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 8.3 Implement D3 drag behavior and node click selection
    - Apply D3 drag to node groups — drag updates `node.fx`/`node.fy` (simulation pinning only, no store dispatch)
    - On node click, emit `onNodeClick` with the node ID
    - Apply visual selection indicator (stroke/ring) to the selected node based on `selectedNodeId` input
    - _Requirements: 6.8, 7.1_

  - [x] 8.4 Implement Searchlight Effect
    - When `activeGoal` input changes, find the SVG group for `activeGoal.anchorNodeId`
    - Apply/remove the `searchlight-active` CSS class that triggers the pulsing halo animation
    - When `activeGoal` becomes null, fade out the searchlight
    - _Requirements: 8.3, 8.4, 8.5_

- [x] 9. Implement NodeInspectorComponent
  - Create `src/app/components/node-inspector/node-inspector.component.ts` as standalone OnPush
  - Inputs: `selectedNode`, `edges`, `nodes`
  - Outputs: `onClearSelection`, `onNodeLinkClick`
  - When a node is selected: display ID (monospaced), label, type badge, status badge, and "Links" section with clickable connected-node labels
  - When no node is selected: display system overview with counts of HYPOTHESIS, CONFIRMED, QUESTION, UNKNOWN nodes
  - Render "Clear Selection" button
  - Create `node-inspector.component.css`
  - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 13.1_

- [x] 10. Implement AuditTrailComponent
  - [x] 10.1 Create AuditTrailComponent with step card rendering
    - Create `src/app/components/audit-trail/audit-trail.component.ts` as standalone OnPush
    - Inputs: `steps` (recent 20), `allSteps` (recent 50 for scroll-back)
    - Outputs: `onStepClick`
    - Render each step as a card: `actionTaken` header + `totalScore` badge + `strategyName` tag
    - Render impact bars: horizontal bar chart of `factors[]` — green for positive, red for negative, width proportional to `|impact|` relative to max absolute impact in the step
    - Render prose summary: "Selected [anchorLabel → targetRelation] because [highest-impact factor] was dominant (+[impact])"
    - Use monospaced font for entity IDs
    - Create `audit-trail.component.css`
    - _Requirements: 9.1, 9.2, 9.3, 2.7, 13.1_

  - [x] 10.2 Implement auto-scroll and scroll-back behavior
    - Auto-scroll to bottom on new step emission
    - Track `isAtBottom` flag via `scroll` event listener
    - Suppress auto-scroll when user has manually scrolled up
    - Resume auto-scroll when user scrolls back within 50px of bottom
    - Render only the most recent 20 steps in the DOM; render older steps (up to 50) on scroll-up demand
    - _Requirements: 9.4, 9.5, 9.6_

- [x] 11. Implement InquiryOverlayComponent
  - Create `src/app/components/inquiry-overlay/inquiry-overlay.component.ts` as standalone OnPush
  - Inputs: `engineState`, `activeGoal`, `questionNode`
  - Outputs: `onResolve`
  - Visible only when `engineState === INQUIRY`; positioned as absolute overlay with `z-index: 100`
  - Display question text: "Does [anchorLabel] have a [targetRelation] relationship?"
  - Render three buttons: "Yes (Confirm)", "No (Refute)", "Unknown"
  - On "Yes": reveal text input with autocomplete suggestions from KB fragment labels; submit dispatches `resolveInquiry` with CONFIRMED + entered label
  - On "No": dispatch with UNKNOWN + "User confirmed absence"
  - On "Unknown": dispatch with UNKNOWN + "User was unsure"
  - Use `--color-inquiry-amber` for border and accent
  - Create `inquiry-overlay.component.css`
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 13.1_

- [x] 12. Checkpoint — Verify all components render and interact
  - Ensure the project compiles, all components render in the dashboard, and basic interactions work (button clicks, slider changes, node selection). Ask the user if questions arise.

- [x] 13. Implement cross-linking between Graph and Audit Trail
  - [x] 13.1 Implement Audit Trail → Graph highlighting
    - When user clicks a step in the Audit Trail, emit `onStepClick` with the step
    - Dashboard passes the step's `anchorNodeId` as `highlightNodeId` to SSMGraphComponent
    - SSMGraphComponent applies a temporary emphasis effect (distinct from searchlight) to the highlighted node
    - _Requirements: 9.7, 12.1_

  - [x] 13.2 Implement Graph → Audit Trail scrolling
    - When user clicks a node in the graph, Dashboard tells AuditTrailComponent to scroll to the most recent step referencing that node's ID as `anchorNodeId`
    - Add a `scrollToNode` method or input on AuditTrailComponent
    - Clear previous highlight/scroll when a different node or step is selected
    - _Requirements: 12.2, 12.3_

- [x] 14. Integration wiring and final testing
  - [x] 14.1 Wire DashboardComponent inputs/outputs to all child components
    - Ensure all viewModel slices are correctly passed as inputs to each child component
    - Ensure all child component outputs are wired to FacadeService methods
    - Handle the "Reset on Load" toggle logic in Dashboard: when checked, call `facade.reset()` before loading new Task Structure or Knowledge Base
    - Wire the Inquiry Overlay's `questionNode` input by finding the QUESTION node from SSM nodes
    - Wire the Audit Trail's `allSteps` input from `selectRecentHistory` (50) and `steps` from `selectRenderedHistory` (20)
    - _Requirements: 1.6, 4.6, 13.4_

  - [x] 14.2 Write integration tests for the dashboard
    - Test that loading Task Structure JSON through DomainConsole dispatches the correct action
    - Test that clicking Run/Step/Pause/Reset triggers the correct FacadeService methods
    - Test that node selection in the graph updates the NodeInspector
    - Test that the InquiryOverlay appears when engine state is INQUIRY and disappears on resolution
    - Test that strategy slider changes dispatch `updateStrategy`
    - _Requirements: 1.1, 1.2, 1.3, 3.2, 3.3, 3.4, 7.1, 10.9_

- [x] 15. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, the dashboard renders correctly, and all interactions work end-to-end. Ask the user if questions arise.

## Notes

- All tasks are required — none are marked optional
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- D3 positions are local to the force simulation and never stored in NgRx
- `selectedNodeId` is local to FacadeService (BehaviorSubject), not in NgRx
- The design has no Correctness Properties section, so property-based tests are not included
- All components use `ChangeDetectionStrategy.OnPush` and standalone component patterns
