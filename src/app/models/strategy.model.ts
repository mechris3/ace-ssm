/**
 * @fileoverview Strategy Model — configurable heuristic weights and reasoning trace types.
 *
 * The Strategy controls HOW the engine reasons, not WHAT it reasons about.
 * By adjusting weights, a user can make the engine prioritize urgency
 * (safety-first), parsimony (converge quickly), or cost aversion (minimize
 * user interruptions). The named strategy is stamped on every ReasoningStep
 * so the audit trail records which tuning produced each decision.
 *
 * @remarks
 * DESIGN DECISION: Strategy weights are unbounded (not clamped to [0, 1])
 * because they are user-facing controls, not metadata. A user might set
 * urgency=5.0 to heavily prioritize safety, or costAversion=0.0 to ignore
 * inquiry cost entirely. The scoring formula handles any non-negative value
 * gracefully because it's a linear combination.
 */

import { IGoal } from './ssm.model';

/**
 * The three heuristic weight dimensions that control the Search Operator's
 * scoring formula.
 *
 * Each weight multiplies a corresponding term in the scoring formula:
 * - `urgency × 100 × weights.urgency` (additive)
 * - `parsimony_bonus × weights.parsimony` (additive)
 * - `inquiryCost × 100 × weights.costAversion` (subtractive)
 *
 * @remarks
 * DESIGN DECISION: Weights are unbounded rather than normalized to [0, 1].
 * This gives users full control over the relative importance of each factor.
 * The engine doesn't need normalized weights because the scoring formula is
 * a simple linear combination — any positive values work correctly.
 */
export interface IStrategyWeights {
  /**
   * Multiplier for clinical urgency. Higher values make the engine
   * prioritize the most dangerous possibilities first ("Safety-First").
   */
  urgency: number;

  /**
   * Multiplier for parsimony bonus. Higher values make the engine prefer
   * goals that converge the model (STATUS_UPGRADE, or expanding into
   * already-represented entity types).
   */
  parsimony: number;

  /**
   * Multiplier for inquiry cost penalty. Higher values make the engine
   * avoid goals that would likely require user interruption.
   */
  costAversion: number;
}

/**
 * A named inference strategy with heuristic weights and pacer timing.
 *
 * The `name` is stamped on every `IReasoningStep` so the reasoning history
 * records which strategy configuration produced each decision. This supports
 * the "Glass Box" goal of full traceability.
 */
export interface IStrategy {
  /**
   * Human-readable strategy name (e.g., "Balanced", "Safety-First", "Cost-Averse").
   * Stamped on every ReasoningStep for audit trail traceability.
   */
  name: string;

  /** The three heuristic weight dimensions. */
  weights: IStrategyWeights;

  /**
   * Delay between heartbeat pulses in milliseconds (0–2000).
   */
  pacerDelay: number;

  /**
   * Local strategic principles (S_L) — ordered subgoal types per entity type.
   * [Ref: Paper 1 Sec 3.2.3 / Paper 2 Sec 3.2 Fig 7 / Gap Analysis Gap 3]
   *
   * For each entity type, an ordered array of relation types specifying the
   * priority order for pursuing subgoals. Earlier entries have higher priority.
   *
   * Example for a medical diagnosis domain:
   * ```
   * {
   *   "Condition": ["CAUSED_BY", "TREATED_BY"],
   *   "Clinical_Finding": ["EXPLAINS", "CONFIRMED_BY"]
   * }
   * ```
   *
   * WHY: The paper's node-chain matrix (Fig 7b) prescribes that for a Disease
   * focus node, "test before refine" means pursuing D→?F before D→?Ds. This
   * translates to relation-type ordering per entity type. Goals matching earlier
   * positions in the ordering receive a higher scoring bonus.
   *
   * If absent or empty for a given entity type, all relation types are treated
   * equally (no ordering bonus).
   */
  goalOrdering?: Record<string, string[]>;
}

/**
 * A single factor contributing to a goal's heuristic score.
 *
 * Rationale factors are the atomic building blocks of the "Glass Box"
 * explanation. Each factor has a human-readable label, a numeric impact
 * (positive = helps, negative = hurts), and a prose explanation of WHY
 * this factor applies.
 *
 * @remarks
 * The sum of all `impact` values in a ReasoningStep's `factors` array
 * equals the raw score (before UNKNOWN_Anchor_Penalty). This invariant
 * is tested by Property 10 in the design spec.
 */
export interface IRationaleFactor {
  /** Short label identifying this factor (e.g., "Clinical Urgency", "Parsimony"). */
  label: string;

  /** Numeric contribution to the total score. Positive = additive, negative = subtractive. */
  impact: number;

  /** Human-readable explanation of why this factor has this impact. */
  explanation: string;
}

/**
 * A complete record of one inference step — the engine's "show your work" artifact.
 *
 * Every SSM mutation (PATCH, STATUS_UPGRADE, INQUIRY, RESOLVE) produces exactly
 * one ReasoningStep that is appended to `ISSMState.history`. This is the core
 * of the "Glass Box" transparency: any observer can replay the history and
 * understand exactly what the engine did and why.
 */
export interface IReasoningStep {
  /** Unix timestamp (ms) when this step was scored by the Search Operator. */
  timestamp: number;

  /** The goal that won the scoring competition for this pulse. */
  selectedGoal: IGoal;

  /** Final score after all factors and penalties (including UNKNOWN_Anchor_Penalty). */
  totalScore: number;

  /**
   * Breakdown of every factor that contributed to the score.
   * The sum of `factor.impact` values equals the raw score (pre-penalty).
   */
  factors?: IRationaleFactor[];

  /** Name of the strategy that was active when this step was scored. */
  strategyName: string;

  /**
   * Human-readable description of what the engine did with this goal.
   * Filled by the Inference Engine orchestrator AFTER the Knowledge Operator
   * returns its result (e.g., "Expanded 'Fever' via CAUSES → Bacterial Meningitis, Influenza").
   */
  actionTaken: string;

  /**
   * Snapshot of the diagnostic differential at the time of this step.
   * Shows the competing candidate solutions ranked by coverage + CF.
   * Optional — only present when the differential has been computed
   * (i.e., when root-type nodes exist in the SSM).
   *
   * Each entry is a compact summary: { label, coverage, total, cf, isComplete }.
   * This enables the audit trail to show the competitive landscape at
   * every decision point without requiring a separate UI query.
   */
  differentialSnapshot?: { label: string; coverage: number; total: number; cf: number; isComplete: boolean }[];
}

/**
 * The default strategy used on startup — equal weight to all three dimensions.
 *
 * @remarks
 * "Balanced" means urgency, parsimony, and cost aversion all have weight 1.0,
 * so no single factor dominates. The 1500ms pacer delay provides a comfortable
 * pace for observing the engine's reasoning in real time.
 */
export const initialStrategy: IStrategy = {
  name: 'Balanced',
  weights: { urgency: 1.0, parsimony: 1.0, costAversion: 1.0 },
  pacerDelay: 1500,
};
