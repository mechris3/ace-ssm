import * as fc from 'fast-check';
import { ssmReducer } from './ssm.reducer';
import * as SSMActions from './ssm.actions';
import { ISSMNode, ISSMEdge, ISSMState, NodeStatus, initialSSMState } from '../../models/ssm.model';
import { IReasoningStep, IRationaleFactor } from '../../models/strategy.model';

// ─── Fast-check Arbitraries ───────────────────────────────────────────────────

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

const rationaleFactorArb: fc.Arbitrary<IRationaleFactor> = fc.record({
  label: fc.string({ minLength: 1, maxLength: 20 }),
  impact: fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true }),
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
  totalScore: fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
  factors: fc.array(rationaleFactorArb, { minLength: 1, maxLength: 5 }),
  strategyName: fc.string({ minLength: 1, maxLength: 15 }),
  actionTaken: fc.string({ minLength: 1, maxLength: 30 }),
});

const ssmStateArb: fc.Arbitrary<ISSMState> = fc.record({
  nodes: fc.array(nodeArb, { minLength: 0, maxLength: 10 }),
  edges: fc.array(edgeArb, { minLength: 0, maxLength: 10 }),
  history: fc.array(reasoningStepArb, { minLength: 0, maxLength: 5 }),
  isRunning: fc.boolean(),
  waitingForUser: fc.boolean(),
  pendingFindingNodeId: fc.constant(null as string | null),
});

const nonEmptySSMStateArb: fc.Arbitrary<ISSMState> = fc.record({
  nodes: fc.array(nodeArb, { minLength: 1, maxLength: 10 }),
  edges: fc.array(edgeArb, { minLength: 1, maxLength: 10 }),
  history: fc.array(reasoningStepArb, { minLength: 1, maxLength: 5 }),
  isRunning: fc.boolean(),
  waitingForUser: fc.boolean(),
  pendingFindingNodeId: fc.constant(null as string | null),
});

// ─── Property 5: SSM Patch Is Append-Only ────────────────────────────────────
// **Validates: Requirements 4.2, 4.3, 14.3**

describe('Property 5: SSM Patch Is Append-Only', () => {

  it('should preserve existing nodes/edges and append new ones, history grows by 1', () => {
    fc.assert(
      fc.property(
        ssmStateArb,
        fc.array(nodeArb, { minLength: 1, maxLength: 5 }),
        fc.array(edgeArb, { minLength: 1, maxLength: 5 }),
        reasoningStepArb,
        (prevState, newNodes, newEdges, reasoningStep) => {
          const action = SSMActions.applyPatch({ nodes: newNodes, edges: newEdges, reasoningStep });
          const nextState = ssmReducer(prevState, action);

          // (a) All previous nodes preserved
          for (let i = 0; i < prevState.nodes.length; i++) {
            expect(nextState.nodes[i]).toEqual(prevState.nodes[i]);
          }
          // (b) New nodes appended
          for (let i = 0; i < newNodes.length; i++) {
            expect(nextState.nodes[prevState.nodes.length + i]).toEqual(newNodes[i]);
          }
          expect(nextState.nodes.length).toBe(prevState.nodes.length + newNodes.length);

          // (a) All previous edges preserved
          for (let i = 0; i < prevState.edges.length; i++) {
            expect(nextState.edges[i]).toEqual(prevState.edges[i]);
          }
          // (b) New edges appended
          for (let i = 0; i < newEdges.length; i++) {
            expect(nextState.edges[prevState.edges.length + i]).toEqual(newEdges[i]);
          }
          expect(nextState.edges.length).toBe(prevState.edges.length + newEdges.length);

          // (c) History grows by exactly one entry
          expect(nextState.history.length).toBe(prevState.history.length + 1);
          expect(nextState.history[nextState.history.length - 1]).toEqual(reasoningStep);

          // Previous history preserved
          for (let i = 0; i < prevState.history.length; i++) {
            expect(nextState.history[i]).toEqual(prevState.history[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6: SSM Reset Restores Initial State ───────────────────────────
// **Validates: Requirements 4.5**

describe('Property 6: SSM Reset Restores Initial State', () => {

  it('should restore initialSSMState from any non-empty state', () => {
    fc.assert(
      fc.property(nonEmptySSMStateArb, (prevState) => {
        const action = SSMActions.resetSSM();
        const nextState = ssmReducer(prevState, action);

        expect(nextState).toEqual(initialSSMState);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 13: Inquiry Resolution Updates Node and History ────────────────
// **Validates: Requirements 12.3, 12.4, 12.5**

describe('Property 13: Inquiry Resolution Updates Node and History', () => {

  /** Generate an SSM state that has at least one QUESTION node. */
  const ssmWithQuestionNodeArb: fc.Arbitrary<{ state: ISSMState; questionNodeId: string }> =
    fc.tuple(
      fc.array(nodeArb, { minLength: 0, maxLength: 5 }),
      fc.array(edgeArb, { minLength: 0, maxLength: 5 }),
      fc.array(reasoningStepArb, { minLength: 0, maxLength: 3 }),
      fc.uuid(),
      fc.constantFrom(...LABEL_POOL),
      fc.constantFrom(...TYPE_POOL),
    ).map(([otherNodes, edges, history, qId, qLabel, qType]) => {
      const questionNode: ISSMNode = {
        id: qId,
        label: qLabel,
        type: qType,
        status: 'QUESTION',
      };
      return {
        state: {
          nodes: [...otherNodes, questionNode],
          edges,
          history,
          isRunning: false,
          waitingForUser: true,
          pendingFindingNodeId: null,
        },
        questionNodeId: qId,
      };
    });

  it('should update QUESTION node to CONFIRMED with new label, history grows by 1', () => {
    fc.assert(
      fc.property(
        ssmWithQuestionNodeArb,
        fc.string({ minLength: 1, maxLength: 20 }),
        reasoningStepArb,
        ({ state, questionNodeId }, newLabel, reasoningStep) => {
          const action = SSMActions.resolveInquiry({
            nodeId: questionNodeId,
            newStatus: 'CONFIRMED',
            newLabel,
            reasoningStep,
          });
          const nextState = ssmReducer(state, action);

          // Node status updated to CONFIRMED
          const updatedNode = nextState.nodes.find(n => n.id === questionNodeId);
          expect(updatedNode).toBeDefined();
          expect(updatedNode!.status).toBe('CONFIRMED');
          expect(updatedNode!.label).toBe(newLabel);

          // History grows by 1
          expect(nextState.history.length).toBe(state.history.length + 1);
          expect(nextState.history[nextState.history.length - 1]).toEqual(reasoningStep);

          // waitingForUser cleared
          expect(nextState.waitingForUser).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should update QUESTION node to UNKNOWN without changing label, history grows by 1', () => {
    fc.assert(
      fc.property(
        ssmWithQuestionNodeArb,
        reasoningStepArb,
        ({ state, questionNodeId }, reasoningStep) => {
          const originalNode = state.nodes.find(n => n.id === questionNodeId)!;
          const action = SSMActions.resolveInquiry({
            nodeId: questionNodeId,
            newStatus: 'UNKNOWN',
            newLabel: null,
            reasoningStep,
          });
          const nextState = ssmReducer(state, action);

          // Node status updated to UNKNOWN
          const updatedNode = nextState.nodes.find(n => n.id === questionNodeId);
          expect(updatedNode).toBeDefined();
          expect(updatedNode!.status).toBe('UNKNOWN');
          // Label unchanged when newLabel is null
          expect(updatedNode!.label).toBe(originalNode.label);

          // History grows by 1
          expect(nextState.history.length).toBe(state.history.length + 1);
          expect(nextState.history[nextState.history.length - 1]).toEqual(reasoningStep);

          // waitingForUser cleared
          expect(nextState.waitingForUser).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 14: History Is Append-Only and Valid ───────────────────────────
// **Validates: Requirements 14.2, 14.4**

describe('Property 14: History Is Append-Only and Valid', () => {

  /**
   * Generate a random sequence of SSM-mutating actions.
   * Each action carries a valid reasoningStep with timestamp > 0,
   * non-empty factors, and non-empty actionTaken.
   */
  const ssmMutatingActionArb = fc.oneof(
    // applyPatch
    fc.tuple(
      fc.array(nodeArb, { minLength: 1, maxLength: 3 }),
      fc.array(edgeArb, { minLength: 1, maxLength: 3 }),
      reasoningStepArb,
    ).map(([nodes, edges, reasoningStep]) =>
      SSMActions.applyPatch({ nodes, edges, reasoningStep })
    ),
    // applyStatusUpgrade
    fc.tuple(fc.uuid(), reasoningStepArb).map(([nodeId, reasoningStep]) =>
      SSMActions.applyStatusUpgrade({ nodeId, reasoningStep })
    ),
    // openInquiry
    fc.tuple(nodeArb, edgeArb, reasoningStepArb).map(([questionNode, edge, reasoningStep]) =>
      SSMActions.openInquiry({ questionNode, edge, reasoningStep })
    ),
    // resolveInquiry
    fc.tuple(
      fc.uuid(),
      fc.constantFrom('CONFIRMED' as NodeStatus, 'UNKNOWN' as NodeStatus),
      fc.option(fc.string({ minLength: 1, maxLength: 15 }), { nil: null as string | null }),
      reasoningStepArb,
    ).map(([nodeId, newStatus, newLabel, reasoningStep]) =>
      SSMActions.resolveInquiry({ nodeId, newStatus, newLabel, reasoningStep })
    ),
  );

  it('should have monotonically non-decreasing history length with valid entries', () => {
    fc.assert(
      fc.property(
        fc.array(ssmMutatingActionArb, { minLength: 1, maxLength: 10 }),
        (actions) => {
          let state: ISSMState = initialSSMState;
          let prevHistoryLength = 0;

          for (const action of actions) {
            state = ssmReducer(state, action);

            // History length is monotonically non-decreasing
            expect(state.history.length).toBeGreaterThanOrEqual(prevHistoryLength);
            prevHistoryLength = state.history.length;
          }

          // Every history entry has valid timestamp > 0, non-empty factors, non-empty actionTaken
          for (const entry of state.history) {
            expect(entry.timestamp).toBeGreaterThan(0);
            expect(entry.factors?.length ?? 0).toBeGreaterThanOrEqual(0);
            expect(entry.actionTaken.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
