import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { FacadeService, IViewModel } from '../../services/facade.service';
import { ControlBarComponent } from '../control-bar/control-bar.component';
import { StatusBarComponent } from '../status-bar/status-bar.component';
import { DomainConsoleComponent } from '../domain-console/domain-console.component';
import { SSMGraphComponent } from '../ssm-graph/ssm-graph.component';
import { NodeInspectorComponent } from '../node-inspector/node-inspector.component';
import { AuditTrailComponent } from '../audit-trail/audit-trail.component';
import { InquiryOverlayComponent, FindingResolution } from '../inquiry-overlay/inquiry-overlay.component';
import { DifferentialPanelComponent } from '../differential-panel/differential-panel.component';
import { ISSMNode, ISSMEdge } from '../../models/ssm.model';
import { IReasoningStep } from '../../models/strategy.model';
import { IRelation } from '../../models/task-structure.model';
import { IKnowledgeFragment } from '../../models/knowledge-base.model';
import { selectRecentHistory, selectRenderedHistory, selectPendingFindingNode } from '../../store/ssm/ssm.selectors';
import { selectRelations } from '../../store/task-structure/task-structure.selectors';
import { selectAllFragments } from '../../store/knowledge-base/knowledge-base.selectors';
import { first } from 'rxjs/operators';

export type ViewMode = 'ssm' | 'taskStructure' | 'knowledgeBase';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ControlBarComponent,
    StatusBarComponent,
    DomainConsoleComponent,
    SSMGraphComponent,
    NodeInspectorComponent,
    AuditTrailComponent,
    InquiryOverlayComponent,
    DifferentialPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent {
  private store = inject(Store);
  facade = inject(FacadeService);
  vm$: Observable<IViewModel> = this.facade.viewModel$;
  renderedSteps$: Observable<IReasoningStep[]> = this.store.select(selectRenderedHistory);
  recentSteps$: Observable<IReasoningStep[]> = this.store.select(selectRecentHistory);
  pendingFindingNode$: Observable<ISSMNode | null> = this.store.select(selectPendingFindingNode);
  relations$: Observable<IRelation[]> = this.store.select(selectRelations);
  fragments$: Observable<IKnowledgeFragment[]> = this.store.select(selectAllFragments);
  resetOnLoad = true;

  /** Current view mode for the graph workspace. */
  readonly viewMode = signal<ViewMode>('ssm');

  /** Node ID to highlight in the graph (set when user clicks an Audit Trail step). */
  highlightNodeId: string | null = null;

  /** Node ID to scroll to in the Audit Trail (set when user clicks a graph node). */
  scrollToNodeId: string | null = null;

  /** Transform Task Structure entity types + relations into graph nodes/edges. */
  taskStructureToGraph(entityTypes: string[], relations: IRelation[]): { nodes: ISSMNode[]; edges: ISSMEdge[] } {
    const nodes: ISSMNode[] = entityTypes.map(t => ({
      id: `ts_${t}`,
      label: t,
      type: t,
      status: 'CONFIRMED' as const,
    }));
    const edges: ISSMEdge[] = relations.map((r, i) => ({
      id: `ts_edge_${i}`,
      source: `ts_${r.from}`,
      target: `ts_${r.to}`,
      relationType: r.type,
    }));
    return { nodes, edges };
  }

  /** Transform KB fragments into graph nodes/edges. */
  kbToGraph(fragments: IKnowledgeFragment[]): { nodes: ISSMNode[]; edges: ISSMEdge[] } {
    const nodeMap = new Map<string, ISSMNode>();
    const edges: ISSMEdge[] = [];

    for (const f of fragments) {
      if (!nodeMap.has(f.subject)) {
        nodeMap.set(f.subject, {
          id: `kb_${f.subject}`,
          label: f.subject,
          type: f.subjectType,
          status: 'CONFIRMED' as const,
        });
      }
      if (!nodeMap.has(f.object)) {
        nodeMap.set(f.object, {
          id: `kb_${f.object}`,
          label: f.object,
          type: f.objectType,
          status: 'HYPOTHESIS' as const,
        });
      }
      edges.push({
        id: `kb_edge_${f.id}`,
        source: `kb_${f.subject}`,
        target: `kb_${f.object}`,
        relationType: f.relation,
      });
    }

    return { nodes: Array.from(nodeMap.values()), edges };
  }

  /** Get the entity type of the active goal's anchor for cross-layer highlighting. */
  getHighlightType(vm: IViewModel): string | null {
    if (!vm.activeGoal) { return null; }
    const anchor = vm.ssm.nodes.find(n => n.id === vm.activeGoal!.anchorNodeId);
    return anchor?.type ?? null;
  }

  getSelectedNode(vm: IViewModel): ISSMNode | null {
    if (!vm.selectedNodeId) { return null; }
    return vm.ssm.nodes.find(n => n.id === vm.selectedNodeId) ?? null;
  }

  handleLoadDomain(json: string): void {
    if (this.resetOnLoad) { this.facade.reset(); }
    this.facade.loadDomain(json);
  }

  handleSaveDomain(): void {
    this.facade.exportDomain('session-' + Date.now(), 'Diagnostic Session')
      .pipe(first())
      .subscribe(json => {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ace-ssm-session-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  handleResolve(resolution: FindingResolution): void {
    switch (resolution.action) {
      case 'confirm':
        this.facade.confirmFinding(resolution.nodeId, resolution.nodeLabel);
        break;
      case 'refute':
        this.facade.refuteFinding(resolution.nodeId, resolution.nodeLabel);
        break;
      case 'skip':
        this.facade.skipFinding(resolution.nodeId, resolution.nodeLabel);
        break;
    }
  }

  /** Audit Trail step clicked → highlight the anchor node in the graph + select it. */
  handleStepClick(step: IReasoningStep): void {
    const anchorNodeId = step.selectedGoal.anchorNodeId;
    this.highlightNodeId = anchorNodeId;
    this.scrollToNodeId = null;
    this.facade.selectNode(anchorNodeId);
  }

  /** Graph node clicked → scroll Audit Trail to related step + select the node. */
  handleNodeClick(nodeId: string): void {
    this.scrollToNodeId = nodeId;
    this.highlightNodeId = null;
    this.facade.selectNode(nodeId);
  }
}
