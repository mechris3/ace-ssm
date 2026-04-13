import * as fc from 'fast-check';
import { SSMSerializerService } from './ssm-serializer.service';
import { ISSMNode, ISSMEdge, ISSMState, NodeStatus } from '../models/ssm.model';
import { IReasoningStep, IRationaleFactor } from '../models/strategy.model';

// ─── Fast-check Arbitraries (reused from SSM reducer spec pattern) ───────────

const NODE_STATUS_POOL: NodeStatus[] = ['HYPOTHESIS', 'CONFIRMED', 'QUESTION', 'UNKNOWN'];
const TYPE_POOL = ['FINDING', 'ETIOLOGIC_AGENT', 'PHYSIOLOGIC_STATE', 'TREATMENT'];
const RELATION_POOL = ['CAUSES', 'INDUCES', 'CONFIRMED_BY', 'TREATS'];
const LABEL_POOL = ['Fever', 'Headache', 'Meningitis', 'Influenza', 'Rash', 'Cough'];
const GOAL_KIND_POOL: Array<'EXPAND' | 'STATUS_UPGRADE'> = ['EXPAND', 'STATUS_UPGRADE'];

const nodeArb: fc.Arbitrary<ISSMNode> = fc.record({
  id: fc.uuid(),
  label: fc.constantFrom(...LABEL_POOL),
  type: fc.constantFrom(...TYPE_POOL),
  status: fc.constantFrom(...NODE_STATUS_POOL),
});

const edgeArb: fc.Arbitrary<ISSMEdge> = fc.record({
  id: fc.uuid(),
  source: fc.uuid(),
  target: fc.uuid(),
  relationType: fc.constantFrom(...RELATION_POOL),
});

// Use a double that avoids -0 since JSON.stringify(-0) === "0", breaking round-trip equality
const jsonSafeDouble = (opts: { min: number; max: number }) =>
  fc.double({ ...opts, noNaN: true, noDefaultInfinity: true }).map(v => Object.is(v, -0) ? 0 : v);

const rationaleFactorArb: fc.Arbitrary<IRationaleFactor> = fc.record({
  label: fc.string({ minLength: 1, maxLength: 20 }),
  impact: jsonSafeDouble({ min: -500, max: 500 }),
  explanation: fc.string({ minLength: 1, maxLength: 30 }),
});

const goalArb = fc.record({
  id: fc.uuid(),
  kind: fc.constantFrom(...GOAL_KIND_POOL),
  anchorNodeId: fc.uuid(),
  anchorLabel: fc.constantFrom(...LABEL_POOL),
  targetRelation: fc.constantFrom(...RELATION_POOL),
  targetType: fc.constantFrom(...TYPE_POOL),
  direction: fc.constantFrom('forward' as const, 'reverse' as const),
});

const reasoningStepArb: fc.Arbitrary<IReasoningStep> = fc.record({
  timestamp: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
  selectedGoal: goalArb,
  totalScore: jsonSafeDouble({ min: -1000, max: 1000 }),
  factors: fc.array(rationaleFactorArb, { minLength: 1, maxLength: 5 }),
  strategyName: fc.string({ minLength: 1, maxLength: 15 }),
  actionTaken: fc.string({ minLength: 1, maxLength: 30 }),
});

const ssmStateArb: fc.Arbitrary<ISSMState> = fc.record({
  nodes: fc.array(nodeArb, { minLength: 0, maxLength: 20 }),
  edges: fc.array(edgeArb, { minLength: 0, maxLength: 20 }),
  history: fc.array(reasoningStepArb, { minLength: 0, maxLength: 10 }),
  isRunning: fc.boolean(),
  waitingForUser: fc.boolean(),
  pendingFindingNodeId: fc.constant(null as string | null),
});

// ─── Property 1: SSM Serialization Round-Trip ────────────────────────────────
// **Validates: Requirements 16.1, 16.2, 16.3**

describe('Feature: ace-ssm-core-engine, Property 1: SSM Serialization Round-Trip', () => {
  const service = new SSMSerializerService();

  it('serialize then deserialize produces deeply equal ISSMState', () => {
    fc.assert(
      fc.property(ssmStateArb, (state) => {
        const json = service.serialize(state);
        const result = service.deserialize(json);

        // Result should not be an error
        expect('error' in (result as any)).toBe(false);
        expect(result).toEqual(state);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 16: Invalid JSON Deserialization Returns Error ─────────────────
// **Validates: Requirements 16.4**

describe('Feature: ace-ssm-core-engine, Property 16: Invalid JSON Deserialization Returns Error', () => {
  const service = new SSMSerializerService();

  it('non-JSON strings return error and do not throw', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
          try { JSON.parse(s); return false; } catch { return true; }
        }),
        (invalidJson) => {
          const result = service.deserialize(invalidJson);
          expect('error' in (result as any)).toBe(true);
          expect(typeof (result as { error: string }).error).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('structurally invalid JSON (missing fields, wrong types) returns error and does not throw', () => {
    // Generate valid JSON objects that don't conform to ISSMState structure
    const invalidStructureArb = fc.oneof(
      // Missing nodes array
      fc.record({
        edges: fc.constant([]),
        history: fc.constant([]),
        isRunning: fc.boolean(),
        waitingForUser: fc.boolean(),
      }),
      // nodes is not an array
      fc.record({
        nodes: fc.string(),
        edges: fc.constant([]),
        history: fc.constant([]),
        isRunning: fc.boolean(),
        waitingForUser: fc.boolean(),
      }),
      // edges is not an array
      fc.record({
        nodes: fc.constant([]),
        edges: fc.string(),
        history: fc.constant([]),
        isRunning: fc.boolean(),
        waitingForUser: fc.boolean(),
      }),
      // history is not an array
      fc.record({
        nodes: fc.constant([]),
        edges: fc.constant([]),
        history: fc.integer(),
        isRunning: fc.boolean(),
        waitingForUser: fc.boolean(),
      }),
      // isRunning is not a boolean
      fc.record({
        nodes: fc.constant([]),
        edges: fc.constant([]),
        history: fc.constant([]),
        isRunning: fc.string(),
        waitingForUser: fc.boolean(),
      }),
      // waitingForUser is not a boolean
      fc.record({
        nodes: fc.constant([]),
        edges: fc.constant([]),
        history: fc.constant([]),
        isRunning: fc.boolean(),
        waitingForUser: fc.string(),
      }),
      // Empty object
      fc.constant({}),
      // Array instead of object
      fc.constant([]),
      // Null
      fc.constant(null),
      // nodes with invalid node (missing required fields)
      fc.record({
        nodes: fc.constant([{ id: 'x' }]),
        edges: fc.constant([]),
        history: fc.constant([]),
        isRunning: fc.constant(true),
        waitingForUser: fc.constant(false),
      }),
    );

    fc.assert(
      fc.property(invalidStructureArb, (invalidObj) => {
        const json = JSON.stringify(invalidObj);
        const result = service.deserialize(json);
        expect('error' in (result as any)).toBe(true);
        expect(typeof (result as { error: string }).error).toBe('string');
      }),
      { numRuns: 100 }
    );
  });
});
