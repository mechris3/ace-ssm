import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ISSMNode, ISSMEdge } from '../../models/ssm.model';

interface LinkInfo {
  direction: 'outgoing' | 'incoming';
  relationType: string;
  connectedNodeId: string;
  connectedNodeLabel: string;
}

@Component({
  selector: 'app-node-inspector',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./node-inspector.component.css'],
  template: `
    <!-- Selected node detail view -->
    <ng-container *ngIf="selectedNode; else overviewTpl">
      <div class="inspector-header">
        <h3>Node Inspector</h3>
        <button class="clear-btn" (click)="onClearSelection.emit()">Clear Selection</button>
      </div>
      <div class="node-id">{{ selectedNode.id }}</div>
      <div class="node-label">{{ selectedNode.label }}</div>
      <div class="badges">
        <span class="badge badge-type">{{ selectedNode.type }}</span>
        <span class="badge" [ngClass]="'badge-status-' + selectedNode.status">{{ selectedNode.status }}</span>
      </div>
      <div class="links-section" *ngIf="links.length > 0">
        <h4>Links</h4>
        <div class="link-item" *ngFor="let link of links">
          <span class="link-direction">{{ link.direction === 'outgoing' ? '→' : '←' }}</span>
          <span class="link-relation">{{ link.relationType }}</span>
          <span class="link-node" (click)="onNodeLinkClick.emit(link.connectedNodeId)">{{ link.connectedNodeLabel }}</span>
        </div>
      </div>
    </ng-container>

    <!-- Overview when no node selected -->
    <ng-template #overviewTpl>
      <div class="overview">
        <h3>System Overview</h3>
        <div class="overview-counts">
          <div class="count-row">
            <span class="count-label badge-status-HYPOTHESIS" style="background:none;">Hypothesis</span>
            <span class="count-value" style="color:var(--color-hypothesis)">{{ hypothesisCount }}</span>
          </div>
          <div class="count-row">
            <span class="count-label badge-status-CONFIRMED" style="background:none;">Confirmed</span>
            <span class="count-value" style="color:var(--color-confirmed)">{{ confirmedCount }}</span>
          </div>
          <div class="count-row">
            <span class="count-label badge-status-QUESTION" style="background:none;">Question</span>
            <span class="count-value" style="color:var(--color-question)">{{ questionCount }}</span>
          </div>
          <div class="count-row">
            <span class="count-label badge-status-UNKNOWN" style="background:none;">Unknown</span>
            <span class="count-value" style="color:var(--color-unknown)">{{ unknownCount }}</span>
          </div>
        </div>
      </div>
    </ng-template>
  `,
})
export class NodeInspectorComponent {
  @Input() selectedNode: ISSMNode | null = null;
  @Input() edges: ISSMEdge[] = [];
  @Input() nodes: ISSMNode[] = [];

  @Output() onClearSelection = new EventEmitter<void>();
  @Output() onNodeLinkClick = new EventEmitter<string>();

  get links(): LinkInfo[] {
    if (!this.selectedNode) { return []; }
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    const result: LinkInfo[] = [];
    for (const edge of this.edges) {
      if (edge.source === this.selectedNode.id) {
        const target = nodeMap.get(edge.target);
        result.push({
          direction: 'outgoing',
          relationType: edge.relationType,
          connectedNodeId: edge.target,
          connectedNodeLabel: target?.label ?? edge.target,
        });
      } else if (edge.target === this.selectedNode.id) {
        const source = nodeMap.get(edge.source);
        result.push({
          direction: 'incoming',
          relationType: edge.relationType,
          connectedNodeId: edge.source,
          connectedNodeLabel: source?.label ?? edge.source,
        });
      }
    }
    return result;
  }

  get hypothesisCount(): number {
    return this.nodes.filter(n => n.status === 'HYPOTHESIS').length;
  }

  get confirmedCount(): number {
    return this.nodes.filter(n => n.status === 'CONFIRMED').length;
  }

  get questionCount(): number {
    return this.nodes.filter(n => n.status === 'QUESTION').length;
  }

  get unknownCount(): number {
    return this.nodes.filter(n => n.status === 'UNKNOWN').length;
  }
}
