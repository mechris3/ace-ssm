/**
 * @fileoverview Goal Generator — first operator in the Triple-Operator cycle.
 *
 * The Goal Generator performs **abductive reasoning** (inference to the best
 * explanation) by comparing the current SSM graph against the Task Structure
 * grammar to identify logical "gaps" — relations that SHOULD exist according
 * to the grammar but DON'T yet have corresponding edges in the SSM.
 *
 * It produces two kinds of goals:
 * 1. **EXPAND goals** — "This node should have a CAUSES edge but doesn't yet."
 * 2. **STATUS_UPGRADE goals** — "This HYPOTHESIS has all CONFIRMED_BY evidence;
 *    it should be promoted to CONFIRMED."
 *
 * This is a **pure function** — no side effects, no service dependencies.
 * It reads the SSM and Task Structure snapshots and returns a list of goals.
 *
 * @remarks
 * DESIGN DECISION: The Goal Generator is the only operator that reads the
 * Task Structure. The Search Operator and Knowledge Operator only read the
 * Knowledge Base. This separation of concerns keeps each operator focused
 * on a single layer of the Data Trinity.
 */

import { ISSMState, IGoal, GoalKind } from '../models/ssm.model';
import { ITaskStructure } from '../models/task-structure.model';

/**
 * Generates all actionable goals by detecting gaps in the SSM relative to
 * the Task Structure grammar, plus STATUS_UPGRADE opportunities.
 *
 * **Gap detection algorithm (EXPAND goals):**
 * For each node in the SSM, find all Task Structure relations where
 * `relation.from === node.type`. For each such relation, check if an edge
 * already exists with `source === node.id && relationType === relation.type`.
 * If no such edge exists, emit an EXPAND goal.
 *
 * **STATUS_UPGRADE detection algorithm:**
 * For each HYPOTHESIS node, find all outgoing CONFIRMED_BY edges. If at
 * least one exists AND every target node has status CONFIRMED, emit a
 * STATUS_UPGRADE goal.
 *
 * @param ssm - Current SSM state snapshot (Layer 3 — Working Memory)
 * @param taskStructure - Task Structure definition (Layer 1 — The Rules)
 * @returns Array of goals to be scored by the Search Operator
 *
 * @remarks
 * DESIGN DECISION: STATUS_UPGRADE goes through the full Triple-Operator
 * cycle (Goal → Search → Knowledge) rather than being handled as a special
 * case in the reducer. This ensures every SSM mutation has a corresponding
 * ReasoningStep in the history, maintaining the "Glass Box" audit trail.
 */
export function generateGoals(ssm: ISSMState, taskStructure: ITaskStructure): IGoal[] {
  // --- EXPAND GOALS ---
  // For each node, find Task Structure relations where this node's type is
  // the "from" side, then filter out relations that already have an edge.
  // This is the core "gap detection" logic — it identifies what the grammar
  // says SHOULD exist but the SSM doesn't have yet.
  const expandGoals = ssm.nodes.flatMap(node => {
    // Find all relations that this node type can originate
    const validRelations = taskStructure.relations.filter(r => r.from === node.type);
    return validRelations
      // Filter out relations where an edge already exists from this node.
      // DESIGN DECISION: We check (source === node.id && relationType === rel.type),
      // not (source === node.id && target type matches). This means one edge per
      // (node, relationType) pair closes the gap, even if multiple KB fragments
      // could match. The multi-hypothesis spawning in the Knowledge Operator
      // creates ALL matching nodes in a single PATCH, so one edge-check is sufficient.
      .filter(rel => !ssm.edges.some(
        e => e.source === node.id && e.relationType === rel.type
      ))
      .map(rel => ({
        id: `goal_${crypto.randomUUID()}`,
        kind: 'EXPAND' as GoalKind,
        anchorNodeId: node.id,
        // Cache the label now so the Knowledge Operator can use it for
        // label-based KB matching without a second SSM lookup
        anchorLabel: node.label,
        targetRelation: rel.type,
        targetType: rel.to,
      }));
  });

  // --- STATUS_UPGRADE GOALS ---
  // For each HYPOTHESIS node, check if all CONFIRMED_BY targets are CONFIRMED.
  // This implements transitive confirmation: a HYPOTHESIS can only be promoted
  // when its evidence chain bottoms out at confirmed observations.
  const upgradeGoals = ssm.nodes
    .filter(node => node.status === 'HYPOTHESIS')
    .filter(node => {
      const confirmedByEdges = ssm.edges.filter(
        e => e.source === node.id && e.relationType === 'CONFIRMED_BY'
      );
      // DESIGN DECISION: Must have at least one CONFIRMED_BY edge.
      // A HYPOTHESIS with zero CONFIRMED_BY edges can never be promoted —
      // it needs explicit evidence. This prevents vacuous truth from
      // auto-promoting hypotheses that simply haven't been investigated yet.
      if (confirmedByEdges.length === 0) return false;

      // DESIGN DECISION: The check is purely structural — it reads the current
      // SSM snapshot and does NOT recurse into the targets' own CONFIRMED_BY
      // chains. Transitivity emerges naturally over multiple pulses: if target A
      // is itself a HYPOTHESIS, it won't be CONFIRMED yet, so this check fails.
      // Once A gets promoted (on a future pulse), this check will pass on the
      // next pulse. This avoids recursive graph traversal in a pure function.
      return confirmedByEdges.every(edge => {
        const target = ssm.nodes.find(n => n.id === edge.target);
        return target?.status === 'CONFIRMED';
      });
    })
    .map(node => ({
      id: `goal_${crypto.randomUUID()}`,
      kind: 'STATUS_UPGRADE' as GoalKind,
      anchorNodeId: node.id,
      anchorLabel: node.label,
      // DESIGN DECISION: targetRelation is the literal string "STATUS_UPGRADE"
      // rather than a real relation type. This makes it easy to identify in
      // the reasoning history and ensures it won't accidentally match any
      // Task Structure relation during KB lookup (which it bypasses anyway).
      targetRelation: 'STATUS_UPGRADE',
      targetType: node.type,
    }));

  return [...expandGoals, ...upgradeGoals];
}
