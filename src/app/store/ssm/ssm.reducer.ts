/**
 * @fileoverview SSM Reducer — state transitions for the SSM (Layer 3 — Working Memory).
 * [Ref: MD Sec 6.2 - SSM Actions]
 *
 * Manages the evolving graph of nodes, edges, and reasoning history.
 * Enforces the append-only invariant for graph growth (PATCH) while
 * allowing targeted status mutations (STATUS_UPGRADE, inquiry resolution).
 *
 * Every mutating action (except reset/restore) appends exactly one
 * IReasoningStep to the history array.
 * [Ref: MD Sec 10 Invariant 5 - Every mutation is explained]
 * [Ref: MD Sec 10 Invariant 2 - Append-only graph]
 */

import { createReducer, on } from '@ngrx/store';
import { ISSMState, NodeStatus, initialSSMState } from '../../models/ssm.model';
import * as SSMActions from './ssm.actions';

/** NgRx feature key for the SSM store slice. [Ref: MD Sec 6.1] */
export const ssmFeatureKey = 'ssm';

export const ssmReducer = createReducer(
  initialSSMState,

  // ═══════════════════════════════════════════════════════════════════
  // [Ref: MD Sec 6.2 - applyPatch]
  // Append new nodes and edges from a Knowledge Operator PATCH result.
  // WHY: Append-only — preserves the full reasoning trail (Invariant 2).
  // ═══════════════════════════════════════════════════════════════════
  on(SSMActions.applyPatch, (state, { nodes, edges, reasoningStep }) => ({
    ...state,
    nodes: [...state.nodes, ...nodes],
    edges: [...state.edges, ...edges],
    history: [...state.history, reasoningStep],
  })),

  // ═══════════════════════════════════════════════════════════════════
  // [Ref: MD Sec 6.2 - applyStatusUpgrade]
  // Promote a HYPOTHESIS node to CONFIRMED.
  // WHY: STATUS_UPGRADE always means HYPOTHESIS → CONFIRMED. The status
  // is hard-coded rather than read from the payload for safety.
  // ═══════════════════════════════════════════════════════════════════
  on(SSMActions.applyStatusUpgrade, (state, { nodeId, reasoningStep }) => ({
    ...state,
    nodes: state.nodes.map(n =>
      n.id === nodeId ? { ...n, status: 'CONFIRMED' as NodeStatus } : n
    ),
    history: [...state.history, reasoningStep],
  })),

  // ═══════════════════════════════════════════════════════════════════
  // [Ref: MD Sec 6.2 - openInquiry] (legacy QUESTION node flow)
  // ═══════════════════════════════════════════════════════════════════
  on(SSMActions.openInquiry, (state, { questionNode, edge, reasoningStep }) => ({
    ...state,
    nodes: [...state.nodes, questionNode],
    edges: [...state.edges, edge],
    history: [...state.history, reasoningStep],
    waitingForUser: true,
  })),

  // ═══════════════════════════════════════════════════════════════════
  // [Ref: MD Sec 6.2 - resolveInquiry] (legacy QUESTION node resolution)
  // ═══════════════════════════════════════════════════════════════════
  on(SSMActions.resolveInquiry, (state, { nodeId, newStatus, newLabel, reasoningStep }) => ({
    ...state,
    nodes: state.nodes.map(n =>
      n.id === nodeId ? { ...n, status: newStatus, label: newLabel ?? n.label } : n
    ),
    history: [...state.history, reasoningStep],
    waitingForUser: false,
  })),

  // ═══════════════════════════════════════════════════════════════════
  // [Ref: MD Sec 6.2 - resetSSM]
  // ═══════════════════════════════════════════════════════════════════
  on(SSMActions.resetSSM, () => initialSSMState),

  // ═══════════════════════════════════════════════════════════════════
  // [Ref: MD Sec 6.2 - restoreSSM]
  // WHY: Full replacement, not merge. The deserialized state is assumed
  // structurally valid (validated by the SSM Serializer before dispatch).
  // ═══════════════════════════════════════════════════════════════════
  on(SSMActions.restoreSSM, (_, { ssmState }) => ssmState),

  // ═══════════════════════════════════════════════════════════════════
  // [Ref: MD Sec 6.2 - openFindingInquiry]
  // [Ref: MD Sec 5.1 - Trigger Condition]
  // WHY: Sets pendingFindingNodeId so the UI knows which node to show
  // in the inquiry modal. Sets waitingForUser to block the pacer.
  // ═══════════════════════════════════════════════════════════════════
  on(SSMActions.openFindingInquiry, (state, { nodeId, reasoningStep }) => ({
    ...state,
    history: [...state.history, reasoningStep],
    waitingForUser: true,
    pendingFindingNodeId: nodeId,
  })),

  // ═══════════════════════════════════════════════════════════════════
  // [Ref: MD Sec 6.2 - confirmFinding]
  // [Ref: MD Sec 5.3 - User Actions: Confirm → CONFIRMED]
  // ═══════════════════════════════════════════════════════════════════
  on(SSMActions.confirmFinding, (state, { nodeId, reasoningStep }) => ({
    ...state,
    nodes: state.nodes.map(n =>
      n.id === nodeId ? { ...n, status: 'CONFIRMED' as NodeStatus } : n
    ),
    history: [...state.history, reasoningStep],
    waitingForUser: false,
    pendingFindingNodeId: null,
  })),

  // ═══════════════════════════════════════════════════════════════════
  // [Ref: MD Sec 6.2 - refuteFinding]
  // [Ref: MD Sec 5.3 - User Actions: Refute → REFUTED]
  // WHY: REFUTED nodes apply a 99% penalty (0.01×) to all downstream
  // goals, effectively killing the branch. [Ref: MD Sec 3.2.3]
  // ═══════════════════════════════════════════════════════════════════
  on(SSMActions.refuteFinding, (state, { nodeId, reasoningStep }) => ({
    ...state,
    nodes: state.nodes.map(n =>
      n.id === nodeId ? { ...n, status: 'REFUTED' as NodeStatus } : n
    ),
    history: [...state.history, reasoningStep],
    waitingForUser: false,
    pendingFindingNodeId: null,
  })),

  // ═══════════════════════════════════════════════════════════════════
  // [Ref: MD Sec 6.2 - skipFinding]
  // [Ref: MD Sec 5.3 - User Actions: Skip → SKIPPED]
  // WHY: SKIPPED nodes lose their urgency bonus but the branch is not
  // killed — it can still compete on parsimony. [Ref: MD Sec 3.2.3]
  // ═══════════════════════════════════════════════════════════════════
  on(SSMActions.skipFinding, (state, { nodeId, reasoningStep }) => ({
    ...state,
    nodes: state.nodes.map(n =>
      n.id === nodeId ? { ...n, status: 'SKIPPED' as NodeStatus } : n
    ),
    history: [...state.history, reasoningStep],
    waitingForUser: false,
    pendingFindingNodeId: null,
  })),
);
