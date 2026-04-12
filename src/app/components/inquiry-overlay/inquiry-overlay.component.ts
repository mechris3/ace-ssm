import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EngineState } from '../../models/engine.model';
import { IGoal, ISSMNode, NodeStatus } from '../../models/ssm.model';

export interface InquiryResolution {
  nodeId: string;
  status: NodeStatus;
  label: string | null;
  auditText: string;
}

@Component({
  selector: 'app-inquiry-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./inquiry-overlay.component.css'],
  template: `
    <div class="inquiry-overlay" *ngIf="engineState === INQUIRY_STATE">
      <div class="inquiry-panel">
        <h4 class="inquiry-title">Inquiry Required</h4>
        <p class="inquiry-question" *ngIf="activeGoal">
          Does <strong>{{ activeGoal.anchorLabel }}</strong> have a
          <strong>{{ activeGoal.targetRelation }}</strong> relationship?
        </p>
        <div class="inquiry-buttons" *ngIf="!showLabelInput">
          <button class="inquiry-btn btn-yes" (click)="onYes()">Yes (Confirm)</button>
          <button class="inquiry-btn btn-no" (click)="onNo()">No (Refute)</button>
          <button class="inquiry-btn btn-unknown" (click)="onUnknown()">Unknown</button>
        </div>
        <div class="label-input-section" *ngIf="showLabelInput">
          <input
            class="label-input"
            type="text"
            placeholder="Enter label for confirmed entity..."
            [(ngModel)]="labelValue"
            (keyup.enter)="submitLabel()" />
          <button
            class="submit-btn"
            [disabled]="!labelValue.trim()"
            (click)="submitLabel()">
            Confirm
          </button>
        </div>
      </div>
    </div>
  `,
})
export class InquiryOverlayComponent {
  readonly INQUIRY_STATE = EngineState.INQUIRY;

  @Input() engineState: EngineState = EngineState.IDLE;
  @Input() activeGoal: IGoal | null = null;
  @Input() questionNode: ISSMNode | null = null;

  @Output() onResolve = new EventEmitter<InquiryResolution>();

  showLabelInput = false;
  labelValue = '';

  onYes(): void {
    this.showLabelInput = true;
  }

  onNo(): void {
    if (!this.questionNode) { return; }
    this.onResolve.emit({
      nodeId: this.questionNode.id,
      status: 'UNKNOWN',
      label: null,
      auditText: 'User confirmed absence',
    });
    this.resetState();
  }

  onUnknown(): void {
    if (!this.questionNode) { return; }
    this.onResolve.emit({
      nodeId: this.questionNode.id,
      status: 'UNKNOWN',
      label: null,
      auditText: 'User was unsure',
    });
    this.resetState();
  }

  submitLabel(): void {
    if (!this.questionNode || !this.labelValue.trim()) { return; }
    this.onResolve.emit({
      nodeId: this.questionNode.id,
      status: 'CONFIRMED',
      label: this.labelValue.trim(),
      auditText: `User confirmed: ${this.labelValue.trim()}`,
    });
    this.resetState();
  }

  private resetState(): void {
    this.showLabelInput = false;
    this.labelValue = '';
  }
}
