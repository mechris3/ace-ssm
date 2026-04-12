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
import { InquiryOverlayComponent, InquiryResolution } from '../inquiry-overlay/inquiry-overlay.component';
import { ISSMNode } from '../../models/ssm.model';
import { IReasoningStep } from '../../models/strategy.model';
import { selectRecentHistory, selectRenderedHistory } from '../../store/ssm/ssm.selectors';

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
  resetOnLoad = true;

  /** Node ID to highlight in the graph (set when user clicks an Audit Trail step). */
  highlightNodeId: string | null = null;

  /** Node ID to scroll to in the Audit Trail (set when user clicks a graph node). */
  scrollToNodeId: string | null = null;

  getSelectedNode(vm: IViewModel): ISSMNode | null {
    if (!vm.selectedNodeId) { return null; }
    return vm.ssm.nodes.find(n => n.id === vm.selectedNodeId) ?? null;
  }

  getQuestionNode(vm: IViewModel): ISSMNode | null {
    return vm.ssm.nodes.find(n => n.status === 'QUESTION') ?? null;
  }

  handleLoadTaskStructure(json: string, vm: IViewModel): void {
    if (this.resetOnLoad) { this.facade.reset(); }
    this.facade.loadTaskStructure(json);
  }

  handleLoadKnowledgeBase(json: string, vm: IViewModel): void {
    if (this.resetOnLoad) { this.facade.reset(); }
    this.facade.loadKnowledgeBase(json);
  }

  handleResolve(resolution: InquiryResolution): void {
    this.facade.resolveInquiry(
      resolution.nodeId,
      resolution.status,
      resolution.label,
      resolution.auditText,
    );
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
