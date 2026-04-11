/**
 * @fileoverview Knowledge Base Model — Layer 2 of the Data Trinity ("The Library").
 *
 * The Knowledge Base is a collection of domain facts (fragments) that the
 * Knowledge Operator consults when resolving EXPAND goals. Each fragment
 * encodes a single directed relationship between two domain concepts
 * (e.g., "Fever CAUSES Bacterial Meningitis") along with metadata that
 * the Search Operator uses for heuristic scoring.
 *
 * Fragments are matched by **label** (domain term), not by SSM node ID.
 * This is the bridge between the ephemeral working memory (SSM) and the
 * universal domain knowledge.
 *
 * @remarks
 * DESIGN DECISION: The KB is a flat array of fragments rather than a graph
 * or ontology. This keeps the matching logic simple (filter by subject +
 * relation) and makes the KB easy to author, inspect, and serialize as JSON.
 * The engine's "intelligence" comes from the Triple-Operator cycle, not from
 * a complex KB structure.
 */

/**
 * Metadata attached to each Knowledge Base fragment.
 *
 * All values are bounded to [0.0, 1.0] — enforced by the KB reducer at
 * load time. This normalization ensures the Search Operator's scoring
 * formula produces comparable values across fragments without needing
 * per-field scaling.
 *
 * @remarks
 * DESIGN DECISION: Metadata is bounded [0, 1] rather than unbounded because
 * the scoring formula multiplies these values by fixed constants (e.g., 100)
 * and strategy weights. Unbounded metadata would make weight tuning
 * unpredictable and break the "Glass Box" transparency guarantee — users
 * need to understand that urgency=1.0 is "maximum" and 0.0 is "none".
 */
export interface IFragmentMetadata {
  /**
   * Clinical risk / priority level (0.0 = no urgency, 1.0 = life-threatening).
   *
   * The Search Operator uses MAX(urgency) across all matching fragments
   * for a goal, because the engine must pivot to the most dangerous
   * possibility immediately to satisfy the "Safety-First" requirement.
   * Using MEAN would dilute a single high-urgency fragment among benign ones.
   */
  urgency: number;

  /**
   * Diagnostic value / discriminating power (0.0 = non-specific, 1.0 = pathognomonic).
   *
   * Currently stored for future use in advanced scoring strategies.
   * In the POC, the Search Operator does not directly weight specificity,
   * but it is available for strategy extensions.
   */
  specificity: number;

  /**
   * Cost of interrupting the user to ask about this relationship
   * (0.0 = trivial question, 1.0 = invasive/expensive inquiry).
   *
   * The Search Operator uses MEAN(inquiryCost) across matching fragments
   * and subtracts it from the score, weighted by `costAversion`. This
   * penalizes goals that would likely require user interruption.
   */
  inquiryCost: number;
}

/**
 * A single fact in the Knowledge Base — one directed relationship between
 * two domain concepts with associated metadata.
 *
 * The Knowledge Operator matches fragments by `subject` (label) and
 * `relation` (type) against the winning goal's `anchorLabel` and
 * `targetRelation`. When multiple fragments match, ALL are instantiated
 * as HYPOTHESIS nodes in a single PATCH (multi-hypothesis spawning).
 *
 * @remarks
 * DESIGN DECISION: `subject` and `object` are domain labels (e.g., "Fever"),
 * not SSM node IDs. This is the label-based matching strategy — it bridges
 * the ephemeral SSM (Layer 3) to the universal KB (Layer 2) without coupling
 * them by ID. A KB fragment about "Fever" applies to ANY SSM node labeled
 * "Fever", regardless of when or how that node was created.
 */
export interface IKnowledgeFragment {
  /** Unique identifier for this fragment within the KB. */
  id: string;

  /** Domain label of the source concept (e.g., "Fever"). Matched against IGoal.anchorLabel. */
  subject: string;

  /** Entity type of the source concept. Must match a Task Structure entityType. */
  subjectType: string;

  /** Relation type (e.g., "CAUSES", "CONFIRMED_BY"). Must match a Task Structure relation type. */
  relation: string;

  /** Domain label of the target concept (e.g., "Bacterial Meningitis"). Becomes the new node's label. */
  object: string;

  /** Entity type of the target concept. Must match a Task Structure entityType. */
  objectType: string;

  /** Heuristic metadata used by the Search Operator for scoring. All values in [0, 1]. */
  metadata: IFragmentMetadata;
}
