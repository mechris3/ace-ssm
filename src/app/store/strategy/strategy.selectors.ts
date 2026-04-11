/**
 * @fileoverview Strategy Selectors — read-only projections of the inference strategy.
 *
 * These selectors expose the current strategy configuration to consumers.
 * The Inference Engine uses `selectStrategy` to provide the full strategy
 * to the Search Operator. The Pacer service (or UI) can use `selectPacerDelay`
 * to read the current timing configuration.
 */

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { IStrategy } from '../../models/strategy.model';
import { strategyFeatureKey } from './strategy.reducer';

/** Selects the entire Strategy slice from the store. */
export const selectStrategyState = createFeatureSelector<IStrategy>(strategyFeatureKey);

/**
 * Selects the complete strategy object (name, weights, pacerDelay).
 *
 * Used by the Inference Engine's `withLatestFrom` to provide the strategy
 * to the Search Operator for goal scoring.
 */
export const selectStrategy = createSelector(
  selectStrategyState,
  (state) => state
);

/**
 * Selects just the heuristic weights.
 * Useful for UI components that display or edit weight sliders.
 */
export const selectWeights = createSelector(
  selectStrategyState,
  (state) => state.weights
);

/**
 * Selects just the pacer delay value.
 * Useful for the speed slider UI and the Pacer service.
 */
export const selectPacerDelay = createSelector(
  selectStrategyState,
  (state) => state.pacerDelay
);
