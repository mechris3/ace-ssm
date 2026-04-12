import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { PacerService } from './pacer.service';

import { ISSMState, NodeStatus } from '../models/ssm.model';
import { EngineState } from '../models/engine.model';
import { IGoal } from '../models/ssm.model';
import { IStrategy, IStrategyWeights, IReasoningStep } from '../models/strategy.model';

import * as EngineActions from '../store/engine/engine.actions';
import * as SSMActions from '../store/ssm/ssm.actions';
import * as StrategyActions from '../store/strategy/strategy.actions';
import * as TaskStructureActions from '../store/task-structure/task-structure.actions';
import * as KnowledgeBaseActions from '../store/knowledge-base/knowledge-base.actions';

import { selectSSMState } from '../store/ssm/ssm.selectors';
import { selectEngineState, selectActiveGoal } from '../store/engine/engine.selectors';
import { selectStrategy } from '../store/strategy/strategy.selectors';
import { selectEntityTypes } from '../store/task-structure/task-structure.selectors';
import { selectTaskStructureLoaded, selectTaskStructureError } from '../store/task-structure/task-structure.selectors';
import { selectKnowledgeBaseLoaded, selectKnowledgeBaseError } from '../store/knowledge-base/knowledge-base.selectors';

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
  entityTypes: string[];
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
    ]).pipe(
      map(([ssm, engineState, activeGoal, strategy, selectedNodeId,
            taskStructureLoaded, taskStructureError, kbLoaded, kbError, entityTypes]) => ({
        ssm,
        engineState,
        activeGoal,
        strategy,
        selectedNodeId,
        taskStructureLoaded,
        taskStructureError,
        kbLoaded,
        kbError,
        entityTypes,
      }))
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
    const parsed = JSON.parse(json);
    this.store.dispatch(TaskStructureActions.loadTaskStructure({ taskStructure: parsed }));
  }

  loadKnowledgeBase(json: string): void {
    const parsed = JSON.parse(json);
    this.store.dispatch(KnowledgeBaseActions.loadKnowledgeBase({ fragments: parsed }));
  }

  seedFinding(label: string, type: string): void {
    const id = `node_${crypto.randomUUID()}`;
    this.store.dispatch(SSMActions.applyPatch({
      nodes: [{ id, label, type, status: 'CONFIRMED' as const }],
      edges: [],
      reasoningStep: {
        timestamp: Date.now(),
        selectedGoal: { id: `goal_seed`, kind: 'EXPAND', anchorNodeId: id, anchorLabel: label, targetRelation: 'SEED', targetType: type },
        totalScore: 0,
        factors: [],
        strategyName: 'Manual',
        actionTaken: `Seeded finding: ${label} (${type})`,
      },
    }));
  }

  resolveInquiry(nodeId: string, newStatus: NodeStatus, newLabel: string | null, auditText: string): void {
    const reasoningStep: IReasoningStep = {
      timestamp: Date.now(),
      selectedGoal: { id: `goal_resolve`, kind: 'EXPAND', anchorNodeId: nodeId, anchorLabel: newLabel ?? '', targetRelation: 'RESOLVE', targetType: '' },
      totalScore: 0,
      factors: [],
      strategyName: 'Manual',
      actionTaken: auditText,
    };
    this.store.dispatch(SSMActions.resolveInquiry({ nodeId, newStatus, newLabel, reasoningStep }));
    this.store.dispatch(EngineActions.engineInquiryAnswered());
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
