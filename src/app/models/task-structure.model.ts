/**
 * @fileoverview Task Structure Model — Layer 1 of the Data Trinity ("The Rules").
 *
 * The Task Structure defines the **grammar** of the domain: what kinds of entities
 * exist and how they may relate to each other. It is domain-agnostic by design —
 * entity types are plain strings (not an enum) so the same engine can power a
 * medical-diagnosis domain, a cybersecurity-triage domain, or any other domain
 * simply by loading a different Task Structure JSON file.
 *
 * The engine never hard-codes entity names; it only reasons about structural
 * relationships. This is what makes ACE-SSM a "Glass Box" — the rules are
 * explicit, inspectable, and swappable.
 *
 * @remarks
 * DESIGN DECISION: `entityTypes` is `string[]` rather than a TypeScript enum
 * because the engine must remain domain-agnostic. Enums would couple the
 * engine to a specific domain vocabulary at compile time.
 */

/**
 * A directed relation type within the domain grammar.
 *
 * Relations have `from` and `to` constraints that reference entries in
 * `ITaskStructure.entityTypes`. This constraint is validated at load time
 * by the Task Structure reducer — if either endpoint references an unknown
 * entity type, the entire Task Structure is rejected.
 *
 * @remarks
 * DESIGN DECISION: `from`/`to` are strings referencing `entityTypes` rather
 * than indices or nested objects. This keeps the JSON representation flat and
 * human-readable, which is critical for the "Glass Box" transparency goal.
 * The Goal Generator uses `from` to determine which relations are valid
 * outgoing edges for a given node type, enabling gap detection.
 */
export interface IRelation {
  /** Relation label, e.g. 'CAUSES', 'INDUCES', 'CONFIRMED_BY', 'TREATS'. */
  type: string;
  /** Source entity type — only nodes of this type may originate this relation. */
  from: string;
  /** Target entity type — the relation points to nodes of this type. */
  to: string;
}

/**
 * The complete Task Structure definition — Layer 1 of the Data Trinity.
 *
 * Loaded once at startup and treated as immutable thereafter. The Goal Generator
 * cross-references every SSM node against these relations to detect "gaps" —
 * relations that *should* exist (per the grammar) but don't yet have a
 * corresponding edge in the SSM.
 *
 * @example
 * ```json
 * {
 *   "entityTypes": ["FINDING", "ETIOLOGIC_AGENT", "PHYSIOLOGIC_STATE", "TREATMENT"],
 *   "relations": [
 *     { "type": "CAUSES", "from": "FINDING", "to": "ETIOLOGIC_AGENT" }
 *   ]
 * }
 * ```
 */
export interface ITaskStructure {
  /**
   * All valid entity type labels in this domain.
   *
   * @remarks
   * DESIGN DECISION: Stored as `string[]` (not a Set) because the JSON
   * serialization format is an array, and the validation logic iterates
   * linearly — the list is small enough that O(n) lookup is acceptable.
   */
  entityTypes: string[];

  /**
   * All valid directed relation types. Each relation's `from` and `to`
   * must reference entries in `entityTypes` — enforced by the reducer.
   */
  relations: IRelation[];
}
