/**
 * @fileoverview Engine Model — FSM states and operator result types.
 *
 * This file defines the finite state machine (FSM) that governs the engine's
 * lifecycle, plus the discriminated union of result types that the Knowledge
 * Operator can return. Together, these types ensure that every possible
 * engine state and operator outcome is explicitly modeled and exhaustively
 * handled by the orchestrator.
 *
 * @remarks
 * DESIGN DECISION: The engine FSM and operator results are defined as
 * separate types (not merged into the SSM model) because they represent
 * different concerns. The FSM is about the engine's lifecycle; the operator
 * results are about the outcome of a single inference step. Keeping them
 * separate makes the orchestrator's dispatch logic a clean switch on
 * `result.type`.
 */

import { ISSMEdge, ISSMNode, IGoal } from './ssm.model';

/**
 * The four states of the engine's finite state machine.
 *
 * The FSM enforces valid transitions — e.g., you can only enter THINKING
 * from IDLE, and you can only enter INQUIRY from THINKING. Invalid
 * transitions are silently ignored by the reducer (the state doesn't change).
 *
 * @remarks
 * DESIGN DECISION: Four states, not three. RESOLVED is separate from IDLE
 * because it signals that the engine has exhausted all goals (the SSM is
 * fully saturated). The UI can distinguish "hasn't started yet" (IDLE)
 * from "finished reasoning" (RESOLVED) to show appropriate feedback.
 *
 * State transitions:
 * ```
 * IDLE → THINKING (on engineStart)
 * THINKING → IDLE (on enginePause)
 * THINKING → INQUIRY (on engineInquiry — KB returned INQUIRY_REQUIRED)
 * THINKING → RESOLVED (on engineResolved — no goals remain)
 * INQUIRY → IDLE (on engineInquiryAnswered — user resolved the question)
 * ANY → IDLE (on engineReset)
 * ```
 */
export enum EngineState {
  /** Engine is idle — not processing. Ready to start or has been paused/reset. */
  IDLE = 'IDLE',

  /** Engine is actively processing pulses through the Triple-Operator cycle. */
  THINKING = 'THINKING',

  /**
   * Engine is paused waiting for user input. A QUESTION node exists in the SSM
   * and the user must resolve it (CONFIRMED or UNKNOWN) before inference resumes.
   */
  INQUIRY = 'INQUIRY',

  /**
   * Engine has exhausted all goals — the SSM is fully saturated given the
   * current Task Structure and Knowledge Base. No further inference is possible.
   */
  RESOLVED = 'RESOLVED',
}

/**
 * Result returned by the Knowledge Operator when it successfully matches
 * KB fragments and spawns new HYPOTHESIS nodes.
 *
 * Contains the new nodes and edges to append to the SSM via `applyPatch`.
 * Multiple nodes may be present (multi-hypothesis spawning).
 */
export interface IPatchResult {
  /** Discriminator — identifies this as a graph-expansion result. */
  type: 'PATCH';

  /** New HYPOTHESIS nodes to append to the SSM. One per matching KB fragment. */
  nodes: ISSMNode[];

  /** New edges connecting the anchor node to each new HYPOTHESIS node. */
  edges: ISSMEdge[];

  /**
   * CF updates for existing nodes affected by graph merging.
   * Maps node ID → new combined CF value.
   * [Ref: MD Sec 4.6 / Paper 1 Sec 3.2.2 / Gap 4]
   * The reducer applies these immutably — the Knowledge Operator never
   * mutates store objects.
   */
  cfUpdates?: Record<string, number>;
}

/**
 * Result returned by the Knowledge Operator for STATUS_UPGRADE goals.
 *
 * @remarks
 * DESIGN DECISION: STATUS_UPGRADE_PATCH is a separate result type from PATCH
 * because it represents a fundamentally different mutation: changing an existing
 * node's status rather than appending new nodes. The reducer handles it with
 * a `map()` over existing nodes (targeted status change) rather than array
 * concatenation (append). Keeping it separate makes the orchestrator's dispatch
 * logic explicit and type-safe — TypeScript's exhaustive checking ensures every
 * result type is handled.
 */
export interface IStatusUpgradePatchResult {
  /** Discriminator — identifies this as a status-promotion result. */
  type: 'STATUS_UPGRADE_PATCH';

  /** The ID of the HYPOTHESIS node to promote to CONFIRMED. */
  nodeId: string;

  /** The target status — always 'CONFIRMED' in the current design. */
  newStatus: 'CONFIRMED';
}

/**
 * Result returned by the Knowledge Operator when no KB fragments match
 * the goal's anchor label and target relation.
 *
 * The engine treats the Knowledge Base as ground truth, so a missing match
 * simply means this relation doesn't exist in the domain. The engine silently
 * skips the goal and marks the edge as explored so it won't be retried.
 */
export interface INoMatchResult {
  /** Discriminator — identifies this as a no-match (skip) result. */
  type: 'NO_MATCH';

  /** The original goal that had no KB coverage. */
  goal: IGoal;
}

/**
 * Result returned by the Knowledge Operator when no KB fragments match
 * the goal's anchor label and target relation.
 *
 * @deprecated Retained for backward compatibility. New code should handle NO_MATCH instead.
 */
export interface IInquiryRequiredResult {
  /** Discriminator — identifies this as an inquiry-needed result. */
  type: 'INQUIRY_REQUIRED';

  /** The original goal that could not be resolved from the KB. */
  goal: IGoal;
}

/**
 * Discriminated union of all possible Knowledge Operator outcomes.
 *
 * The Inference Engine orchestrator switches on `result.type` to determine
 * which NgRx action to dispatch. TypeScript's exhaustive checking ensures
 * every variant is handled.
 *
 * @remarks
 * DESIGN DECISION: Using a discriminated union (tagged union) rather than
 * a class hierarchy because the Knowledge Operator is a pure function, not
 * an OOP construct. Tagged unions are idiomatic TypeScript for this pattern
 * and work naturally with `if/else` or `switch` narrowing.
 */
export type KnowledgeOperatorResult =
  | IPatchResult
  | IStatusUpgradePatchResult
  | INoMatchResult
  | IInquiryRequiredResult;
