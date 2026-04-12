import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
import { ISSMNode } from '../../models/ssm.model';
import { IReasoningStep } from '../../models/strategy.model';
import { selectRecentHistory, selectRenderedHistory, selectPendingFindingNode } from '../../store/ssm/ssm.selectors';
import { first } from 'rxjs/operators';

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
  resetOnLoad = true;

  /** Node ID to highlight in the graph (set when user clicks an Audit Trail step). */
  highlightNodeId: string | null = null;

  /** Node ID to scroll to in the Audit Trail (set when user clicks a graph node). */
  scrollToNodeId: string | null = null;

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
