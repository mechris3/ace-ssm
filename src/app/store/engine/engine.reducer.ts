/**
 * @fileoverview Engine FSM Reducer — state transitions for the inference engine lifecycle.
 * [Ref: MD Sec 4.1 - Engine Finite State Machine]
 * [Ref: MD Sec 6.3 - Engine Actions]
 *
 * The engine FSM has four states (IDLE, THINKING, INQUIRY, RESOLVED) and
 * enforces valid transitions. Invalid transitions are silently ignored.
 *
 * State diagram:
 * ```
 * IDLE → THINKING       (engineStart)       [Ref: MD Sec 4.1]
 * THINKING → IDLE       (enginePause)       [Ref: MD Sec 4.1]
 * THINKING → INQUIRY    (engineInquiry)     [Ref: MD Sec 4.1]
 * THINKING → RESOLVED   (engineResolved)    [Ref: MD Sec 4.1]
 * INQUIRY → IDLE        (engineInquiryAnswered) [Ref: MD Sec 4.1]
 * ANY → IDLE            (engineReset)       [Ref: MD Sec 4.1]
 * ```
 *
 * WHY silent ignoring: Actions may arrive out of order due to async timing.
 * Throwing would crash the reducer pipeline. Silent ignoring is the NgRx
 * convention for guarded transitions.
 */

import { createReducer, on } from '@ngrx/store';
import { EngineState } from '../../models/engine.model';
import { IGoal } from '../../models/ssm.model';
import * as EngineActions from './engine.actions';

/** NgRx feature key for the engine FSM store slice. [Ref: MD Sec 6.1] */
export const engineFeatureKey = 'engine';

/** Shape of the engine FSM store slice. [Ref: MD Sec 6.1] */
export interface EngineSliceState {
  /** Current state of the engine finite state machine. */
  state: EngineState;
  /** The currently active goal during a pulse, used by the Searchlight Effect. */
  activeGoal: IGoal | null;
}

/** Initial engine state — IDLE, ready to start. */
export const initialEngineState: EngineSliceState = {
  state: EngineState.IDLE,
  activeGoal: null,
};

export const engineReducer = createReducer(
  initialEngineState,

  // [Ref: MD Sec 6.3] IDLE → THINKING: User initiated inference (Run or Step).
  on(EngineActions.engineStart, (s) =>
    s.state === EngineState.IDLE ? { ...s, state: EngineState.THINKING } : s
  ),

  // [Ref: MD Sec 6.3] THINKING → IDLE: User paused inference.
  on(EngineActions.enginePause, (s) =>
    s.state === EngineState.THINKING ? { ...s, state: EngineState.IDLE } : s
  ),

  // [Ref: MD Sec 6.3] THINKING → INQUIRY: Finding confirmation triggered.
  // [Ref: MD Sec 5.1 - Trigger Condition]
  on(EngineActions.engineInquiry, (s) =>
    s.state === EngineState.THINKING ? { ...s, state: EngineState.INQUIRY } : s
  ),

  // [Ref: MD Sec 6.3] THINKING → RESOLVED: Goal Generator returned zero goals.
  // Also triggered by stall detection (Sec 4.7).
  on(EngineActions.engineResolved, (s) =>
    s.state === EngineState.THINKING ? { ...s, state: EngineState.RESOLVED, activeGoal: null } : s
  ),

  // [Ref: MD Sec 6.3] INQUIRY → IDLE: User resolved the inquiry.
  // [Ref: MD Sec 5.3 - User Actions]
  on(EngineActions.engineInquiryAnswered, (s) =>
    s.state === EngineState.INQUIRY ? { ...s, state: EngineState.IDLE } : s
  ),

  // [Ref: MD Sec 6.3] Set the active goal for the Searchlight Effect.
  // [Ref: MD Sec 4.3 Step 5]
  on(EngineActions.setActiveGoal, (s, { goal }) => ({ ...s, activeGoal: goal })),

  // [Ref: MD Sec 6.3] ANY → IDLE: Universal reset, always valid.
  on(EngineActions.engineReset, () => ({ state: EngineState.IDLE, activeGoal: null })),
);
