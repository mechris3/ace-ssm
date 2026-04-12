/**
 * @fileoverview SSM Model — Layer 3 of the Data Trinity ("Working Memory").
 *
 * The Situation Specific Model (SSM) is the engine's evolving graph of
 * hypotheses, confirmed facts, open questions, and the reasoning history
 * that produced them. It is the central artifact of the inference process —
 * every operator reads from it, and every mutation flows through NgRx
 * actions that append to it.
 *
 * The SSM is designed for transparency: every node has a human-readable
 * label, every edge traces back to a Task Structure relation, and every
 * mutation is recorded in the history with a full Rationale Packet.
 *
 * @remarks
 * DESIGN DECISION: The SSM is append-only for nodes and edges (via PATCH).
 * Nodes are never deleted — they can only change status. This preserves
 * the full reasoning trail and supports the "Glass Box" auditability goal.
 */

import { IReasoningStep } from './strategy.model';

/**
 * The six possible lifecycle states of an SSM node.
 *
 * @remarks
 * - `HYPOTHESIS` — Spawned by the Knowledge Operator from KB fragments.
 *   Not yet confirmed; may be promoted via STATUS_UPGRADE or killed by penalty.
 * - `CONFIRMED` — User-confirmed (via inquiry modal) or promoted
 *   (via STATUS_UPGRADE when all CONFIRMED_BY targets are CONFIRMED).
 * - `QUESTION` — Created by the Inference Engine when the Knowledge Operator
 *   returns INQUIRY_REQUIRED. Represents a gap the user must fill (legacy).
 * - `UNKNOWN` — User explicitly marked a QUESTION as unknown. Blocks
 *   promotion chains and applies multiplicative penalty to downstream goals.
 * - `REFUTED` — User explicitly rejected this finding via the inquiry modal.
 *   Applies a 99% multiplicative penalty (0.01×) to all downstream goals.
 * - `SKIPPED` — User deferred judgment via the inquiry modal. Loses urgency
 *   bonus for the current cycle but the branch is not permanently killed.
 */
export type NodeStatus = 'HYPOTHESIS' | 'CONFIRMED' | 'QUESTION' | 'UNKNOWN' | 'REFUTED' | 'SKIPPED';

/**
 * A node in the SSM graph — represents a single domain concept in working memory.
 *
 * Nodes are created by the Knowledge Operator (HYPOTHESIS), the Inference Engine
 * (QUESTION), or loaded from fixtures/user input (CONFIRMED seed nodes).
 */
export interface ISSMNode {
  /** Unique identifier, typically `node_${crypto.randomUUID()}`. */
  id: string;

  /**
   * Human-readable domain term (e.g., "Fever", "Bacterial Meningitis").
   *
   * @remarks
   * DESIGN DECISION: The label is the bridge to the Knowledge Base. The
   * Knowledge Operator matches `IGoal.anchorLabel` against `IKnowledgeFragment.subject`
   * using exact string equality. This label-based matching (not ID-based) is what
   * makes the KB universal — the same fragment applies to any node with the same label.
   */
  label: string;

  /** Entity type from the Task Structure (e.g., "FINDING", "ETIOLOGIC_AGENT"). */
  type: string;

  /** Current lifecycle status. Drives goal generation and scoring behavior. */
  status: NodeStatus;

  /**
   * Whether this node can be confirmed by the user via the Inquiry Modal.
   *
   * When `true` and the node is in HYPOTHESIZED status, the Searchlight landing
   * on this node triggers a finding-confirmation inquiry instead of continuing
   * the Triple-Operator cycle. The user can then confirm or dismiss the finding.
   */
  canBeConfirmed?: boolean;
}

/**
 * A directed edge in the SSM graph — represents a relationship between two nodes.
 *
 * Edges are created alongside nodes in PATCH operations and are never deleted.
 * The Goal Generator uses edges to detect which relations have already been
 * explored (gap detection: "does an edge with this source + relationType exist?").
 */
export interface ISSMEdge {
  /** Unique identifier, typically `edge_${crypto.randomUUID()}`. */
  id: string;

  /** ID of the source node (the "from" side of the relation). */
  source: string;

  /** ID of the target node (the "to" side of the relation). */
  target: string;

  /** Relation type from the Task Structure (e.g., "CAUSES", "CONFIRMED_BY"). */
  relationType: string;
}

/**
 * The complete SSM state — the engine's working memory at a point in time.
 *
 * This is the shape stored in the NgRx `ssm` slice. It includes the graph
 * (nodes + edges), the full reasoning history, and two boolean flags that
 * coordinate the engine's lifecycle with the UI.
 */
export interface ISSMState {
  /** All nodes in the SSM graph. Append-only via PATCH; status-mutable via upgrade/inquiry. */
  nodes: ISSMNode[];

  /** All edges in the SSM graph. Strictly append-only. */
  edges: ISSMEdge[];

  /**
   * Ordered list of every reasoning step the engine has taken.
   * Each entry corresponds to exactly one SSM mutation (PATCH, STATUS_UPGRADE,
   * INQUIRY, or RESOLVE). This is the "Glass Box" audit trail.
   */
  history: IReasoningStep[];

  /** Whether the engine is actively running (pacer emitting pulses). */
  isRunning: boolean;

  /**
   * Whether the engine is paused waiting for user input (INQUIRY state).
   * When true, the UI should present the open QUESTION node for resolution.
   */
  waitingForUser: boolean;

  /**
   * The ID of a HYPOTHESIZED node pending user confirmation via the finding
   * inquiry modal. Set by `openFindingInquiry`, cleared by `confirmFinding`
   * or `dismissFindingInquiry`.
   */
  pendingFindingNodeId: string | null;
}

/**
 * Discriminator for the two kinds of goals the engine can pursue.
 *
 * @remarks
 * DESIGN DECISION: Goals are tagged with a `kind` discriminator rather than
 * using separate interfaces. This keeps the Goal → Search → Knowledge pipeline
 * uniform — every goal flows through the same three operators. The Knowledge
 * Operator branches on `kind` to decide whether to consult the KB (EXPAND)
 * or bypass it (STATUS_UPGRADE).
 *
 * - `EXPAND` — Seek new KB fragments to grow the SSM graph. The anchor node
 *   has an unexplored relation (a "gap" detected by the Goal Generator).
 * - `STATUS_UPGRADE` — Promote a HYPOTHESIS to CONFIRMED because all its
 *   CONFIRMED_BY targets are themselves CONFIRMED. This goes through the
 *   full Triple-Operator cycle for consistency and traceability.
 */
export type GoalKind = 'EXPAND' | 'STATUS_UPGRADE';

/**
 * Direction of an EXPAND goal relative to the Task Structure relation.
 *
 * @remarks
 * DESIGN DECISION: Diagnosis starts with symptoms and reasons backwards
 * to causes. The engine must support both forward reasoning ("what does
 * this cause?") and abductive/reverse reasoning ("what explains this?").
 * Rather than duplicating relations in the Task Structure, we tag each
 * goal with a direction so the Knowledge Operator knows which side of
 * the KB fragment to match against.
 *
 * - `forward` — The anchor node is the `from` side. KB matches on
 *   `fragment.subject === anchorLabel`. New nodes come from `fragment.object`.
 * - `reverse` — The anchor node is the `to` side. KB matches on
 *   `fragment.object === anchorLabel`. New nodes come from `fragment.subject`.
 *   This is abductive reasoning: "what could explain this observation?"
 */
export type GoalDirection = 'forward' | 'reverse';

/**
 * A goal represents a single unit of work for the inference engine.
 *
 * Goals are generated by the Goal Generator, scored by the Search Operator,
 * and resolved by the Knowledge Operator. Only the highest-scoring goal
 * is acted upon per pulse — this is the engine's "one winner per heartbeat" rule.
 */
export interface IGoal {
  /** Unique identifier, typically `goal_${crypto.randomUUID()}`. */
  id: string;

  /** Whether this goal expands the graph or promotes a hypothesis. */
  kind: GoalKind;

  /** ID of the SSM node this goal is anchored to. */
  anchorNodeId: string;

  /**
   * Cached label of the anchor node at goal-creation time.
   *
   * @remarks
   * DESIGN DECISION: The label is cached on the goal rather than looked up
   * later because the Knowledge Operator needs it for label-based KB matching.
   * Caching avoids a second SSM lookup in the Knowledge Operator and ensures
   * the label is stable even if the SSM were to change between operators
   * (though in practice it doesn't within a single pulse).
   */
  anchorLabel: string;

  /**
   * The relation type this goal targets (e.g., "CAUSES", "CONFIRMED_BY").
   * For STATUS_UPGRADE goals, this is the literal string "STATUS_UPGRADE".
   */
  targetRelation: string;

  /** The entity type of the expected target node (from Task Structure). */
  targetType: string;

  /**
   * Direction of this goal relative to the Task Structure relation.
   * `forward` = anchor is the `from` side, `reverse` = anchor is the `to` side.
   * Defaults to `forward` for backward compatibility. STATUS_UPGRADE goals always use `forward`.
   */
  direction: GoalDirection;
}

/**
 * The initial (empty) SSM state used by the NgRx reducer on startup and reset.
 *
 * All arrays are empty, both flags are false. The engine starts with a blank
 * slate — seed nodes must be added via PATCH before inference can begin.
 */
export const initialSSMState: ISSMState = {
  nodes: [],
  edges: [],
  history: [],
  isRunning: false,
  waitingForUser: false,
  pendingFindingNodeId: null,
};
