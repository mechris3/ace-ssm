/**
 * @fileoverview Search Operator — Operator 2 of the Triple-Operator cycle.
 * [Ref: MD Sec 3.2 - Search Operator]
 *
 * Scores and ranks all active goals using a weighted heuristic formula
 * derived from KB metadata and the current Strategy. Returns the single
 * highest-scoring goal along with a Rationale Packet explaining why it won.
 *
 * Pure function — no side effects, no service dependencies.
 * [Ref: MD Sec 10 Invariant 6 - Pure Operators]
 */

import { IGoal, ISSMState } from '../models/ssm.model';
import { IKnowledgeFragment } from '../models/knowledge-base.model';
import { IStrategy, IRationaleFactor, IReasoningStep } from '../models/strategy.model';

/**
 * Scores all goals and returns the highest-scoring one with a full rationale.
 * [Ref: MD Sec 3.2.1 - Scoring Formula for EXPAND Goals]
 * [Ref: MD Sec 3.2.2 - Scoring Formula for STATUS_UPGRADE Goals]
 *
 * @param goals - Non-empty array of goals from the Goal Generator
 * @param ssm - Current SSM state snapshot (Layer 3)
 * @param kb - All Knowledge Base fragments (Layer 2)
 * @param strategy - Current strategy with weights and name
 * @param unknownPenalty - Multiplicative penalty for UNKNOWN anchors (default 0.05)
 * @returns The winning goal and its complete Rationale Packet
 */
export function scoreGoals(
  goals: IGoal[],
  ssm: ISSMState,
  kb: IKnowledgeFragment[],
  strategy: IStrategy,
  unknownPenalty: number = 0.05,
  solutionFocusNodeId: string | null = null
): { selectedGoal: IGoal; rationale: IReasoningStep } {

  // [Ref: Paper 1 Sec 3.2.3 / Gap 2] Build the set of node IDs reachable
  // from the solution focus for the focus bonus calculation.
  const focusSubgraphIds = new Set<string>();
  if (solutionFocusNodeId) {
    const queue = [solutionFocusNodeId];
    focusSubgraphIds.add(solutionFocusNodeId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const e of ssm.edges) {
        const src = typeof e.source === 'string' ? e.source : (e.source as any).id;
        const tgt = typeof e.target === 'string' ? e.target : (e.target as any).id;
        if (src === current && !focusSubgraphIds.has(tgt)) {
          focusSubgraphIds.add(tgt);
          queue.push(tgt);
        }
        if (tgt === current && !focusSubgraphIds.has(src)) {
          focusSubgraphIds.add(src);
          queue.push(src);
        }
      }
    }
  }

  const scored = goals.map(goal => {
    const anchor = ssm.nodes.find(n => n.id === goal.anchorNodeId);
    const factors: IRationaleFactor[] = [];

    // ═════════════════════════════════════════════════════════════════
    // STATUS_UPGRADE Scoring
    // [Ref: MD Sec 3.2.2 - Scoring Formula for STATUS_UPGRADE Goals]
    // rawScore = 200 × weights.parsimony
    // WHY: The 4× multiplier over EXPAND parsimony (50) ensures
    // promotion is strongly preferred — "confirm before explore".
    // [Ref: MD Sec 10 Invariant 9 - Confirm before explore]
    // ═════════════════════════════════════════════════════════════════
    if (goal.kind === 'STATUS_UPGRADE') {
      const parsimonyScore = 200 * strategy.weights.parsimony;
      factors.push({
        label: 'Status Upgrade Parsimony',
        impact: parsimonyScore,
        explanation: `Promoting "${anchor?.label}" to CONFIRMED converges the model.`,
      });
      const rawScore = parsimonyScore;

      // [Ref: MD Sec 3.2.3 - Anchor Status Penalties]
      let totalScore = rawScore;
      if (anchor?.status === 'REFUTED') {
        totalScore = rawScore * 0.01;
      } else if (anchor?.status === 'UNKNOWN') {
        totalScore = rawScore * unknownPenalty;
      }
      return { goal, totalScore, rawScore, factors };
    }

    // ═════════════════════════════════════════════════════════════════
    // EXPAND Goal Scoring
    // [Ref: MD Sec 3.2.1 - Scoring Formula for EXPAND Goals]
    // rawScore = (MAX(urgency) × 100 × urgencyWeight)
    //          + (parsimony_bonus × parsimonyWeight)
    //          - (MEAN(inquiryCost) × 100 × costAversionWeight)
    // ═════════════════════════════════════════════════════════════════
    const isReverse = goal.direction === 'reverse';

    // [Ref: MD Sec 10 Invariant 3 - Dual-key KB matching]
    const anchorKeys = new Set([goal.anchorLabel, goal.anchorNodeId]);

    // [Ref: MD Sec 3.3.2 - Cascading Search] mirrors Knowledge Operator
    // Priority 1: Exact relation match. Priority 2: Broad fallback.
    let matchingFragments = isReverse
      ? kb.filter(f => anchorKeys.has(f.object) && f.relation === goal.targetRelation)
      : kb.filter(f => anchorKeys.has(f.subject) && f.relation === goal.targetRelation);

    if (matchingFragments.length === 0) {
      matchingFragments = isReverse
        ? kb.filter(f => anchorKeys.has(f.object))
        : kb.filter(f => anchorKeys.has(f.subject));
    }

    // ── Clinical Urgency ──────────────────────────────────────────
    // [Ref: MD Sec 3.2.1] MAX(urgency), not MEAN.
    // WHY: The engine must pivot to the most dangerous possibility
    // immediately ("Safety-First"). MEAN would dilute a single
    // life-threatening signal among benign alternatives.
    const maxUrgency = matchingFragments.length > 0
      ? Math.max(...matchingFragments.map(f => f.metadata.urgency))
      : 0;

    // ── Inquiry Cost ──────────────────────────────────────────────
    // [Ref: MD Sec 3.2.1] MEAN(inquiryCost), not MAX.
    // WHY: Cost is an expected-value calculation — the engine doesn't
    // know which specific fragment will be relevant, so the average
    // across all matching fragments is the best estimate.
    const meanCost = matchingFragments.length > 0
      ? matchingFragments.reduce((sum, f) => sum + f.metadata.inquiryCost, 0) / matchingFragments.length
      : 0;

    const urgencyScore = maxUrgency * 100 * strategy.weights.urgency;

    // ── Parsimony ─────────────────────────────────────────────────
    // [Ref: MD Sec 3.2.1 - Parsimony bonus]
    // Base: 50 points if SSM already has a node of the target type.
    // Multi-evidence bonus: +30 per additional CONFIRMED node that
    // the candidate explains.
    // WHY: Prioritizes Conditions that unify multiple confirmed
    // findings (convergence/parsimony principle).
    let parsimonyScore = ssm.nodes.some(n => n.type === goal.targetType)
      ? 50 * strategy.weights.parsimony
      : 0;

    if (isReverse && matchingFragments.length > 0) {
      const confirmedLabels = new Set(
        ssm.nodes.filter(n => n.status === 'CONFIRMED').flatMap(n => [n.label, n.id])
      );
      for (const frag of matchingFragments) {
        const candidateLabel = frag.subject;
        const confirmedLinks = kb.filter(f =>
          f.subject === candidateLabel && confirmedLabels.has(f.object)
        ).length;
        if (confirmedLinks > 1) {
          parsimonyScore += (confirmedLinks - 1) * 30 * strategy.weights.parsimony;
        }
      }
    }

    const costScore = meanCost * 100 * strategy.weights.costAversion;

    factors.push(
      { label: 'Clinical Urgency', impact: urgencyScore, explanation: `MAX(urgency) from KB for "${anchor?.label}" → ${goal.targetRelation}.` },
      { label: 'Parsimony', impact: parsimonyScore, explanation: `Model already contains ${goal.targetType} nodes.` },
      { label: 'Inquiry Cost', impact: -costScore, explanation: `MEAN(inquiryCost) from KB fragments.` },
    );

    // [Ref: Paper 1 Sec 3.2.2 / Gap 4] CF bonus: goals anchored on
    // high-certainty nodes score higher. This ensures the engine prefers
    // to expand well-supported hypotheses over uncertain ones.
    const cfBonus = (anchor?.cf ?? 0.5) * 20 * strategy.weights.parsimony;
    factors.push(
      { label: 'Certainty', impact: cfBonus, explanation: `Anchor "${anchor?.label}" has CF=${(anchor?.cf ?? 0.5).toFixed(2)}.` },
    );

    // [Ref: Paper 1 Sec 3.2.3 / Gap 2] Focus bonus: goals within the
    // currently focused SSM subgraph score higher.
    const focusBonus = (focusSubgraphIds.size > 0 && focusSubgraphIds.has(goal.anchorNodeId))
      ? 25 * strategy.weights.parsimony
      : 0;
    if (focusBonus > 0) {
      factors.push(
        { label: 'Solution Focus', impact: focusBonus, explanation: `Goal is within the focused candidate subgraph.` },
      );
    }

    // [Ref: Paper 2 Sec 3.2 Fig 7 / Gap 3] S_L ordering bonus: goals
    // matching earlier positions in the entity-type-specific ordering
    // score higher. This implements "test before refine" and similar
    // local strategic principles from the paper's node-chain matrix.
    let orderingBonus = 0;
    if (strategy.goalOrdering && anchor) {
      const ordering = strategy.goalOrdering[anchor.type];
      if (ordering && ordering.length > 0) {
        const position = ordering.indexOf(goal.targetRelation);
        if (position >= 0) {
          // Earlier positions get higher bonus: first = 40, second = 30, etc.
          orderingBonus = Math.max(0, 40 - position * 10) * strategy.weights.parsimony;
        }
        // Goals with relations not in the ordering get 0 bonus (lowest priority)
      }
    }
    if (orderingBonus > 0) {
      factors.push(
        { label: 'S_L Ordering', impact: orderingBonus, explanation: `Relation "${goal.targetRelation}" is priority ${strategy.goalOrdering?.[anchor?.type ?? '']?.indexOf(goal.targetRelation) ?? '?'} for ${anchor?.type} nodes.` },
      );
    }

    const rawScore = urgencyScore + parsimonyScore + cfBonus + focusBonus + orderingBonus - costScore;

    // ═════════════════════════════════════════════════════════════════
    // Anchor Status Penalties
    // [Ref: MD Sec 3.2.3 - Anchor Status Penalties]
    //
    // REFUTED (0.01×): User explicitly rejected — branch is dead.
    // UNKNOWN (0.05×): Unresolved — heavily suppressed.
    // SKIPPED (−urgency): Deferred — loses urgency but keeps parsimony.
    //
    // WHY: Multiplicative penalties (REFUTED, UNKNOWN) cannot be
    // overcome by high urgency. SKIPPED is subtractive so the goal
    // can still compete on parsimony alone.
    // [Ref: MD Sec 10 Invariant 8 - Status-based scoring penalties]
    // ═════════════════════════════════════════════════════════════════
    let totalScore = rawScore;
    if (anchor?.status === 'REFUTED') {
      totalScore = rawScore * 0.01;
      factors.push({
        label: 'Refuted Anchor Penalty',
        impact: -(rawScore * 0.99),
        explanation: `Anchor "${anchor.label}" was refuted by user — 99% penalty applied.`,
      });
    } else if (anchor?.status === 'UNKNOWN') {
      totalScore = rawScore * unknownPenalty;
    } else if (anchor?.status === 'SKIPPED') {
      totalScore = rawScore - urgencyScore;
      factors.push({
        label: 'Skipped Anchor',
        impact: -urgencyScore,
        explanation: `Anchor "${anchor.label}" was skipped — urgency bonus removed for this cycle.`,
      });
    }

    return { goal, totalScore, rawScore, factors };
  });

  // ═══════════════════════════════════════════════════════════════════
  // Winner Selection
  // [Ref: MD Sec 3.2.4 - Tie-Breaking]
  // WHY: Stable sort by descending score. Ties broken by array order,
  // which means EXPAND goals (generated first) are preferred over
  // STATUS_UPGRADE goals at equal scores.
  // ═══════════════════════════════════════════════════════════════════
  scored.sort((a, b) => b.totalScore - a.totalScore);
  const winner = scored[0];

  // [Ref: MD Sec 3.2.5 - Rationale Packet]
  // WHY: actionTaken is left empty — the orchestrator fills it in AFTER
  // the Knowledge Operator returns, because only then is the actual
  // action known (Expanded, Linked, Promoted, or No KB match).
  return {
    selectedGoal: winner.goal,
    rationale: {
      timestamp: Date.now(),
      selectedGoal: winner.goal,
      totalScore: winner.totalScore,
      factors: winner.factors,
      strategyName: strategy.name,
      actionTaken: '',
    },
  };
}
