/**
 * @fileoverview Knowledge Operator — Operator 3 of the Triple-Operator cycle.
 * [Ref: MD Sec 3.3 - Knowledge Operator]
 *
 * Resolves the winning goal by matching it against the Knowledge Base (Layer 2).
 * It is the bridge between the engine's reasoning (goals) and domain knowledge.
 *
 * Three possible outcomes:
 *   1. PATCH              — KB matched; spawn new nodes and/or merge edges (Sec 3.3.2, 4.6)
 *   2. STATUS_UPGRADE_PATCH — Goal is STATUS_UPGRADE; bypass KB (Sec 3.3.1)
 *   3. NO_MATCH           — No KB fragments matched; goal is exhausted (Sec 4.4)
 *
 * Pure function — no side effects, no service dependencies.
 * [Ref: MD Sec 10 Invariant 6 - Pure Operators]
 */

import { IGoal, ISSMNode, ISSMEdge, NodeStatus } from '../models/ssm.model';
import { IKnowledgeFragment } from '../models/knowledge-base.model';
import { KnowledgeOperatorResult } from '../models/engine.model';

/**
 * Resolves a goal against the Knowledge Base.
 * [Ref: MD Sec 3.3.2 - EXPAND Goals — KB Matching]
 *
 * Uses a cascading KB match:
 *   Priority 1: Exact relation match (anchor + targetRelation)
 *   Priority 2: Broad fallback (anchor on correct side, any relation)
 *
 * For each match, checks if the target already exists in the SSM:
 *   - Existing target → edge to existing node (Graph Merging, Sec 4.6)
 *   - New target → HYPOTHESIS node + edge (Multi-Hypothesis Spawning, Sec 3.3.3)
 *
 * @param goal - The winning goal from the Search Operator
 * @param kb - All Knowledge Base fragments (Layer 2)
 * @param existingNodes - Current SSM nodes for deduplication / graph merging
 * @returns Discriminated union: PATCH | STATUS_UPGRADE_PATCH | NO_MATCH
 */
export function resolveGoal(
  goal: IGoal,
  kb: IKnowledgeFragment[],
  existingNodes: ISSMNode[] = []
): KnowledgeOperatorResult {

  // ═══════════════════════════════════════════════════════════════════
  // STATUS_UPGRADE — bypass KB entirely
  // [Ref: MD Sec 3.3.1 - STATUS_UPGRADE Goals]
  // WHY: The Goal Generator already verified promotion conditions.
  // Keeping STATUS_UPGRADE in the pipeline ensures traceability —
  // every mutation gets a ReasoningStep (Sec 10 Invariant 5).
  // ═══════════════════════════════════════════════════════════════════
  if (goal.kind === 'STATUS_UPGRADE') {
    return {
      type: 'STATUS_UPGRADE_PATCH',
      nodeId: goal.anchorNodeId,
      newStatus: 'CONFIRMED',
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // EXPAND — Cascading KB Match
  // [Ref: MD Sec 3.3.2 - Cascading Search]
  // WHY: The KB may use a different but logically equivalent relation
  // name (e.g., CONFIRMED_BY instead of EXPLAINS). The broad fallback
  // prevents the engine from stalling on relation name mismatches.
  // ═══════════════════════════════════════════════════════════════════
  const isReverse = goal.direction === 'reverse';

  // [Ref: MD Sec 10 Invariant 3 - Dual-key KB matching]
  // WHY: Supports KB fragments authored with either human-readable
  // labels ("Stiff Neck") or identifier-style keys ("Stiff_Neck").
  const anchorKeys = new Set([goal.anchorLabel, goal.anchorNodeId]);

  // Priority 1: Exact relation match
  let matches = isReverse
    ? kb.filter(f => anchorKeys.has(f.object) && f.relation === goal.targetRelation)
    : kb.filter(f => anchorKeys.has(f.subject) && f.relation === goal.targetRelation);

  // Priority 2: Broad fallback — any relation for this anchor
  if (matches.length === 0) {
    matches = isReverse
      ? kb.filter(f => anchorKeys.has(f.object))
      : kb.filter(f => anchorKeys.has(f.subject));
  }

  if (matches.length === 0) {
    return { type: 'NO_MATCH', goal };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Graph Merging / Deduplication
  // [Ref: MD Sec 4.6 - Graph Merging]
  // [Ref: MD Sec 3.3.2 - Deduplication and Graph Merging]
  //
  // WHY (Parsimony/Convergence): If a target node already exists in
  // the SSM, we draw an edge to it instead of spawning a duplicate.
  // This merges subgraphs — e.g., Subarachnoid_Hemorrhage discovered
  // from two different findings gets one node with two incoming edges,
  // not two separate nodes. This is what makes the +30 parsimony
  // bonus (Sec 3.2.1) meaningful.
  // ═══════════════════════════════════════════════════════════════════
  const existingByKey = new Map<string, ISSMNode>();
  for (const n of existingNodes) {
    existingByKey.set(n.label, n);
    existingByKey.set(n.id, n);
  }

  const nodes: ISSMNode[] = [];
  const edges: ISSMEdge[] = [];

  for (const f of matches) {
    const targetLabel = isReverse ? f.subject : f.object;
    const existing = existingByKey.get(targetLabel);

    if (existing) {
      // [Ref: MD Sec 4.6] Target exists → edge only (graph merging)
      // [Ref: Paper 1 Sec 3.2.2 / Gap 4] Combine CFs using conjunctive
      // formula: cf_combined = cf1 + cf2 * (1 - cf1). This increases
      // confidence when multiple independent fragments support the same node.
      if (existing.cf !== undefined) {
        const newCf = f.metadata.specificity ?? 0.5;
        existing.cf = existing.cf + newCf * (1 - existing.cf);
      }
      edges.push({
        id: `edge_${crypto.randomUUID()}`,
        source: isReverse ? existing.id : goal.anchorNodeId,
        target: isReverse ? goal.anchorNodeId : existing.id,
        relationType: f.relation,
      });
    } else {
      // [Ref: MD Sec 3.3.3] Target is new → spawn HYPOTHESIS + edge
      const newNode: ISSMNode = {
        id: `node_${crypto.randomUUID()}`,
        label: isReverse ? f.subject : f.object,
        type: isReverse ? f.subjectType : f.objectType,
        status: 'HYPOTHESIS' as NodeStatus,
        // [Ref: MD Sec 5.1] canBeConfirmed defaults to true
        canBeConfirmed: f.canBeConfirmed ?? true,
        // [Ref: Paper 1 Sec 3.2.2 / Gap 4] CF derived from KB fragment.
        // Uses specificity as the initial certainty — how diagnostic this
        // fragment is for the spawned concept. Defaults to 0.5 if absent.
        cf: f.metadata.specificity ?? 0.5,
      };
      nodes.push(newNode);
      edges.push({
        id: `edge_${crypto.randomUUID()}`,
        source: isReverse ? newNode.id : goal.anchorNodeId,
        target: isReverse ? goal.anchorNodeId : newNode.id,
        relationType: f.relation,
      });
    }
  }

  if (nodes.length === 0 && edges.length === 0) {
    return { type: 'NO_MATCH', goal };
  }

  return { type: 'PATCH', nodes, edges };
}
