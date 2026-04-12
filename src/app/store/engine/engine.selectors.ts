/**
 * @fileoverview Engine FSM Selectors — read-only projections of the engine state.
 *
 * Exposes the current FSM state to consumers. The Inference Engine uses
 * `selectEngineState` in its `filter()` to gate pulse processing — only
 * THINKING state allows the Triple-Operator cycle to execute.
 */

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { EngineSliceState, engineFeatureKey } from './engine.reducer';

/** Selects the entire engine FSM slice from the store. */
export const selectEngineSlice = createFeatureSelector<EngineSliceState>(engineFeatureKey);

/**
 * Selects the current engine FSM state (IDLE, THINKING, INQUIRY, or RESOLVED).
 *
 * Used by the Inference Engine's `filter()` operator to gate pulse processing —
 * pulses are only processed when the engine is in THINKING state. Also used by
 * UI components to show appropriate controls (e.g., disable "Run" when already THINKING).
 */
export const selectEngineState = createSelector(
  selectEngineSlice,
  (slice) => slice.state
);

/**
 * Selects the currently active goal from the engine store slice.
 * Used by the SSM Graph Component to apply the Searchlight Effect
 * to the anchor node of the active goal.
 */
export const selectActiveGoal = createSelector(
  selectEngineSlice,
  (slice) => slice.activeGoal
);

/**
 * Selects the solution focus node ID — the root of the currently pursued
 * SSM subgraph (candidate solution).
 * [Ref: Paper 1 Sec 3.2.3 / Gap 2 - Global Strategic Principles (S_G)]
 */
export const selectSolutionFocusNodeId = createSelector(
  selectEngineSlice,
  (slice) => slice.solutionFocusNodeId
);
