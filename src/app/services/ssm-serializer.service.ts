/**
 * @fileoverview SSM Serializer Service — JSON round-trip for the SSM state.
 *
 * Provides serialize/deserialize methods for persisting and restoring the
 * complete SSM state (nodes, edges, history, flags). The round-trip guarantee
 * (Property 1 in the design spec) ensures that `deserialize(serialize(state))`
 * produces a deeply equal state for any valid `ISSMState`.
 *
 * @remarks
 * DESIGN DECISION: The serializer never throws. `deserialize()` returns either
 * a valid `ISSMState` or an `{ error: string }` object. This is deliberate —
 * the caller (typically a UI "load" action) can inspect the result and display
 * a user-friendly error without needing try/catch. Throwing would force every
 * caller to handle exceptions, which is error-prone in reactive pipelines.
 *
 * DESIGN DECISION: Structural validation on deserialize is intentionally
 * conservative — it checks that the required arrays and booleans exist, and
 * that each node has the four required fields (id, label, type, status).
 * It does NOT validate referential integrity (e.g., that edge.source points
 * to an existing node) because that's the store's responsibility. The
 * serializer's job is to catch malformed JSON, not enforce domain invariants.
 */

import { Injectable } from '@angular/core';
import { ISSMState } from '../models/ssm.model';

@Injectable({ providedIn: 'root' })
export class SSMSerializerService {
  /**
   * Serializes the complete SSM state to a JSON string.
   *
   * Uses `JSON.stringify` directly — no custom replacers or transformations.
   * The SSM state is a plain object graph (no circular references, no class
   * instances), so standard JSON serialization is sufficient.
   *
   * @param state - The SSM state to serialize
   * @returns JSON string representation of the state
   */
  serialize(state: ISSMState): string {
    return JSON.stringify(state);
  }

  /**
   * Deserializes a JSON string back into an `ISSMState`, with structural validation.
   *
   * Returns either a valid `ISSMState` or an `{ error: string }` object describing
   * what went wrong. Never throws.
   *
   * **Validation checks (in order):**
   * 1. JSON.parse succeeds (catches syntax errors)
   * 2. `nodes`, `edges`, and `history` are arrays
   * 3. `isRunning` and `waitingForUser` are booleans
   * 4. Each node has `id`, `label`, `type`, and `status` fields
   *
   * @param json - JSON string to parse and validate
   * @returns Valid `ISSMState` or `{ error: string }` with a descriptive message
   *
   * @remarks
   * DESIGN DECISION: Validation is intentionally shallow — we check structure
   * (are the right fields present with the right types?) but not semantics
   * (are node IDs unique? do edge sources reference real nodes?). Semantic
   * validation belongs in the domain layer, not the serialization layer.
   * This keeps the serializer fast and focused on its single responsibility.
   */
  deserialize(json: string): ISSMState | { error: string } {
    try {
      const parsed = JSON.parse(json);

      // Validate top-level array fields exist
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges) || !Array.isArray(parsed.history)) {
        return { error: 'Invalid SSM structure: nodes, edges, and history must be arrays.' };
      }

      // Validate boolean flags exist and are the correct type
      if (typeof parsed.isRunning !== 'boolean' || typeof parsed.waitingForUser !== 'boolean') {
        return { error: 'Invalid SSM structure: isRunning and waitingForUser must be booleans.' };
      }

      // Validate each node has the four required fields.
      // We check for truthiness (not just existence) to catch empty strings and null.
      for (const node of parsed.nodes) {
        if (!node.id || !node.label || !node.type || !node.status) {
          return { error: `Invalid node: missing required fields. Node: ${JSON.stringify(node)}` };
        }
      }

      return parsed as ISSMState;
    } catch (e) {
      // JSON.parse failed — return the parse error message
      return { error: `JSON parse error: ${(e as Error).message}` };
    }
  }
}
