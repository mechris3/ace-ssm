/**
 * @fileoverview Task Structure Fixture — sample medical domain grammar for testing.
 *
 * This fixture defines a medical-diagnosis domain grammar with four entity types
 * and five relations. It is designed to exercise all key engine behaviors:
 *
 * - **Multi-step reasoning chains:** FINDING → CAUSES → ETIOLOGIC_AGENT → INDUCES → PHYSIOLOGIC_STATE
 * - **Confirmation chains:** ETIOLOGIC_AGENT → CONFIRMED_BY → FINDING
 * - **Treatment paths:** TREATMENT → TREATS → ETIOLOGIC_AGENT
 * - **STATUS_UPGRADE:** CONFIRMED_BY edges enable hypothesis promotion
 *
 * @remarks
 * DESIGN DECISION: The fixture uses a medical domain because it naturally
 * exhibits the reasoning patterns the engine is designed for: differential
 * diagnosis (multi-hypothesis), evidence gathering (CONFIRMED_BY), and
 * treatment planning (TREATS). However, the engine itself is domain-agnostic —
 * this fixture could be replaced with a cybersecurity or engineering domain.
 *
 * DESIGN DECISION: CONFIRMED_BY appears TWICE — once from ETIOLOGIC_AGENT
 * to FINDING, and once from PHYSIOLOGIC_STATE to FINDING. This is intentional:
 * both etiologic agents (diseases) and physiologic states (symptoms) can be
 * confirmed by findings (test results, observations). This tests the engine's
 * ability to handle the same relation type with different `from` constraints.
 *
 * DESIGN DECISION: TREATMENT is included even though the POC doesn't have
 * treatment-specific logic. It exercises the engine's ability to handle
 * entity types that only appear as relation sources (TREATMENT → TREATS),
 * never as targets of other relations. This tests gap detection for
 * "leaf" entity types.
 */

import { ITaskStructure } from '../models/task-structure.model';

/**
 * Sample medical domain Task Structure for testing and demonstration.
 *
 * Entity types:
 * - `FINDING` — Observable clinical findings (e.g., Fever, Neck Stiffness)
 * - `ETIOLOGIC_AGENT` — Diseases or conditions (e.g., Bacterial Meningitis)
 * - `PHYSIOLOGIC_STATE` — Physiological consequences (e.g., Myalgia)
 * - `TREATMENT` — Therapeutic interventions (e.g., Antibiotics)
 *
 * Relations:
 * - `CAUSES` — A finding suggests an etiologic agent
 * - `INDUCES` — An etiologic agent produces a physiologic state
 * - `TREATS` — A treatment addresses an etiologic agent
 * - `CONFIRMED_BY` (×2) — An agent or state is confirmed by a finding
 */
export const TASK_STRUCTURE_FIXTURE: ITaskStructure = {
  entityTypes: ['FINDING', 'ETIOLOGIC_AGENT', 'PHYSIOLOGIC_STATE', 'TREATMENT'],
  relations: [
    // FINDING → ETIOLOGIC_AGENT: "Fever causes Bacterial Meningitis"
    { type: 'CAUSES', from: 'FINDING', to: 'ETIOLOGIC_AGENT' },
    // ETIOLOGIC_AGENT → PHYSIOLOGIC_STATE: "Meningitis induces Neck Stiffness"
    { type: 'INDUCES', from: 'ETIOLOGIC_AGENT', to: 'PHYSIOLOGIC_STATE' },
    // TREATMENT → ETIOLOGIC_AGENT: "Antibiotics treats Meningitis"
    { type: 'TREATS', from: 'TREATMENT', to: 'ETIOLOGIC_AGENT' },
    // ETIOLOGIC_AGENT → FINDING: "Meningitis confirmed by Lumbar Puncture"
    // This enables STATUS_UPGRADE for disease hypotheses
    { type: 'CONFIRMED_BY', from: 'ETIOLOGIC_AGENT', to: 'FINDING' },
    // PHYSIOLOGIC_STATE → FINDING: "Neck Stiffness confirmed by Physical Exam"
    // This enables STATUS_UPGRADE for physiologic state hypotheses
    { type: 'CONFIRMED_BY', from: 'PHYSIOLOGIC_STATE', to: 'FINDING' }
  ]
};
