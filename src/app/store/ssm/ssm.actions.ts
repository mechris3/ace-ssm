/**
 * @fileoverview SSM Store Actions — all possible mutations to the SSM state.
 * [Ref: MD Sec 6.2 - SSM Actions]
 *
 * The SSM (Layer 3 — Working Memory) is the central artifact of the inference
 * engine. These actions represent every way the SSM can change. Each action
 * carries a `reasoningStep` (except reset/restore) to maintain the "Glass Box"
 * audit trail — every mutation is explained.
 * [Ref: MD Sec 10 Invariant 5 - Every mutation is explained]
 */

import { createAction, props } from '@ngrx/store';
import { ISSMNode, ISSMEdge, ISSMState, NodeStatus } from '../../models/ssm.model';
import { IReasoningStep } from '../../models/strategy.model';

/**
 * [Ref: MD Sec 6.2 - applyPatch]
 * Appends new HYPOTHESIS nodes and/or edges to the SSM graph.
 * Triggered by the Knowledge Operator PATCH result (Sec 3.3.2, 3.3.3, 4.6).
 * Also used for placeholder edges (Sec 4.4, 4.5).
 * WHY: Append-only — preserves the full reasoning trail (Invariant 2).
 */
export const applyPatch = createAction(
  '[SSM] Apply Patch',
  props<{ nodes: ISSMNode[]; edges: ISSMEdge[]; reasoningStep: IReasoningStep; cfUpdates?: Record<string, number> }>()
);

/**
 * [Ref: MD Sec 6.2 - openInquiry] (legacy)
 * Creates a QUESTION node and edge when the Knowledge Operator returned
 * INQUIRY_REQUIRED. Sets `waitingForUser = true`.
 */
export const openInquiry = createAction(
  '[SSM] Open Inquiry',
  props<{ questionNode: ISSMNode; edge: ISSMEdge; reasoningStep: IReasoningStep }>()
);

/**
 * [Ref: MD Sec 6.2 - resolveInquiry] (legacy)
 * Resolves an open QUESTION node with user-provided information.
 * Updates status and optionally label. Clears `waitingForUser`.
 */
export const resolveInquiry = createAction(
  '[SSM] Resolve Inquiry',
  props<{ nodeId: string; newStatus: NodeStatus; newLabel: string | null; reasoningStep: IReasoningStep }>()
);

/**
 * [Ref: MD Sec 6.2 - applyStatusUpgrade]
 * Promotes a HYPOTHESIS node to CONFIRMED status.
 * Triggered by STATUS_UPGRADE_PATCH result (Sec 3.3.1).
 * WHY: Separate from applyPatch because it mutates an existing node's
 * status rather than appending new nodes.
 */
export const applyStatusUpgrade = createAction(
  '[SSM] Apply Status Upgrade',
  props<{ nodeId: string; reasoningStep: IReasoningStep }>()
);

/**
 * [Ref: MD Sec 6.2 - resetSSM]
 * Resets the SSM to its initial empty state.
 */
export const resetSSM = createAction('[SSM] Reset');

/**
 * [Ref: MD Sec 6.2 - restoreSSM]
 * Restores the SSM from a deserialized state (e.g., loaded from JSON).
 * Replaces the entire state wholesale.
 */
export const restoreSSM = createAction(
  '[SSM] Restore',
  props<{ ssmState: ISSMState }>()
);

/**
 * [Ref: MD Sec 6.2 - openFindingInquiry]
 * [Ref: MD Sec 5.1 - Trigger Condition]
 * Opens a finding-confirmation inquiry for a HYPOTHESIZED node.
 * Sets `waitingForUser = true` and `pendingFindingNodeId`.
 * WHY: Unlike openInquiry, this does NOT create a QUESTION node —
 * it targets an existing HYPOTHESIS and asks the user to confirm it.
 */
export const openFindingInquiry = createAction(
  '[SSM] Open Finding Inquiry',
  props<{ nodeId: string; reasoningStep: IReasoningStep }>()
);

/**
 * [Ref: MD Sec 6.2 - confirmFinding]
 * [Ref: MD Sec 5.3 - User Actions: Confirm]
 * Confirms a HYPOTHESIZED finding → status flips to CONFIRMED.
 * Clears `waitingForUser` and `pendingFindingNodeId`.
 */
export const confirmFinding = createAction(
  '[SSM] Confirm Finding',
  props<{ nodeId: string; reasoningStep: IReasoningStep }>()
);

/**
 * [Ref: MD Sec 6.2 - refuteFinding]
 * [Ref: MD Sec 5.3 - User Actions: Refute]
 * Refutes a HYPOTHESIZED finding → status flips to REFUTED.
 * WHY: REFUTED nodes apply a 99% penalty (0.01×) to all downstream
 * goals, effectively killing the branch. [Ref: MD Sec 3.2.3]
 */
export const refuteFinding = createAction(
  '[SSM] Refute Finding',
  props<{ nodeId: string; reasoningStep: IReasoningStep }>()
);

/**
 * [Ref: MD Sec 6.2 - skipFinding]
 * [Ref: MD Sec 5.3 - User Actions: Skip]
 * Skips a finding inquiry → status flips to SKIPPED.
 * WHY: SKIPPED nodes lose their urgency bonus for the current cycle
 * but are not permanently penalized. [Ref: MD Sec 3.2.3]
 */
export const skipFinding = createAction(
  '[SSM] Skip Finding',
  props<{ nodeId: string; reasoningStep: IReasoningStep }>()
);
