/**
 * @fileoverview Engine FSM Actions — transitions for the inference engine's lifecycle.
 * [Ref: MD Sec 6.3 - Engine Actions]
 * [Ref: MD Sec 4.1 - Engine Finite State Machine]
 *
 * These actions drive the engine's finite state machine (IDLE → THINKING →
 * INQUIRY/RESOLVED → IDLE). The reducer enforces valid transitions —
 * dispatching an action in an invalid state is silently ignored.
 */

import { createAction, props } from '@ngrx/store';
import { IGoal } from '../../models/ssm.model';

/**
 * [Ref: MD Sec 6.3] IDLE → THINKING.
 * Triggered when the user clicks "Run" or "Step".
 * Also triggered by resumeAfterInquiry (Sec 5.4).
 */
export const engineStart = createAction('[Engine] Start');

/**
 * [Ref: MD Sec 6.3] THINKING → IDLE.
 * Triggered when the user clicks "Pause".
 */
export const enginePause = createAction('[Engine] Pause');

/**
 * [Ref: MD Sec 6.3] THINKING → INQUIRY.
 * Triggered when the finding confirmation check (Sec 4.3 Step 8) finds
 * a confirmable HYPOTHESIS node. The engine pauses for user input.
 */
export const engineInquiry = createAction('[Engine] Inquiry');

/**
 * [Ref: MD Sec 6.3] THINKING → RESOLVED.
 * Triggered when the Goal Generator returns zero goals (SSM saturated),
 * or by the stall detection safety valve (Sec 4.7).
 */
export const engineResolved = createAction('[Engine] Resolved');

/**
 * [Ref: MD Sec 6.3] ANY → IDLE.
 * Universal reset — returns to a clean starting state regardless of
 * the current FSM state.
 */
export const engineReset = createAction('[Engine] Reset');

/**
 * [Ref: MD Sec 6.3] INQUIRY → IDLE.
 * Triggered after the user confirms, refutes, or skips a finding (Sec 5.3).
 * The facade then calls resumeAfterInquiry (Sec 5.4) to restart the engine.
 */
export const engineInquiryAnswered = createAction('[Engine] Inquiry Answered');

/**
 * [Ref: MD Sec 6.3 / MD Sec 4.3 Step 5]
 * Sets the currently active goal during a pulse.
 * Used by the Searchlight Effect to highlight the anchor node.
 * Set to null on reset or resolution.
 */
export const setActiveGoal = createAction(
  '[Engine] Set Active Goal',
  props<{ goal: IGoal | null }>()
);

/**
 * [Ref: Paper 1 Sec 3.2.3 / Gap 2 - Global Strategic Principles (S_G)]
 * Sets the solution focus — the root node of the currently pursued SSM subgraph.
 * Dispatched by the inference engine after evaluating S_G principles.
 */
export const setSolutionFocus = createAction(
  '[Engine] Set Solution Focus',
  props<{ nodeId: string | null }>()
);
