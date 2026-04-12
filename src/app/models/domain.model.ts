import { ITaskStructure } from './task-structure.model';
import { IKnowledgeFragment } from './knowledge-base.model';
import { ISSMState } from './ssm.model';
import { IStrategy } from './strategy.model';

/**
 * A complete diagnostic session — the domain grammar, knowledge library,
 * current reasoning state, and strategy configuration bundled together.
 *
 * When loaded, the `structure` and `knowledgeBase` initialize the engine's
 * grammar and fact library. If `ssm` is present, it restores a previous
 * session's reasoning state (nodes, edges, audit trail). If `strategy`
 * is present, it restores the heuristic weights.
 *
 * When saved/exported, the entire current state is captured — making the
 * file a "Diagnostic Session" that can be shared, reviewed, or resumed.
 *
 * @remarks
 * DESIGN DECISION: The SSM and strategy fields are optional on load
 * (a fresh domain starts with an empty SSM and default strategy) but
 * always populated on export (the current state is captured).
 */
export interface IDomain {
  /** Unique identifier for this domain/session. */
  id: string;
  /** Human-readable name (e.g., "Meningitis Diagnosis — Session 3"). */
  name: string;
  /** Layer 1: The grammar — entity types and valid relations. */
  structure: ITaskStructure;
  /** Layer 2: The fact library — domain knowledge fragments. */
  knowledgeBase: IKnowledgeFragment[];
  /** Layer 3: The reasoning state — nodes, edges, and audit trail. Optional on load. */
  ssm?: ISSMState;
  /** Heuristic weights and pacer configuration. Optional on load. */
  strategy?: IStrategy;
}
