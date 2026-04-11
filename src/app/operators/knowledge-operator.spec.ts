import * as fc from 'fast-check';
import { resolveGoal } from './knowledge-operator';
import { IGoal } from '../models/ssm.model';
import { IKnowledgeFragment } from '../models/knowledge-base.model';

// ─── Fast-check Arbitraries ───────────────────────────────────────────────────

const ENTITY_TYPES = ['Symptom', 'Disease', 'Test', 'Treatment'];
const RELATION_TYPES = ['CAUSES', 'DIAGNOSED_BY', 'TREATED_BY', 'CONFIRMED_BY'];
const LABELS = ['Fever', 'Cough', 'Headache', 'Rash', 'Fatigue', 'Nausea', 'Pain'];

/** Arbitrary for KB fragment metadata values in [0, 1]. */
const metadataArb = fc.record({
  urgency: fc.double({ min: 0, max: 1, noNaN: true }),
  specificity: fc.double({ min: 0, max: 1, noNaN: true }),
  inquiryCost: fc.double({ min: 0, max: 1, noNaN: true }),
});

/** Arbitrary for an EXPAND goal with random anchorLabel and targetRelation. */
const expandGoalArb: fc.Arbitrary<IGoal> = fc.record({
  id: fc.uuid(),
  kind: fc.constant('EXPAND' as const),
  anchorNodeId: fc.uuid(),
  anchorLabel: fc.constantFrom(...LABELS),
  targetRelation: fc.constantFrom(...RELATION_TYPES),
  targetType: fc.constantFrom(...ENTITY_TYPES),
});

/**
 * Build a KB fragment that matches a given goal's anchorLabel and targetRelation.
 */
function matchingFragmentArb(goal: IGoal): fc.Arbitrary<IKnowledgeFragment> {
  return fc.record({
    id: fc.uuid(),
    subject: fc.constant(goal.anchorLabel),
    subjectType: fc.constantFrom(...ENTITY_TYPES),
    relation: fc.constant(goal.targetRelation),
    object: fc.constantFrom(...LABELS),
    objectType: fc.constantFrom(...ENTITY_TYPES),
    metadata: metadataArb,
  });
}

/**
 * Build a KB fragment guaranteed NOT to match a given goal.
 * Uses subjects and relations drawn from pools that exclude the goal's values.
 */
function nonMatchingFragmentArb(goal: IGoal): fc.Arbitrary<IKnowledgeFragment> {
  // Pick a subject that differs from the goal's anchorLabel
  const otherLabels = LABELS.filter(l => l !== goal.anchorLabel);
  const safeSubjects = otherLabels.length > 0 ? otherLabels : ['__NO_MATCH__'];

  return fc.record({
    id: fc.uuid(),
    subject: fc.constantFrom(...safeSubjects),
    subjectType: fc.constantFrom(...ENTITY_TYPES),
    relation: fc.constantFrom(...RELATION_TYPES),
    object: fc.constantFrom(...LABELS),
    objectType: fc.constantFrom(...ENTITY_TYPES),
    metadata: metadataArb,
  });
}

// ─── Property 11: Knowledge Operator Match Completeness ───────────────────────
// **Validates: Requirements 8.1, 8.2, 8.5**

describe('Property 11: Knowledge Operator Match Completeness', () => {

  it('should return a PATCH with exactly N HYPOTHESIS nodes and N edges for N matching fragments', () => {
    fc.assert(
      fc.property(
        expandGoalArb.chain(goal =>
          fc.integer({ min: 1, max: 5 }).chain(matchCount =>
            fc.tuple(
              fc.constant(goal),
              fc.tuple(...Array.from({ length: matchCount }, () => matchingFragmentArb(goal))),
              fc.array(nonMatchingFragmentArb(goal), { minLength: 0, maxLength: 3 }),
            )
          )
        ),
        ([goal, matchingFrags, nonMatchingFrags]) => {
          const kb = [...matchingFrags, ...nonMatchingFrags];
          const result = resolveGoal(goal, kb);

          // Count actual matches (same logic as the operator)
          const expectedMatches = kb.filter(
            f => f.subject === goal.anchorLabel && f.relation === goal.targetRelation
          );
          const N = expectedMatches.length;

          // Must be a PATCH since we have at least 1 matching fragment
          expect(result.type).toBe('PATCH');

          if (result.type === 'PATCH') {
            // Exactly N nodes and N edges
            expect(result.nodes.length).toBe(N);
            expect(result.edges.length).toBe(N);

            // Each node is a HYPOTHESIS with correct label and type
            for (let i = 0; i < N; i++) {
              const node = result.nodes[i];
              const frag = expectedMatches[i];

              expect(node.label).toBe(frag.object);
              expect(node.type).toBe(frag.objectType);
              expect(node.status).toBe('HYPOTHESIS');
            }

            // Each edge's source is the goal's anchorNodeId
            for (const edge of result.edges) {
              expect(edge.source).toBe(goal.anchorNodeId);
            }

            // Each edge's target matches the corresponding node
            for (let i = 0; i < N; i++) {
              expect(result.edges[i].target).toBe(result.nodes[i].id);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 12: Knowledge Operator Inquiry on No Match ──────────────────────
// **Validates: Requirements 8.3**

describe('Property 12: Knowledge Operator Inquiry on No Match', () => {

  it('should return INQUIRY_REQUIRED with the original goal when no KB fragments match', () => {
    fc.assert(
      fc.property(
        expandGoalArb.chain(goal =>
          fc.tuple(
            fc.constant(goal),
            fc.array(nonMatchingFragmentArb(goal), { minLength: 0, maxLength: 5 }),
          )
        ),
        ([goal, nonMatchingFrags]) => {
          const result = resolveGoal(goal, nonMatchingFrags);

          expect(result.type).toBe('INQUIRY_REQUIRED');

          if (result.type === 'INQUIRY_REQUIRED') {
            expect(result.goal).toBe(goal);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
