/**
 * @fileoverview Inference Engine Service — the orchestrator of the Triple-Operator cycle.
 * [Ref: MD Sec 4 - Engine Orchestration]
 *
 * Wires together the Pacer (timing), the three pure operators
 * (Goal Generator → Search Operator → Knowledge Operator), and the NgRx
 * store (state management). On each pulse it:
 *
 *   1. Snapshots all store slices           [Ref: MD Sec 4.3 Step 1]
 *   2. Runs the Goal Generator              [Ref: MD Sec 4.3 Step 3]
 *   3. Runs the Search Operator             [Ref: MD Sec 4.3 Step 4]
 *   4. Runs the Knowledge Operator          [Ref: MD Sec 4.3 Step 6]
 *   5. Dispatches the appropriate action    [Ref: MD Sec 4.3 Step 7]
 *   6. Checks for stall / loop break       [Ref: MD Sec 4.7]
 *   7. Checks for finding confirmation      [Ref: MD Sec 4.3 Step 8]
 *
 * The orchestrator is the ONLY component with side effects (store dispatches
 * and pacer control). The three operators remain pure functions.
 * [Ref: MD Sec 10 Invariant 6 - Pure Operators]
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
import { selectRelations } from '../store/task-structure/task-structure.selectors';
import { selectAllFragments } from '../store/knowledge-base/knowledge-base.selectors';
import { selectStrategy } from '../store/strategy/strategy.selectors';
import { selectEngineState } from '../store/engine/engine.selectors';

import { EngineState } from '../models/engine.model';
import { ISSMNode, ISSMEdge, ISSMState, IGoal } from '../models/ssm.model';
import { IReasoningStep, IStrategy } from '../models/strategy.model';
import { IKnowledgeFragment } from '../models/knowledge-base.model';
import { ITaskStructure } from '../models/task-structure.model';
import { IRelation } from '../models/task-structure.model';
import { computeDifferential } from '../store/ssm/ssm.selectors';

import * as SSMActions from '../store/ssm/ssm.actions';
import * as EngineActions from '../store/engine/engine.actions';

@Injectable({ providedIn: 'root' })
export class InferenceEngineService {
  /**
   * The main orchestration Observable.
   * [Ref: MD Sec 4.2 - Pacer / MD Sec 10 Invariant 7 - Clock-driven inference]
   *
   * WHY: `orchestrate$` is a public Observable, not an auto-started effect.
   * The subscription is managed by AppComponent using `takeUntilDestroyed`,
   * tying the engine's lifecycle to the Angular component tree.
   */
  public orchestrate$;

  /**
   * [Ref: MD Sec 4.7 - Stall Detection / Safety Valve]
   * Tracks consecutive pulses that produced no new nodes.
   * WHY: Prevents infinite loops when all goals resolve to NO_MATCH or
   * edges-only PATCHes. After MAX_STALL_PULSES, the engine forces RESOLVED.
   */
  private stallCount = 0;
  private static readonly MAX_STALL_PULSES = 10;

  constructor(
    private store: Store,
    private pacer: PacerService
  ) {
    this.orchestrate$ = this.pacer.pulse$.pipe(
      // [Ref: MD Sec 4.3 Step 1] Snapshot all store slices at pulse time.
      // WHY: withLatestFrom ensures the pulse is the sole trigger.
      // Store changes alone do NOT trigger a cycle — only clock ticks do.
      withLatestFrom(
        this.store.select(selectSSMState),
        this.store.select(selectTaskStructure),
        this.store.select(selectAllFragments),
        this.store.select(selectStrategy),
        this.store.select(selectEngineState),
        this.store.select(selectRelations)
      ),
      // [Ref: MD Sec 4.3 Step 2] Gate check — only THINKING state.
      // WHY: Prevents stale pulses during IDLE, INQUIRY, or RESOLVED.
      filter(([_, _ssm, _ts, _kb, _strat, engineState]) =>
        engineState === EngineState.THINKING
      ),
      tap(([_, ssm, taskStructure, kb, strategy, _engineState, relations]) => {
        this.processPulse(ssm, taskStructure, kb, strategy, relations);
      })
    );
  }

  /**
   * Executes one complete Triple-Operator cycle for a single pulse.
   * [Ref: MD Sec 4.3 - Pulse Processing Pipeline]
   * [Ref: MD Sec 1.3 - One Winner Per Heartbeat]
   */
  processPulse(
    ssm: ISSMState,
    taskStructure: ITaskStructure,
    kb: IKnowledgeFragment[],
    strategy: IStrategy,
    relations: IRelation[] = []
  ): void {

    // ═══════════════════════════════════════════════════════════════
    // Step 3: Goal Generation
    // [Ref: MD Sec 4.3 Step 3 / MD Sec 3.1 - Goal Generator]
    // ═══════════════════════════════════════════════════════════════
    const goals = this.generateGoals(ssm, taskStructure);

    if (goals.length === 0) {
      // [Ref: MD Sec 4.1] THINKING → RESOLVED: SSM is fully saturated.
      this.store.dispatch(EngineActions.setActiveGoal({ goal: null }));
      this.store.dispatch(EngineActions.engineResolved());
      this.pacer.pause();
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // Step 4: Goal Scoring — pick the winner
    // [Ref: MD Sec 4.3 Step 4 / MD Sec 3.2 - Search Operator]
    // ═══════════════════════════════════════════════════════════════
    const { selectedGoal, rationale } = this.scoreGoals(goals, ssm, kb, strategy);

    // [Ref: MD Sec 4.3 Step 5] Searchlight — highlight the anchor node
    this.store.dispatch(EngineActions.setActiveGoal({ goal: selectedGoal }));

    // ═══════════════════════════════════════════════════════════════
    // Step 6: Goal Resolution
    // [Ref: MD Sec 4.3 Step 6 / MD Sec 3.3 - Knowledge Operator]
    // ═══════════════════════════════════════════════════════════════
    const result = this.resolveGoal(selectedGoal, kb, ssm.nodes);

    // ═══════════════════════════════════════════════════════════════
    // Step 7: Dispatch based on result type
    // [Ref: MD Sec 4.3 Step 7]
    // ═══════════════════════════════════════════════════════════════
    if (result.type === 'PATCH') {
      // [Ref: MD Sec 3.3.2 / 3.3.3 / 4.6]
      // actionTaken uses "Expanded" for new nodes, "Linked" for graph merges
      // to match the terminology in the MD file.
      const reasoningStep: IReasoningStep = {
        ...rationale,
        actionTaken: result.nodes.length > 0
          ? `Expanded "${selectedGoal.anchorLabel}" via ${selectedGoal.targetRelation} → ${result.nodes.map(n => n.label).join(', ')}`
          : `Linked "${selectedGoal.anchorLabel}" to existing nodes via ${result.edges.map(e => e.relationType).join(', ')}`,
      };

      // [Ref: MD Sec 4.5 - Goal Relation Coverage / Exhaustion]
      // WHY: If the broad fallback resolved the goal using a different
      // relation type, the Goal Generator would still see the original
      // relation as unexplored and regenerate the same goal → infinite loop.
      // The placeholder edge marks the original relation as exhausted.
      const patchEdges = [...result.edges];
      const goalRelationCovered = result.edges.some(e => e.relationType === selectedGoal.targetRelation);
      if (!goalRelationCovered) {
        patchEdges.push({
          id: `edge_${crypto.randomUUID()}`,
          source: selectedGoal.direction === 'reverse' ? `placeholder_${crypto.randomUUID()}` : selectedGoal.anchorNodeId,
          target: selectedGoal.direction === 'reverse' ? selectedGoal.anchorNodeId : `placeholder_${crypto.randomUUID()}`,
          relationType: selectedGoal.targetRelation,
        });
      }

      this.store.dispatch(SSMActions.applyPatch({
        nodes: result.nodes,
        edges: patchEdges,
        reasoningStep,
      }));

    } else if (result.type === 'STATUS_UPGRADE_PATCH') {
      // [Ref: MD Sec 3.3.1 / 3.1.2]
      const reasoningStep: IReasoningStep = {
        ...rationale,
        actionTaken: `Promoted "${selectedGoal.anchorLabel}" from HYPOTHESIS to CONFIRMED`,
      };
      this.store.dispatch(SSMActions.applyStatusUpgrade({
        nodeId: result.nodeId,
        reasoningStep,
      }));

    } else if (result.type === 'NO_MATCH') {
      // [Ref: MD Sec 4.4 - NO_MATCH Handling / Placeholder Edges]
      // WHY: The KB is ground truth (Sec 10 Invariant 4). A missing match
      // means this relation doesn't exist. The placeholder edge prevents
      // the Goal Generator from detecting the same gap again.
      const placeholderEdge: ISSMEdge = {
        id: `edge_${crypto.randomUUID()}`,
        source: selectedGoal.direction === 'reverse' ? `placeholder_${crypto.randomUUID()}` : selectedGoal.anchorNodeId,
        target: selectedGoal.direction === 'reverse' ? selectedGoal.anchorNodeId : `placeholder_${crypto.randomUUID()}`,
        relationType: selectedGoal.targetRelation,
      };
      const reasoningStep: IReasoningStep = {
        ...rationale,
        actionTaken: `No KB match for "${selectedGoal.anchorLabel}" → ${selectedGoal.targetRelation}; skipped (KB is truth)`,
      };
      this.store.dispatch(SSMActions.applyPatch({
        nodes: [],
        edges: [placeholderEdge],
        reasoningStep,
      }));

    } else if (result.type === 'INQUIRY_REQUIRED') {
      // Legacy fallback — treat identically to NO_MATCH.
      const placeholderEdge: ISSMEdge = {
        id: `edge_${crypto.randomUUID()}`,
        source: selectedGoal.direction === 'reverse' ? `placeholder_${crypto.randomUUID()}` : selectedGoal.anchorNodeId,
        target: selectedGoal.direction === 'reverse' ? selectedGoal.anchorNodeId : `placeholder_${crypto.randomUUID()}`,
        relationType: selectedGoal.targetRelation,
      };
      const reasoningStep: IReasoningStep = {
        ...rationale,
        actionTaken: `No KB match for "${selectedGoal.anchorLabel}" → ${selectedGoal.targetRelation}; skipped (KB is truth)`,
      };
      this.store.dispatch(SSMActions.applyPatch({
        nodes: [],
        edges: [placeholderEdge],
        reasoningStep,
      }));
    }

    // ═══════════════════════════════════════════════════════════════
    // Stall Detection — Safety Valve
    // [Ref: MD Sec 4.7 - Stall Detection / Loop Break]
    //
    // WHY: Without this, the engine could spin indefinitely on goals
    // that only produce placeholder edges or edges to existing nodes.
    // After MAX_STALL_PULSES consecutive pulses with zero new nodes,
    // force RESOLVED to break the loop.
    // ═══════════════════════════════════════════════════════════════
    const producedNewNodes = result.type === 'PATCH' && result.nodes.length > 0;
    if (producedNewNodes) {
      this.stallCount = 0;
    } else {
      this.stallCount++;
      if (this.stallCount >= InferenceEngineService.MAX_STALL_PULSES) {
        console.warn(
          `[ACE-SSM] Logic exhaustion: ${this.stallCount} consecutive pulses ` +
          `with no new nodes. Forcing RESOLVED. [Ref: MD Sec 4.7]`
        );
        this.store.dispatch(EngineActions.setActiveGoal({ goal: null }));
        this.store.dispatch(EngineActions.engineResolved());
        this.pacer.pause();
        this.stallCount = 0;
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Diagnostic Differential — Global Goal Constraint (G_g)
    // [Ref: Paper Sec 3.2.1 / Gap Analysis Gap 1]
    //
    // WHY: The paper defines G_g as the termination condition: the SSM
    // is "solved" when a candidate Condition covers ALL seed findings.
    // If any candidate in the differential achieves complete coverage,
    // the engine can declare victory and transition to RESOLVED.
    // ═══════════════════════════════════════════════════════════════
    if (relations.length > 0) {
      const differential = computeDifferential(ssm.nodes, ssm.edges, relations);
      const winner = differential.find(d => d.isComplete);
      if (winner) {
        console.info(
          `[ACE-SSM] Diagnostic differential resolved: "${winner.node.label}" ` +
          `covers all ${winner.totalSeedCount} seed findings. [Ref: Paper G_g]`
        );
        this.store.dispatch(EngineActions.setActiveGoal({ goal: null }));
        this.store.dispatch(EngineActions.engineResolved());
        this.pacer.pause();
        return;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Finding Confirmation Check
    // [Ref: MD Sec 4.3 Step 8 / MD Sec 5.1 - Trigger Condition]
    //
    // WHY: The engine must pause for user input when it spawns a
    // hypothesis that requires clinical observation. This is what
    // makes the system interactive rather than fully automated.
    // [Ref: MD Sec 10 Invariant 10 - Finding confirmation is user-driven]
    // ═══════════════════════════════════════════════════════════════
    const confirmableNodes: ISSMNode[] = [];

    // Check newly spawned nodes from a PATCH result
    if (result.type === 'PATCH') {
      confirmableNodes.push(
        ...result.nodes.filter(n => n.status === 'HYPOTHESIS' && n.canBeConfirmed === true)
      );
    }

    // Check the anchor node (from the SSM snapshot taken at pulse start)
    const anchorNode = ssm.nodes.find(n => n.id === selectedGoal.anchorNodeId);
    if (
      anchorNode &&
      anchorNode.status === 'HYPOTHESIS' &&
      anchorNode.canBeConfirmed === true
    ) {
      confirmableNodes.push(anchorNode);
    }

    if (confirmableNodes.length > 0) {
      const nodeToConfirm = confirmableNodes[0];
      // [Ref: MD Sec 1.3] This is the second dispatch in the same pulse —
      // the finding inquiry produces its own separate ReasoningStep.
      const confirmReasoningStep: IReasoningStep = {
        ...rationale,
        actionTaken: `Observation required: "${nodeToConfirm.label}". Awaiting user confirmation.`,
      };
      this.store.dispatch(SSMActions.openFindingInquiry({
        nodeId: nodeToConfirm.id,
        reasoningStep: confirmReasoningStep,
      }));
      // [Ref: MD Sec 4.1] THINKING → INQUIRY
      this.store.dispatch(EngineActions.engineInquiry());
      this.pacer.pause();
    }
  }

  /** Testability wrapper for Goal Generator. [Ref: MD Sec 3.1] */
  generateGoals(ssm: ISSMState, taskStructure: ITaskStructure): IGoal[] {
    return generateGoals(ssm, taskStructure);
  }

  /** Testability wrapper for Search Operator. [Ref: MD Sec 3.2] */
  scoreGoals(
    goals: IGoal[], ssm: ISSMState, kb: IKnowledgeFragment[], strategy: IStrategy
  ): { selectedGoal: IGoal; rationale: IReasoningStep } {
    return scoreGoals(goals, ssm, kb, strategy);
  }

  /** Testability wrapper for Knowledge Operator. [Ref: MD Sec 3.3] */
  resolveGoal(goal: IGoal, kb: IKnowledgeFragment[], existingNodes: ISSMNode[] = []) {
    return resolveGoal(goal, kb, existingNodes);
  }
}
