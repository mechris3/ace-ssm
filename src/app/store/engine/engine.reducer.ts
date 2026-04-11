/**
 * @fileoverview Engine FSM Reducer — state transitions for the inference engine lifecycle.
 *
 * The engine FSM has four states (IDLE, THINKING, INQUIRY, RESOLVED) and
 * enforces valid transitions. Invalid transitions are silently ignored —
 * the reducer returns the current state unchanged. This makes the FSM
 * robust against out-of-order dispatches.
 *
 * @remarks
 * DESIGN DECISION: Invalid transitions are silently ignored rather than
 * throwing errors. This is intentional for a reactive system — actions may
 * arrive out of order due to async timing, and throwing would crash the
 * reducer pipeline. Silent ignoring is the NgRx convention for guarded
 * transitions.
 *
 * State diagram:
 * ```
 * IDLE → THINKING (engineStart)
 * THINKING → IDLE (enginePause)
 * THINKING → INQUIRY (engineInquiry)
 * THINKING → RESOLVED (engineResolved)
 * INQUIRY → IDLE (engineInquiryAnswered)
 * ANY → IDLE (engineReset)
 * ```
 */

import { createReducer, on } from '@ngrx/store';
import { EngineState } from '../../models/engine.model';
import * as EngineActions from './engine.actions';

/** NgRx feature key for the engine FSM store slice. */
export const engineFeatureKey = 'engine';

/**
 * Shape of the engine FSM store slice.
 * Contains only the current FSM state — no other data.
 */
export interface EngineSliceState {
  /** Current state of the engine finite state machine. */
  state: EngineState;
}

/**
 * Initial engine state — IDLE, ready to start.
 */
export const initialEngineState: EngineSliceState = {
  state: EngineState.IDLE,
};

export const engineReducer = createReducer(
  initialEngineState,

  /** IDLE → THINKING: User initiated inference (Run or Step). */
  on(EngineActions.engineStart, (s) =>
    s.state === EngineState.IDLE ? { state: EngineState.THINKING } : s
  ),

  /** THINKING → IDLE: User paused inference. */
  on(EngineActions.enginePause, (s) =>
    s.state === EngineState.THINKING ? { state: EngineState.IDLE } : s
  ),

  /** THINKING → INQUIRY: Knowledge Operator returned INQUIRY_REQUIRED. */
  on(EngineActions.engineInquiry, (s) =>
    s.state === EngineState.THINKING ? { state: EngineState.INQUIRY } : s
  ),

  /** THINKING → RESOLVED: Goal Generator returned zero goals (SSM saturated). */
  on(EngineActions.engineResolved, (s) =>
    s.state === EngineState.THINKING ? { state: EngineState.RESOLVED } : s
  ),

  /** INQUIRY → IDLE: User resolved the open question. */
  on(EngineActions.engineInquiryAnswered, (s) =>
    s.state === EngineState.INQUIRY ? { state: EngineState.IDLE } : s
  ),

  /** ANY → IDLE: Universal reset, always valid. */
  on(EngineActions.engineReset, () => ({ state: EngineState.IDLE })),
);
