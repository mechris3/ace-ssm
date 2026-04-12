/**
 * @fileoverview Knowledge Base Selectors — read-only projections of domain facts.
 *
 * These selectors expose KB fragments to consumers. The Inference Engine uses
 * `selectAllFragments` to provide the full KB to the Search Operator and
 * Knowledge Operator. The parameterized `selectFragmentsBySubjectAndRelation`
 * selector supports targeted queries (used in tests and potentially by UI).
 */

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { KnowledgeBaseState, knowledgeBaseFeatureKey } from './knowledge-base.reducer';

/** Selects the entire Knowledge Base slice from the store. */
export const selectKnowledgeBaseState = createFeatureSelector<KnowledgeBaseState>(
  knowledgeBaseFeatureKey
);

/**
 * Selects all KB fragments.
 *
 * Used by the Inference Engine's `withLatestFrom` to provide the full KB
 * to the Search Operator (for scoring metadata) and Knowledge Operator
 * (for label-based matching).
 */
export const selectAllFragments = createSelector(
  selectKnowledgeBaseState,
  (state) => state.fragments
);

/**
 * Creates a parameterized selector that filters fragments by subject label
 * and relation type.
 *
 * This mirrors the exact matching logic used by the Knowledge Operator
 * (`fragment.subject === subject && fragment.relation === relation`),
 * making it useful for testing and UI previews.
 *
 * @param subject - Domain label to match against `fragment.subject`
 * @param relation - Relation type to match against `fragment.relation`
 * @returns Memoized selector returning only matching fragments
 *
 * @remarks
 * DESIGN DECISION: This is a factory function that returns a new selector
 * for each (subject, relation) pair. NgRx memoizes each instance separately,
 * so repeated calls with the same parameters are efficient. The factory
 * pattern is necessary because NgRx selectors don't natively support
 * parameterized inputs.
 */
export const selectFragmentsBySubjectAndRelation = (subject: string, relation: string) =>
  createSelector(
    selectAllFragments,
    (fragments) => fragments.filter(f => f.subject === subject && f.relation === relation)
  );

/** Selects whether Knowledge Base fragments have been successfully loaded. */
export const selectKnowledgeBaseLoaded = createSelector(
  selectKnowledgeBaseState,
  (state) => state.loaded
);

/** Selects the Knowledge Base validation error, or null if no error. */
export const selectKnowledgeBaseError = createSelector(
  selectKnowledgeBaseState,
  (state) => state.error
);
