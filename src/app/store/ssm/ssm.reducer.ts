/**
 * @fileoverview SSM Reducer — state transitions for the SSM (Layer 3 — Working Memory).
 *
 * The SSM reducer manages the evolving graph of nodes, edges, and reasoning
 * history. It enforces the append-only invariant for graph growth (PATCH)
 * while allowing targeted status mutations (STATUS_UPGRADE, INQUIRY resolution).
 *
 * Every mutating action (except reset/restore) appends exactly one
 * `IReasoningStep` to the history array, maintaining the "Glass Box" audit trail.
 *
 * @remarks
 * DESIGN DECISION: The SSM is append-only for nodes and edges via PATCH.
 * Nodes are never deleted — they can only change status. This design choice
 * ensures the full reasoning trail is preserved and auditable. The history
 * array is also strictly append-only (monotonically growing).
 */

import { createReducer, on } from '@ngrx/store';
import { ISSMState, NodeStatus, initialSSMState } from '../../models/ssm.model';
import * as SSMActions from './ssm.actions';

/** NgRx feature key for the SSM store slice. */
export const ssmFeatureKey = 'ssm';

export const ssmReducer = createReducer(
  initialSSMState,

  /**
   * Append new nodes and edges from a Knowledge Operator PATCH result.
   *
   * Uses spread operator to concatenate new items onto existing arrays,
   * preserving all previous nodes and edges unchanged. This is the core
   * of the append-only invariant (Property 5 in the design spec).
   */
  on(SSMActions.applyPatch, (state, { nodes, edges, reasoningStep }) => ({
    ...state,
    nodes: [...state.nodes, ...nodes],
    edges: [...state.edges, ...edges],
    history: [...state.history, reasoningStep],
  })),

  /**
   * Promote a HYPOTHESIS node to CONFIRMED status.
   *
   * Uses `map()` to find the target node by ID and update only its status.
   * All other nodes remain unchanged. This is a targeted mutation, not an append.
   *
   * @remarks
   * DESIGN DECISION: The status is hard-coded to 'CONFIRMED' (cast via `as NodeStatus`)
   * rather than reading from the action payload. This is intentional — STATUS_UPGRADE
   * always means HYPOTHESIS → CONFIRMED. The cast is needed because the string literal
   * 'CONFIRMED' doesn't automatically narrow to the `NodeStatus` union type.
   */
  on(SSMActions.applyStatusUpgrade, (state, { nodeId, reasoningStep }) => ({
    ...state,
    nodes: state.nodes.map(n =>
      n.id === nodeId ? { ...n, status: 'CONFIRMED' as NodeStatus } : n
    ),
    history: [...state.history, reasoningStep],
  })),

  /**
   * Add a QUESTION node and edge when the engine needs user input.
   *
   * Appends the question node and its connecting edge to the graph,
   * records the reasoning step, and sets `waitingForUser = true` to
   * signal the UI that input is needed.
   */
  on(SSMActions.openInquiry, (state, { questionNode, edge, reasoningStep }) => ({
    ...state,
    nodes: [...state.nodes, questionNode],
    edges: [...state.edges, edge],
    history: [...state.history, reasoningStep],
    waitingForUser: true,
  })),

  /**
   * Resolve an open QUESTION node with user-provided information.
   *
   * Updates the target node's status (CONFIRMED or UNKNOWN) and optionally
   * its label. Clears `waitingForUser` to allow the engine to resume.
   *
   * @remarks
   * DESIGN DECISION: `newLabel ?? n.label` uses nullish coalescing — if the
   * user provides a label (CONFIRMED case), it replaces the "?" prompt.
   * If `newLabel` is null (UNKNOWN case), the original label is preserved.
   * This keeps the QUESTION node's "?" prefix visible in the graph for
   * UNKNOWN resolutions, serving as a visual indicator of unresolved gaps.
   */
  on(SSMActions.resolveInquiry, (state, { nodeId, newStatus, newLabel, reasoningStep }) => ({
    ...state,
    nodes: state.nodes.map(n =>
      n.id === nodeId ? { ...n, status: newStatus, label: newLabel ?? n.label } : n
    ),
    history: [...state.history, reasoningStep],
    waitingForUser: false,
  })),

  /**
   * Reset the SSM to its initial empty state.
   * Clears all nodes, edges, history, and flags.
   */
  on(SSMActions.resetSSM, () => initialSSMState),

  /**
   * Restore the SSM from a deserialized state.
   * Replaces the entire state wholesale — used for loading saved sessions.
   *
   * @remarks
   * DESIGN DECISION: The previous state is completely discarded (the `_`
   * parameter is unused). This is intentional — restore is a full replacement,
   * not a merge. The deserialized state is assumed to be structurally valid
   * (validated by the SSM Serializer before dispatch).
   */
  on(SSMActions.restoreSSM, (_, { ssmState }) => ssmState),
);
