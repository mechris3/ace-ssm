/**
 * @fileoverview Strategy Reducer — state management for inference heuristic configuration.
 *
 * The Strategy slice stores the named strategy (weights + pacer delay) that
 * controls the Search Operator's scoring behavior. Updates are simple
 * replacements — no validation is needed because strategy weights are
 * intentionally unbounded.
 *
 * @remarks
 * DESIGN DECISION: No validation on weights — they are unbounded by design.
 * Users should be able to set any non-negative value to control the relative
 * importance of urgency, parsimony, and cost aversion. The scoring formula
 * handles any values gracefully (it's a linear combination).
 */

import { createReducer, on } from '@ngrx/store';
import { IStrategy, initialStrategy } from '../../models/strategy.model';
import * as StrategyActions from './strategy.actions';

/** NgRx feature key for the Strategy store slice. */
export const strategyFeatureKey = 'strategy';

export const strategyReducer = createReducer(
  initialStrategy,

  /**
   * Replace the strategy name and weights.
   * Preserves the current `pacerDelay` (only name + weights are updated).
   */
  on(StrategyActions.updateStrategy, (state, { name, weights }) => ({
    ...state,
    name,
    weights,
  })),

  /**
   * Replace the pacer delay.
   * Preserves the current name and weights (only delay is updated).
   */
  on(StrategyActions.updatePacerDelay, (state, { pacerDelay }) => ({
    ...state,
    pacerDelay,
  })),
);
