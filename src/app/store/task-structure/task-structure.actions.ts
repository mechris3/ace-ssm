/**
 * @fileoverview Task Structure Store Actions — loading and validation of the domain grammar.
 *
 * The Task Structure (Layer 1 — The Rules) is loaded once at startup and
 * treated as immutable thereafter. These actions handle the load lifecycle:
 * validate → success or failure.
 *
 * @remarks
 * DESIGN DECISION: `loadTaskStructure` performs inline validation in the
 * reducer (checking that relation endpoints reference valid entity types)
 * rather than using a separate validation action. This keeps the validation
 * synchronous and co-located with the state transition, avoiding race
 * conditions between validation and loading.
 */

import { createAction, props } from '@ngrx/store';
import { IRelation, ITaskStructure } from '../../models/task-structure.model';

/**
 * Loads a Task Structure into the store with inline validation.
 *
 * The reducer validates that every relation's `from` and `to` fields
 * reference entries in `entityTypes`. If validation fails, the store
 * records an error and the Task Structure is NOT loaded.
 *
 * Triggered by: Application startup, fixture loading, or user import.
 */
export const loadTaskStructure = createAction(
  '[Task Structure] Load Task Structure',
  props<{ taskStructure: ITaskStructure }>()
);

/**
 * Signals that a Task Structure was loaded successfully (bypassing inline validation).
 *
 * Used when the caller has already validated the data (e.g., from a trusted source).
 * Replaces the entire Task Structure state.
 */
export const loadTaskStructureSuccess = createAction(
  '[Task Structure] Load Task Structure Success',
  props<{ entityTypes: string[]; relations: IRelation[] }>()
);

/**
 * Signals that Task Structure loading failed.
 *
 * Stores the error message in the slice's `error` field for UI display.
 * The Task Structure data remains unchanged (previous valid data, if any, is preserved).
 */
export const loadTaskStructureFailure = createAction(
  '[Task Structure] Load Task Structure Failure',
  props<{ error: string }>()
);
