[← Back to Docs Index](./README.md)

# MASTER ARCHITECTURAL SPECIFICATION: ACE-SSM REACTIVE ENGINE (2026)

## 1. CORE PHILOSOPHY & SYSTEM VISION
The ACE-SSM (Architectural Component Ensemble - Situation Specific Model) is a "Logical Glass Box" inference engine. It is designed to replace "black-box" AI logic with a transparent, state-space search process where every conclusion is traceable back to a specific heuristic decision.

- **Traceability:** Every node and edge in the Situation Specific Model (SSM) must be associated with a `Rationale` packet.
- **Paced Reasoning:** The engine runs on a reactive "Heartbeat" stream, allowing a human-in-the-loop to observe the "Searchlight" of the engine as it evaluates possibilities.
- **Hardware Target:** High-performance implementation optimized for M3 Max using Angular (v19+), NgRx, RxJS, and D3.js.

---

## 2. THE DATA TRINITY (CONTRACTS)

### I. Task Structure (The Meta-Rules)
A static schema defining the "Grammar" of reasoning.
```typescript
export interface ITaskStructure {
  entityTypes: Array<'ETIOLOGIC_AGENT' | 'PHYSIOLOGIC_STATE' | 'FINDING' | 'TREATMENT'>;
  relations: {
    type: 'CAUSES' | 'INDUCES' | 'CONFIRMS' | 'TREATS';
    from: string; // Must match an entityType
    to: string;   // Must match an entityType
  }[];
}
```

### II. Knowledge Base (The Global Library)
The repository of domain facts used to satisfy logical goals.
```typescript
export interface IKnowledgeFragment {
  id: string;
  subject: string;      
  subjectType: string;
  relation: string;     
  object: string;       
  objectType: string;
  metadata: {
    urgency: number;      // 0.0 - 1.0 (Clinical risk/priority)
    specificity: number;  // 0.0 - 1.0 (Diagnostic value)
    inquiryCost: number;  // 0.0 - 1.0 (Cost of user interruption)
  };
}
```

### III. Situation Specific Model (The Instance State)
The dynamic, evolving graph of the current case.
```typescript
export interface ISSMNode {
  id: string;
  label: string;
  type: string;
  status: 'HYPOTHESIS' | 'CONFIRMED' | 'QUESTION';
}

export interface ISSMEdge {
  id: string;
  source: string;
  target: string;
  relationType: string;
}

export interface ISSMState {
  nodes: ISSMNode[];
  edges: ISSMEdge[];
  history: IReasoningStep[]; // The append-only Audit Trail
  isRunning: boolean;        // Engine toggle
  waitingForUser: boolean;   // Halt state for inquiry
}
```

---

## 3. HEURISTICS & REASONING (THE STRATEGIST)

### The Strategy Interface
Controls the "personality" of the engine by weighting different heuristics.
```typescript
export interface IStrategy {
  weights: {
    urgency: number;     // Multiplier for clinical risk metadata
    parsimony: number;   // Weight for model convergence (Occam's Razor)
    costAversion: number;// Weight for avoiding user interruption
  };
  pacerDelay: number;    // Heartbeat delay in ms (0 to 2000)
}
```

### The Rationale Packet (Explainability)
Every decision made by the Search Operator returns this data structure.
```typescript
export interface IRationaleFactor {
  label: string;
  impact: number; // The weighted score added or subtracted
  explanation: string;
}

export interface IReasoningStep {
  timestamp: number;
  selectedGoal: IGoal;
  totalScore: number;
  factors: IRationaleFactor[];
  strategyName: string;
  actionTaken: string; // e.g., "Expanded 'Fever' node via 'CAUSES' relation"
}
```

---

## 4. THE OPERATOR TRINITY (PURE LOGIC)

### Operator 1: Goal Generator (The Gap Finder)
Pure function that identifies "Gaps" by mapping the SSM against the Task Structure.
```typescript
export const goalOperator = (ssm: ISSMState, ts: ITaskStructure): IGoal[] => {
  return ssm.nodes.flatMap(node => {
    const validRelations = ts.relations.filter(r => r.from === node.type);
    return validRelations
      .filter(rel => !ssm.edges.some(e => e.source === node.id && e.relationType === rel.type))
      .map(rel => ({
        id: `goal_${crypto.randomUUID()}`,
        anchorNodeId: node.id,
        targetRelation: rel.type,
        targetType: rel.to
      }));
  });
};
```

### Operator 2: Search Operator (The Strategist)
Pure function that scores all active goals.
**Logic Formula:** $TotalScore = (Urgency \cdot w_u) + (Parsimony \cdot w_p) - (Cost \cdot w_c)$
```typescript
export const searchOperator = (goals: IGoal[], ssm: ISSMState, strategy: IStrategy) => {
  const scoredGoals = goals.map(goal => {
    const anchor = ssm.nodes.find(n => n.id === goal.anchorNodeId);
    
    const urgency = (anchor?.type === 'ETIOLOGIC_AGENT' ? 100 : 25) * strategy.weights.urgency;
    const parsimony = ssm.nodes.some(n => n.type === goal.targetType) ? 50 * strategy.weights.parsimony : 0;
    const cost = goal.targetRelation === 'CONFIRMS' ? -40 * strategy.weights.costAversion : 0;

    const factors = [
      { label: 'Clinical Urgency', impact: urgency, explanation: `Risk priority based on ${anchor?.label}.` },
      { label: 'Parsimony', impact: parsimony, explanation: 'Connecting to existing concept nodes.' },
      { label: 'Inquiry Cost', impact: cost, explanation: 'Cost of user interruption.' }
    ];

    return { goal, totalScore: urgency + parsimony + cost, factors };
  });

  const winner = [...scoredGoals].sort((a, b) => b.totalScore - a.totalScore)[0];
  return { selectedGoal: winner.goal, rationale: winner };
};
```

### Operator 3: Knowledge Operator (The Pattern Matcher)
Resolves goals via KB fragments or triggers an Inquiry.
```typescript
export const knowledgeOperator = (goal: IGoal, kb: IKnowledgeFragment[]) => {
  const match = kb.find(f => f.subject === goal.anchorNodeId && f.relation === goal.targetRelation);
  if (match) {
    return {
      type: 'PATCH',
      nodes: [{ id: match.object, label: match.object, type: match.objectType, status: 'CONFIRMED' }],
      edges: [{ id: `edge_${crypto.randomUUID()}`, source: match.subject, target: match.object, relationType: match.relation }]
    };
  }
  return { type: 'INQUIRY_REQUIRED', goal };
};
```

---

## 5. REACTIVE ORCHESTRATION (RxJS)
The engine avoids imperative loops. It uses a time-based heartbeat to allow visual settling of D3 physics.

```typescript
@Injectable({ providedIn: 'root' })
export class InferenceEngineService {
  private isRunning$ = new BehaviorSubject<boolean>(false);
  private pacerDelay$ = new BehaviorSubject<number>(500); 

  // The Heartbeat Pipeline
  public enginePulse$ = this.pacerDelay$.pipe(
    switchMap(delay => timer(0, delay)),
    filter(() => this.isRunning$.value),
    withLatestFrom(this.store.select(selectSSM), this.store.select(selectStrategy), this.store.select(selectKB)),
    map(([_, ssm, strategy, kb]) => {
      const goals = goalOperator(ssm, taskStructure);
      if (!goals.length) return { action: 'HALT' };

      const { selectedGoal, rationale } = searchOperator(goals, ssm, strategy);
      const result = knowledgeOperator(selectedGoal, kb);
      
      return { result, rationale };
    }),
    tap(({ result, rationale }) => {
      if (result.action === 'HALT') {
        this.isRunning$.next(false);
      } else if (result.type === 'PATCH') {
        this.store.dispatch(Actions.applySSMPatch({ 
          nodes: result.nodes, 
          edges: result.edges, 
          rationale: { ...rationale, timestamp: Date.now() } 
        }));
      } else if (result.type === 'INQUIRY_REQUIRED') {
        this.isRunning$.next(false); // Halt autopilot
        this.store.dispatch(Actions.openInquiryUI({ goal: result.goal }));
      }
    })
  );

  // EXPOSED MODES
  public run() { this.isRunning$.next(true); }
  public pause() { this.isRunning$.next(false); }
  public step() { /* Executes exactly one pulse cycle and pauses */ }
  public setDelay(ms: number) { this.pacerDelay$.next(ms); }
}
```

---

## 6. UI / UX & VISUALIZATION (D3.JS)

### I. The Three-Tab Environment
- **SSM Workspace (Main):** The live, force-directed graph. 
- **Task Structure View:** Static reference graph showing valid "Entity-to-Relation" moves.
- **KB Explorer:** A searchable table/view of all fragments in the library.

### II. The Control Deck
- **Pacer Slider:** UI binding to `pacerDelay$`. Adjusts "thought speed" from 0ms (instant) to 2000ms.
- **Mode Toggle:** [Run Until Question] | [Step] | [Cycle].
- **Heuristic Sliders:** Real-time controls to adjust the multipliers in the `IStrategy` object.

### III. Visualization Mechanics (M3 Max Optimized)
- **Searchlight Effect:** Pulse the `anchorNodeId` of the current `selectedGoal` in the SSM graph to show engine focus.
- **Rationale Pulse:** When a goal is satisfied, animate "particles" flowing from the strategy sliders toward the node, visually representing the weights that drove the decision.
- **Ghost Nodes:** Render potential future nodes (from the Goal Stack) as semi-transparent "ghost" nodes before they are confirmed by the Knowledge Operator.

### IV. The Reasoning Chain (Audit Trail)
A vertical sidebar logging the `history` state from the NgRx store.
- **Text Translation:** Converts `IRationaleFactor` objects into prose.
- **Example:** "Engine prioritized 'Investigate Meningitis' (+145) over 'Standard Infection' (+40) because 'Clinical Urgency' weight is High."

---

## 7. DATA SAMPLES (JSON)

### Task Structure
```json
{
  "entityTypes": ["FINDING", "ETIOLOGIC_AGENT", "PHYSIOLOGIC_STATE"],
  "relations": [
    { "from": "FINDING", "to": "ETIOLOGIC_AGENT", "type": "CAUSES" },
    { "from": "ETIOLOGIC_AGENT", "to": "PHYSIOLOGIC_STATE", "type": "INDUCES" },
    { "from": "PHYSIOLOGIC_STATE", "to": "FINDING", "type": "CONFIRMS" }
  ]
}
```

### Knowledge Base Fragment (Micro-theory)
```json
[
  {
    "id": "kb_101",
    "subject": "Fever",
    "subjectType": "FINDING",
    "relation": "CAUSES",
    "object": "Bacterial Meningitis",
    "objectType": "ETIOLOGIC_AGENT",
    "metadata": { "urgency": 1.0, "specificity": 0.3, "inquiryCost": 0.1 }
  }
]
```

---

## 8. HANDOVER NOTES FOR KIRO
1. **Immutable State:** Do not allow D3 to mutate the store. D3 should only project the store state.
2. **OnPush Strategy:** Ensure all Angular components use `ChangeDetectionStrategy.OnPush` to prevent the UI from being throttled by the engine's pulse frequency.
3. **Traceability First:** Every addition to the SSM must be accompanied by its `Rationale` packet in the `history` log.
4. **Heartbeat Control:** Ensure the `timer()` in the RxJS service is the sole driver of the inference logic.