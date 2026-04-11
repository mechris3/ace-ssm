/**
 * @fileoverview Knowledge Base Store Actions — loading and validation of domain facts.
 *
 * The Knowledge Base (Layer 2 — The Library) is a collection of fragments
 * that the Knowledge Operator consults when resolving EXPAND goals. These
 * actions handle the load lifecycle with metadata validation.
 *
 * @remarks
 * DESIGN DECISION: `loadKnowledgeBase` performs inline metadata validation
 * in the reducer (checking that urgency, specificity, and inquiryCost are
 * in [0, 1]). This mirrors the Task Structure's validation pattern — the
 * store never contains invalid data.
 */

import { createAction, props } from '@ngrx/store';
import { IKnowledgeFragment } from '../../models/knowledge-base.model';

/**
 * Loads Knowledge Base fragments into the store with inline metadata validation.
 *
 * The reducer validates that every fragment's metadata fields (urgency,
 * specificity, inquiryCost) are within [0.0, 1.0]. If any field is out
 * of range, the entire load is rejected with a descriptive error.
 *
 * Triggered by: Application startup, fixture loading, or user import.
 */
export const loadKnowledgeBase = createAction(
  '[Knowledge Base] Load Knowledge Base',
  props<{ fragments: IKnowledgeFragment[] }>()
);

/**
 * Signals that Knowledge Base fragments were loaded successfully
 * (bypassing inline validation).
 *
 * Used when the caller has already validated the data. Replaces the
 * entire fragment collection.
 */
export const loadKnowledgeBaseSuccess = createAction(
  '[Knowledge Base] Load Knowledge Base Success',
  props<{ fragments: IKnowledgeFragment[] }>()
);

/**
 * Signals that Knowledge Base loading failed.
 *
 * Stores the error message in the slice's `error` field for UI display.
 * The fragment data remains unchanged.
 */
export const loadKnowledgeBaseFailure = createAction(
  '[Knowledge Base] Load Knowledge Base Failure',
  props<{ error: string }>()
);
