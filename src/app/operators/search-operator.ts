/**
 * @fileoverview Search Operator — second operator in the Triple-Operator cycle.
 *
 * The Search Operator scores and ranks all active goals using a weighted
 * heuristic formula derived from Knowledge Base metadata and the current
 * Strategy. It returns the single highest-scoring goal along with a
 * Rationale Packet that explains exactly why that goal won.
 *
 * This is the engine's "decision-making" step — it determines WHICH gap
 * to fill next. The scoring formula is intentionally simple and transparent
 * (a linear combination of three factors) so that users can understand and
 * tune the engine's behavior via strategy weights.
 *
 * This is a **pure function** — no side effects, no service dependencies.
 *
 * @remarks
 * DESIGN DECISION: The Search Operator performs a read-only query against
 * the KB to extract metadata for scoring, but it never mutates the KB or
 * SSM. The actual KB-to-SSM bridging (creating nodes) is the Knowledge
 * Operator's job. This separation keeps each operator's responsibility clear.
 */

import { IGoal, ISSMState } from '../models/ssm.model';
import { IKnowledgeFragment } from '../models/knowledge-base.model';
import { IStrategy, IRationaleFactor, IReasoningStep } from '../models/strategy.model';

/**
 * Scores all goals and returns the highest-scoring one with a full rationale.
 *
 * **Scoring formula for EXPAND goals:**
 * ```
 * rawScore = (MAX(urgency) × 100 × urgency_weight)
 *          + (parsimony_bonus × parsimony_weight)
 *          - (MEAN(inquiryCost) × 100 × costAversion_weight)
 * ```
 *
 * **Scoring formula for STATUS_UPGRADE goals:**
 * ```
 * rawScore = 200 × parsimony_weight
 * ```
 *
 * **UNKNOWN_Anchor_Penalty:** If the anchor node has status UNKNOWN,
 * `totalScore = rawScore × unknownPenalty` (default 0.05, i.e., 95% reduction).
 *
 * @param goals - Non-empty array of goals from the Goal Generator
 * @param ssm - Current SSM state snapshot
 * @param kb - All Knowledge Base fragments
 * @param strategy - Current strategy with weights and name
 * @param unknownPenalty - Multiplicative penalty for UNKNOWN anchors (default 0.05)
 * @returns The winning goal and its complete Rationale Packet
 *
 * @remarks
 * DESIGN DECISION: `actionTaken` is left as an empty string in the returned
 * rationale. The Inference Engine orchestrator fills it in AFTER the Knowledge
 * Operator returns, because only then does the engine know what actually happened
 * (PATCH, STATUS_UPGRADE, or INQUIRY). This avoids speculative descriptions.
 */
export function scoreGoals(
  goals: IGoal[],
  ssm: ISSMState,
  kb: IKnowledgeFragment[],
  strategy: IStrategy,
  unknownPenalty: number = 0.05
): { selectedGoal: IGoal; rationale: IReasoningStep } {
  const scored = goals.map(goal => {
    const anchor = ssm.nodes.find(n => n.id === goal.anchorNodeId);
    const factors: IRationaleFactor[] = [];

    if (goal.kind === 'STATUS_UPGRADE') {
      // DESIGN DECISION: STATUS_UPGRADE goals receive a fixed parsimony score
      // of 200 (vs. 50 for EXPAND parsimony bonus). The 4× multiplier ensures
      // that promotion is strongly preferred when conditions are met, because
      // converging the model (confirming a hypothesis) is always more valuable
      // than expanding it further. This implements the "confirm before explore" heuristic.
      const parsimonyScore = 200 * strategy.weights.parsimony;
      factors.push({
        label: 'Status Upgrade Parsimony',
        impact: parsimonyScore,
        explanation: `Promoting "${anchor?.label}" to CONFIRMED converges the model.`,
      });
      const rawScore = parsimonyScore;

      // Apply UNKNOWN penalty if the anchor is somehow UNKNOWN
      // (shouldn't happen for STATUS_UPGRADE since we only generate these
      // for HYPOTHESIS nodes, but defensive coding for consistency)
      const totalScore = anchor?.status === 'UNKNOWN'
        ? rawScore * unknownPenalty
        : rawScore;
      return { goal, totalScore, rawScore, factors };
    }

    // --- EXPAND goal scoring ---

    // DESIGN DECISION: Match KB fragments by label + relation, same as the
    // Knowledge Operator will do. This ensures the Search Operator's score
    // reflects what the Knowledge Operator will actually find.
    const matchingFragments = kb.filter(
      f => f.subject === goal.anchorLabel && f.relation === goal.targetRelation
    );

    // DESIGN DECISION: MAX(urgency), not MEAN. The engine must pivot to the
    // most dangerous possibility immediately to satisfy the "Safety-First"
    // requirement. If one KB fragment says "Fever CAUSES Bacterial Meningitis"
    // with urgency=1.0 and another says "Fever CAUSES Common Cold" with
    // urgency=0.1, the goal should score as if urgency=1.0. Using MEAN would
    // dilute the life-threatening signal.
    const maxUrgency = matchingFragments.length > 0
      ? Math.max(...matchingFragments.map(f => f.metadata.urgency))
      : 0;

    // DESIGN DECISION: MEAN(inquiryCost), not MAX. Unlike urgency (where we
    // must assume the worst case), cost is an expected-value calculation.
    // The engine doesn't know which specific fragment will be relevant, so
    // the average cost across all matching fragments is the best estimate.
    const meanCost = matchingFragments.length > 0
      ? matchingFragments.reduce((sum, f) => sum + f.metadata.inquiryCost, 0) / matchingFragments.length
      : 0;

    // Scale factors to comparable magnitudes (×100) then apply strategy weights
    const urgencyScore = maxUrgency * 100 * strategy.weights.urgency;

    // DESIGN DECISION: Parsimony bonus is a fixed 50 points (before weight)
    // awarded when the SSM already contains at least one node of the target type.
    // This rewards goals that connect to existing knowledge rather than introducing
    // entirely new entity types. The value 50 was chosen to be meaningful but not
    // dominant — urgency (up to 100) can still override parsimony.
    const parsimonyScore = ssm.nodes.some(n => n.type === goal.targetType)
      ? 50 * strategy.weights.parsimony
      : 0;

    const costScore = meanCost * 100 * strategy.weights.costAversion;

    factors.push(
      { label: 'Clinical Urgency', impact: urgencyScore, explanation: `MAX(urgency) from KB for "${anchor?.label}" → ${goal.targetRelation}.` },
      { label: 'Parsimony', impact: parsimonyScore, explanation: `Model already contains ${goal.targetType} nodes.` },
      { label: 'Inquiry Cost', impact: -costScore, explanation: `MEAN(inquiryCost) from KB fragments.` },
    );

    const rawScore = urgencyScore + parsimonyScore - costScore;

    // DESIGN DECISION: UNKNOWN_Anchor_Penalty is multiplicative (0.05×), not
    // additive. This ensures that goals anchored on UNKNOWN nodes are almost
    // completely suppressed regardless of their raw score. An additive penalty
    // could be overcome by high urgency, but a 95% multiplicative reduction
    // effectively kills the branch. This implements the "dead hypothesis" behavior:
    // if a mandatory finding is UNKNOWN, all downstream reasoning is suppressed.
    const totalScore = anchor?.status === 'UNKNOWN'
      ? rawScore * unknownPenalty
      : rawScore;

    return { goal, totalScore, rawScore, factors };
  });

  // DESIGN DECISION: Stable sort (highest score first, ties broken by array order).
  // JavaScript's Array.sort is not guaranteed stable in all engines, but modern
  // engines (V8, SpiderMonkey) implement stable sort. Tie-breaking by array order
  // means EXPAND goals (generated first) are preferred over STATUS_UPGRADE goals
  // at equal scores, which is the desired behavior — expand before promote when
  // scores are tied.
  scored.sort((a, b) => b.totalScore - a.totalScore);
  const winner = scored[0];

  return {
    selectedGoal: winner.goal,
    rationale: {
      timestamp: Date.now(),
      selectedGoal: winner.goal,
      totalScore: winner.totalScore,
      factors: winner.factors,
      strategyName: strategy.name,
      // Left empty — the orchestrator fills this in after the Knowledge Operator
      // returns, because only then is the actual action known.
      actionTaken: '',
    },
  };
}
