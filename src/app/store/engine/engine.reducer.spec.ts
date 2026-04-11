import * as fc from 'fast-check';
import { engineReducer, EngineSliceState, initialEngineState } from './engine.reducer';
import * as EngineActions from './engine.actions';
import { EngineState } from '../../models/engine.model';

// ─── Fast-check Arbitraries ───────────────────────────────────────────────────

const ALL_ENGINE_STATES: EngineState[] = [
  EngineState.IDLE,
  EngineState.THINKING,
  EngineState.INQUIRY,
  EngineState.RESOLVED,
];

const engineStateArb: fc.Arbitrary<EngineState> = fc.constantFrom(...ALL_ENGINE_STATES);

const engineSliceArb: fc.Arbitrary<EngineSliceState> = engineStateArb.map(s => ({ state: s }));

// ─── Property 15: Engine FSM Transition Correctness ──────────────────────────
// **Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.6, 11.7**

describe('Property 15: Engine FSM Transition Correctness', () => {

  it('engineReset from any state should transition to IDLE', () => {
    fc.assert(
      fc.property(engineSliceArb, (prev) => {
        const next = engineReducer(prev, EngineActions.engineReset());
        expect(next.state).toBe(EngineState.IDLE);
      }),
      { numRuns: 100 }
    );
  });

  it('engineStart from IDLE should transition to THINKING', () => {
    fc.assert(
      fc.property(fc.constant({ state: EngineState.IDLE } as EngineSliceState), (prev) => {
        const next = engineReducer(prev, EngineActions.engineStart());
        expect(next.state).toBe(EngineState.THINKING);
      }),
      { numRuns: 100 }
    );
  });

  it('engineInquiry from THINKING should transition to INQUIRY', () => {
    fc.assert(
      fc.property(fc.constant({ state: EngineState.THINKING } as EngineSliceState), (prev) => {
        const next = engineReducer(prev, EngineActions.engineInquiry());
        expect(next.state).toBe(EngineState.INQUIRY);
      }),
      { numRuns: 100 }
    );
  });

  it('engineResolved from THINKING should transition to RESOLVED', () => {
    fc.assert(
      fc.property(fc.constant({ state: EngineState.THINKING } as EngineSliceState), (prev) => {
        const next = engineReducer(prev, EngineActions.engineResolved());
        expect(next.state).toBe(EngineState.RESOLVED);
      }),
      { numRuns: 100 }
    );
  });

  it('enginePause from THINKING should transition to IDLE', () => {
    fc.assert(
      fc.property(fc.constant({ state: EngineState.THINKING } as EngineSliceState), (prev) => {
        const next = engineReducer(prev, EngineActions.enginePause());
        expect(next.state).toBe(EngineState.IDLE);
      }),
      { numRuns: 100 }
    );
  });

  it('engineInquiryAnswered from INQUIRY should transition to IDLE', () => {
    fc.assert(
      fc.property(fc.constant({ state: EngineState.INQUIRY } as EngineSliceState), (prev) => {
        const next = engineReducer(prev, EngineActions.engineInquiryAnswered());
        expect(next.state).toBe(EngineState.IDLE);
      }),
      { numRuns: 100 }
    );
  });

  it('invalid transitions should be ignored (state unchanged)', () => {
    // engineStart from non-IDLE states should be ignored
    const nonIdleStates = [EngineState.THINKING, EngineState.INQUIRY, EngineState.RESOLVED];
    fc.assert(
      fc.property(fc.constantFrom(...nonIdleStates), (s) => {
        const prev: EngineSliceState = { state: s };
        const next = engineReducer(prev, EngineActions.engineStart());
        expect(next.state).toBe(s);
      }),
      { numRuns: 100 }
    );
  });

  it('enginePause from non-THINKING states should be ignored', () => {
    const nonThinkingStates = [EngineState.IDLE, EngineState.INQUIRY, EngineState.RESOLVED];
    fc.assert(
      fc.property(fc.constantFrom(...nonThinkingStates), (s) => {
        const prev: EngineSliceState = { state: s };
        const next = engineReducer(prev, EngineActions.enginePause());
        expect(next.state).toBe(s);
      }),
      { numRuns: 100 }
    );
  });

  it('engineInquiry from non-THINKING states should be ignored', () => {
    const nonThinkingStates = [EngineState.IDLE, EngineState.INQUIRY, EngineState.RESOLVED];
    fc.assert(
      fc.property(fc.constantFrom(...nonThinkingStates), (s) => {
        const prev: EngineSliceState = { state: s };
        const next = engineReducer(prev, EngineActions.engineInquiry());
        expect(next.state).toBe(s);
      }),
      { numRuns: 100 }
    );
  });

  it('engineResolved from non-THINKING states should be ignored', () => {
    const nonThinkingStates = [EngineState.IDLE, EngineState.INQUIRY, EngineState.RESOLVED];
    fc.assert(
      fc.property(fc.constantFrom(...nonThinkingStates), (s) => {
        const prev: EngineSliceState = { state: s };
        const next = engineReducer(prev, EngineActions.engineResolved());
        expect(next.state).toBe(s);
      }),
      { numRuns: 100 }
    );
  });

  it('engineInquiryAnswered from non-INQUIRY states should be ignored', () => {
    const nonInquiryStates = [EngineState.IDLE, EngineState.THINKING, EngineState.RESOLVED];
    fc.assert(
      fc.property(fc.constantFrom(...nonInquiryStates), (s) => {
        const prev: EngineSliceState = { state: s };
        const next = engineReducer(prev, EngineActions.engineInquiryAnswered());
        expect(next.state).toBe(s);
      }),
      { numRuns: 100 }
    );
  });
});
