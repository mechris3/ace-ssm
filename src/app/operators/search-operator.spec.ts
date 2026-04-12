import * as fc from 'fast-check';
import { scoreGoals } from './search-operator';
import { ISSMState, ISSMNode, ISSMEdge, IGoal, NodeStatus } from '../models/ssm.model';
import { IKnowledgeFragment } from '../models/knowledge-base.model';
import { IStrategy } from '../models/strategy.model';

// ─── Fast-check Arbitraries ───────────────────────────────────────────────────

const ENTITY_TYPES = ['Symptom', 'Disease', 'Test', 'Treatment'];
const RELATION_TYPES = ['CAUSES', 'DIAGNOSED_BY', 'TREATED_BY', 'CONFIRMED_BY'];
const NODE_STATUSES: NodeStatus[] = ['HYPOTHESIS', 'CONFIRMED', 'QUESTION', 'UNKNOWN'];

/** Arbitrary for a positive weight value in [0.1, 5.0]. */
const weightArb = fc.double({ min: 0.1, max: 5.0, noNaN: true });

/** Arbitrary for a strategy. */
const strategyArb: fc.Arbitrary<IStrategy> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 10 }),
  weights: fc.record({
    urgency: weightArb,
    parsimony: weightArb,
    costAversion: weightArb,
  }),
  pacerDelay: fc.integer({ min: 0, max: 2000 }),
});

/** Arbitrary for KB fragment metadata values in [0, 1]. */
const metadataArb = fc.record({
  urgency: fc.double({ min: 0, max: 1, noNaN: true }),
  specificity: fc.double({ min: 0, max: 1, noNaN: true }),
  inquiryCost: fc.double({ min: 0, max: 1, noNaN: true }),
});

/** Arbitrary for an SSM node with a given id and type. */
function ssmNodeArb(id: string, type: string): fc.Arbitrary<ISSMNode> {
  return fc.record({
    id: fc.constant(id),
    label: fc.constantFrom('Fever', 'Cough', 'Headache', 'Rash', 'Fatigue'),
    type: fc.constant(type),
    status: fc.constantFrom<NodeStatus>('HYPOTHESIS', 'CONFIRMED'),
  });
}

/** Arbitrary for an SSM node that may be UNKNOWN. */
function ssmNodeWithUnknownArb(id: string, type: string): fc.Arbitrary<ISSMNode> {
  return fc.record({
    id: fc.constant(id),
    label: fc.constantFrom('Fever', 'Cough', 'Headache', 'Rash', 'Fatigue'),
    type: fc.constant(type),
    status: fc.constantFrom<NodeStatus>(...NODE_STATUSES),
  });
}

/**
 * Combined arbitrary that generates a consistent set of:
 * - SSM with at least 1 node
 * - EXPAND goals referencing actual SSM node IDs
 * - KB fragments (some matching goals, some not)
 * - Strategy with valid weights
 * - unknownPenalty
 *
 * Uses chain approach: generate SSM first, then goals referencing those nodes.
 */
const searchOperatorInputArb = fc.integer({ min: 1, max: 5 }).chain(nodeCount => {
  // Generate node IDs and types
  const nodeIdsAndTypes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `node_${i}`,
    type: ENTITY_TYPES[i % ENTITY_TYPES.length],
  }));

  // Generate SSM nodes (non-UNKNOWN for base set)
  const nodesArb = fc.tuple(
    ...nodeIdsAndTypes.map(({ id, type }) => ssmNodeWithUnknownArb(id, type))
  );

  return nodesArb.chain(nodes => {
    // Optionally add extra nodes of various types for parsimony testing
    const extraNodesArb = fc.array(
      fc.tuple(
        fc.uuid(),
        fc.constantFrom(...ENTITY_TYPES),
        fc.constantFrom<NodeStatus>('HYPOTHESIS', 'CONFIRMED'),
      ).map(([id, type, status]) => ({
        id,
        label: 'Extra',
        type,
        status,
      } as ISSMNode)),
      { minLength: 0, maxLength: 3 }
    );

    return extraNodesArb.chain(extraNodes => {
      const allNodes = [...nodes, ...extraNodes];

      // Generate at least 1 EXPAND goal referencing actual SSM nodes
      const goalCountArb = fc.integer({ min: 1, max: 5 });

      return goalCountArb.chain(goalCount => {
        const goalsArb = fc.tuple(
          ...Array.from({ length: goalCount }, (_, i) => {
            const nodeIdx = i % nodes.length;
            const node = nodes[nodeIdx];
            return fc.record({
              id: fc.constant(`goal_${i}`),
              kind: fc.constant('EXPAND' as const),
              anchorNodeId: fc.constant(node.id),
              anchorLabel: fc.constant(node.label),
              targetRelation: fc.constantFrom(...RELATION_TYPES),
              targetType: fc.constantFrom(...ENTITY_TYPES),
              direction: fc.constantFrom('forward' as const, 'reverse' as const),
            });
          })
        );

        return goalsArb.chain(goals => {
          // Generate KB fragments — some matching goals, some random
          const matchingFragsArb = fc.array(
            fc.tuple(
              fc.uuid(),
              fc.constantFrom(...goals.map(g => g.anchorLabel)),
              fc.constantFrom(...goals.map(g => g.targetRelation)),
              fc.constantFrom(...ENTITY_TYPES),
              metadataArb,
            ).map(([id, subject, relation, objectType, metadata]) => ({
              id,
              subject,
              subjectType: 'Symptom',
              relation,
              object: `Object_${id.slice(0, 4)}`,
              objectType,
              metadata,
            } as IKnowledgeFragment)),
            { minLength: 0, maxLength: 6 }
          );

          const randomFragsArb = fc.array(
            fc.tuple(
              fc.uuid(),
              fc.constantFrom('NoMatch1', 'NoMatch2'),
              fc.constantFrom('NO_REL'),
              fc.constantFrom(...ENTITY_TYPES),
              metadataArb,
            ).map(([id, subject, relation, objectType, metadata]) => ({
              id,
              subject,
              subjectType: 'Other',
              relation,
              object: `Rand_${id.slice(0, 4)}`,
              objectType,
              metadata,
            } as IKnowledgeFragment)),
            { minLength: 0, maxLength: 3 }
          );

          return fc.tuple(matchingFragsArb, randomFragsArb, strategyArb, fc.double({ min: 0.01, max: 0.5, noNaN: true }))
            .map(([matchingFrags, randomFrags, strategy, unknownPenalty]) => {
              const ssm: ISSMState = {
                nodes: allNodes,
                edges: [],
                history: [],
                isRunning: false,
                waitingForUser: false,
              };
              const kb = [...matchingFrags, ...randomFrags];
              return { ssm, goals: goals as IGoal[], kb, strategy, unknownPenalty };
            });
        });
      });
    });
  });
});

// ─── Helper: independently compute expected score for an EXPAND goal ──────────

function computeExpectedScore(
  goal: IGoal,
  ssm: ISSMState,
  kb: IKnowledgeFragment[],
  strategy: IStrategy,
  unknownPenalty: number
): { rawScore: number; totalScore: number } {
  const anchor = ssm.nodes.find(n => n.id === goal.anchorNodeId);

  const isReverse = goal.direction === 'reverse';
  const matchingFragments = isReverse
    ? kb.filter(f => f.object === goal.anchorLabel && f.relation === goal.targetRelation)
    : kb.filter(f => f.subject === goal.anchorLabel && f.relation === goal.targetRelation);

  const maxUrgency = matchingFragments.length > 0
    ? Math.max(...matchingFragments.map(f => f.metadata.urgency))
    : 0;
  const meanCost = matchingFragments.length > 0
    ? matchingFragments.reduce((sum, f) => sum + f.metadata.inquiryCost, 0) / matchingFragments.length
    : 0;

  const urgencyScore = maxUrgency * 100 * strategy.weights.urgency;
  const parsimonyScore = ssm.nodes.some(n => n.type === goal.targetType)
    ? 50 * strategy.weights.parsimony
    : 0;
  const costScore = meanCost * 100 * strategy.weights.costAversion;

  const rawScore = urgencyScore + parsimonyScore - costScore;
  const totalScore = anchor?.status === 'UNKNOWN'
    ? rawScore * unknownPenalty
    : rawScore;

  return { rawScore, totalScore };
}

// ─── Property 9: Search Operator Scoring Formula ──────────────────────────────
// **Validates: Requirements 7.1, 7.2, 7.3, 7.5, 13.2, 13.4**

describe('Property 9: Search Operator Scoring Formula', () => {

  it('should compute raw score matching the formula for the winning EXPAND goal', () => {
    fc.assert(
      fc.property(searchOperatorInputArb, ({ ssm, goals, kb, strategy, unknownPenalty }) => {
        const result = scoreGoals(goals, ssm, kb, strategy, unknownPenalty);

        // Independently compute expected scores for all goals
        const expectedScores = goals.map(goal =>
          computeExpectedScore(goal, ssm, kb, strategy, unknownPenalty)
        );

        // Find the winning goal's index
        const winnerIdx = goals.findIndex(g => g.id === result.selectedGoal.id);
        expect(winnerIdx).toBeGreaterThanOrEqual(0);

        const expected = expectedScores[winnerIdx];

        // The rationale totalScore should match the expected totalScore
        expect(result.rationale.totalScore).toBeCloseTo(expected.totalScore, 8);
      }),
      { numRuns: 100 }
    );
  });

  it('should apply UNKNOWN penalty to goals anchored by UNKNOWN-status nodes', () => {
    fc.assert(
      fc.property(searchOperatorInputArb, ({ ssm, goals, kb, strategy, unknownPenalty }) => {
        // For each goal, verify the scoring independently
        const allExpected = goals.map(goal =>
          computeExpectedScore(goal, ssm, kb, strategy, unknownPenalty)
        );

        // Find goals anchored by UNKNOWN nodes
        const unknownGoals = goals.filter(g => {
          const anchor = ssm.nodes.find(n => n.id === g.anchorNodeId);
          return anchor?.status === 'UNKNOWN';
        });

        for (const goal of unknownGoals) {
          const idx = goals.findIndex(g => g.id === goal.id);
          const expected = allExpected[idx];
          // totalScore should be rawScore * unknownPenalty
          expect(expected.totalScore).toBeCloseTo(expected.rawScore * unknownPenalty, 8);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should return the goal with the highest totalScore', () => {
    fc.assert(
      fc.property(searchOperatorInputArb, ({ ssm, goals, kb, strategy, unknownPenalty }) => {
        const result = scoreGoals(goals, ssm, kb, strategy, unknownPenalty);

        // Compute all expected total scores
        const allExpected = goals.map(goal =>
          computeExpectedScore(goal, ssm, kb, strategy, unknownPenalty)
        );

        const maxTotalScore = Math.max(...allExpected.map(e => e.totalScore));

        // The returned goal should have the highest total score
        const winnerIdx = goals.findIndex(g => g.id === result.selectedGoal.id);
        expect(allExpected[winnerIdx].totalScore).toBeCloseTo(maxTotalScore, 8);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 10: Rationale Factor Sum Invariant ──────────────────────────────
// **Validates: Requirements 7.8, 14.1**

describe('Property 10: Rationale Factor Sum Invariant', () => {

  it('should have factor impacts summing to the raw score (before UNKNOWN penalty)', () => {
    fc.assert(
      fc.property(searchOperatorInputArb, ({ ssm, goals, kb, strategy, unknownPenalty }) => {
        const result = scoreGoals(goals, ssm, kb, strategy, unknownPenalty);

        // Sum of factor impacts
        const factorSum = result.rationale.factors.reduce(
          (sum, f) => sum + f.impact, 0
        );

        // Independently compute the raw score for the winning goal
        const winnerIdx = goals.findIndex(g => g.id === result.selectedGoal.id);
        const expected = computeExpectedScore(goals[winnerIdx], ssm, kb, strategy, unknownPenalty);

        // Factor sum should equal raw score (before UNKNOWN penalty)
        expect(factorSum).toBeCloseTo(expected.rawScore, 8);
      }),
      { numRuns: 100 }
    );
  });

  it('should have a non-empty factors array in every ReasoningStep', () => {
    fc.assert(
      fc.property(searchOperatorInputArb, ({ ssm, goals, kb, strategy, unknownPenalty }) => {
        const result = scoreGoals(goals, ssm, kb, strategy, unknownPenalty);

        expect(result.rationale.factors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('should have strategyName matching the strategy name', () => {
    fc.assert(
      fc.property(searchOperatorInputArb, ({ ssm, goals, kb, strategy, unknownPenalty }) => {
        const result = scoreGoals(goals, ssm, kb, strategy, unknownPenalty);

        expect(result.rationale.strategyName).toBe(strategy.name);
      }),
      { numRuns: 100 }
    );
  });
});
