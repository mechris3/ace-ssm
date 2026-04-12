import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

import { PacerService } from './pacer.service';

import { ISSMState, NodeStatus } from '../models/ssm.model';
import { EngineState } from '../models/engine.model';
import { IGoal } from '../models/ssm.model';
import { IStrategy, IStrategyWeights, IReasoningStep } from '../models/strategy.model';
import { IRelation } from '../models/task-structure.model';

import * as EngineActions from '../store/engine/engine.actions';
import * as SSMActions from '../store/ssm/ssm.actions';
import * as StrategyActions from '../store/strategy/strategy.actions';
import * as TaskStructureActions from '../store/task-structure/task-structure.actions';
import * as KnowledgeBaseActions from '../store/knowledge-base/knowledge-base.actions';
import { IDomain } from '../models/domain.model';

import { selectSSMState } from '../store/ssm/ssm.selectors';
import { selectEngineState, selectActiveGoal } from '../store/engine/engine.selectors';
import { selectStrategy } from '../store/strategy/strategy.selectors';
import { selectEntityTypes } from '../store/task-structure/task-structure.selectors';
import { selectTaskStructure, selectTaskStructureLoaded, selectTaskStructureError } from '../store/task-structure/task-structure.selectors';
import { selectRelations } from '../store/task-structure/task-structure.selectors';
import { selectAllFragments, selectKnowledgeBaseLoaded, selectKnowledgeBaseError } from '../store/knowledge-base/knowledge-base.selectors';
import { computeDifferential, IDifferentialEntry } from '../store/ssm/ssm.selectors';
import { validateDomain } from '../operators/domain-validator';

export interface IViewModel {
  ssm: ISSMState;
  engineState: EngineState;
  activeGoal: IGoal | null;
  strategy: IStrategy;
  selectedNodeId: string | null;
  taskStructureLoaded: boolean;
  taskStructureError: string | null;
  kbLoaded: boolean;
  kbError: string | null;
  domainError: string | null;
  entityTypes: string[];
  relations: IRelation[];
  differential: IDifferentialEntry[];
}

@Injectable({ providedIn: 'root' })
export class FacadeService {
  private selectedNodeId$ = new BehaviorSubject<string | null>(null);
  viewModel$!: Observable<IViewModel>;

  constructor(private store: Store, private pacer: PacerService) {
    this.viewModel$ = combineLatest([
      this.store.select(selectSSMState),
      this.store.select(selectEngineState),
      this.store.select(selectActiveGoal),
      this.store.select(selectStrategy),
      this.selectedNodeId$,
      this.store.select(selectTaskStructureLoaded),
      this.store.select(selectTaskStructureError),
      this.store.select(selectKnowledgeBaseLoaded),
      this.store.select(selectKnowledgeBaseError),
      this.store.select(selectEntityTypes),
      this.store.select(selectRelations),
    ]).pipe(
      map(([ssm, engineState, activeGoal, strategy, selectedNodeId,
            taskStructureLoaded, taskStructureError, kbLoaded, kbError, entityTypes, relations]) => ({
        ssm,
        engineState,
        activeGoal,
        strategy,
        selectedNodeId,
        taskStructureLoaded,
        taskStructureError,
        kbLoaded,
        kbError,
        domainError: taskStructureError || kbError,
        entityTypes,
        relations,
        differential: computeDifferential(ssm.nodes, ssm.edges, relations),
      })),
      shareReplay(1),
    );
  }

  run(): void {
    this.store.dispatch(EngineActions.engineStart());
    this.pacer.run();
  }

  pause(): void {
    this.store.dispatch(EngineActions.enginePause());
    this.pacer.pause();
  }

  step(): void {
    this.store.dispatch(EngineActions.engineStart());
    this.pacer.step();
  }

  reset(): void {
    this.store.dispatch(EngineActions.engineReset());
    this.store.dispatch(SSMActions.resetSSM());
    this.pacer.pause();
  }

  setSpeed(ms: number): void {
    this.store.dispatch(StrategyActions.updatePacerDelay({ pacerDelay: ms }));
    this.pacer.setDelay(ms);
  }

  loadTaskStructure(json: string): void {
    try {
      const parsed = JSON.parse(json);
      this.store.dispatch(TaskStructureActions.loadTaskStructure({ taskStructure: parsed }));
    } catch (e) {
      this.store.dispatch(TaskStructureActions.loadTaskStructureFailure({
        error: `JSON parse error: ${(e as Error).message}`,
      }));
    }
  }

  loadKnowledgeBase(json: string): void {
    try {
      const parsed = JSON.parse(json);
      this.store.dispatch(KnowledgeBaseActions.loadKnowledgeBase({ fragments: parsed }));
    } catch (e) {
      this.store.dispatch(KnowledgeBaseActions.loadKnowledgeBaseFailure({
        error: `JSON parse error: ${(e as Error).message}`,
      }));
    }
  }

  loadDomain(json: string): void {
    try {
      const parsed: IDomain = JSON.parse(json);

      if (!parsed.structure || !parsed.knowledgeBase) {
        this.store.dispatch(TaskStructureActions.loadTaskStructureFailure({
          error: 'Invalid Domain JSON: missing "structure" or "knowledgeBase" field.',
        }));
        return;
      }

      // Atomic load: Task Structure → KB → (optional) SSM restore → (optional) Strategy restore
      this.store.dispatch(TaskStructureActions.loadTaskStructure({ taskStructure: parsed.structure }));
      this.store.dispatch(KnowledgeBaseActions.loadKnowledgeBase({ fragments: parsed.knowledgeBase }));

      // Restore previous session state if present.
      // Normalize the SSM to handle alternate field names (e.g., "auditTrail" → "history")
      // and missing fields. The store expects ISSMState shape exactly.
      if (parsed.ssm) {
        const raw = parsed.ssm as any;
        const normalizedSSM: ISSMState = {
          nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
          edges: Array.isArray(raw.edges) ? raw.edges : [],
          history: Array.isArray(raw.history) ? raw.history
                 : Array.isArray(raw.auditTrail) ? raw.auditTrail
                 : [],
          isRunning: typeof raw.isRunning === 'boolean' ? raw.isRunning : false,
          waitingForUser: typeof raw.waitingForUser === 'boolean' ? raw.waitingForUser : false,
          pendingFindingNodeId: typeof raw.pendingFindingNodeId === 'string' ? raw.pendingFindingNodeId : null,
        };
        this.store.dispatch(SSMActions.restoreSSM({ ssmState: normalizedSSM }));
      }
      if (parsed.strategy) {
        this.store.dispatch(StrategyActions.updateStrategy({ name: parsed.strategy.name, weights: parsed.strategy.weights }));
        this.store.dispatch(StrategyActions.updatePacerDelay({ pacerDelay: parsed.strategy.pacerDelay }));
      }

      // [Ref: Paper 2 Sec 4.3 / Gap 7] Validate the loaded domain
      const ssmNodes = parsed.ssm?.nodes ?? [];
      const warnings = validateDomain(parsed.structure, parsed.knowledgeBase, ssmNodes as any[]);
      if (warnings.length > 0) {
        console.warn(`[ACE-SSM] Domain validation warnings (${warnings.length}):`);
        warnings.forEach(w => console.warn(`  ⚠ ${w}`));
      }
    } catch (e) {
      this.store.dispatch(TaskStructureActions.loadTaskStructureFailure({
        error: `Domain JSON parse error: ${(e as Error).message}`,
      }));
    }
  }

  /**
   * Exports the current domain session as a JSON string.
   * Captures the full state: structure, KB, SSM (nodes/edges/history), and strategy.
   * The resulting JSON can be saved to a file and loaded later to resume the session.
   */
  exportDomain(domainId: string, domainName: string): Observable<string> {
    return combineLatest([
      this.store.select(selectTaskStructure),
      this.store.select(selectAllFragments),
      this.store.select(selectSSMState),
      this.store.select(selectStrategy),
    ]).pipe(
      map(([structure, knowledgeBase, ssm, strategy]) => {
        const domain: IDomain = {
          id: domainId,
          name: domainName,
          structure,
          knowledgeBase,
          ssm,
          strategy,
        };
        return JSON.stringify(domain, null, 2);
      }),
    );
  }

  seedFinding(label: string, type: string): void {
    const id = `node_${crypto.randomUUID()}`;
    this.store.dispatch(SSMActions.applyPatch({
      nodes: [{ id, label, type, status: 'CONFIRMED' as const, cf: 1.0 }],
      edges: [],
      reasoningStep: {
        timestamp: Date.now(),
        selectedGoal: { id: `goal_seed`, kind: 'EXPAND', anchorNodeId: id, anchorLabel: label, targetRelation: 'SEED', targetType: type, direction: 'forward' },
        totalScore: 0,
        factors: [],
        strategyName: 'Manual',
        actionTaken: `Seeded finding: ${label} (${type})`,
      },
    }));
    // Auto-trigger a pulse so the engine immediately investigates the new finding
    this.store.dispatch(EngineActions.engineStart());
    this.pacer.step();
  }

  resolveInquiry(nodeId: string, newStatus: NodeStatus, newLabel: string | null, auditText: string): void {
    const reasoningStep: IReasoningStep = {
      timestamp: Date.now(),
      selectedGoal: { id: `goal_resolve`, kind: 'EXPAND', anchorNodeId: nodeId, anchorLabel: newLabel ?? '', targetRelation: 'RESOLVE', targetType: '', direction: 'forward' },
      totalScore: 0,
      factors: [],
      strategyName: 'Manual',
      actionTaken: auditText,
    };
    this.store.dispatch(SSMActions.resolveInquiry({ nodeId, newStatus, newLabel, reasoningStep }));
    this.store.dispatch(EngineActions.engineInquiryAnswered());
  }

  confirmFinding(nodeId: string, nodeLabel: string): void {
    const reasoningStep: IReasoningStep = {
      timestamp: Date.now(),
      selectedGoal: { id: `goal_confirm`, kind: 'EXPAND', anchorNodeId: nodeId, anchorLabel: nodeLabel, targetRelation: 'CONFIRM_FINDING', targetType: '', direction: 'forward' },
      totalScore: 0,
      factors: [],
      strategyName: 'Manual',
      actionTaken: `User confirmed finding: "${nodeLabel}"`,
    };
    this.store.dispatch(SSMActions.confirmFinding({ nodeId, reasoningStep }));
    this.store.dispatch(EngineActions.engineInquiryAnswered());
    this.resumeAfterInquiry();
  }

  refuteFinding(nodeId: string, nodeLabel: string): void {
    const reasoningStep: IReasoningStep = {
      timestamp: Date.now(),
      selectedGoal: { id: `goal_refute`, kind: 'EXPAND', anchorNodeId: nodeId, anchorLabel: nodeLabel, targetRelation: 'REFUTE_FINDING', targetType: '', direction: 'forward' },
      totalScore: 0,
      factors: [],
      strategyName: 'Manual',
      actionTaken: `User refuted finding: "${nodeLabel}"`,
    };
    this.store.dispatch(SSMActions.refuteFinding({ nodeId, reasoningStep }));
    this.store.dispatch(EngineActions.engineInquiryAnswered());
    this.resumeAfterInquiry();
  }

  skipFinding(nodeId: string, nodeLabel: string): void {
    const reasoningStep: IReasoningStep = {
      timestamp: Date.now(),
      selectedGoal: { id: `goal_skip`, kind: 'EXPAND', anchorNodeId: nodeId, anchorLabel: nodeLabel, targetRelation: 'SKIP_FINDING', targetType: '', direction: 'forward' },
      totalScore: 0,
      factors: [],
      strategyName: 'Manual',
      actionTaken: `User skipped finding: "${nodeLabel}"`,
    };
    this.store.dispatch(SSMActions.skipFinding({ nodeId, reasoningStep }));
    this.store.dispatch(EngineActions.engineInquiryAnswered());
    this.resumeAfterInquiry();
  }

  /**
   * Automatically resumes inference after an inquiry resolution.
   *
   * Resumes continuous running so the engine processes all pending goals
   * (including NO_MATCH placeholders) until it hits the next confirmable
   * node or exhausts all goals. This prevents the engine from stalling
   * on low-value goals between inquiry pauses.
   */
  private resumeAfterInquiry(): void {
    this.store.dispatch(EngineActions.engineStart());
    this.pacer.run();
  }

  updateStrategy(weights: IStrategyWeights): void {
    const entries: [string, number][] = [
      ['urgency', weights.urgency],
      ['parsimony', weights.parsimony],
      ['costAversion', weights.costAversion],
    ];
    const [topKey] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const nameMap: Record<string, string> = {
      urgency: 'Urgency-Focused',
      parsimony: 'Parsimony-Focused',
      costAversion: 'Cost-Averse',
    };
    const name = nameMap[topKey] ?? 'Balanced';
    this.store.dispatch(StrategyActions.updateStrategy({ name, weights }));
  }

  selectNode(nodeId: string | null): void {
    this.selectedNodeId$.next(nodeId);
  }
}
