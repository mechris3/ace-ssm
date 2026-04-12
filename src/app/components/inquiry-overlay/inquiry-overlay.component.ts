import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { EngineState } from '../../models/engine.model';
import { ISSMNode } from '../../models/ssm.model';

export type FindingAction = 'confirm' | 'refute' | 'skip';

export interface FindingResolution {
  nodeId: string;
  nodeLabel: string;
  action: FindingAction;
}

@Component({
  selector: 'app-inquiry-overlay',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./inquiry-overlay.component.css'],
  template: `
    <div class="inquiry-overlay" *ngIf="engineState === INQUIRY_STATE && pendingNode">
      <div class="inquiry-panel">
        <h4 class="inquiry-title">Observation Required</h4>
        <p class="inquiry-question">
          <strong>{{ pendingNode.label }}</strong>. Can you confirm this finding?
        </p>
        <div class="inquiry-buttons">
          <button class="inquiry-btn btn-confirm" (click)="onAction('confirm')">Confirm</button>
          <button class="inquiry-btn btn-refute" (click)="onAction('refute')">Refute</button>
          <button class="inquiry-btn btn-skip" (click)="onAction('skip')">Unknown / Skip</button>
        </div>
      </div>
    </div>
  `,
})
export class InquiryOverlayComponent {
  readonly INQUIRY_STATE = EngineState.INQUIRY;

  @Input() engineState: EngineState = EngineState.IDLE;
  @Input() pendingNode: ISSMNode | null = null;

  @Output() onResolve = new EventEmitter<FindingResolution>();

  onAction(action: FindingAction): void {
    if (!this.pendingNode) { return; }
    this.onResolve.emit({
      nodeId: this.pendingNode.id,
      nodeLabel: this.pendingNode.label,
      action,
    });
  }
}
