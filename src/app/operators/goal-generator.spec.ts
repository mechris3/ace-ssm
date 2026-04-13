import * as fc from 'fast-check';
import { generateGoals } from './goal-generator';
import { ISSMState, ISSMNode, ISSMEdge, NodeStatus } from '../models/ssm.model';
import { ITaskStructure, IRelation } from '../models/task-structure.model';

// ─── Fast-check Arbitraries ───────────────────────────────────────────────────

const ENTITY_TYPE_POOL = ['A', 'B', 'C', 'D'];
const RELATION_TYPE_POOL = ['rel_AB', 'rel_AC', 'rel_AD', 'rel_BC', 'rel_BD', 'rel_CD'];
const NODE_STATUSES: NodeStatus[] = ['HYPOTHESIS', 'CONFIRMED', 'QUESTION', 'UNKNOWN'];

/** Arbitrary for a subset of entity types (at least 1). */
const entityTypesArb = fc.shuffledSubarray(ENTITY_TYPE_POOL, { minLength: 1 })
  .map(arr => [...new Set(arr)]);

/** Arbitrary for relations whose from/to reference the given entity types (unique by type+from+to). */
function relationsArb(entityTypes: string[]): fc.Arbitrary<IRelation[]> {
  if (entityTypes.length < 1) return fc.constant([]);
  const etArb = fc.constantFrom(...entityTypes);
  const relTypeArb = fc.constantFrom(...RELATION_TYPE_POOL);
  return fc.array(
    fc.tuple(relTypeArb, etArb, etArb).map(([type, from, to]) => ({ type, from, to })),
    { minLength: 0, maxLength: 8 }
  ).map(rels => {
    // Deduplicate by (type, from, to) to avoid ambiguous gap counting
    const seen = new Set<string>();
    return rels.filter(r => {
      const key = `${r.type}::${r.from}::${r.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}

/** Arbitrary for SSM nodes whose types reference the given entity types. */
function nodesArb(entityTypes: string[]): fc.Arbitrary<ISSMNode[]> {
  if (entityTypes.length < 1) return fc.constant([]);
  const etArb = fc.constantFrom(...entityTypes);
  const statusArb = fc.constantFrom(...NODE_STATUSES);
  return fc.array(
    fc.tuple(fc.uuid(), fc.string({ minLength: 1, maxLength: 8 }), etArb, statusArb)
      .map(([id, label, type, status]) => ({ id, label, type, status })),
    { minLength: 0, maxLength: 8 }
  );
}

/** Arbitrary for SSM edges whose source/target reference the given node IDs. */
function edgesArb(nodeIds: string[], relations: IRelation[]): fc.Arbitrary<ISSMEdge[]> {
  if (nodeIds.length === 0 || relations.length === 0) return fc.constant([]);
  const nodeIdArb = fc.constantFrom(...nodeIds);
  const relTypeArb = fc.constantFrom(...relations.map(r => r.type));
  return fc.array(
    fc.tuple(fc.uuid(), nodeIdArb, nodeIdArb, relTypeArb)
      .map(([id, source, target, relationType]) => ({ id, source, target, relationType })),
    { minLength: 0, maxLength: 10 }
  );
}

/** Combined arbitrary producing a consistent (ISSMState, ITaskStructure) pair. */
const ssmAndTaskStructureArb: fc.Arbitrary<{ ssm: ISSMState; taskStructure: ITaskStructure }> =
  entityTypesArb.chain(entityTypes =>
    relationsArb(entityTypes).chain(relations =>
      nodesArb(entityTypes).chain(nodes => {
        const nodeIds = nodes.map(n => n.id);
        return edgesArb(nodeIds, relations).map(edges => ({
          ssm: {
            nodes,
            edges,
            history: [],
            isRunning: false,
            waitingForUser: false,
            pendingFindingNodeId: null,
          } as ISSMState,
          taskStructure: { entityTypes, relations } as ITaskStructure,
        }));
      })
    )
  );

// ─── Property 7: Goal Generator Completeness and Soundness ────────────────────
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 13.1**

describe('Property 7: Goal Generator Completeness and Soundness', () => {

  it('should produce exactly one EXPAND goal per (node, relation) gap', () => {
    fc.assert(
      fc.property(ssmAndTaskStructureArb, ({ ssm, taskStructure }) => {
        const goals = generateGoals(ssm, taskStructure);
        const expandGoals = goals.filter(g => g.kind === 'EXPAND');

        // Compute expected gaps: forward (rel.from === node.type, no edge with source === node.id)
        // and reverse (rel.to === node.type, no edge with target === node.id)
        const expectedGaps: { nodeId: string; relType: string; targetType: string; direction: string }[] = [];
        for (const node of ssm.nodes) {
          for (const rel of taskStructure.relations) {
            // Forward gaps
            if (rel.from === node.type) {
              const hasEdge = ssm.edges.some(
                e => e.source === node.id && e.relationType === rel.type
              );
              if (!hasEdge) {
                expectedGaps.push({ nodeId: node.id, relType: rel.type, targetType: rel.to, direction: 'forward' });
              }
            }
            // Reverse gaps (abductive)
            if (rel.to === node.type) {
              const hasEdge = ssm.edges.some(
                e => e.target === node.id && e.relationType === rel.type
              );
              if (!hasEdge) {
                expectedGaps.push({ nodeId: node.id, relType: rel.type, targetType: rel.from, direction: 'reverse' });
              }
            }
          }
        }

        // Completeness: every expected gap has a corresponding EXPAND goal
        for (const gap of expectedGaps) {
          const matching = expandGoals.filter(
            g => g.anchorNodeId === gap.nodeId && g.targetRelation === gap.relType && g.targetType === gap.targetType && g.direction === gap.direction
          );
          expect(matching.length).toBe(1);
        }

        // Soundness: every EXPAND goal corresponds to an expected gap
        for (const goal of expandGoals) {
          const matchesGap = expectedGaps.some(
            gap => gap.nodeId === goal.anchorNodeId && gap.relType === goal.targetRelation && gap.targetType === goal.targetType && gap.direction === goal.direction
          );
          expect(matchesGap).toBeTrue();
        }

        // Count match: exactly one goal per gap
        expect(expandGoals.length).toBe(expectedGaps.length);
      }),
      { numRuns: 100 }
    );
  });

  it('should not produce EXPAND goals for (node, relation) pairs that already have edges', () => {
    fc.assert(
      fc.property(ssmAndTaskStructureArb, ({ ssm, taskStructure }) => {
        const goals = generateGoals(ssm, taskStructure);
        const expandGoals = goals.filter(g => g.kind === 'EXPAND');

        // Collect covered (node, relationType, direction) pairs from existing edges
        const coveredForwardPairs = new Set(
          ssm.edges.map(e => `${e.source}::${e.relationType}`)
        );
        const coveredReversePairs = new Set(
          ssm.edges.map(e => `${e.target}::${e.relationType}`)
        );

        // No EXPAND goal should target a covered pair
        for (const goal of expandGoals) {
          const key = `${goal.anchorNodeId}::${goal.targetRelation}`;
          if (goal.direction === 'forward') {
            expect(coveredForwardPairs.has(key)).toBeFalse();
          } else {
            expect(coveredReversePairs.has(key)).toBeFalse();
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should not regenerate goals for UNKNOWN nodes that already have edges for a relation', () => {
    fc.assert(
      fc.property(ssmAndTaskStructureArb, ({ ssm, taskStructure }) => {
        const goals = generateGoals(ssm, taskStructure);
        const expandGoals = goals.filter(g => g.kind === 'EXPAND');

        // For UNKNOWN nodes with existing edges, those edges close the gap
        const unknownNodes = ssm.nodes.filter(n => n.status === 'UNKNOWN');
        for (const node of unknownNodes) {
          // Forward: edges where node is source
          const coveredForwardRelTypes = ssm.edges
            .filter(e => e.source === node.id)
            .map(e => e.relationType);
          for (const relType of coveredForwardRelTypes) {
            const regenerated = expandGoals.some(
              g => g.anchorNodeId === node.id && g.targetRelation === relType && g.direction === 'forward'
            );
            expect(regenerated).toBeFalse();
          }
          // Reverse: edges where node is target
          const coveredReverseRelTypes = ssm.edges
            .filter(e => e.target === node.id)
            .map(e => e.relationType);
          for (const relType of coveredReverseRelTypes) {
            const regenerated = expandGoals.some(
              g => g.anchorNodeId === node.id && g.targetRelation === relType && g.direction === 'reverse'
            );
            expect(regenerated).toBeFalse();
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 8: Goal Generator Idempotence ──────────────────────────────────
// **Validates: Requirements 6.6**

describe('Property 8: Goal Generator Idempotence', () => {

  it('should produce structurally equivalent results when called twice with identical inputs', () => {
    fc.assert(
      fc.property(ssmAndTaskStructureArb, ({ ssm, taskStructure }) => {
        const goals1 = generateGoals(ssm, taskStructure);
        const goals2 = generateGoals(ssm, taskStructure);

        // Same count
        expect(goals1.length).toBe(goals2.length);

        // Extract structural tuples (ignoring generated UUIDs)
        const toTuple = (g: { anchorNodeId: string; targetRelation: string; targetType: string; kind: string; direction: string }) =>
          `${g.anchorNodeId}::${g.targetRelation}::${g.targetType}::${g.kind}::${g.direction}`;

        const tuples1 = goals1.map(toTuple).sort();
        const tuples2 = goals2.map(toTuple).sort();

        expect(tuples1).toEqual(tuples2);
      }),
      { numRuns: 100 }
    );
  });
});
