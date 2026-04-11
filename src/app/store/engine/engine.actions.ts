/**
 * @fileoverview Engine FSM Actions — transitions for the inference engine's lifecycle.
 *
 * These actions drive the engine's finite state machine (IDLE → THINKING →
 * INQUIRY/RESOLVED → IDLE). Each action represents a specific lifecycle event.
 * The reducer enforces valid transitions — dispatching an action in an invalid
 * state is silently ignored (the state doesn't change).
 *
 * @remarks
 * DESIGN DECISION: Engine actions carry no payload (except `engineReset` which
 * is also payload-free). The FSM state is determined entirely by the transition,
 * not by data. This keeps the FSM simple and predictable — you can reason about
 * it as a pure state diagram without considering payload variations.
 */

import { createAction } from '@ngrx/store';

/**
 * Transitions the engine from IDLE to THINKING.
 * Triggered when the user clicks "Run" or "Step" — the pacer starts emitting pulses.
 * Only valid from IDLE state; ignored in all other states.
 */
export const engineStart = createAction('[Engine] Start');

/**
 * Transitions the engine from THINKING to IDLE.
 * Triggered when the user clicks "Pause" — the pacer stops emitting pulses.
 * Only valid from THINKING state; ignored in all other states.
 */
export const enginePause = createAction('[Engine] Pause');

/**
 * Transitions the engine from THINKING to INQUIRY.
 * Triggered by the Inference Engine when the Knowledge Operator returns
 * INQUIRY_REQUIRED — the engine needs user input before it can continue.
 * Only valid from THINKING state; ignored in all other states.
 */
export const engineInquiry = createAction('[Engine] Inquiry');

/**
 * Transitions the engine from THINKING to RESOLVED.
 * Triggered by the Inference Engine when the Goal Generator returns zero goals —
 * the SSM is fully saturated and no further inference is possible.
 * Only valid from THINKING state; ignored in all other states.
 */
export const engineResolved = createAction('[Engine] Resolved');

/**
 * Transitions the engine from ANY state to IDLE.
 * A universal reset — used to return to a clean starting state regardless
 * of the current FSM state. Always valid.
 */
export const engineReset = createAction('[Engine] Reset');

/**
 * Transitions the engine from INQUIRY to IDLE.
 * Triggered after the user resolves an open QUESTION node (via `resolveInquiry`).
 * The engine returns to IDLE so the user can resume inference with Run or Step.
 * Only valid from INQUIRY state; ignored in all other states.
 */
export const engineInquiryAnswered = createAction('[Engine] Inquiry Answered');
