/**
 * @fileoverview Task Structure Reducer — state management for the domain grammar (Layer 1).
 *
 * The Task Structure is loaded once and treated as immutable. The reducer
 * validates relation endpoints on load — if any relation references an
 * entity type not in `entityTypes`, the entire load is rejected with a
 * descriptive error.
 *
 * @remarks
 * DESIGN DECISION: Validation happens inline in the `loadTaskStructure`
 * handler rather than in a separate effect or guard. This ensures the
 * store never contains an invalid Task Structure — the validation and
 * state update are atomic within a single reducer call.
 */

import { createReducer, on } from '@ngrx/store';
import { IRelation } from '../../models/task-structure.model';
import * as TaskStructureActions from './task-structure.actions';

/** NgRx feature key for the Task Structure store slice. */
export const taskStructureFeatureKey = 'taskStructure';

/**
 * Shape of the Task Structure store slice.
 *
 * Includes `loaded` and `error` fields for lifecycle tracking.
 * The UI can check `loaded` to know if the grammar is ready,
 * and `error` to display validation failures.
 */
export interface TaskStructureState {
  /** All valid entity type labels in this domain. */
  entityTypes: string[];
  /** All valid directed relation types. */
  relations: IRelation[];
  /** Whether a Task Structure has been successfully loaded. */
  loaded: boolean;
  /** Validation error message, or null if no error. */
  error: string | null;
}

/**
 * Initial state — empty grammar, not yet loaded.
 */
export const initialState: TaskStructureState = {
  entityTypes: [],
  relations: [],
  loaded: false,
  error: null,
};

export const taskStructureReducer = createReducer(
  initialState,

  /**
   * Load a Task Structure with inline validation.
   *
   * Validates that every relation's `from` and `to` fields reference
   * entries in `entityTypes`. If any relation references an unknown
   * entity type, the entire load is rejected — the state records the
   * error and the data is NOT stored.
   *
   * @remarks
   * DESIGN DECISION: The entire Task Structure is rejected on the first
   * invalid relation, not just the offending relation. This is because
   * a partial grammar would produce incorrect gap detection in the Goal
   * Generator — it's safer to reject entirely and surface the error.
   */
  on(TaskStructureActions.loadTaskStructure, (state, { taskStructure }) => {
    const { entityTypes, relations } = taskStructure;

    // Validate every relation's endpoints against the entityTypes list
    for (const relation of relations) {
      if (!entityTypes.includes(relation.from)) {
        return {
          ...state,
          error: `Relation references unknown entity type: ${relation.from}`,
        };
      }
      if (!entityTypes.includes(relation.to)) {
        return {
          ...state,
          error: `Relation references unknown entity type: ${relation.to}`,
        };
      }
    }

    // Validation passed — store the grammar
    return {
      ...state,
      entityTypes,
      relations,
      loaded: true,
      error: null,
    };
  }),

  /**
   * Direct success load — bypasses inline validation.
   * Replaces the entire state with the provided data.
   */
  on(TaskStructureActions.loadTaskStructureSuccess, (_state, { entityTypes, relations }) => ({
    entityTypes,
    relations,
    loaded: true,
    error: null,
  })),

  /**
   * Load failure — records the error without modifying the data.
   * Previous valid data (if any) is preserved.
   */
  on(TaskStructureActions.loadTaskStructureFailure, (state, { error }) => ({
    ...state,
    error,
    loaded: false,
  })),
);
