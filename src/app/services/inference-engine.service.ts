/**
 * @fileoverview Inference Engine Service — the orchestrator of the Triple-Operator cycle.
 *
 * This service wires together the Pacer (timing), the three pure operators
 * (Goal Generator → Search Operator → Knowledge Operator), and the NgRx store
 * (state management). On each pulse from the Pacer, it:
 *
 * 1. Snapshots the current state from all relevant store slices
 * 2. Runs the Goal Generator to detect gaps
 * 3. Runs the Search Operator to pick the best goal
 * 4. Runs the Knowledge Operator to resolve it
 * 5. Dispatches the appropriate NgRx action based on the result
 *
 * The orchestrator is the only component that has side effects (store dispatches
 * and pacer control). The three operators remain pure functions.
 *
 * @remarks
 * DESIGN DECISION: The operators are exposed as instance methods (`this.generateGoals`,
 * `this.scoreGoals`, `this.resolveGoal`) that delegate to the pure functions.
 * This indirection exists solely for **testability** — tests can spy on or
 * override these methods to inject controlled behavior without mocking the
 * pure function imports. The methods add no logic; they are transparent wrappers.
 *
 * DESIGN DECISION: The orchestration pipeline uses `withLatestFrom` (not `combineLatest`)
 * because the Pacer pulse is the sole trigger. We don't want store changes to
 * trigger inference — only clock ticks should. `withLatestFrom` samples the
 * store state at the moment of each pulse without subscribing to store changes
 * as a trigger source.
 */

import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { withLatestFrom, filter, tap } from 'rxjs/operators';

import { PacerService } from './pacer.service';
import { generateGoals } from '../operators/goal-generator';
import { scoreGoals } from '../operators/search-operator';
import { resolveGoal } from '../operators/knowledge-operator';

import { selectSSMState } from '../store/ssm/ssm.selectors';
import { selectTaskStructure } from '../store/task-structure/task-structure.selectors';
import { selectAllFragments } from '../store/knowledge-base/knowledge-base.selectors';
import { selectStrategy } from '../store/strategy/strategy.selectors';
import { selectEngineState } from '../store/engine/engine.selectors';

import { EngineState } from '../models/engine.model';
import { ISSMNode, ISSMEdge, ISSMState, IGoal } from '../models/ssm.model';
import { IReasoningStep, IStrategy } from '../models/strategy.model';
import { IKnowledgeFragment } from '../models/knowledge-base.model';
import { ITaskStructure } from '../models/task-structure.model';

import * as SSMActions from '../store/ssm/ssm.actions';
import * as EngineActions from '../store/engine/engine.actions';

@Injectable({ providedIn: 'root' })
export class InferenceEngineService {
  /**
   * The main orchestration Observable. Must be subscribed to (typically in
   * AppComponent) for the engine to function. Each emission represents one
   * complete Triple-Operator cycle.
   *
   * @remarks
   * DESIGN DECISION: `orchestrate$` is a public Observable, not an auto-started
   * effect. The subscription is managed by AppComponent using `takeUntilDestroyed`,
   * which ties the engine's lifecycle to the Angular component tree. This avoids
   * orphaned subscriptions and makes the engine's activation explicit.
   */
  public orchestrate$;

  constructor(
    private store: Store,
    private pacer: PacerService
  ) {
    this.orchestrate$ = this.pacer.pulse$.pipe(
      // Sample all store slices at the moment of each pulse.
      // DESIGN DECISION: withLatestFrom ensures the pulse is the sole trigger.
      // Store changes alone do NOT trigger a cycle — only clock ticks do.
      withLatestFrom(
        this.store.select(selectSSMState),
        this.store.select(selectTaskStructure),
        this.store.select(selectAllFragments),
        this.store.select(selectStrategy),
        this.store.select(selectEngineState)
      ),
      // DESIGN DECISION: Only process pulses when the engine FSM is in THINKING state.
      // This prevents stale pulses from being processed during IDLE, INQUIRY, or RESOLVED.
      // The filter acts as a gate — pulses are silently dropped in non-THINKING states.
      filter(([_, _ssm, _ts, _kb, _strat, engineState]) =>
        engineState === EngineState.THINKING
      ),
      tap(([_, ssm, taskStructure, kb, strategy]) => {
        this.processPulse(ssm, taskStructure, kb, strategy);
      })
    );
  }

  /**
   * Executes one complete Triple-Operator cycle for a single pulse.
   *
   * This method contains the core dispatch logic:
   * - **PATCH** → Append new HYPOTHESIS nodes and edges to the SSM
   * - **STATUS_UPGRADE_PATCH** → Promote a HYPOTHESIS to CONFIRMED
   * - **INQUIRY_REQUIRED** → Create a QUESTION node, pause the engine
   * - **No goals** → Transition to RESOLVED (SSM is fully saturated)
   *
   * @param ssm - Current SSM state snapshot
   * @param taskStructure - Task Structure definition
   * @param kb - All Knowledge Base fragments
   * @param strategy - Current strategy with weights and name
   */
  processPulse(
    ssm: ISSMState,
    taskStructure: ITaskStructure,
    kb: IKnowledgeFragment[],
    strategy: IStrategy
  ): void {
    // Step 1: Goal Generation — detect gaps and upgrade opportunities
    const goals = this.generateGoals(ssm, taskStructure);

    if (goals.length === 0) {
      // No goals remain — the SSM is fully saturated. Transition to RESOLVED
      // and stop the pacer. The user must reset to start a new inference cycle.
      this.store.dispatch(EngineActions.setActiveGoal({ goal: null }));
      this.store.dispatch(EngineActions.engineResolved());
      this.pacer.pause();
      return;
    }

    // Step 2: Search Operator — score all goals and pick the winner
    const { selectedGoal, rationale } = this.scoreGoals(goals, ssm, kb, strategy);

    // Dispatch activeGoal so the Searchlight can highlight the anchor node
    this.store.dispatch(EngineActions.setActiveGoal({ goal: selectedGoal }));

    // Step 3: Knowledge Operator — resolve the winning goal against the KB
    const result = this.resolveGoal(selectedGoal, kb);

    // Step 4: Dispatch based on result type.
    // Each branch fills in the `actionTaken` field of the rationale with a
    // human-readable description of what actually happened.
    if (result.type === 'PATCH') {
      // KB fragments matched — append new HYPOTHESIS nodes to the SSM
      const reasoningStep: IReasoningStep = {
        ...rationale,
        actionTaken: `Expanded "${selectedGoal.anchorLabel}" via ${selectedGoal.targetRelation} → ${result.nodes.map(n => n.label).join(', ')}`,
      };
      this.store.dispatch(SSMActions.applyPatch({
        nodes: result.nodes,
        edges: result.edges,
        reasoningStep,
      }));
    } else if (result.type === 'STATUS_UPGRADE_PATCH') {
      // All CONFIRMED_BY targets are CONFIRMED — promote the hypothesis
      const reasoningStep: IReasoningStep = {
        ...rationale,
        actionTaken: `Promoted "${selectedGoal.anchorLabel}" from HYPOTHESIS to CONFIRMED`,
      };
      this.store.dispatch(SSMActions.applyStatusUpgrade({
        nodeId: result.nodeId,
        reasoningStep,
      }));
    } else if (result.type === 'INQUIRY_REQUIRED') {
      // No KB fragments matched — create a QUESTION node and pause for user input.
      // The QUESTION node's label is a human-readable prompt (e.g., "? CAUSES of Fever").
      const questionNode: ISSMNode = {
        id: `node_${crypto.randomUUID()}`,
        label: `? ${selectedGoal.targetRelation} of ${selectedGoal.anchorLabel}`,
        type: selectedGoal.targetType,
        status: 'QUESTION',
      };
      const edge: ISSMEdge = {
        id: `edge_${crypto.randomUUID()}`,
        source: selectedGoal.anchorNodeId,
        target: questionNode.id,
        relationType: selectedGoal.targetRelation,
      };
      const reasoningStep: IReasoningStep = {
        ...rationale,
        actionTaken: `Inquiry required: "${questionNode.label}"`,
      };
      // Dispatch the inquiry to the SSM (adds QUESTION node + edge + history entry)
      this.store.dispatch(SSMActions.openInquiry({ questionNode, edge, reasoningStep }));
      // Transition the engine FSM to INQUIRY state
      this.store.dispatch(EngineActions.engineInquiry());
      // Stop the pacer — inference cannot continue until the user answers
      this.pacer.pause();
    }
  }

  /**
   * Wrapper around the pure `generateGoals` function for testability.
   * Tests can spy on this method to inject controlled goal lists.
   */
  generateGoals(ssm: ISSMState, taskStructure: ITaskStructure): IGoal[] {
    return generateGoals(ssm, taskStructure);
  }

  /**
   * Wrapper around the pure `scoreGoals` function for testability.
   * Tests can spy on this method to inject controlled scoring results.
   */
  scoreGoals(
    goals: IGoal[], ssm: ISSMState, kb: IKnowledgeFragment[], strategy: IStrategy
  ): { selectedGoal: IGoal; rationale: IReasoningStep } {
    return scoreGoals(goals, ssm, kb, strategy);
  }

  /**
   * Wrapper around the pure `resolveGoal` function for testability.
   * Tests can spy on this method to inject controlled resolution results.
   */
  resolveGoal(goal: IGoal, kb: IKnowledgeFragment[]) {
    return resolveGoal(goal, kb);
  }
}
