/**
 * @fileoverview Meta-SSM — groups reasoning steps into chains.
 * [Ref: Paper 1 Sec 5.3 / Gap Analysis Gap 6]
 *
 * The Meta-SSM is a higher-level view of the reasoning process.
 * Each "reasoning chain" is a sequence of consecutive ReasoningSteps
 * that share the same anchor entity type or solution focus context.
 *
 * This is a simplified version of the paper's full Meta-SSM concept,
 * which would track lines of reasoning and the S_G principles that
 * caused switches between them.
 *
 * Pure function — no side effects.
 */

import { IReasoningStep } from '../models/strategy.model';

/**
 * A reasoning chain — a group of consecutive steps sharing a context.
 */
export interface IReasoningChain {
  /** Human-readable label for this chain. */
  label: string;
  /** The steps in this chain, in order. */
  steps: IReasoningStep[];
  /** Whether this chain was a user action or system reasoning. */
  type: 'system' | 'user';
  /** Start timestamp of the first step. */
  startTime: number;
  /** End timestamp of the last step. */
  endTime: number;
}

/**
 * Groups reasoning steps into chains based on context switches.
 * A new chain starts when:
 * - The strategy name changes (Manual vs. engine strategy)
 * - The anchor entity type changes significantly
 */
export function buildReasoningChains(steps: IReasoningStep[]): IReasoningChain[] {
  if (steps.length === 0) return [];

  const chains: IReasoningChain[] = [];
  let currentChain: IReasoningStep[] = [steps[0]];
  let currentType: 'system' | 'user' = steps[0].strategyName === 'Manual' ? 'user' : 'system';

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    const stepType: 'system' | 'user' = step.strategyName === 'Manual' ? 'user' : 'system';

    // Start a new chain on context switch
    if (stepType !== currentType) {
      chains.push(finalizeChain(currentChain, currentType));
      currentChain = [step];
      currentType = stepType;
    } else {
      currentChain.push(step);
    }
  }

  // Finalize the last chain
  if (currentChain.length > 0) {
    chains.push(finalizeChain(currentChain, currentType));
  }

  return chains;
}

function finalizeChain(steps: IReasoningStep[], type: 'system' | 'user'): IReasoningChain {
  const firstAction = steps[0].actionTaken;
  const label = type === 'user'
    ? `User: ${firstAction}`
    : `Engine: ${steps.length} step${steps.length > 1 ? 's' : ''} — ${firstAction}`;

  return {
    label,
    steps,
    type,
    startTime: steps[0].timestamp,
    endTime: steps[steps.length - 1].timestamp,
  };
}
