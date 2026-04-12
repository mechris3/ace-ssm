/**
 * @fileoverview Task Structure Selectors — read-only projections of the domain grammar.
 *
 * These selectors expose the Task Structure (Layer 1) to consumers.
 * The Inference Engine uses `selectTaskStructure` to get the grammar
 * for the Goal Generator. UI components can use the individual selectors
 * to display entity types and relations.
 */

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { TaskStructureState, taskStructureFeatureKey } from './task-structure.reducer';

/** Selects the entire Task Structure slice from the store. */
export const selectTaskStructureState = createFeatureSelector<TaskStructureState>(
  taskStructureFeatureKey
);

/**
 * Selects the Task Structure as an `{ entityTypes, relations }` object.
 *
 * Used by the Inference Engine's `withLatestFrom` to provide the grammar
 * to the Goal Generator. Returns only the data fields (not `loaded`/`error`)
 * because the operators don't need lifecycle metadata.
 */
export const selectTaskStructure = createSelector(
  selectTaskStructureState,
  (state) => ({ entityTypes: state.entityTypes, relations: state.relations })
);

/** Selects just the entity type labels. Used by UI for display/filtering. */
export const selectEntityTypes = createSelector(
  selectTaskStructureState,
  (state) => state.entityTypes
);

/** Selects just the relation definitions. Used by UI for display/filtering. */
export const selectRelations = createSelector(
  selectTaskStructureState,
  (state) => state.relations
);

/** Selects whether a Task Structure has been successfully loaded. */
export const selectTaskStructureLoaded = createSelector(
  selectTaskStructureState,
  (state) => state.loaded
);

/** Selects the Task Structure validation error, or null if no error. */
export const selectTaskStructureError = createSelector(
  selectTaskStructureState,
  (state) => state.error
);
