/**
 * @fileoverview Knowledge Base Fixture — sample medical domain facts for testing.
 *
 * This fixture provides six KB fragments that exercise all key engine behaviors:
 *
 * 1. **Multi-hypothesis spawning:** "Fever" CAUSES both "Bacterial Meningitis"
 *    (urgency=1.0) and "Influenza" (urgency=0.4). When the engine processes
 *    the CAUSES gap for a "Fever" node, BOTH hypotheses are spawned in a
 *    single PATCH. The Search Operator then prioritizes Meningitis (higher urgency).
 *
 * 2. **INQUIRY_REQUIRED path:** No fragment exists for the TREATS relation,
 *    so any EXPAND goal targeting TREATS will trigger INQUIRY_REQUIRED.
 *    This tests the inquiry lifecycle (QUESTION node → user resolution).
 *
 * 3. **Confirmation chains:** Both ETIOLOGIC_AGENTs have CONFIRMED_BY fragments
 *    pointing to FINDINGs (Lumbar Puncture, Rapid Flu Test). When these findings
 *    are confirmed, the Goal Generator detects STATUS_UPGRADE opportunities.
 *
 * 4. **Urgency-driven prioritization:** Bacterial Meningitis has urgency=1.0
 *    (life-threatening) while Influenza has urgency=0.4 (moderate). The Search
 *    Operator's MAX(urgency) formula ensures Meningitis-related goals score higher.
 *
 * 5. **Cost variation:** Lumbar Puncture has inquiryCost=0.7 (invasive procedure)
 *    while Rapid Flu Test has inquiryCost=0.4 (simple test). This tests the
 *    cost aversion weight's effect on goal scoring.
 *
 * @remarks
 * DESIGN DECISION: The fixture is intentionally small (6 fragments) to make
 * test assertions tractable while still covering all engine code paths.
 * A production KB would have hundreds or thousands of fragments, but the
 * engine's behavior is the same — it's just more goals to score.
 */

import { IKnowledgeFragment } from '../models/knowledge-base.model';

/**
 * Sample medical domain Knowledge Base for testing and demonstration.
 *
 * Fragment summary:
 * - kb_001: Fever → CAUSES → Bacterial Meningitis (urgency=1.0, high priority)
 * - kb_002: Fever → CAUSES → Influenza (urgency=0.4, moderate priority)
 * - kb_003: Bacterial Meningitis → INDUCES → Neck Stiffness (urgency=0.9)
 * - kb_004: Bacterial Meningitis → CONFIRMED_BY → Lumbar Puncture (high cost)
 * - kb_005: Influenza → INDUCES → Myalgia (urgency=0.2, low priority)
 * - kb_006: Influenza → CONFIRMED_BY → Rapid Flu Test (moderate cost)
 */
export const KNOWLEDGE_BASE_FIXTURE: IKnowledgeFragment[] = [
  {
    // Multi-hypothesis trigger: this fragment + kb_002 both match "Fever" + "CAUSES",
    // causing the Knowledge Operator to spawn two HYPOTHESIS nodes in one PATCH.
    // Urgency=1.0 ensures this path is prioritized by the Search Operator (Safety-First).
    id: 'kb_001',
    subject: 'Fever',
    subjectType: 'FINDING',
    relation: 'CAUSES',
    object: 'Bacterial Meningitis',
    objectType: 'ETIOLOGIC_AGENT',
    metadata: { urgency: 1.0, specificity: 0.3, inquiryCost: 0.1 }
  },
  {
    // Second hypothesis for "Fever CAUSES" — lower urgency than Meningitis.
    // Tests that multi-hypothesis spawning includes ALL matches, not just the best.
    id: 'kb_002',
    subject: 'Fever',
    subjectType: 'FINDING',
    relation: 'CAUSES',
    object: 'Influenza',
    objectType: 'ETIOLOGIC_AGENT',
    metadata: { urgency: 0.4, specificity: 0.5, inquiryCost: 0.2 }
  },
  {
    // Downstream expansion: once Bacterial Meningitis is in the SSM, this fragment
    // enables the INDUCES gap to be filled with "Neck Stiffness".
    // High urgency (0.9) ensures this path is explored early.
    id: 'kb_003',
    subject: 'Bacterial Meningitis',
    subjectType: 'ETIOLOGIC_AGENT',
    relation: 'INDUCES',
    object: 'Neck Stiffness',
    objectType: 'PHYSIOLOGIC_STATE',
    metadata: { urgency: 0.9, specificity: 0.8, inquiryCost: 0.3 }
  },
  {
    // Confirmation evidence: Lumbar Puncture confirms Bacterial Meningitis.
    // High inquiryCost (0.7) tests cost aversion — this is an invasive procedure.
    // When this FINDING is confirmed, it enables STATUS_UPGRADE for Meningitis.
    id: 'kb_004',
    subject: 'Bacterial Meningitis',
    subjectType: 'ETIOLOGIC_AGENT',
    relation: 'CONFIRMED_BY',
    object: 'Lumbar Puncture',
    objectType: 'FINDING',
    metadata: { urgency: 0.8, specificity: 0.95, inquiryCost: 0.7 }
  },
  {
    // Low-priority downstream expansion for the Influenza branch.
    // Low urgency (0.2) means this is explored after higher-priority goals.
    id: 'kb_005',
    subject: 'Influenza',
    subjectType: 'ETIOLOGIC_AGENT',
    relation: 'INDUCES',
    object: 'Myalgia',
    objectType: 'PHYSIOLOGIC_STATE',
    metadata: { urgency: 0.2, specificity: 0.4, inquiryCost: 0.1 }
  },
  {
    // Confirmation evidence for the Influenza branch.
    // Moderate cost (0.4) — a simple rapid test, cheaper than Lumbar Puncture.
    // When confirmed, enables STATUS_UPGRADE for Influenza.
    id: 'kb_006',
    subject: 'Influenza',
    subjectType: 'ETIOLOGIC_AGENT',
    relation: 'CONFIRMED_BY',
    object: 'Rapid Flu Test',
    objectType: 'FINDING',
    metadata: { urgency: 0.3, specificity: 0.9, inquiryCost: 0.4 }
  }
];
