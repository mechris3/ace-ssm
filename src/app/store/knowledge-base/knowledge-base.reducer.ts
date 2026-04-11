/**
 * @fileoverview Knowledge Base Reducer — state management for domain facts (Layer 2).
 *
 * The Knowledge Base stores all fragments that the Knowledge Operator can
 * match against. The reducer validates metadata bounds on load — all
 * urgency, specificity, and inquiryCost values must be in [0.0, 1.0].
 *
 * @remarks
 * DESIGN DECISION: Metadata validation happens inline in the `loadKnowledgeBase`
 * handler, mirroring the Task Structure's validation pattern. If ANY fragment
 * has out-of-range metadata, the entire load is rejected. This prevents
 * partially-valid KBs from producing unpredictable scoring behavior.
 */

import { createReducer, on } from '@ngrx/store';
import { IKnowledgeFragment } from '../../models/knowledge-base.model';
import * as KnowledgeBaseActions from './knowledge-base.actions';

/** NgRx feature key for the Knowledge Base store slice. */
export const knowledgeBaseFeatureKey = 'knowledgeBase';

/**
 * Shape of the Knowledge Base store slice.
 *
 * Includes `loaded` and `error` fields for lifecycle tracking,
 * matching the Task Structure slice's pattern.
 */
export interface KnowledgeBaseState {
  /** All loaded Knowledge Base fragments. */
  fragments: IKnowledgeFragment[];
  /** Whether fragments have been successfully loaded. */
  loaded: boolean;
  /** Validation error message, or null if no error. */
  error: string | null;
}

/**
 * Initial state — empty fragment list, not yet loaded.
 */
export const initialState: KnowledgeBaseState = {
  fragments: [],
  loaded: false,
  error: null,
};

/**
 * Validates that all metadata fields in every fragment are within [0.0, 1.0].
 *
 * Returns a descriptive error string identifying the first invalid field,
 * or null if all fragments are valid.
 *
 * @remarks
 * DESIGN DECISION: Validation is fail-fast — it returns on the first invalid
 * field rather than collecting all errors. This is sufficient for the POC
 * and keeps the error message actionable (fix this one field, then retry).
 *
 * @param fragments - Array of KB fragments to validate
 * @returns Error message string, or null if all valid
 */
function validateFragments(fragments: IKnowledgeFragment[]): string | null {
  const fields = ['urgency', 'specificity', 'inquiryCost'] as const;
  for (const fragment of fragments) {
    for (const field of fields) {
      const value = fragment.metadata[field];
      if (value < 0 || value > 1) {
        return `Fragment ${fragment.id}: ${field} out of range [0, 1]`;
      }
    }
  }
  return null;
}

export const knowledgeBaseReducer = createReducer(
  initialState,

  /**
   * Load fragments with inline metadata validation.
   *
   * If validation fails, the error is recorded but the fragment data
   * is NOT stored — the previous state's fragments are preserved.
   */
  on(KnowledgeBaseActions.loadKnowledgeBase, (state, { fragments }) => {
    const error = validateFragments(fragments);
    if (error) {
      return { ...state, error };
    }
    return {
      ...state,
      fragments,
      loaded: true,
      error: null,
    };
  }),

  /**
   * Direct success load — bypasses inline validation.
   * Replaces the entire fragment collection.
   */
  on(KnowledgeBaseActions.loadKnowledgeBaseSuccess, (_state, { fragments }) => ({
    fragments,
    loaded: true,
    error: null,
  })),

  /**
   * Load failure — records the error without modifying the fragment data.
   */
  on(KnowledgeBaseActions.loadKnowledgeBaseFailure, (state, { error }) => ({
    ...state,
    error,
    loaded: false,
  })),
);
