import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { FacadeService } from './facade.service';
import { PacerService } from './pacer.service';
import { EngineState } from '../models/engine.model';
import { initialSSMState } from '../models/ssm.model';
import { initialStrategy } from '../models/strategy.model';
import { first } from 'rxjs/operators';

import * as EngineActions from '../store/engine/engine.actions';
import * as SSMActions from '../store/ssm/ssm.actions';

describe('FacadeService', () => {
  let service: FacadeService;
  let store: MockStore;
  let mockPacer: jasmine.SpyObj<PacerService>;

  const initialState = {
    ssm: initialSSMState,
    engine: { state: EngineState.IDLE, activeGoal: null },
    strategy: initialStrategy,
    taskStructure: { entityTypes: [], relations: [], loaded: false, error: null },
    knowledgeBase: { fragments: [], loaded: false, error: null },
  };

  beforeEach(() => {
    mockPacer = jasmine.createSpyObj('PacerService', ['run', 'pause', 'step', 'setDelay']);

    TestBed.configureTestingModule({
      providers: [
        FacadeService,
        provideMockStore({ initialState }),
        { provide: PacerService, useValue: mockPacer },
      ],
    });

    store = TestBed.inject(MockStore);
    service = TestBed.inject(FacadeService);
    spyOn(store, 'dispatch').and.callThrough();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── run() ──────────────────────────────────────────────────────────────
  it('run() dispatches engineStart and calls pacer.run()', () => {
    service.run();
    expect(store.dispatch).toHaveBeenCalledWith(EngineActions.engineStart());
    expect(mockPacer.run).toHaveBeenCalled();
  });

  // ── pause() ─────────────────────────────────────────────────────────
  it('pause() dispatches enginePause and calls pacer.pause()', () => {
    service.pause();
    expect(store.dispatch).toHaveBeenCalledWith(EngineActions.enginePause());
    expect(mockPacer.pause).toHaveBeenCalled();
  });

  // ── step() ──────────────────────────────────────────────────────────
  it('step() dispatches engineStart and calls pacer.step()', () => {
    service.step();
    expect(store.dispatch).toHaveBeenCalledWith(EngineActions.engineStart());
    expect(mockPacer.step).toHaveBeenCalled();
  });

  // ── reset() ─────────────────────────────────────────────────────────
  it('reset() dispatches engineReset, resetSSM, and calls pacer.pause()', () => {
    service.reset();
    expect(store.dispatch).toHaveBeenCalledWith(EngineActions.engineReset());
    expect(store.dispatch).toHaveBeenCalledWith(SSMActions.resetSSM());
    expect(mockPacer.pause).toHaveBeenCalled();
  });

  // ── resolveInquiry() ───────────────────────────────────────────────
  it('resolveInquiry() dispatches resolveInquiry and engineInquiryAnswered', () => {
    service.resolveInquiry('node_1', 'CONFIRMED', 'Test Label', 'User confirmed');

    const calls = (store.dispatch as jasmine.Spy).calls.allArgs().map(a => a[0]);
    const resolveCall = calls.find((a: any) => a.type === '[SSM] Resolve Inquiry');
    const answeredCall = calls.find((a: any) => a.type === '[Engine] Inquiry Answered');

    expect(resolveCall).toBeTruthy();
    expect(resolveCall.nodeId).toBe('node_1');
    expect(resolveCall.newStatus).toBe('CONFIRMED');
    expect(resolveCall.newLabel).toBe('Test Label');
    expect(resolveCall.reasoningStep.actionTaken).toBe('User confirmed');
    expect(answeredCall).toBeTruthy();
  });

  // ── selectNode() + viewModel$ ──────────────────────────────────────
  it('selectNode() updates the BehaviorSubject and emits through viewModel$', async () => {
    // Initial emission should have null selectedNodeId
    const vm1 = await service.viewModel$.pipe(first()).toPromise();
    expect(vm1!.selectedNodeId).toBeNull();

    // After selecting a node, viewModel$ should emit the new ID
    service.selectNode('node_42');
    const vm2 = await service.viewModel$.pipe(first()).toPromise();
    expect(vm2!.selectedNodeId).toBe('node_42');

    // Deselecting should emit null again
    service.selectNode(null);
    const vm3 = await service.viewModel$.pipe(first()).toPromise();
    expect(vm3!.selectedNodeId).toBeNull();
  });
});
