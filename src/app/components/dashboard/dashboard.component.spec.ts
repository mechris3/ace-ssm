import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { DashboardComponent } from './dashboard.component';
import { FacadeService } from '../../services/facade.service';
import { PacerService } from '../../services/pacer.service';
import { EngineState } from '../../models/engine.model';
import { initialSSMState } from '../../models/ssm.model';
import { initialStrategy, IReasoningStep } from '../../models/strategy.model';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let facade: FacadeService;
  let mockPacer: jasmine.SpyObj<PacerService>;
  let store: MockStore;

  const initialState = {
    ssm: initialSSMState,
    engine: { state: EngineState.IDLE, activeGoal: null },
    strategy: initialStrategy,
    taskStructure: { entityTypes: [], relations: [], loaded: false, error: null },
    knowledgeBase: { fragments: [], loaded: false, error: null },
  };

  beforeEach(async () => {
    mockPacer = jasmine.createSpyObj('PacerService', ['run', 'pause', 'step', 'setDelay']);

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideMockStore({ initialState }),
        { provide: PacerService, useValue: mockPacer },
      ],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    facade = TestBed.inject(FacadeService);
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the dashboard with all child components', () => {
    expect(component).toBeTruthy();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-control-bar')).toBeTruthy();
    expect(el.querySelector('app-domain-console')).toBeTruthy();
    expect(el.querySelector('app-ssm-graph')).toBeTruthy();
    expect(el.querySelector('app-inquiry-overlay')).toBeTruthy();
    expect(el.querySelector('app-node-inspector')).toBeTruthy();
    expect(el.querySelector('app-audit-trail')).toBeTruthy();
    expect(el.querySelector('app-status-bar')).toBeTruthy();
  });

  it('should call facade.run() when Run button is clicked', () => {
    spyOn(facade, 'run');
    const el: HTMLElement = fixture.nativeElement;
    const runBtn = el.querySelector('app-control-bar button:first-child') as HTMLButtonElement;
    runBtn.click();
    expect(facade.run).toHaveBeenCalled();
  });

  it('should call facade.step() when Step button is clicked', () => {
    spyOn(facade, 'step');
    const el: HTMLElement = fixture.nativeElement;
    const buttons = el.querySelectorAll('app-control-bar button');
    const stepBtn = buttons[1] as HTMLButtonElement;
    stepBtn.click();
    expect(facade.step).toHaveBeenCalled();
  });

  it('should call facade.pause() when Pause button is clicked', () => {
    // Pause is disabled in IDLE, so switch to THINKING first
    store.setState({
      ...initialState,
      engine: { state: EngineState.THINKING, activeGoal: null },
    });
    fixture.detectChanges();

    spyOn(facade, 'pause');
    const el: HTMLElement = fixture.nativeElement;
    const buttons = el.querySelectorAll('app-control-bar button');
    const pauseBtn = buttons[2] as HTMLButtonElement;
    pauseBtn.click();
    expect(facade.pause).toHaveBeenCalled();
  });

  it('should call facade.reset() when Reset button is clicked', () => {
    spyOn(facade, 'reset');
    const el: HTMLElement = fixture.nativeElement;
    const buttons = el.querySelectorAll('app-control-bar button');
    const resetBtn = buttons[3] as HTMLButtonElement;
    resetBtn.click();
    expect(facade.reset).toHaveBeenCalled();
  });

  it('should emit viewModel$ and populate child component inputs', (done) => {
    component.vm$.subscribe(vm => {
      expect(vm).toBeTruthy();
      expect(vm.engineState).toBe(EngineState.IDLE);
      expect(vm.ssm.nodes).toEqual([]);
      expect(vm.ssm.edges).toEqual([]);
      expect(vm.selectedNodeId).toBeNull();
      expect(vm.activeGoal).toBeNull();
      done();
    });
  });

  it('should set highlightNodeId when handleStepClick is called', () => {
    const step: IReasoningStep = {
      timestamp: 1000,
      selectedGoal: {
        id: 'goal_1',
        kind: 'EXPAND',
        anchorNodeId: 'node_abc',
        anchorLabel: 'Fever',
        targetRelation: 'CAUSES',
        targetType: 'ETIOLOGIC_AGENT',
        direction: 'forward',
      },
      totalScore: 5.0,
      factors: [],
      strategyName: 'Balanced',
      actionTaken: 'Expanded Fever',
    };

    spyOn(facade, 'selectNode');
    component.handleStepClick(step);

    expect(component.highlightNodeId).toBe('node_abc');
    expect(component.scrollToNodeId).toBeNull();
    expect(facade.selectNode).toHaveBeenCalledWith('node_abc');
  });

  it('should set scrollToNodeId when handleNodeClick is called', () => {
    spyOn(facade, 'selectNode');
    component.handleNodeClick('node_xyz');

    expect(component.scrollToNodeId).toBe('node_xyz');
    expect(component.highlightNodeId).toBeNull();
    expect(facade.selectNode).toHaveBeenCalledWith('node_xyz');
  });

  it('should clear highlightNodeId when a different node is clicked', () => {
    component.highlightNodeId = 'node_abc';
    spyOn(facade, 'selectNode');

    component.handleNodeClick('node_xyz');

    expect(component.highlightNodeId).toBeNull();
    expect(component.scrollToNodeId).toBe('node_xyz');
  });

  it('should clear scrollToNodeId when a step is clicked', () => {
    component.scrollToNodeId = 'node_xyz';
    const step: IReasoningStep = {
      timestamp: 2000,
      selectedGoal: {
        id: 'goal_2',
        kind: 'EXPAND',
        anchorNodeId: 'node_abc',
        anchorLabel: 'Fever',
        targetRelation: 'CAUSES',
        targetType: 'ETIOLOGIC_AGENT',
        direction: 'forward',
      },
      totalScore: 3.0,
      factors: [],
      strategyName: 'Balanced',
      actionTaken: 'Expanded Fever',
    };

    spyOn(facade, 'selectNode');
    component.handleStepClick(step);

    expect(component.scrollToNodeId).toBeNull();
    expect(component.highlightNodeId).toBe('node_abc');
  });

  it('should handle resetOnLoad toggle correctly', () => {
    expect(component.resetOnLoad).toBeTrue();
    component.resetOnLoad = false;
    expect(component.resetOnLoad).toBeFalse();
  });
});
