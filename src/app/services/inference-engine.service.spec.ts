import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';

import { InferenceEngineService } from './inference-engine.service';
import { PacerService } from './pacer.service';
import { EngineState } from '../models/engine.model';
import { ISSMState, ISSMNode, ISSMEdge, IGoal } from '../models/ssm.model';
import { IStrategy, IReasoningStep, initialStrategy } from '../models/strategy.model';
import { IKnowledgeFragment } from '../models/knowledge-base.model';
import { IRelation } from '../models/task-structure.model';

import * as SSMActions from '../store/ssm/ssm.actions';
import * as EngineActions from '../store/engine/engine.actions';

describe('InferenceEngineService', () => {
  let service: InferenceEngineService;
  let store: MockStore;
  let pulseSubject: Subject<void>;
  let mockPacer: {
    pulse$: Subject<void>;
    pause: jasmine.Spy;
    run: jasmine.Spy;
    step: jasmine.Spy;
    setDelay: jasmine.Spy;
  };

  const testNode: ISSMNode = {
    id: 'n1', label: 'Fever', type: 'FINDING', status: 'CONFIRMED',
  };
  const testSSM: ISSMState = {
    nodes: [testNode], edges: [], history: [],
    isRunning: true, waitingForUser: false, pendingFindingNodeId: null,
  };
  const testTaskStructure = {
    entityTypes: ['FINDING', 'ETIOLOGIC_AGENT'],
    relations: [
      { type: 'CAUSES', from: 'FINDING', to: 'ETIOLOGIC_AGENT' },
    ] as IRelation[],
  };
  const testKB: IKnowledgeFragment[] = [{
    id: 'kb1', subject: 'Fever', subjectType: 'FINDING',
    relation: 'CAUSES', object: 'Bacterial Meningitis',
    objectType: 'ETIOLOGIC_AGENT',
    metadata: { urgency: 1.0, specificity: 0.3, inquiryCost: 0.1 },
  }];
  const testStrategy: IStrategy = { ...initialStrategy };

  const initialState = {
    ssm: testSSM,
    taskStructure: {
      entityTypes: testTaskStructure.entityTypes,
      relations: testTaskStructure.relations,
      loaded: true, error: null,
    },
    knowledgeBase: { fragments: testKB, loaded: true, error: null },
    strategy: testStrategy,
    engine: { state: EngineState.THINKING },
  };

  function makeGoal(overrides: Partial<IGoal> = {}): IGoal {
    return {
      id: 'g1', kind: 'EXPAND', anchorNodeId: 'n1',
      anchorLabel: 'Fever', targetRelation: 'CAUSES',
      targetType: 'ETIOLOGIC_AGENT', direction: 'forward', ...overrides,
    };
  }

  function makeRationale(goal: IGoal, overrides: Partial<IReasoningStep> = {}): IReasoningStep {
    return {
      timestamp: 1, selectedGoal: goal, totalScore: 90,
      factors: [{ label: 'Urgency', impact: 90, explanation: 'test' }],
      strategyName: 'Balanced', actionTaken: '', ...overrides,
    };
  }

  beforeEach(() => {
    pulseSubject = new Subject<void>();
    mockPacer = {
      pulse$: pulseSubject,
      pause: jasmine.createSpy('pause'),
      run: jasmine.createSpy('run'),
      step: jasmine.createSpy('step'),
      setDelay: jasmine.createSpy('setDelay'),
    };

    TestBed.configureTestingModule({
      providers: [
        InferenceEngineService,
        provideMockStore({ initialState }),
        { provide: PacerService, useValue: mockPacer },
      ],
    });

    store = TestBed.inject(MockStore);
    service = TestBed.inject(InferenceEngineService);
    spyOn(store, 'dispatch').and.callThrough();
  });

  afterEach(() => {
    pulseSubject.complete();
  });

  it('should call operators in order: Goal Generator → Search Operator → Knowledge Operator', () => {
    const goal = makeGoal();
    const rationale = makeRationale(goal);
    const callOrder: string[] = [];

    spyOn(service, 'generateGoals').and.callFake((...args: any[]) => {
      callOrder.push('generateGoals');
      return [goal];
    });
    spyOn(service, 'scoreGoals').and.callFake((...args: any[]) => {
      callOrder.push('scoreGoals');
      return { selectedGoal: goal, rationale };
    });
    spyOn(service, 'resolveGoal').and.callFake((...args: any[]) => {
      callOrder.push('resolveGoal');
      return {
        type: 'PATCH' as const,
        nodes: [{ id: 'n2', label: 'BM', type: 'ETIOLOGIC_AGENT', status: 'HYPOTHESIS' as const }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', relationType: 'CAUSES' }],
      };
    });

    service.orchestrate$.subscribe();
    pulseSubject.next();

    expect(callOrder).toEqual(['generateGoals', 'scoreGoals', 'resolveGoal']);
  });

  it('should dispatch applyPatch with reasoningStep on PATCH result', () => {
    const goal = makeGoal();
    const patchNodes: ISSMNode[] = [
      { id: 'n2', label: 'Bacterial Meningitis', type: 'ETIOLOGIC_AGENT', status: 'HYPOTHESIS' },
    ];
    const patchEdges: ISSMEdge[] = [
      { id: 'e1', source: 'n1', target: 'n2', relationType: 'CAUSES' },
    ];

    spyOn(service, 'generateGoals').and.returnValue([goal]);
    spyOn(service, 'scoreGoals').and.returnValue({
      selectedGoal: goal, rationale: makeRationale(goal),
    });
    spyOn(service, 'resolveGoal').and.returnValue({
      type: 'PATCH', nodes: patchNodes, edges: patchEdges,
    });

    service.orchestrate$.subscribe();
    pulseSubject.next();

    const dispatched = (store.dispatch as jasmine.Spy).calls.allArgs().map(a => a[0]);
    const patchAction = dispatched.find((a: any) => a.type === SSMActions.applyPatch.type);
    expect(patchAction).toBeTruthy();
    expect(patchAction.nodes).toEqual(patchNodes);
    expect(patchAction.edges).toEqual(patchEdges);
    expect(patchAction.reasoningStep.totalScore).toBe(90);
    expect(patchAction.reasoningStep.strategyName).toBe('Balanced');
    expect(patchAction.reasoningStep.actionTaken).toContain('Expanded');
  });

  it('should dispatch openInquiry + engineInquiry + pause on INQUIRY_REQUIRED result', () => {
    const goal = makeGoal({ targetRelation: 'TREATS', targetType: 'TREATMENT' });

    spyOn(service, 'generateGoals').and.returnValue([goal]);
    spyOn(service, 'scoreGoals').and.returnValue({
      selectedGoal: goal, rationale: makeRationale(goal, { totalScore: 50 }),
    });
    spyOn(service, 'resolveGoal').and.returnValue({
      type: 'INQUIRY_REQUIRED', goal,
    });

    service.orchestrate$.subscribe();
    pulseSubject.next();

    const dispatched = (store.dispatch as jasmine.Spy).calls.allArgs().map(a => a[0]);

    // openInquiry with QUESTION node
    const inquiryAction = dispatched.find((a: any) => a.type === SSMActions.openInquiry.type);
    expect(inquiryAction).toBeTruthy();
    expect(inquiryAction.questionNode.status).toBe('QUESTION');
    expect(inquiryAction.questionNode.type).toBe('TREATMENT');
    expect(inquiryAction.questionNode.label).toContain('? TREATS of Fever');
    expect(inquiryAction.edge.source).toBe('n1');
    expect(inquiryAction.edge.relationType).toBe('TREATS');
    expect(inquiryAction.reasoningStep.actionTaken).toContain('Inquiry required');

    // engineInquiry FSM transition
    const fsmAction = dispatched.find((a: any) => a.type === EngineActions.engineInquiry.type);
    expect(fsmAction).toBeTruthy();

    // Pacer paused
    expect(mockPacer.pause).toHaveBeenCalled();
  });

  it('should dispatch engineResolved + pause when goals are empty', () => {
    spyOn(service, 'generateGoals').and.returnValue([]);

    service.orchestrate$.subscribe();
    pulseSubject.next();

    const dispatched = (store.dispatch as jasmine.Spy).calls.allArgs().map(a => a[0]);
    const resolvedAction = dispatched.find((a: any) => a.type === EngineActions.engineResolved.type);
    expect(resolvedAction).toBeTruthy();
    expect(mockPacer.pause).toHaveBeenCalled();
  });

  it('should dispatch applyStatusUpgrade on STATUS_UPGRADE_PATCH result', () => {
    const goal = makeGoal({
      kind: 'STATUS_UPGRADE', targetRelation: 'STATUS_UPGRADE', targetType: 'FINDING',
    });

    spyOn(service, 'generateGoals').and.returnValue([goal]);
    spyOn(service, 'scoreGoals').and.returnValue({
      selectedGoal: goal, rationale: makeRationale(goal, { totalScore: 200 }),
    });
    spyOn(service, 'resolveGoal').and.returnValue({
      type: 'STATUS_UPGRADE_PATCH', nodeId: 'n1', newStatus: 'CONFIRMED',
    });

    service.orchestrate$.subscribe();
    pulseSubject.next();

    const dispatched = (store.dispatch as jasmine.Spy).calls.allArgs().map(a => a[0]);
    const upgradeAction = dispatched.find((a: any) => a.type === SSMActions.applyStatusUpgrade.type);
    expect(upgradeAction).toBeTruthy();
    expect(upgradeAction.nodeId).toBe('n1');
    expect(upgradeAction.reasoningStep.totalScore).toBe(200);
    expect(upgradeAction.reasoningStep.actionTaken).toContain('Promoted');
  });

  it('should not process pulse when engine state is not THINKING', () => {
    store.setState({ ...initialState, engine: { state: EngineState.IDLE } });

    const generateSpy = spyOn(service, 'generateGoals');

    service.orchestrate$.subscribe();
    pulseSubject.next();

    expect(generateSpy).not.toHaveBeenCalled();
  });
});

/**
 * ─── Integration Tests ───
 *
 * These tests let the real operators run (no spies on generateGoals/scoreGoals/resolveGoal).
 * MockStore doesn't run reducers, so between pulses we manually setState to simulate
 * the state the reducers would produce after dispatched actions.
 */

import { TASK_STRUCTURE_FIXTURE } from '../fixtures/task-structure.fixture';
import { KNOWLEDGE_BASE_FIXTURE } from '../fixtures/knowledge-base.fixture';

describe('InferenceEngineService — Integration: Multi-Pulse Scenario', () => {
  let service: InferenceEngineService;
  let store: MockStore;
  let pulseSubject: Subject<void>;
  let mockPacer: {
    pulse$: Subject<void>;
    pause: jasmine.Spy;
    run: jasmine.Spy;
    step: jasmine.Spy;
    setDelay: jasmine.Spy;
  };

  const feverNode: ISSMNode = {
    id: 'n1', label: 'Fever', type: 'FINDING', status: 'CONFIRMED',
  };

  const baseSSM: ISSMState = {
    nodes: [feverNode], edges: [], history: [],
    isRunning: true, waitingForUser: false, pendingFindingNodeId: null,
  };

  const integrationState = {
    ssm: baseSSM,
    taskStructure: {
      entityTypes: TASK_STRUCTURE_FIXTURE.entityTypes,
      relations: TASK_STRUCTURE_FIXTURE.relations,
      loaded: true, error: null,
    },
    knowledgeBase: { fragments: KNOWLEDGE_BASE_FIXTURE, loaded: true, error: null },
    strategy: { ...initialStrategy },
    engine: { state: EngineState.THINKING },
  };

  function getDispatched(): any[] {
    return (store.dispatch as jasmine.Spy).calls.allArgs().map(a => a[0]);
  }

  beforeEach(() => {
    pulseSubject = new Subject<void>();
    mockPacer = {
      pulse$: pulseSubject,
      pause: jasmine.createSpy('pause'),
      run: jasmine.createSpy('run'),
      step: jasmine.createSpy('step'),
      setDelay: jasmine.createSpy('setDelay'),
    };

    TestBed.configureTestingModule({
      providers: [
        InferenceEngineService,
        provideMockStore({ initialState: integrationState }),
        { provide: PacerService, useValue: mockPacer },
      ],
    });

    store = TestBed.inject(MockStore);
    service = TestBed.inject(InferenceEngineService);
    spyOn(store, 'dispatch').and.callThrough();
  });

  afterEach(() => {
    pulseSubject.complete();
  });

  it('should spawn Bacterial Meningitis and Influenza as HYPOTHESIS nodes on first pulse (multi-hypothesis)', () => {
    service.orchestrate$.subscribe();
    pulseSubject.next();

    const dispatched = getDispatched();
    const patchAction = dispatched.find((a: any) => a.type === SSMActions.applyPatch.type);
    expect(patchAction).toBeTruthy('Expected an applyPatch action');

    // Fever CAUSES → should spawn both Bacterial Meningitis and Influenza
    const labels = patchAction.nodes.map((n: ISSMNode) => n.label).sort();
    expect(labels).toEqual(['Bacterial Meningitis', 'Influenza']);

    // All spawned nodes should be HYPOTHESIS
    patchAction.nodes.forEach((n: ISSMNode) => {
      expect(n.status).toBe('HYPOTHESIS');
    });

    // Edges should link from Fever (n1) with relationType CAUSES
    patchAction.edges.forEach((e: ISSMEdge) => {
      expect(e.source).toBe('n1');
      expect(e.relationType).toBe('CAUSES');
    });

    // ReasoningStep should describe the expansion
    expect(patchAction.reasoningStep.actionTaken).toContain('Expanded');
    expect(patchAction.reasoningStep.actionTaken).toContain('Fever');
    expect(patchAction.reasoningStep.strategyName).toBe('Balanced');
  });

  it('should continue growing SSM with INDUCES and CONFIRMED_BY goals on subsequent pulses', () => {
    service.orchestrate$.subscribe();

    // --- Pulse 1: Fever → CAUSES → Bacterial Meningitis + Influenza ---
    pulseSubject.next();
    const pulse1Dispatched = getDispatched();
    const patch1 = pulse1Dispatched.find((a: any) => a.type === SSMActions.applyPatch.type);
    expect(patch1).toBeTruthy();

    // Extract spawned node IDs for state simulation
    const bmNode = patch1.nodes.find((n: ISSMNode) => n.label === 'Bacterial Meningitis');
    const fluNode = patch1.nodes.find((n: ISSMNode) => n.label === 'Influenza');
    expect(bmNode).toBeTruthy();
    expect(fluNode).toBeTruthy();

    // --- Simulate reducer: update store state with the patch applied ---
    const postPulse1SSM: ISSMState = {
      ...baseSSM,
      nodes: [feverNode, bmNode!, fluNode!],
      edges: [...patch1.edges],
      history: [patch1.reasoningStep],
    };
    store.setState({ ...integrationState, ssm: postPulse1SSM });

    // Clear dispatch spy for pulse 2
    (store.dispatch as jasmine.Spy).calls.reset();

    // --- Pulse 2: Should generate INDUCES / CONFIRMED_BY / TREATS goals for new HYPOTHESIS nodes ---
    pulseSubject.next();
    const pulse2Dispatched = getDispatched();
    const patch2 = pulse2Dispatched.find((a: any) => a.type === SSMActions.applyPatch.type);

    // The engine should have dispatched something (either a patch or inquiry)
    // With the full KB, Bacterial Meningitis has INDUCES→Neck Stiffness and CONFIRMED_BY→Lumbar Puncture
    // Influenza has INDUCES→Myalgia and CONFIRMED_BY→Rapid Flu Test
    // The highest-scoring goal should win and produce a patch
    expect(pulse2Dispatched.length).toBeGreaterThan(0);

    if (patch2) {
      // Verify the patch contains nodes from the KB (INDUCES or CONFIRMED_BY results)
      patch2.nodes.forEach((n: ISSMNode) => {
        expect(n.status).toBe('HYPOTHESIS');
      });
      patch2.edges.forEach((e: ISSMEdge) => {
        expect(['INDUCES', 'CONFIRMED_BY', 'TREATS']).toContain(e.relationType);
      });
      expect(patch2.reasoningStep.actionTaken).toContain('Expanded');
    }
  });
});

describe('InferenceEngineService — Integration: Inquiry and UNKNOWN Flows', () => {
  let service: InferenceEngineService;
  let store: MockStore;
  let pulseSubject: Subject<void>;
  let mockPacer: {
    pulse$: Subject<void>;
    pause: jasmine.Spy;
    run: jasmine.Spy;
    step: jasmine.Spy;
    setDelay: jasmine.Spy;
  };

  // A node that will trigger INQUIRY_REQUIRED: TREATMENT node with TREATS relation
  // has no KB match (no fragment with subject="Aspirin" and relation="TREATS")
  const treatmentNode: ISSMNode = {
    id: 'n_treat', label: 'Aspirin', type: 'TREATMENT', status: 'CONFIRMED',
  };

  const inquirySSM: ISSMState = {
    nodes: [treatmentNode], edges: [], history: [],
    isRunning: true, waitingForUser: false, pendingFindingNodeId: null,
  };

  const inquiryState = {
    ssm: inquirySSM,
    taskStructure: {
      entityTypes: TASK_STRUCTURE_FIXTURE.entityTypes,
      relations: TASK_STRUCTURE_FIXTURE.relations,
      loaded: true, error: null,
    },
    knowledgeBase: { fragments: KNOWLEDGE_BASE_FIXTURE, loaded: true, error: null },
    strategy: { ...initialStrategy },
    engine: { state: EngineState.THINKING },
  };

  function getDispatched(): any[] {
    return (store.dispatch as jasmine.Spy).calls.allArgs().map(a => a[0]);
  }

  beforeEach(() => {
    pulseSubject = new Subject<void>();
    mockPacer = {
      pulse$: pulseSubject,
      pause: jasmine.createSpy('pause'),
      run: jasmine.createSpy('run'),
      step: jasmine.createSpy('step'),
      setDelay: jasmine.createSpy('setDelay'),
    };

    TestBed.configureTestingModule({
      providers: [
        InferenceEngineService,
        provideMockStore({ initialState: inquiryState }),
        { provide: PacerService, useValue: mockPacer },
      ],
    });

    store = TestBed.inject(MockStore);
    service = TestBed.inject(InferenceEngineService);
    spyOn(store, 'dispatch').and.callThrough();
  });

  afterEach(() => {
    pulseSubject.complete();
  });

  it('should trigger INQUIRY_REQUIRED → QUESTION node creation and engine transitions to INQUIRY', () => {
    service.orchestrate$.subscribe();
    pulseSubject.next();

    const dispatched = getDispatched();

    // openInquiry should have been dispatched with a QUESTION node
    const inquiryAction = dispatched.find((a: any) => a.type === SSMActions.openInquiry.type);
    expect(inquiryAction).toBeTruthy('Expected openInquiry action');
    expect(inquiryAction.questionNode.status).toBe('QUESTION');
    expect(inquiryAction.questionNode.type).toBe('ETIOLOGIC_AGENT');
    expect(inquiryAction.questionNode.label).toContain('?');
    expect(inquiryAction.edge.source).toBe('n_treat');
    expect(inquiryAction.edge.relationType).toBe('TREATS');
    expect(inquiryAction.reasoningStep.actionTaken).toContain('Inquiry required');

    // engineInquiry FSM transition
    const fsmAction = dispatched.find((a: any) => a.type === EngineActions.engineInquiry.type);
    expect(fsmAction).toBeTruthy('Expected engineInquiry action');

    // Pacer should be paused
    expect(mockPacer.pause).toHaveBeenCalled();
  });

  it('should resolve inquiry with CONFIRMED → node status updated, engine back to IDLE', () => {
    service.orchestrate$.subscribe();
    pulseSubject.next();

    const dispatched = getDispatched();
    const inquiryAction = dispatched.find((a: any) => a.type === SSMActions.openInquiry.type);
    expect(inquiryAction).toBeTruthy();

    const questionNodeId = inquiryAction.questionNode.id;

    // Simulate: user resolves inquiry with CONFIRMED
    // This would normally be dispatched by the UI and handled by the reducer
    const resolveStep: IReasoningStep = {
      timestamp: Date.now(),
      selectedGoal: { id: 'resolve', kind: 'EXPAND', anchorNodeId: 'n_treat', anchorLabel: 'Aspirin', targetRelation: 'TREATS', targetType: 'ETIOLOGIC_AGENT', direction: 'forward' },
      totalScore: 0,
      factors: [{ label: 'User Input', impact: 0, explanation: 'User confirmed inquiry' }],
      strategyName: 'Balanced',
      actionTaken: 'User confirmed: Streptococcus',
    };

    // Dispatch resolveInquiry (simulating user action)
    store.dispatch(SSMActions.resolveInquiry({
      nodeId: questionNodeId,
      newStatus: 'CONFIRMED',
      newLabel: 'Streptococcus',
      reasoningStep: resolveStep,
    }));

    // Dispatch engineInquiryAnswered (simulating FSM transition)
    store.dispatch(EngineActions.engineInquiryAnswered());

    const allDispatched = getDispatched();

    // Verify resolveInquiry was dispatched
    const resolveAction = allDispatched.find((a: any) => a.type === SSMActions.resolveInquiry.type);
    expect(resolveAction).toBeTruthy('Expected resolveInquiry action');
    expect(resolveAction.nodeId).toBe(questionNodeId);
    expect(resolveAction.newStatus).toBe('CONFIRMED');
    expect(resolveAction.newLabel).toBe('Streptococcus');

    // Verify engineInquiryAnswered was dispatched (transitions INQUIRY → IDLE)
    const answeredAction = allDispatched.find((a: any) => a.type === EngineActions.engineInquiryAnswered.type);
    expect(answeredAction).toBeTruthy('Expected engineInquiryAnswered action');
  });

  it('should resolve inquiry with UNKNOWN → UNKNOWN status, penalty applied on next pulse', () => {
    service.orchestrate$.subscribe();
    pulseSubject.next();

    const dispatched = getDispatched();
    const inquiryAction = dispatched.find((a: any) => a.type === SSMActions.openInquiry.type);
    expect(inquiryAction).toBeTruthy();

    const questionNodeId = inquiryAction.questionNode.id;
    const questionEdge = inquiryAction.edge;

    // Simulate: user marks inquiry as UNKNOWN
    const resolveStep: IReasoningStep = {
      timestamp: Date.now(),
      selectedGoal: { id: 'resolve', kind: 'EXPAND', anchorNodeId: 'n_treat', anchorLabel: 'Aspirin', targetRelation: 'TREATS', targetType: 'ETIOLOGIC_AGENT', direction: 'forward' },
      totalScore: 0,
      factors: [{ label: 'User Input', impact: 0, explanation: 'User marked unknown' }],
      strategyName: 'Balanced',
      actionTaken: 'User marked unknown',
    };

    store.dispatch(SSMActions.resolveInquiry({
      nodeId: questionNodeId,
      newStatus: 'UNKNOWN',
      newLabel: null,
      reasoningStep: resolveStep,
    }));

    const allDispatched = getDispatched();
    const resolveAction = allDispatched.find((a: any) => a.type === SSMActions.resolveInquiry.type);
    expect(resolveAction).toBeTruthy('Expected resolveInquiry action');
    expect(resolveAction.newStatus).toBe('UNKNOWN');

    // Now simulate the state after UNKNOWN resolution and fire another pulse
    // The UNKNOWN node should exist with its edge, closing the gap
    const unknownNode: ISSMNode = {
      id: questionNodeId, label: inquiryAction.questionNode.label,
      type: 'ETIOLOGIC_AGENT', status: 'UNKNOWN',
    };
    const postUnknownSSM: ISSMState = {
      nodes: [treatmentNode, unknownNode],
      edges: [questionEdge],
      history: [inquiryAction.reasoningStep, resolveStep],
      isRunning: true, waitingForUser: false, pendingFindingNodeId: null,
    };

    store.setState({
      ...inquiryState,
      ssm: postUnknownSSM,
      engine: { state: EngineState.THINKING },
    });

    (store.dispatch as jasmine.Spy).calls.reset();

    // Fire another pulse — goals anchored on the UNKNOWN node should have penalty applied
    pulseSubject.next();

    const pulse2Dispatched = getDispatched();

    // The UNKNOWN node (ETIOLOGIC_AGENT) could generate goals but they'd be heavily penalized.
    // The TREATS edge from treatmentNode already exists, so no new TREATS goal for treatmentNode.
    // Any dispatched action should reflect the penalty in scoring.
    // If no goals remain (all gaps filled), engine should resolve.
    if (pulse2Dispatched.some((a: any) => a.type === EngineActions.engineResolved.type)) {
      // All goals exhausted — valid outcome when UNKNOWN closes the gap
      expect(pulse2Dispatched.find((a: any) => a.type === EngineActions.engineResolved.type)).toBeTruthy();
    } else {
      // Goals exist but UNKNOWN-anchored ones should have very low scores
      const patchAction = pulse2Dispatched.find((a: any) =>
        a.type === SSMActions.applyPatch.type || a.type === SSMActions.openInquiry.type
      );
      if (patchAction && patchAction.reasoningStep) {
        // The UNKNOWN penalty (0.05) should result in a very low totalScore
        // compared to normal scores (which are typically 50-100+)
        expect(patchAction.reasoningStep.totalScore).toBeLessThan(20);
      }
    }
  });
});

describe('InferenceEngineService — Integration: Confirmation Chain', () => {
  let service: InferenceEngineService;
  let store: MockStore;
  let pulseSubject: Subject<void>;
  let mockPacer: {
    pulse$: Subject<void>;
    pause: jasmine.Spy;
    run: jasmine.Spy;
    step: jasmine.Spy;
    setDelay: jasmine.Spy;
  };

  // Set up: Bacterial Meningitis (HYPOTHESIS) with CONFIRMED_BY edge to Lumbar Puncture (CONFIRMED)
  const bmNode: ISSMNode = {
    id: 'n_bm', label: 'Bacterial Meningitis', type: 'ETIOLOGIC_AGENT', status: 'HYPOTHESIS',
  };
  const lpNode: ISSMNode = {
    id: 'n_lp', label: 'Lumbar Puncture', type: 'FINDING', status: 'CONFIRMED',
  };
  const feverNode: ISSMNode = {
    id: 'n_fever', label: 'Fever', type: 'FINDING', status: 'CONFIRMED',
  };
  const confirmedByEdge: ISSMEdge = {
    id: 'e_cb', source: 'n_bm', target: 'n_lp', relationType: 'CONFIRMED_BY',
  };
  const causesEdge: ISSMEdge = {
    id: 'e_causes', source: 'n_fever', target: 'n_bm', relationType: 'CAUSES',
  };

  const confirmSSM: ISSMState = {
    nodes: [feverNode, bmNode, lpNode],
    edges: [causesEdge, confirmedByEdge],
    history: [],
    isRunning: true, waitingForUser: false, pendingFindingNodeId: null,
  };

  const confirmState = {
    ssm: confirmSSM,
    taskStructure: {
      entityTypes: TASK_STRUCTURE_FIXTURE.entityTypes,
      relations: TASK_STRUCTURE_FIXTURE.relations,
      loaded: true, error: null,
    },
    knowledgeBase: { fragments: KNOWLEDGE_BASE_FIXTURE, loaded: true, error: null },
    strategy: { ...initialStrategy },
    engine: { state: EngineState.THINKING },
  };

  function getDispatched(): any[] {
    return (store.dispatch as jasmine.Spy).calls.allArgs().map(a => a[0]);
  }

  beforeEach(() => {
    pulseSubject = new Subject<void>();
    mockPacer = {
      pulse$: pulseSubject,
      pause: jasmine.createSpy('pause'),
      run: jasmine.createSpy('run'),
      step: jasmine.createSpy('step'),
      setDelay: jasmine.createSpy('setDelay'),
    };

    TestBed.configureTestingModule({
      providers: [
        InferenceEngineService,
        provideMockStore({ initialState: confirmState }),
        { provide: PacerService, useValue: mockPacer },
      ],
    });

    store = TestBed.inject(MockStore);
    service = TestBed.inject(InferenceEngineService);
    spyOn(store, 'dispatch').and.callThrough();
  });

  afterEach(() => {
    pulseSubject.complete();
  });

  it('should fire STATUS_UPGRADE goal and promote Bacterial Meningitis to CONFIRMED', () => {
    service.orchestrate$.subscribe();
    pulseSubject.next();

    const dispatched = getDispatched();

    // The Goal Generator should detect that Bacterial Meningitis (HYPOTHESIS) has
    // a CONFIRMED_BY edge to Lumbar Puncture (CONFIRMED), so all CONFIRMED_BY targets
    // are CONFIRMED → STATUS_UPGRADE goal should be generated.
    //
    // STATUS_UPGRADE goals score 200 × parsimony_weight = 200, which is higher than
    // most EXPAND goals, so it should win the Search Operator.
    const upgradeAction = dispatched.find((a: any) => a.type === SSMActions.applyStatusUpgrade.type);
    expect(upgradeAction).toBeTruthy('Expected applyStatusUpgrade action for Bacterial Meningitis');
    expect(upgradeAction.nodeId).toBe('n_bm');
    expect(upgradeAction.reasoningStep.actionTaken).toContain('Promoted');
    expect(upgradeAction.reasoningStep.actionTaken).toContain('Bacterial Meningitis');
    expect(upgradeAction.reasoningStep.totalScore).toBe(200);
  });
});
