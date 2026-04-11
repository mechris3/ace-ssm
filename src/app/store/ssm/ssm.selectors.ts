/**
 * @fileoverview SSM Selectors — read-only projections of the SSM state.
 *
 * These selectors expose specific slices of the SSM state to consumers
 * (the Inference Engine, UI components, and tests). Each selector is
 * memoized by NgRx — it only recomputes when its input state changes.
 *
 * @remarks
 * DESIGN DECISION: `selectSSMState` returns the entire SSM state object.
 * This is used by the Inference Engine's `withLatestFrom` to get a complete
 * snapshot for the Triple-Operator cycle. The individual selectors (nodes,
 * edges, etc.) are provided for UI components that only need a subset.
 */

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ISSMState } from '../../models/ssm.model';
import { ssmFeatureKey } from './ssm.reducer';

/**
 * Selects the entire SSM state slice.
 * Used by the Inference Engine to get a complete snapshot for each pulse.
 */
export const selectSSMState = createFeatureSelector<ISSMState>(ssmFeatureKey);

/** Selects all nodes in the SSM graph. Used by UI components for rendering. */
export const selectAllNodes = createSelector(
  selectSSMState,
  (state) => state.nodes
);

/** Selects all edges in the SSM graph. Used by UI components for rendering. */
export const selectAllEdges = createSelector(
  selectSSMState,
  (state) => state.edges
);

/**
 * Selects the complete reasoning history.
 * Each entry is one ReasoningStep corresponding to one SSM mutation.
 * Used by the UI to display the "Glass Box" audit trail.
 */
export const selectHistory = createSelector(
  selectSSMState,
  (state) => state.history
);

/** Selects whether the engine is actively running. */
export const selectIsRunning = createSelector(
  selectSSMState,
  (state) => state.isRunning
);

/**
 * Selects whether the engine is waiting for user input (INQUIRY state).
 * When true, the UI should present the open QUESTION node for resolution.
 */
export const selectWaitingForUser = createSelector(
  selectSSMState,
  (state) => state.waitingForUser
);
