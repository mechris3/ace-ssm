import * as fc from 'fast-check';
import { taskStructureReducer, initialState } from './task-structure.reducer';
import { loadTaskStructure } from './task-structure.actions';
import { IRelation, ITaskStructure } from '../../models/task-structure.model';

// ─── Fast-check Arbitraries ───────────────────────────────────────────────────

const ENTITY_TYPE_POOL = ['A', 'B', 'C', 'D', 'E', 'F'];
const RELATION_TYPE_POOL = ['REL_1', 'REL_2', 'REL_3', 'REL_4'];

/** Arbitrary for a non-empty subset of entity types. */
const entityTypesArb = fc.shuffledSubarray(ENTITY_TYPE_POOL, { minLength: 1 })
  .map(arr => [...new Set(arr)]);

/** Arbitrary for valid relations whose from/to reference the given entity types. */
function validRelationsArb(entityTypes: string[]): fc.Arbitrary<IRelation[]> {
  if (entityTypes.length < 1) return fc.constant([]);
  const etArb = fc.constantFrom(...entityTypes);
  const relTypeArb = fc.constantFrom(...RELATION_TYPE_POOL);
  return fc.array(
    fc.tuple(relTypeArb, etArb, etArb)
      .map(([type, from, to]) => ({ type, from, to })),
    { minLength: 1, maxLength: 6 }
  );
}

/**
 * Arbitrary that generates an ITaskStructure with at least one relation
 * whose `from` or `to` is NOT in the `entityTypes` array.
 */
const invalidTaskStructureArb: fc.Arbitrary<ITaskStructure> =
  entityTypesArb.chain(entityTypes => {
    // Pick an entity type that is guaranteed NOT in the array
    const allTypes = ENTITY_TYPE_POOL;
    const missing = allTypes.filter(t => !entityTypes.includes(t));
    // If all pool types are used, add a synthetic one
    const invalidType = missing.length > 0 ? missing[0] : 'ZZZZZ';

    const etArb = fc.constantFrom(...entityTypes);
    const relTypeArb = fc.constantFrom(...RELATION_TYPE_POOL);

    // Generate one guaranteed-invalid relation (randomly break from or to)
    const invalidRelArb = fc.boolean().chain(breakFrom => {
      if (breakFrom) {
        return fc.tuple(relTypeArb, fc.constant(invalidType), etArb)
          .map(([type, from, to]) => ({ type, from, to }));
      } else {
        return fc.tuple(relTypeArb, etArb, fc.constant(invalidType))
          .map(([type, from, to]) => ({ type, from, to }));
      }
    });

    // Optionally generate some valid relations too
    const validRelsArb = fc.array(
      fc.tuple(relTypeArb, etArb, etArb)
        .map(([type, from, to]) => ({ type, from, to })),
      { minLength: 0, maxLength: 4 }
    );

    // Place the invalid relation at a random position
    return fc.tuple(invalidRelArb, validRelsArb, fc.nat({ max: 10 })).map(
      ([invalidRel, validRels, insertIdx]) => {
        const relations = [...validRels];
        const idx = insertIdx % (relations.length + 1);
        relations.splice(idx, 0, invalidRel);
        return { entityTypes, relations };
      }
    );
  });

/**
 * Arbitrary that generates a fully valid ITaskStructure where all relation
 * from/to reference entries in entityTypes.
 */
const validTaskStructureArb: fc.Arbitrary<ITaskStructure> =
  entityTypesArb.chain(entityTypes =>
    validRelationsArb(entityTypes).map(relations => ({ entityTypes, relations }))
  );

// ─── Property 2: Task Structure Validation Rejects Invalid Relations ──────────
// **Validates: Requirements 2.2**

describe('Property 2: Task Structure Validation Rejects Invalid Relations', () => {

  it('should reject task structures with relations referencing unknown entity types', () => {
    fc.assert(
      fc.property(invalidTaskStructureArb, (taskStructure) => {
        const action = loadTaskStructure({ taskStructure });
        const result = taskStructureReducer(initialState, action);

        // Error must be non-null and contain the expected message
        expect(result.error).not.toBeNull();
        expect(result.error).toContain('Relation references unknown entity type');

        // Store entityTypes and relations must remain unchanged (empty, from initialState)
        expect(result.entityTypes).toEqual(initialState.entityTypes);
        expect(result.relations).toEqual(initialState.relations);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid task structures where all relations reference known entity types', () => {
    fc.assert(
      fc.property(validTaskStructureArb, (taskStructure) => {
        const action = loadTaskStructure({ taskStructure });
        const result = taskStructureReducer(initialState, action);

        // Should load successfully
        expect(result.loaded).toBeTrue();
        expect(result.error).toBeNull();
        expect(result.entityTypes).toEqual(taskStructure.entityTypes);
        expect(result.relations).toEqual(taskStructure.relations);
      }),
      { numRuns: 100 }
    );
  });
});
