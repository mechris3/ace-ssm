import * as fc from 'fast-check';
import { knowledgeBaseReducer, initialState } from './knowledge-base.reducer';
import { loadKnowledgeBase } from './knowledge-base.actions';
import { IKnowledgeFragment, IFragmentMetadata } from '../../models/knowledge-base.model';
import { selectFragmentsBySubjectAndRelation } from './knowledge-base.selectors';

// ─── Fast-check Arbitraries ───────────────────────────────────────────────────

const SUBJECT_POOL = ['Fever', 'Headache', 'Rash', 'Cough', 'Fatigue'];
const RELATION_POOL = ['CAUSES', 'INDUCES', 'CONFIRMED_BY', 'TREATS'];
const OBJECT_POOL = ['Meningitis', 'Influenza', 'Measles', 'Pneumonia', 'Anemia'];
const TYPE_POOL = ['Symptom', 'Disease', 'Finding', 'Treatment'];

/** Arbitrary for valid metadata with all values in [0, 1]. */
const validMetadataArb: fc.Arbitrary<IFragmentMetadata> = fc.record({
  urgency: fc.double({ min: 0, max: 1, noNaN: true }),
  specificity: fc.double({ min: 0, max: 1, noNaN: true }),
  inquiryCost: fc.double({ min: 0, max: 1, noNaN: true }),
});

/** Arbitrary for a valid knowledge fragment. */
const validFragmentArb: fc.Arbitrary<IKnowledgeFragment> = fc.record({
  id: fc.uuid(),
  subject: fc.constantFrom(...SUBJECT_POOL),
  subjectType: fc.constantFrom(...TYPE_POOL),
  relation: fc.constantFrom(...RELATION_POOL),
  object: fc.constantFrom(...OBJECT_POOL),
  objectType: fc.constantFrom(...TYPE_POOL),
  metadata: validMetadataArb,
});

/** Arbitrary for metadata with at least one field outside [0, 1]. */
const invalidMetadataArb: fc.Arbitrary<{ metadata: IFragmentMetadata; invalidField: string }> =
  fc.constantFrom('urgency', 'specificity', 'inquiryCost').chain(field => {
    // Generate a value outside [0, 1]: either < 0 or > 1
    // Note: Number.MIN_VALUE (~5e-324) is too small — -Number.MIN_VALUE ≈ 0
    // and 1 + Number.MIN_VALUE === 1 due to floating point. Use clear margins.
    const outOfRangeValue = fc.oneof(
      fc.double({ min: -1000, max: -0.001, noNaN: true }),
      fc.double({ min: 1.001, max: 1000, noNaN: true }),
    );

    return outOfRangeValue.map(badValue => {
      const metadata: IFragmentMetadata = {
        urgency: 0.5,
        specificity: 0.5,
        inquiryCost: 0.5,
      };
      (metadata as any)[field] = badValue;
      return { metadata, invalidField: field };
    });
  });

/**
 * Arbitrary that generates a fragment array where at least one fragment
 * has metadata outside [0, 1].
 */
const fragmentsWithInvalidMetadataArb: fc.Arbitrary<{
  fragments: IKnowledgeFragment[];
  expectedField: string;
  expectedId: string;
}> = fc.tuple(
  fc.array(validFragmentArb, { minLength: 0, maxLength: 4 }),
  invalidMetadataArb,
  fc.uuid(),
  fc.nat({ max: 10 }),
).map(([validFragments, { metadata, invalidField }, badId, insertIdx]) => {
  const badFragment: IKnowledgeFragment = {
    id: badId,
    subject: 'BadSubject',
    subjectType: 'Symptom',
    relation: 'CAUSES',
    object: 'BadObject',
    objectType: 'Disease',
    metadata,
  };
  const fragments = [...validFragments];
  const idx = insertIdx % (fragments.length + 1);
  fragments.splice(idx, 0, badFragment);
  return { fragments, expectedField: invalidField, expectedId: badId };
});

// ─── Property 3: KB Metadata Validation Rejects Out-of-Range Values ──────────
// **Validates: Requirements 3.2**

describe('Property 3: KB Metadata Validation Rejects Out-of-Range Values', () => {

  it('should reject fragments with metadata values outside [0, 1]', () => {
    fc.assert(
      fc.property(fragmentsWithInvalidMetadataArb, ({ fragments, expectedField, expectedId }) => {
        const action = loadKnowledgeBase({ fragments });
        const result = knowledgeBaseReducer(initialState, action);

        // Error must be set and identify the invalid field
        expect(result.error).not.toBeNull();
        expect(result.error).toContain('out of range [0, 1]');

        // Store fragments must remain unchanged (empty, from initialState)
        expect(result.fragments).toEqual(initialState.fragments);
        expect(result.loaded).toBe(initialState.loaded);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept fragments with all metadata values in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.array(validFragmentArb, { minLength: 1, maxLength: 6 }),
        (fragments) => {
          const action = loadKnowledgeBase({ fragments });
          const result = knowledgeBaseReducer(initialState, action);

          expect(result.loaded).toBeTrue();
          expect(result.error).toBeNull();
          expect(result.fragments).toEqual(fragments);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: KB Filter Selector Correctness ─────────────────────────────
// **Validates: Requirements 3.4**

describe('Property 4: KB Filter Selector Correctness', () => {

  it('should return exactly those fragments matching subject AND relation', () => {
    fc.assert(
      fc.property(
        fc.array(validFragmentArb, { minLength: 1, maxLength: 10 }),
        fc.constantFrom(...SUBJECT_POOL),
        fc.constantFrom(...RELATION_POOL),
        (fragments, querySubject, queryRelation) => {
          // Load fragments into the reducer
          const action = loadKnowledgeBase({ fragments });
          const state = knowledgeBaseReducer(initialState, action);

          // Use the selector's projector function directly
          const selector = selectFragmentsBySubjectAndRelation(querySubject, queryRelation);
          const result = selector.projector(state.fragments);

          // Compute expected result manually
          const expected = fragments.filter(
            f => f.subject === querySubject && f.relation === queryRelation
          );

          expect(result).toEqual(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty array when no fragments match', () => {
    fc.assert(
      fc.property(
        fc.array(validFragmentArb, { minLength: 0, maxLength: 6 }),
        (fragments) => {
          const action = loadKnowledgeBase({ fragments });
          const state = knowledgeBaseReducer(initialState, action);

          // Query with a subject/relation that doesn't exist in the pool
          const selector = selectFragmentsBySubjectAndRelation('NonExistent', 'NO_RELATION');
          const result = selector.projector(state.fragments);

          expect(result).toEqual([]);
        }
      ),
      { numRuns: 50 }
    );
  });
});
