import { TASK_STRUCTURE_FIXTURE } from './task-structure.fixture';
import { KNOWLEDGE_BASE_FIXTURE } from './knowledge-base.fixture';

describe('Test Fixtures Validation', () => {
  describe('Task Structure Fixture', () => {
    it('should have at least 3 entity types', () => {
      expect(TASK_STRUCTURE_FIXTURE.entityTypes.length).toBeGreaterThanOrEqual(3);
    });

    it('should have at least 3 distinct relation types', () => {
      const distinctTypes = new Set(TASK_STRUCTURE_FIXTURE.relations.map(r => r.type));
      expect(distinctTypes.size).toBeGreaterThanOrEqual(3);
    });

    it('should form a connected graph across entity types', () => {
      // Build adjacency from relations (undirected) and verify all entity types are reachable
      const adj = new Map<string, Set<string>>();
      for (const et of TASK_STRUCTURE_FIXTURE.entityTypes) {
        adj.set(et, new Set());
      }
      for (const rel of TASK_STRUCTURE_FIXTURE.relations) {
        adj.get(rel.from)!.add(rel.to);
        adj.get(rel.to)!.add(rel.from);
      }

      const visited = new Set<string>();
      const queue = [TASK_STRUCTURE_FIXTURE.entityTypes[0]];
      while (queue.length > 0) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const neighbor of adj.get(current) ?? []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }

      expect(visited.size).toBe(TASK_STRUCTURE_FIXTURE.entityTypes.length);
    });
  });

  describe('Knowledge Base Fixture', () => {
    it('should have at least 5 fragments', () => {
      expect(KNOWLEDGE_BASE_FIXTURE.length).toBeGreaterThanOrEqual(5);
    });

    it('should cover multiple relation types from the Task Structure', () => {
      const kbRelationTypes = new Set(KNOWLEDGE_BASE_FIXTURE.map(f => f.relation));
      const tsRelationTypes = new Set(TASK_STRUCTURE_FIXTURE.relations.map(r => r.type));
      const covered = [...kbRelationTypes].filter(r => tsRelationTypes.has(r));
      expect(covered.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('INQUIRY_REQUIRED scenario', () => {
    it('should have no KB fragments for the TREATS relation, triggering INQUIRY_REQUIRED', () => {
      // The TREATS relation exists in the Task Structure but has no KB fragments
      const treatsRelation = TASK_STRUCTURE_FIXTURE.relations.find(r => r.type === 'TREATS');
      expect(treatsRelation).toBeTruthy();

      const treatsFragments = KNOWLEDGE_BASE_FIXTURE.filter(f => f.relation === 'TREATS');
      expect(treatsFragments.length).toBe(0);
    });
  });

  describe('Multi-node PATCH scenario', () => {
    it('should have 2+ KB fragments for "Fever" + "CAUSES", producing a multi-node PATCH', () => {
      const feverCausesFragments = KNOWLEDGE_BASE_FIXTURE.filter(
        f => f.subject === 'Fever' && f.relation === 'CAUSES'
      );
      expect(feverCausesFragments.length).toBeGreaterThanOrEqual(2);
    });
  });
});
