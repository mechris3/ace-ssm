/**
 * @fileoverview SSM Selectors — read-only projections of the SSM state.
 *
 * These selectors expose specific slices of the SSM state to consumers
 * (the Inference Engine, UI components, and tests). Each selector is
 * memoized by NgRx — it only recomputes when its input state changes.
 *
 * @remarks
 * DESIGN DECISION: `selectSSMState` returns the entire SSM state object.
 * This is used by the Inference Engine's `withLatestFrom` to get a complete
 * snapshot for the Triple-Operator cycle. The individual selectors (nodes,
 * edges, etc.) are provided for UI components that only need a subset.
 */

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ISSMState, ISSMNode } from '../../models/ssm.model';
import { ssmFeatureKey } from './ssm.reducer';

/**
 * Selects the entire SSM state slice.
 * Used by the Inference Engine to get a complete snapshot for each pulse.
 */
export const selectSSMState = createFeatureSelector<ISSMState>(ssmFeatureKey);

/** Selects all nodes in the SSM graph. Used by UI components for rendering. */
export const selectAllNodes = createSelector(
  selectSSMState,
  (state) => state.nodes
);

/** Selects all edges in the SSM graph. Used by UI components for rendering. */
export const selectAllEdges = createSelector(
  selectSSMState,
  (state) => state.edges
);

/**
 * Selects the complete reasoning history.
 * Each entry is one ReasoningStep corresponding to one SSM mutation.
 * Used by the UI to display the "Glass Box" audit trail.
 */
export const selectHistory = createSelector(
  selectSSMState,
  (state) => state.history
);

/** Selects whether the engine is actively running. */
export const selectIsRunning = createSelector(
  selectSSMState,
  (state) => state.isRunning
);

/**
 * Selects whether the engine is waiting for user input (INQUIRY state).
 * When true, the UI should present the open QUESTION node for resolution.
 */
export const selectWaitingForUser = createSelector(
  selectSSMState,
  (state) => state.waitingForUser
);

/**
 * Selects the most recent 50 reasoning steps from the history.
 * Used as the store-side limit for the Audit Trail scroll-back buffer.
 */
/**
 * Selects the full reasoning history — no truncation.
 * The audit trail is the core of the "Glass Box" transparency;
 * limiting it would hide the engine's reasoning from the user.
 */
export const selectRecentHistory = createSelector(
  selectHistory,
  (history) => history
);

/**
 * Selects the full reasoning history for DOM rendering.
 * Previously capped at 20 entries, now uncapped — the audit trail
 * component handles its own scroll virtualization.
 */
export const selectRenderedHistory = createSelector(
  selectHistory,
  (history) => history
);

/**
 * Selects the SSM node that is pending user confirmation via the finding
 * inquiry modal. Returns null if no finding inquiry is active.
 */
export const selectPendingFindingNode = createSelector(
  selectSSMState,
  (state) => {
    if (!state.pendingFindingNodeId) { return null; }
    return state.nodes.find(n => n.id === state.pendingFindingNodeId) ?? null;
  }
);

/**
 * Diagnostic Differential — the set of competing candidate solutions.
 * [Ref: Paper Sec 3.2.1 / Gap Analysis Gap 1]
 *
 * A differential entry is an SSM node of the "root" entity type (the type
 * that appears as `from` in relations but never as `to` — e.g., Condition).
 * Each entry tracks how many seed findings it covers (directly or transitively).
 */
export interface IDifferentialEntry {
  /** The candidate Condition/Disease node. */
  node: ISSMNode;
  /** Number of seed Symptom nodes this candidate covers via edges. */
  coveredSeedCount: number;
  /** Total number of seed Symptom nodes in the SSM. */
  totalSeedCount: number;
  /** Whether this candidate covers ALL seed findings. */
  isComplete: boolean;
}

import { IRelation } from '../../models/task-structure.model';

/**
 * Computes the diagnostic differential from SSM state and Task Structure relations.
 * [Ref: Paper Sec 3.2.1 — G_g global goal constraint]
 *
 * The "root" entity type is identified dynamically: it's any type that appears
 * as `from` in at least one relation but never as `to`. This is the top of the
 * ontological hierarchy (e.g., Condition, Disease).
 *
 * For each root-type node in the SSM, we trace edges transitively to find
 * which seed Symptom nodes it covers. A candidate that covers ALL seeds is
 * marked as `isComplete` — it satisfies the global goal constraint G_g.
 *
 * Pure function — no side effects.
 */
export function computeDifferential(
  nodes: ISSMNode[],
  edges: { source: string; target: string; relationType: string }[],
  relations: IRelation[]
): IDifferentialEntry[] {
  if (nodes.length === 0 || relations.length === 0) { return []; }

  // Identify root entity types: types that appear as `from` but never as `to`
  const fromTypes = new Set(relations.map(r => r.from));
  const toTypes = new Set(relations.map(r => r.to));
  const rootTypes = new Set([...fromTypes].filter(t => !toTypes.has(t)));

  // If no clear root type, fall back to types that are only `from` in the majority
  if (rootTypes.size === 0) { return []; }

  // Identify seed nodes: CONFIRMED nodes whose type is a leaf type
  // (appears as `to` but never as `from` — e.g., Symptom)
  const leafTypes = new Set([...toTypes].filter(t => !fromTypes.has(t)));
  const seedNodes = nodes.filter(n => n.status === 'CONFIRMED' && leafTypes.has(n.type));
  const seedIds = new Set(seedNodes.map(n => n.id));
  const totalSeedCount = seedIds.size;

  if (totalSeedCount === 0) { return []; }

  // Build adjacency list for transitive reachability (follow edges in both directions)
  const adjacency = new Map<string, Set<string>>();
  for (const e of edges) {
    const src = typeof e.source === 'string' ? e.source : (e.source as any).id;
    const tgt = typeof e.target === 'string' ? e.target : (e.target as any).id;
    if (!adjacency.has(src)) { adjacency.set(src, new Set()); }
    if (!adjacency.has(tgt)) { adjacency.set(tgt, new Set()); }
    adjacency.get(src)!.add(tgt);
    adjacency.get(tgt)!.add(src);
  }

  // For each root-type node, BFS to find which seed nodes are reachable
  const rootNodes = nodes.filter(n => rootTypes.has(n.type) && n.status !== 'REFUTED');

  return rootNodes.map(rootNode => {
    const visited = new Set<string>();
    const queue = [rootNode.id];
    visited.add(rootNode.id);
    let coveredSeedCount = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (seedIds.has(current)) { coveredSeedCount++; }
      const neighbors = adjacency.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    return {
      node: rootNode,
      coveredSeedCount,
      totalSeedCount,
      isComplete: coveredSeedCount >= totalSeedCount,
    };
  }).sort((a, b) => {
    // [Ref: Paper 1 Sec 3.2.3 / Gap 4] Sort by coverage first, then by CF (strength)
    if (b.coveredSeedCount !== a.coveredSeedCount) {
      return b.coveredSeedCount - a.coveredSeedCount;
    }
    return (b.node.cf ?? 0) - (a.node.cf ?? 0);
  });
}
