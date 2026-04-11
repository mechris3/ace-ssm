/**
 * @fileoverview Strategy Store Actions — updating inference heuristic weights and timing.
 *
 * The Strategy controls how the Search Operator scores goals. These actions
 * allow the user to change the strategy name, weights, and pacer delay
 * at runtime. Changes take effect on the next pulse.
 *
 * @remarks
 * DESIGN DECISION: Strategy updates are split into two actions (`updateStrategy`
 * for name + weights, `updatePacerDelay` for timing) because they serve
 * different purposes. Weight changes affect scoring; delay changes affect
 * timing. Splitting them allows the UI to update one without touching the other.
 */

import { createAction, props } from '@ngrx/store';
import { IStrategyWeights } from '../../models/strategy.model';

/**
 * Updates the strategy name and heuristic weights.
 *
 * The new name will be stamped on all subsequent ReasoningSteps.
 * The new weights will affect the Search Operator's scoring formula
 * starting from the next pulse.
 *
 * Triggered by: User changing strategy settings in the UI.
 */
export const updateStrategy = createAction(
  '[Strategy] Update Strategy',
  props<{ name: string; weights: IStrategyWeights }>()
);

/**
 * Updates the pacer delay (time between heartbeat pulses).
 *
 * The new delay takes effect on the next timer cycle. The Pacer service
 * clamps the value to [0, 2000] ms.
 *
 * Triggered by: User adjusting the speed slider in the UI.
 */
export const updatePacerDelay = createAction(
  '[Strategy] Update Pacer Delay',
  props<{ pacerDelay: number }>()
);
