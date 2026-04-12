/**
 * @fileoverview Goal Generator — Operator 1 of the Triple-Operator cycle.
 * [Ref: MD Sec 3.1 - Goal Generator]
 *
 * Performs **abductive reasoning** by comparing the SSM graph against the
 * Task Structure grammar to identify logical "gaps" — relations that SHOULD
 * exist but DON'T yet have corresponding edges.
 *
 * Produces two kinds of goals:
 *   1. EXPAND goals  — fill a structural gap (Sec 3.1.1)
 *   2. STATUS_UPGRADE goals — promote a HYPOTHESIS to CONFIRMED (Sec 3.1.2)
 *
 * Pure function — no side effects, no service dependencies.
 * [Ref: MD Sec 10 Invariant 6 - Pure Operators]
 *
 * WHY: The Goal Generator is the only operator that reads the Task Structure
 * (Layer 1). The Search Operator and Knowledge Operator only read the KB
 * (Layer 2). This separation keeps each operator focused on a single layer
 * of the Data Trinity (Sec 1.1).
 */

import { ISSMState, IGoal, GoalKind, GoalDirection } from '../models/ssm.model';
import { ITaskStructure } from '../models/task-structure.model';

/**
 * Generates all actionable goals from the current SSM state.
 * [Ref: MD Sec 3.1 - Goal Generator]
 *
 * @param ssm - Current SSM state snapshot (Layer 3)
 * @param taskStructure - Task Structure definition (Layer 1)
 * @returns Array of goals to be scored by the Search Operator
 */
export function generateGoals(ssm: ISSMState, taskStructure: ITaskStructure): IGoal[] {

  // ═══════════════════════════════════════════════════════════════════
  // EXPAND GOALS — Gap Detection
  // [Ref: MD Sec 3.1.1 - EXPAND Goal Detection]
  //
  // WHY: For each node, we compare its type against the Task Structure
  // relations to find "gaps" — relations the grammar says SHOULD exist
  // but the SSM doesn't have yet. Each gap becomes an EXPAND goal.
  // ═══════════════════════════════════════════════════════════════════
  const expandGoals = ssm.nodes.flatMap(node => {

    // ── Forward goals ──────────────────────────────────────────────
    // [Ref: MD Sec 3.1.1 - Forward goals]
    // Relations where this node's type is the "from" side.
    // WHY: Forward reasoning asks "what does this node lead to?"
    const forwardRelations = taskStructure.relations.filter(r => r.from === node.type);
    const forwardGoals = forwardRelations
      .filter(rel => !ssm.edges.some(
        e => e.source === node.id && e.relationType === rel.type
      ))
      .map(rel => ({
        id: `goal_${crypto.randomUUID()}`,
        kind: 'EXPAND' as GoalKind,
        anchorNodeId: node.id,
        anchorLabel: node.label,
        targetRelation: rel.type,
        targetType: rel.to,
        direction: 'forward' as GoalDirection,
      }));

    // ── Reverse goals (abductive) ─────────────────────────────────
    // [Ref: MD Sec 3.1.1 - Reverse goals / Directional Locking]
    // Relations where this node's type is the "to" side.
    // WHY: Reverse/abductive reasoning asks "what explains this node?"
    // This is the primary driver of diagnostic inference — starting
    // from confirmed symptoms and reasoning backward to causes.
    //
    // DIRECTIONAL LOCKING: Only REFUTED nodes are excluded from
    // reverse goal generation. CONFIRMED nodes DO generate reverse
    // goals because seed observations need abductive reasoning.
    // WHY: Circular re-spawning is prevented downstream by the
    // Knowledge Operator's graph merging logic (Sec 4.6), not here.
    const reverseGoals = node.status === 'REFUTED'
      ? []
      : taskStructure.relations.filter(r => r.to === node.type)
          .filter(rel => !ssm.edges.some(
            e => e.target === node.id && e.relationType === rel.type
          ))
          .map(rel => ({
            id: `goal_${crypto.randomUUID()}`,
            kind: 'EXPAND' as GoalKind,
            anchorNodeId: node.id,
            anchorLabel: node.label,
            targetRelation: rel.type,
            targetType: rel.from,
            direction: 'reverse' as GoalDirection,
          }));

    return [...forwardGoals, ...reverseGoals];
  });

  // ═══════════════════════════════════════════════════════════════════
  // STATUS_UPGRADE GOALS
  // [Ref: MD Sec 3.1.2 - STATUS_UPGRADE Goal Detection]
  //
  // WHY: A HYPOTHESIS can be promoted to CONFIRMED when ALL of its
  // CONFIRMED_BY targets are themselves CONFIRMED. This goes through
  // the full Triple-Operator cycle (not a special case) so every
  // mutation has a ReasoningStep in the audit trail (Sec 10 Invariant 5).
  // ═══════════════════════════════════════════════════════════════════
  const upgradeGoals = ssm.nodes
    .filter(node => node.status === 'HYPOTHESIS')
    .filter(node => {
      const confirmedByEdges = ssm.edges.filter(
        e => e.source === node.id && e.relationType === 'CONFIRMED_BY'
      );
      // WHY: Must have at least one CONFIRMED_BY edge. Zero edges = vacuous
      // truth, which would auto-promote uninvestigated hypotheses.
      if (confirmedByEdges.length === 0) return false;

      // WHY: Non-recursive check. Transitivity emerges naturally over
      // multiple pulses — if a target is itself a HYPOTHESIS, this check
      // fails now but will pass once that target gets promoted later.
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
      targetRelation: 'STATUS_UPGRADE',
      targetType: node.type,
      direction: 'forward' as GoalDirection,
    }));

  // ═══════════════════════════════════════════════════════════════════
  // DECLARATIVE GOAL CONSTRAINTS
  // [Ref: Paper 2 Sec 4.1 / Gap Analysis Gap 8]
  //
  // WHY: Domain authors can define custom goal constraints in the Task
  // Structure. These are evaluated in addition to the built-in gap
  // detection, allowing domain-specific reasoning rules without
  // changing the engine code.
  // ═══════════════════════════════════════════════════════════════════
  const constraintGoals: IGoal[] = [];
  if (taskStructure.goalConstraints) {
    for (const constraint of taskStructure.goalConstraints) {
      const matchingNodes = ssm.nodes.filter(n => {
        if (n.type !== constraint.nodeType) return false;
        if (constraint.onlyStatus && n.status !== constraint.onlyStatus) return false;
        return true;
      });

      for (const node of matchingNodes) {
        const hasEdge = constraint.direction === 'forward'
          ? ssm.edges.some(e => e.source === node.id && e.relationType === constraint.requiredRelation)
          : ssm.edges.some(e => e.target === node.id && e.relationType === constraint.requiredRelation);

        if (!hasEdge) {
          const rel = taskStructure.relations.find(r => r.type === constraint.requiredRelation);
          if (rel) {
            constraintGoals.push({
              id: `goal_${crypto.randomUUID()}`,
              kind: 'EXPAND' as GoalKind,
              anchorNodeId: node.id,
              anchorLabel: node.label,
              targetRelation: constraint.requiredRelation,
              targetType: constraint.direction === 'forward' ? rel.to : rel.from,
              direction: constraint.direction as GoalDirection,
            });
          }
        }
      }
    }
  }

  return [...expandGoals, ...upgradeGoals, ...constraintGoals];
}
