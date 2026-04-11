/**
 * @fileoverview SSM Store Actions — all possible mutations to the SSM state.
 *
 * The SSM (Layer 3 — Working Memory) is the central artifact of the inference
 * engine. These actions represent every way the SSM can change. Each action
 * carries a `reasoningStep` (except reset/restore) to maintain the "Glass Box"
 * audit trail — every mutation is explained.
 *
 * @remarks
 * DESIGN DECISION: SSM actions are granular (one per mutation type) rather than
 * a single "updateSSM" action. This makes the reducer logic explicit, the
 * DevTools timeline readable, and the action stream filterable for effects.
 */

import { createAction, props } from '@ngrx/store';
import { ISSMNode, ISSMEdge, ISSMState, NodeStatus } from '../../models/ssm.model';
import { IReasoningStep } from '../../models/strategy.model';

/**
 * Appends new HYPOTHESIS nodes and edges to the SSM graph.
 *
 * Triggered by the Inference Engine when the Knowledge Operator returns a PATCH
 * result (one or more KB fragments matched an EXPAND goal). This is the primary
 * mechanism for growing the SSM graph.
 *
 * @remarks
 * DESIGN DECISION: The patch is append-only — existing nodes and edges are never
 * modified or removed by this action. This preserves the full reasoning trail.
 */
export const applyPatch = createAction(
  '[SSM] Apply Patch',
  props<{ nodes: ISSMNode[]; edges: ISSMEdge[]; reasoningStep: IReasoningStep }>()
);

/**
 * Creates a QUESTION node and edge when the Knowledge Operator returns
 * INQUIRY_REQUIRED (no KB fragments matched the goal).
 *
 * Also sets `waitingForUser = true` to signal the UI that user input is needed.
 * The engine FSM transitions to INQUIRY state via a separate engine action.
 */
export const openInquiry = createAction(
  '[SSM] Open Inquiry',
  props<{ questionNode: ISSMNode; edge: ISSMEdge; reasoningStep: IReasoningStep }>()
);

/**
 * Resolves an open QUESTION node with user-provided information.
 *
 * The user can either CONFIRM the question (providing a label for the answer)
 * or mark it as UNKNOWN (no label change). This action updates the node's
 * status and optionally its label, clears `waitingForUser`, and appends
 * a reasoning step to the history.
 *
 * @remarks
 * DESIGN DECISION: `newLabel` is nullable — UNKNOWN resolutions don't change
 * the label (the "?" prefix remains as a visual indicator). CONFIRMED
 * resolutions replace the label with the user's answer (e.g., "Chest Pain").
 */
export const resolveInquiry = createAction(
  '[SSM] Resolve Inquiry',
  props<{ nodeId: string; newStatus: NodeStatus; newLabel: string | null; reasoningStep: IReasoningStep }>()
);

/**
 * Promotes a HYPOTHESIS node to CONFIRMED status.
 *
 * Triggered when the Knowledge Operator returns STATUS_UPGRADE_PATCH — the
 * Goal Generator detected that all CONFIRMED_BY targets are CONFIRMED, and
 * the Search Operator selected this goal as the winner.
 *
 * @remarks
 * DESIGN DECISION: This is a separate action from `applyPatch` because it
 * mutates an existing node's status rather than appending new nodes. The
 * reducer uses `map()` to find and update the target node, which is a
 * fundamentally different operation from array concatenation.
 */
export const applyStatusUpgrade = createAction(
  '[SSM] Apply Status Upgrade',
  props<{ nodeId: string; reasoningStep: IReasoningStep }>()
);

/**
 * Resets the SSM to its initial empty state.
 *
 * Clears all nodes, edges, history, and flags. Used when the user wants
 * to start a fresh inference cycle. No reasoning step is recorded because
 * the history itself is cleared.
 */
export const resetSSM = createAction('[SSM] Reset');

/**
 * Restores the SSM from a deserialized state (e.g., loaded from JSON).
 *
 * Replaces the entire SSM state wholesale. Used by the SSM Serializer
 * to load a previously saved state. The provided state is assumed to
 * have passed structural validation in the serializer.
 */
export const restoreSSM = createAction(
  '[SSM] Restore',
  props<{ ssmState: ISSMState }>()
);
