import * as fc from 'fast-check';
import { strategyReducer } from './strategy.reducer';
import * as StrategyActions from './strategy.actions';
import { IStrategy, IStrategyWeights, initialStrategy } from '../../models/strategy.model';

// ─── Fast-check Arbitraries ───────────────────────────────────────────────────

const weightsArb: fc.Arbitrary<IStrategyWeights> = fc.record({
  urgency: fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
  parsimony: fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
  costAversion: fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
});

const strategyNameArb = fc.string({ minLength: 1, maxLength: 30 });

const pacerDelayArb = fc.integer({ min: 0, max: 2000 });

// ─── Property 17: Strategy Update Replaces Values ────────────────────────────
// **Validates: Requirements 5.2, 5.3**

describe('Property 17: Strategy Update Replaces Values', () => {

  it('updateStrategy should replace name and weights', () => {
    fc.assert(
      fc.property(
        strategyNameArb,
        weightsArb,
        (name, weights) => {
          const action = StrategyActions.updateStrategy({ name, weights });
          const nextState = strategyReducer(initialStrategy, action);

          expect(nextState.name).toBe(name);
          expect(nextState.weights).toEqual(weights);
          // pacerDelay should remain unchanged
          expect(nextState.pacerDelay).toBe(initialStrategy.pacerDelay);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('updatePacerDelay should replace pacerDelay', () => {
    fc.assert(
      fc.property(
        pacerDelayArb,
        (pacerDelay) => {
          const action = StrategyActions.updatePacerDelay({ pacerDelay });
          const nextState = strategyReducer(initialStrategy, action);

          expect(nextState.pacerDelay).toBe(pacerDelay);
          // name and weights should remain unchanged
          expect(nextState.name).toBe(initialStrategy.name);
          expect(nextState.weights).toEqual(initialStrategy.weights);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('updateStrategy followed by updatePacerDelay should reflect both changes', () => {
    fc.assert(
      fc.property(
        strategyNameArb,
        weightsArb,
        pacerDelayArb,
        (name, weights, pacerDelay) => {
          let state: IStrategy = initialStrategy;
          state = strategyReducer(state, StrategyActions.updateStrategy({ name, weights }));
          state = strategyReducer(state, StrategyActions.updatePacerDelay({ pacerDelay }));

          expect(state.name).toBe(name);
          expect(state.weights).toEqual(weights);
          expect(state.pacerDelay).toBe(pacerDelay);
        }
      ),
      { numRuns: 100 }
    );
  });
});
