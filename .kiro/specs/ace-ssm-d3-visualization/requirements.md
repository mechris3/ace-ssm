# Requirements Document: ACE-SSM D3 Visualization Layer

## Introduction

The D3 Visualization Layer is the user-facing interface for the ACE-SSM Glass Box inference engine. It transforms the NgRx store state into a reactive, three-column dashboard that makes the engine's reasoning process visible, controllable, and auditable. The visualization must treat the NgRx store as the absolute source of truth, projecting state changes through D3's enter/update/exit pattern without maintaining local graph state. All UI components use OnPush change detection and communicate through a Facade service that coordinates the Store and PacerService.

## Glossary

- **SSM_Graph_Component**: The D3.js force-directed graph renderer that projects SSM nodes and edges from the NgRx store onto an SVG canvas.
- **Control_Bar**: The top horizontal bar containing engine playback controls (Run, Step, Pause, Reset) and the Pacer speed slider.
- **Domain_Console**: The collapsible left sidebar for loading Task Structure JSON, Knowledge Base JSON, seeding initial findings, and configuring the Reset-on-Load policy.
- **Strategy_Panel**: The section within the left sidebar containing heuristic weight sliders (Urgency, Parsimony, Cost Aversion).
- **Node_Inspector**: The upper section of the right sidebar displaying details of the currently selected SSM node.
- **Audit_Trail**: The lower section of the right sidebar displaying the reasoning history as a rich timeline with impact bars and prose summaries.
- **Inquiry_Overlay**: The HTML overlay panel that appears over the SSM Workspace when the engine enters INQUIRY state, presenting the user with resolution options.
- **Facade_Service**: An Angular service that wraps the NgRx Store and PacerService, exposing high-level methods and a combined viewModel$ observable to UI components.
- **Searchlight_Effect**: A soft pulsing CSS halo animation applied to the anchor node of the engine's currently active goal.
- **Status_Bar**: The bottom horizontal bar displaying engine state, node/edge counts, pulse delay, and a heartbeat indicator.
- **Heartbeat_Indicator**: A small visual pulse animation in the Status Bar that flashes each time an inference pulse completes.
- **Node_Selection**: The act of clicking an SSM node in the graph, which dispatches a selectNode action and populates the Node Inspector.
- **Cross_Link**: The bidirectional interaction where clicking an Audit Trail step highlights the corresponding graph node, and clicking a graph node scrolls the Audit Trail to related steps.
- **Active_Goal**: A persistent field in the Engine store slice that holds the currently selected goal during a pulse, used by the Searchlight Effect.

## Requirements

### Requirement 1: Facade Service

**User Story:** As a developer, I want a single Facade service that coordinates the NgRx Store and PacerService, so that UI components remain purely presentational and never directly access the store or pacer.

#### Acceptance Criteria

1. THE Facade_Service SHALL expose a `run()` method that dispatches `engineStart` and calls `pacer.run()` in a single invocation.
2. THE Facade_Service SHALL expose a `pause()` method that dispatches `enginePause` and calls `pacer.pause()` in a single invocation.
3. THE Facade_Service SHALL expose a `step()` method that dispatches `engineStart` and calls `pacer.step()` in a single invocation.
4. THE Facade_Service SHALL expose a `reset()` method that dispatches `engineReset`, dispatches `resetSSM`, and calls `pacer.pause()` in a single invocation.
5. THE Facade_Service SHALL expose a `setSpeed(ms)` method that dispatches `updatePacerDelay` and calls `pacer.setDelay(ms)` in a single invocation.
6. THE Facade_Service SHALL expose a `viewModel$` observable that combines the SSM state, engine state, strategy, active goal, and selected node into a single emission using NgRx selectors.
7. THE Facade_Service SHALL expose methods for loading Task Structure JSON, Knowledge Base JSON, and seeding initial findings by dispatching the corresponding store actions.
8. THE Facade_Service SHALL expose a method for resolving inquiries that dispatches the `resolveInquiry` action and transitions the engine from INQUIRY to IDLE via `engineInquiryAnswered`.
9. THE Facade_Service SHALL expose a method for updating strategy weights that dispatches `updateStrategy` with the new name and weights.

### Requirement 2: Dashboard Layout

**User Story:** As a user, I want a three-column dashboard layout with a top control bar and bottom status bar, so that I can simultaneously view the reasoning graph, control the engine, and inspect the audit trail.

#### Acceptance Criteria

1. THE Dashboard SHALL render a three-column layout using CSS Grid with a collapsible left sidebar, a center workspace, and a right sidebar.
2. THE Dashboard SHALL render a Control_Bar at the top of the layout containing all engine playback controls and the Pacer speed slider.
3. THE Dashboard SHALL render a Status_Bar at the bottom of the layout displaying the current engine FSM state, total node count, total edge count, and current pulse delay.
4. THE Dashboard SHALL use CSS Variables for all status colors, defined as root-level custom properties: `--color-confirmed`, `--color-hypothesis`, `--color-question`, `--color-unknown`.
5. THE Dashboard SHALL use a Clinical Slate color palette with deep slate backgrounds (`#1a1c1e`), dark gray borders (`#3f444d`), and Logic Blue (`#00a3ff`) as the primary action color.
6. THE Dashboard SHALL use plain CSS (no Tailwind, no component libraries) with CSS Grid and Flexbox for all layout and styling.
7. THE Dashboard SHALL use a monospaced font for the Audit Trail and entity ID labels.
8. WHILE the left sidebar is collapsed, THE Dashboard SHALL expand the center workspace to fill the available horizontal space.

### Requirement 3: Control Bar

**User Story:** As a user, I want playback controls and a speed slider in a top bar, so that I can start, stop, step through, and reset the inference engine at my preferred pace.

#### Acceptance Criteria

1. THE Control_Bar SHALL display four buttons: Run, Step, Pause, and Reset.
2. WHEN the user clicks the Run button, THE Control_Bar SHALL call `Facade_Service.run()`.
3. WHEN the user clicks the Step button, THE Control_Bar SHALL call `Facade_Service.step()`.
4. WHEN the user clicks the Pause button, THE Control_Bar SHALL call `Facade_Service.pause()`.
5. WHEN the user clicks the Reset button, THE Control_Bar SHALL call `Facade_Service.reset()`.
6. THE Control_Bar SHALL display a Pacer speed slider with a range of 0ms to 2000ms.
7. WHEN the user adjusts the Pacer speed slider, THE Control_Bar SHALL call `Facade_Service.setSpeed(ms)` with the slider value.
8. WHILE the engine state is THINKING, THE Control_Bar SHALL visually disable the Run and Step buttons.
9. WHILE the engine state is IDLE, THE Control_Bar SHALL visually disable the Pause button.
10. WHILE the engine state is INQUIRY, THE Control_Bar SHALL visually disable the Run, Step, and Pause buttons.

### Requirement 4: Domain Console (Left Sidebar)

**User Story:** As a developer, I want a collapsible sidebar where I can paste Task Structure and Knowledge Base JSON and seed initial findings, so that I can swap domains without code changes.

#### Acceptance Criteria

1. THE Domain_Console SHALL provide a textarea for pasting Task Structure JSON and a "Load" button that dispatches the load action via the Facade_Service.
2. THE Domain_Console SHALL provide a textarea for pasting Knowledge Base JSON and a "Load" button that dispatches the load action via the Facade_Service.
3. THE Domain_Console SHALL provide a single-row form with a text input for the finding label, a dropdown for the entity type (populated from the loaded Task Structure's entity types), and an "Add" button.
4. WHEN the user clicks the "Add" button, THE Domain_Console SHALL call the Facade_Service to dispatch an `applyPatch` action with a new CONFIRMED node using the entered label and selected type.
5. THE Domain_Console SHALL provide a "Reset on Load" toggle that is checked by default.
6. WHILE the "Reset on Load" toggle is checked, WHEN the user loads a new Task Structure or Knowledge Base, THE Domain_Console SHALL dispatch `resetSSM` before dispatching the load action.
7. IF the store rejects a load action due to validation failure, THEN THE Domain_Console SHALL display the validation error message in a visible red alert within the sidebar.
8. THE Domain_Console SHALL be collapsible via a toggle button, hiding its content while preserving the center workspace layout.

### Requirement 5: Strategy Panel (Left Sidebar)

**User Story:** As a user, I want real-time sliders for the three heuristic weights, so that I can change the engine's reasoning personality and see the effect on the next pulse.

#### Acceptance Criteria

1. THE Strategy_Panel SHALL display three labeled sliders: Urgency, Parsimony, and Cost Aversion.
2. WHEN the user adjusts any weight slider, THE Strategy_Panel SHALL call `Facade_Service.updateStrategy()` with the updated weights and a derived strategy name.
3. THE Strategy_Panel SHALL display the current numeric value next to each slider.
4. WHEN the strategy weights are updated, THE Facade_Service SHALL dispatch the `updateStrategy` action so that the Search Operator uses the new weights on the very next pulse.

### Requirement 6: SSM Graph Rendering

**User Story:** As a user, I want to see the SSM as a live force-directed graph, so that I can visually observe the engine building its reasoning model in real time.

#### Acceptance Criteria

1. THE SSM_Graph_Component SHALL render all SSM nodes from the store as SVG circle elements in a force-directed layout using D3's force simulation.
2. THE SSM_Graph_Component SHALL render all SSM edges from the store as SVG line or path elements with arrowhead markers (`marker-end`) indicating edge direction.
3. THE SSM_Graph_Component SHALL render the `relationType` of each edge as a text label along the edge path.
4. THE SSM_Graph_Component SHALL render the `label` of each node as a text element adjacent to the node circle.
5. THE SSM_Graph_Component SHALL color each node according to its status using the CSS Variables: CONFIRMED nodes use `--color-confirmed`, HYPOTHESIS nodes use `--color-hypothesis`, QUESTION nodes use `--color-question`, UNKNOWN nodes use `--color-unknown`.
6. WHEN the SSM state changes in the store, THE SSM_Graph_Component SHALL update the graph using D3's enter/update/exit pattern: `enter()` creates new node and edge elements, the update selection updates status colors and labels, and `exit()` removes elements on SSM reset.
7. THE SSM_Graph_Component SHALL render a subtle grid-dot background pattern on the SVG canvas.
8. THE SSM_Graph_Component SHALL support D3 drag behavior on nodes for repositioning, keeping drag position local to the D3 simulation without dispatching store actions.
9. THE SSM_Graph_Component SHALL maintain zero local component state for graph data — all node and edge data is read exclusively from NgRx selectors via the Facade_Service.

### Requirement 7: Node Selection and Inspector

**User Story:** As a user, I want to click a node in the graph and see its full details in a dedicated inspector panel, so that I can examine the engine's reasoning about any specific entity.

#### Acceptance Criteria

1. WHEN the user clicks a node in the SSM_Graph_Component, THE SSM_Graph_Component SHALL dispatch a `selectNode` action via the Facade_Service with the clicked node's ID.
2. WHILE a node is selected, THE Node_Inspector SHALL display the node's ID, label, type, and status.
3. WHILE a node is selected, THE Node_Inspector SHALL display a "Links" section listing all incoming and outgoing edges with their relation types and connected node labels.
4. WHILE no node is selected, THE Node_Inspector SHALL display a system overview showing the total number of HYPOTHESIS nodes, CONFIRMED nodes, QUESTION nodes, and UNKNOWN nodes.
5. THE Node_Inspector SHALL provide a "Clear Selection" button that deselects the current node.
6. WHEN the user clicks a different node, THE Node_Inspector SHALL update to show the newly selected node's details.

### Requirement 8: Active Goal and Searchlight Effect

**User Story:** As a user, I want to see which node the engine is currently focused on via a pulsing halo, so that I can follow the engine's "train of thought" in real time.

#### Acceptance Criteria

1. THE Engine store slice SHALL include an `activeGoal` field that persists the currently selected goal during a pulse.
2. WHEN the Inference Engine selects a winning goal during a pulse, THE Inference Engine SHALL dispatch an action to set the `activeGoal` in the Engine store slice.
3. WHEN the `activeGoal` changes in the store, THE SSM_Graph_Component SHALL apply a soft pulsing CSS halo animation (the Searchlight_Effect) to the SVG element representing the `anchorNodeId` of the active goal.
4. WHEN the `activeGoal` becomes null (on engine reset or resolution), THE SSM_Graph_Component SHALL fade out the Searchlight_Effect.
5. THE Searchlight_Effect SHALL use a CSS animation with a smooth scaling halo, not a jarring blink.

### Requirement 9: Audit Trail

**User Story:** As a user, I want a rich timeline of the engine's reasoning history with impact bars and prose summaries, so that I can understand exactly why the engine made each decision.

#### Acceptance Criteria

1. THE Audit_Trail SHALL render each `IReasoningStep` from the SSM history as a card displaying the `actionTaken` text, the `totalScore`, and the `strategyName`.
2. THE Audit_Trail SHALL render a horizontal bar chart for each step's `factors[]` array, using green bars for positive impact values and red bars for negative impact values.
3. THE Audit_Trail SHALL render a prose summary for each step that describes the winning goal and the dominant factor (e.g., "Selected [Goal] because [Highest Factor] was dominant").
4. THE Audit_Trail SHALL subscribe to a selector that returns the most recent 20 reasoning steps to keep the DOM performant.
5. WHEN a new reasoning step is appended to the history, THE Audit_Trail SHALL auto-scroll to the bottom of the list.
6. WHILE the user has manually scrolled up to inspect an earlier step, THE Audit_Trail SHALL suppress auto-scrolling until the user scrolls back to the bottom.
7. WHEN the user clicks a step in the Audit_Trail, THE SSM_Graph_Component SHALL highlight the corresponding anchor node of that step's selected goal.

### Requirement 10: Inquiry Overlay

**User Story:** As a user, I want a prominent overlay panel when the engine needs my input, so that I can resolve QUESTION nodes and allow reasoning to continue.

#### Acceptance Criteria

1. WHILE the engine state is INQUIRY, THE Inquiry_Overlay SHALL appear as an HTML div positioned over the SSM Workspace at a higher z-index than the SVG canvas.
2. THE Inquiry_Overlay SHALL display the inquiry question in human-readable form using the `targetRelation` and `anchorLabel` from the goal (e.g., "Does [anchorLabel] [targetRelation] the current condition?").
3. THE Inquiry_Overlay SHALL display three resolution buttons: "Yes (Confirm)", "No (Refute)", and "Unknown".
4. WHEN the user clicks "Yes (Confirm)", THE Inquiry_Overlay SHALL reveal a text input with autocomplete suggestions sourced from Knowledge Base fragment labels.
5. WHEN the user submits a confirmed label, THE Inquiry_Overlay SHALL call `Facade_Service.resolveInquiry()` with `newStatus: 'CONFIRMED'` and the entered label as `newLabel`.
6. WHEN the user clicks "No (Refute)", THE Inquiry_Overlay SHALL call `Facade_Service.resolveInquiry()` with `newStatus: 'UNKNOWN'` and a reasoning step labeled "User refuted this path".
7. WHEN the user clicks "Unknown", THE Inquiry_Overlay SHALL call `Facade_Service.resolveInquiry()` with `newStatus: 'UNKNOWN'` and a reasoning step labeled "User was unsure".
8. WHILE the Inquiry_Overlay is visible, THE SSM_Graph_Component SHALL apply the Searchlight_Effect to both the QUESTION node and its parent node.
9. WHEN the inquiry is resolved, THE Inquiry_Overlay SHALL disappear immediately and the Facade_Service SHALL transition the engine back to IDLE.
10. THE Inquiry_Overlay SHALL use the Amber color variable (`--color-inquiry-amber`) for its border and accent to signal a system intervention requiring immediate attention.

### Requirement 11: Status Bar

**User Story:** As a user, I want a persistent status bar showing the engine's operational state, so that I can always know whether the engine is thinking, waiting, or finished.

#### Acceptance Criteria

1. THE Status_Bar SHALL display the current engine FSM state (IDLE, THINKING, INQUIRY, or RESOLVED) as a labeled badge.
2. THE Status_Bar SHALL display the total count of nodes in the SSM.
3. THE Status_Bar SHALL display the total count of edges in the SSM.
4. THE Status_Bar SHALL display the current Pacer delay in milliseconds.
5. THE Status_Bar SHALL display a Heartbeat_Indicator that flashes each time an inference pulse completes.
6. WHEN the engine state is RESOLVED, THE Status_Bar SHALL display the state badge with a distinct visual treatment indicating completion.

### Requirement 12: Cross-Linking Between Graph and Audit Trail

**User Story:** As a user, I want clicking an audit trail step to highlight the relevant graph node and clicking a graph node to scroll to related audit trail entries, so that I can trace reasoning bidirectionally.

#### Acceptance Criteria

1. WHEN the user clicks a step in the Audit_Trail, THE SSM_Graph_Component SHALL visually highlight the anchor node of that step's selected goal using a temporary emphasis effect distinct from the Searchlight.
2. WHEN the user clicks a node in the SSM_Graph_Component, THE Audit_Trail SHALL scroll to the most recent reasoning step that references that node's ID as the `anchorNodeId`.
3. WHEN the user selects a different node or audit trail step, THE previous highlight or scroll position SHALL be cleared.

### Requirement 13: Angular Component Architecture

**User Story:** As a developer, I want all visualization components to use OnPush change detection and standalone component patterns, so that the UI remains performant under high-frequency engine pulses.

#### Acceptance Criteria

1. THE Dashboard, Control_Bar, Domain_Console, Strategy_Panel, SSM_Graph_Component, Node_Inspector, Audit_Trail, Inquiry_Overlay, and Status_Bar SHALL each be implemented as standalone Angular components with `ChangeDetectionStrategy.OnPush`.
2. THE SSM_Graph_Component SHALL use `OnPush` change detection and subscribe to NgRx selectors via the Facade_Service, triggering D3 updates only when the store emits new state.
3. THE Facade_Service SHALL be provided at the root level (`providedIn: 'root'`) as a singleton service.
4. THE AppComponent SHALL compose the dashboard layout by rendering the Dashboard component, which in turn renders all child components.
