/**
 * @fileoverview Knowledge Operator — third and final operator in the Triple-Operator cycle.
 *
 * The Knowledge Operator resolves the winning goal by matching it against the
 * Knowledge Base (Layer 2). It is the bridge between the engine's reasoning
 * (goals) and the domain knowledge (KB fragments).
 *
 * Three possible outcomes:
 * 1. **PATCH** — KB fragments matched; spawn HYPOTHESIS nodes for ALL matches.
 * 2. **STATUS_UPGRADE_PATCH** — Goal is STATUS_UPGRADE; bypass KB entirely.
 * 3. **INQUIRY_REQUIRED** — No KB fragments matched; the user must provide input.
 *
 * This is a **pure function** — no side effects, no service dependencies.
 *
 * @remarks
 * DESIGN DECISION: The Knowledge Operator uses **label-based matching** (not ID-based).
 * It matches `goal.anchorLabel` (a domain term like "Fever") against
 * `fragment.subject` (also "Fever"). This is what makes the KB universal —
 * the same fragment applies to ANY SSM node with the matching label, regardless
 * of when or how that node was created. IDs are ephemeral (UUID-based); labels
 * are domain-stable.
 */

import { IGoal, ISSMNode, ISSMEdge, NodeStatus } from '../models/ssm.model';
import { IKnowledgeFragment } from '../models/knowledge-base.model';
import { KnowledgeOperatorResult } from '../models/engine.model';

/**
 * Resolves a goal against the Knowledge Base and returns the appropriate result.
 *
 * **For EXPAND goals:**
 * Filters KB fragments where `subject === goal.anchorLabel` AND
 * `relation === goal.targetRelation`. If matches are found, ALL are
 * instantiated as HYPOTHESIS nodes in a single PATCH (multi-hypothesis
 * spawning). If no matches are found, returns INQUIRY_REQUIRED.
 *
 * **For STATUS_UPGRADE goals:**
 * Bypasses the KB entirely and returns a STATUS_UPGRADE_PATCH. The Goal
 * Generator already verified that all CONFIRMED_BY targets are CONFIRMED,
 * so no further KB consultation is needed.
 *
 * @param goal - The winning goal from the Search Operator
 * @param kb - All Knowledge Base fragments
 * @returns A discriminated union result (PATCH | STATUS_UPGRADE_PATCH | INQUIRY_REQUIRED)
 *
 * @remarks
 * DESIGN DECISION: Multi-hypothesis spawning creates ALL matching nodes in
 * one PATCH rather than picking the "best" match. This is deliberate — the
 * engine doesn't know which hypothesis is correct at this stage. Branching
 * is immediate; prioritization happens on the NEXT pulse when the Search
 * Operator scores the new EXPAND goals emanating from each hypothesis.
 * This avoids the need for a separate "branching" mechanism and keeps the
 * operator pipeline simple.
 */
export function resolveGoal(
  goal: IGoal,
  kb: IKnowledgeFragment[]
): KnowledgeOperatorResult {
  // DESIGN DECISION: STATUS_UPGRADE goals bypass KB entirely. The Knowledge
  // Operator acts as a pass-through — it doesn't need to look anything up
  // because the Goal Generator already verified the promotion conditions.
  // This keeps STATUS_UPGRADE in the Triple-Operator pipeline (for traceability)
  // without adding unnecessary KB queries.
  if (goal.kind === 'STATUS_UPGRADE') {
    return {
      type: 'STATUS_UPGRADE_PATCH',
      nodeId: goal.anchorNodeId,
      newStatus: 'CONFIRMED',
    };
  }

  // EXPAND goals: match by anchor label + target relation.
  // This is the label-based matching strategy — domain terms bridge SSM ↔ KB.
  const matches = kb.filter(
    f => f.subject === goal.anchorLabel && f.relation === goal.targetRelation
  );

  // No KB fragments match → the engine doesn't know about this relationship.
  // Return INQUIRY_REQUIRED so the orchestrator can create a QUESTION node
  // and pause for user input.
  if (matches.length === 0) {
    return { type: 'INQUIRY_REQUIRED', goal };
  }

  // Multi-hypothesis spawning: ALL matches become HYPOTHESIS nodes in a single PATCH.
  // Each node gets a fresh UUID and inherits its label and type from the KB fragment's
  // object side (e.g., fragment "Fever CAUSES Bacterial Meningitis" → node labeled
  // "Bacterial Meningitis" of type "ETIOLOGIC_AGENT").
  const nodes: ISSMNode[] = matches.map(f => ({
    id: `node_${crypto.randomUUID()}`,
    label: f.object,
    type: f.objectType,
    status: 'HYPOTHESIS' as NodeStatus,
  }));

  // Create one edge per new node, connecting the anchor to the new hypothesis.
  // The edge's relationType matches the goal's targetRelation, preserving the
  // Task Structure grammar in the SSM graph.
  const edges: ISSMEdge[] = nodes.map((node, i) => ({
    id: `edge_${crypto.randomUUID()}`,
    source: goal.anchorNodeId,
    target: node.id,
    relationType: goal.targetRelation,
  }));

  return { type: 'PATCH', nodes, edges };
}
