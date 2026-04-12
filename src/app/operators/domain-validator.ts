/**
 * @fileoverview Domain Validator — SSM-DKM validation checks.
 * [Ref: Paper 2 Sec 4.3 / Gap Analysis Gap 7]
 *
 * Validates the consistency and completeness of a loaded domain by
 * cross-checking the Task Structure, Knowledge Base, and SSM.
 *
 * These checks implement a simplified version of the SSM-DKM validation
 * stage (Paper 2 Sec 4.3), which checks for consistency, compactness,
 * and completeness of the formalized knowledge model.
 *
 * Pure function — returns an array of warning strings.
 */

import { ITaskStructure, IRelation } from '../models/task-structure.model';
import { IKnowledgeFragment } from '../models/knowledge-base.model';
import { ISSMNode } from '../models/ssm.model';

/**
 * Validates a domain and returns an array of warning messages.
 * An empty array means the domain is valid.
 */
export function validateDomain(
  structure: ITaskStructure,
  kb: IKnowledgeFragment[],
  ssmNodes: ISSMNode[] = []
): string[] {
  const warnings: string[] = [];

  // ── Task Structure checks ──────────────────────────────────────
  if (structure.entityTypes.length === 0) {
    warnings.push('Task Structure has no entity types.');
  }
  if (structure.relations.length === 0) {
    warnings.push('Task Structure has no relations.');
  }

  // Check for orphan entity types (types with no relations)
  const typesInRelations = new Set<string>();
  for (const r of structure.relations) {
    typesInRelations.add(r.from);
    typesInRelations.add(r.to);
  }
  for (const t of structure.entityTypes) {
    if (!typesInRelations.has(t)) {
      warnings.push(`Entity type "${t}" has no relations — it cannot participate in reasoning.`);
    }
  }

  // ── KB coverage checks ─────────────────────────────────────────
  // Check that every relation in the Task Structure has at least one KB fragment
  for (const r of structure.relations) {
    const hasFragment = kb.some(f => f.relation === r.type);
    if (!hasFragment) {
      warnings.push(`Relation "${r.type}" (${r.from} → ${r.to}) has no KB fragments — the engine cannot resolve goals using this relation.`);
    }
  }

  // Check that KB fragment types match Task Structure
  for (const f of kb) {
    if (!structure.entityTypes.includes(f.subjectType)) {
      warnings.push(`KB fragment "${f.id}": subjectType "${f.subjectType}" is not in entityTypes.`);
    }
    if (!structure.entityTypes.includes(f.objectType)) {
      warnings.push(`KB fragment "${f.id}": objectType "${f.objectType}" is not in entityTypes.`);
    }
    const matchingRelation = structure.relations.find(r => r.type === f.relation);
    if (!matchingRelation) {
      warnings.push(`KB fragment "${f.id}": relation "${f.relation}" is not in Task Structure relations.`);
    } else {
      if (matchingRelation.from !== f.subjectType) {
        warnings.push(`KB fragment "${f.id}": subjectType "${f.subjectType}" doesn't match relation "${f.relation}" from="${matchingRelation.from}".`);
      }
      if (matchingRelation.to !== f.objectType) {
        warnings.push(`KB fragment "${f.id}": objectType "${f.objectType}" doesn't match relation "${f.relation}" to="${matchingRelation.to}".`);
      }
    }
  }

  // ── SSM seed node checks ───────────────────────────────────────
  if (ssmNodes.length === 0) {
    warnings.push('No seed nodes in SSM — the engine has nothing to reason from. Add seed nodes or use the Seed Finding feature.');
  }
  for (const n of ssmNodes) {
    if (!structure.entityTypes.includes(n.type)) {
      warnings.push(`SSM node "${n.label}": type "${n.type}" is not in entityTypes.`);
    }
  }

  // Check that seed nodes are leaf types (can trigger abductive reasoning)
  const fromTypes = new Set(structure.relations.map(r => r.from));
  const toTypes = new Set(structure.relations.map(r => r.to));
  const leafTypes = new Set([...toTypes].filter(t => !fromTypes.has(t)));
  const seedNodes = ssmNodes.filter(n => n.status === 'CONFIRMED');
  for (const n of seedNodes) {
    if (!leafTypes.has(n.type) && !toTypes.has(n.type)) {
      warnings.push(`Seed node "${n.label}" has type "${n.type}" which is not a target of any relation — abductive reasoning cannot reach it.`);
    }
  }

  return warnings;
}
