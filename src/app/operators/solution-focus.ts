/**
 * @fileoverview Solution Focus Evaluator — Global Strategic Principles (S_G).
 * [Ref: Paper 1 Sec 3.2.3 / Paper 2 Sec 3.2 / Gap Analysis Gap 2]
 *
 * Evaluates whether the solution focus should switch to a different
 * candidate in the diagnostic differential after each pulse.
 *
 * The paper defines six principles (s1-s6). We implement a simplified
 * version that covers the most impactful ones:
 *
 *   (s1) Switch to strongest if current focus dropped in strength
 *        — with hysteresis to prevent thrashing on marginal differences
 *   (s2) Switch if a new candidate appeared that's stronger
 *   (s3) Stay on child after specialization (implicit — child inherits focus)
 *
 * Hysteresis: The paper's s1 principle implies stability — the engine
 * should stay focused on the current candidate unless a competitor is
 * *significantly* stronger, not just marginally. Without this, the engine
 * "thrashes" between candidates every time a minor piece of evidence
 * shifts the balance by 0.01. The threshold ensures the engine commits
 * to a line of reasoning before switching, producing a coherent
 * diagnostic dialogue rather than a scattershot exploration.
 * [Ref: Paper 1 Sec 3.2.3 — "principles in S_G take effect only
 * occasionally, when certain changes to the SSM require to divert
 * attention from one SSM subgraph to another"]
 *
 * Pure function — no side effects.
 */

import { IDifferentialEntry } from '../store/ssm/ssm.selectors';

/**
 * Hysteresis threshold for solution focus switching.
 *
 * The strongest candidate must exceed the current focus's strength by
 * at least this margin before a switch occurs. This prevents the engine
 * from pivoting on noise — a candidate with strength 2.01 won't steal
 * focus from one with strength 2.00.
 *
 * The value is calibrated relative to the strength metric (coverage count
 * + CF). A threshold of 0.5 means the competitor needs roughly half a
 * seed finding's worth of additional coverage (or equivalent CF advantage)
 * before the engine considers switching.
 */
const SWITCH_THRESHOLD = 0.5;

/**
 * Computes the "strength" of a differential entry.
 *
 * Strength combines two signals:
 *   - Coverage count: how many seed findings this candidate explains
 *     (integer, typically 0–10)
 *   - Certainty factor: degree of belief in this candidate (0.0–1.0)
 *
 * Coverage dominates (it's an integer) while CF acts as a tiebreaker
 * within the same coverage level.
 */
function strength(entry: IDifferentialEntry): number {
  return entry.coveredSeedCount + (entry.node.cf ?? 0);
}

/**
 * Evaluates S_G principles and returns the node ID that should be the
 * solution focus, or null if no candidates exist.
 *
 * @param currentFocusNodeId - The current solution focus (may be null)
 * @param differential - The current diagnostic differential (ranked)
 * @returns The node ID that should be the solution focus
 */
export function evaluateSolutionFocus(
  currentFocusNodeId: string | null,
  differential: IDifferentialEntry[]
): string | null {
  if (differential.length === 0) { return null; }

  // ═══════════════════════════════════════════════════════════════════
  // No current focus → pick the strongest candidate
  // [Ref: Paper 1 Sec 3.2.3 (s1)]
  // The differential is already sorted by strength (coverage desc, CF desc).
  // ═══════════════════════════════════════════════════════════════════
  if (!currentFocusNodeId) {
    return differential[0].node.id;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Current focus no longer in the differential → switch
  // [Ref: Paper 1 Sec 3.2.3 (s2)]
  // This happens when the current focus was removed (e.g., refuted)
  // or is no longer a root-type node.
  // ═══════════════════════════════════════════════════════════════════
  const currentEntry = differential.find(d => d.node.id === currentFocusNodeId);
  if (!currentEntry) {
    return differential[0].node.id;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Check if another candidate is *significantly* stronger
  // [Ref: Paper 1 Sec 3.2.3 (s1)]
  //
  // The paper says S_G principles "take effect only occasionally, when
  // certain changes to the SSM require to divert attention." This
  // implies stability — don't switch on marginal differences.
  //
  // We apply a hysteresis threshold: the strongest candidate must
  // exceed the current focus by SWITCH_THRESHOLD before a switch
  // occurs. This prevents thrashing between candidates that are
  // nearly equal in strength, producing a more coherent diagnostic
  // dialogue where the engine commits to one line of reasoning.
  // ═══════════════════════════════════════════════════════════════════
  const strongest = differential[0];
  if (strongest.node.id !== currentFocusNodeId) {
    const currentStrength = strength(currentEntry);
    const strongestStrength = strength(strongest);

    if (strongestStrength > currentStrength + SWITCH_THRESHOLD) {
      return strongest.node.id;
    }
  }

  // Stay on current focus — no significant change detected
  return currentFocusNodeId;
}
