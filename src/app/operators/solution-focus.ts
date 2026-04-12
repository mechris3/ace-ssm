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
 *   (s2) Switch if a new candidate appeared that's stronger
 *   (s3) Stay on child after specialization (implicit — child inherits focus)
 *
 * Pure function — no side effects.
 */

import { IDifferentialEntry } from '../store/ssm/ssm.selectors';

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

  // If no current focus, pick the strongest candidate (highest coverage + CF)
  // [Ref: Paper 1 Sec 3.2.3 (s1)] — differential is already sorted by strength
  if (!currentFocusNodeId) {
    return differential[0].node.id;
  }

  // Check if current focus is still in the differential
  const currentEntry = differential.find(d => d.node.id === currentFocusNodeId);

  if (!currentEntry) {
    // [Ref: Paper 1 Sec 3.2.3 (s2)] Current focus was removed or doesn't exist
    // as a root-type node — switch to the strongest candidate
    return differential[0].node.id;
  }

  // [Ref: Paper 1 Sec 3.2.3 (s1)] Check if current focus is still the strongest
  // If another candidate has higher coverage (or same coverage but higher CF),
  // switch to it
  const strongest = differential[0];
  if (strongest.node.id !== currentFocusNodeId) {
    const currentStrength = currentEntry.coveredSeedCount + (currentEntry.node.cf ?? 0);
    const strongestStrength = strongest.coveredSeedCount + (strongest.node.cf ?? 0);
    if (strongestStrength > currentStrength) {
      return strongest.node.id;
    }
  }

  // Stay on current focus
  return currentFocusNodeId;
}
