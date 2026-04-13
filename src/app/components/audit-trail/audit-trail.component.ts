import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { timer } from 'rxjs';
import { IReasoningStep } from '../../models/strategy.model';

@Component({
  selector: 'app-audit-trail',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./audit-trail.component.css'],
  template: `
    <div class="audit-header">
      <span>Audit Trail</span>
      <button
        class="copy-btn"
        [class.copied]="copyState() === 'copied'"
        (click)="copyToClipboard()"
        title="Copy audit trail as Markdown">
        <span *ngIf="copyState() === 'idle'">📋</span>
        <span *ngIf="copyState() === 'copied'">✓ Copied</span>
      </button>
    </div>
    <div
      class="audit-scroll-container"
      #scrollContainer
      (scroll)="onScroll()">
      <ng-container *ngIf="displayedSteps.length > 0; else emptyTpl">
        <div
          class="step-card"
          *ngFor="let step of displayedSteps; trackBy: trackByTimestamp"
          (click)="onStepClick.emit(step)">
          <div class="step-header">
            <span class="action-text">{{ step.actionTaken }}</span>
            <span class="score-badge">{{ step.totalScore | number:'1.1-1' }}</span>
            <span class="strategy-tag">{{ step.strategyName }}</span>
          </div>
          <div class="impact-bars" *ngIf="step.factors && step.factors.length > 0">
            <div class="impact-row" *ngFor="let factor of step.factors">
              <span class="impact-label" [title]="factor.label">{{ factor.label }}</span>
              <div class="impact-bar-track">
                <div
                  class="impact-bar"
                  [class.positive]="factor.impact >= 0"
                  [class.negative]="factor.impact < 0"
                  [style.width.%]="getBarWidth(step, factor.impact)">
                </div>
              </div>
              <span class="impact-value">{{ factor.impact >= 0 ? '+' : '' }}{{ factor.impact | number:'1.1-1' }}</span>
            </div>
          </div>
          <div class="prose-summary">
            {{ getProseSummary(step) }}
          </div>
          <div class="differential-snapshot" *ngIf="step.differentialSnapshot && step.differentialSnapshot.length > 0">
            <span class="snapshot-label">Differential:</span>
            <span
              class="snapshot-entry"
              *ngFor="let d of step.differentialSnapshot"
              [class.winner]="d.isComplete"
              [title]="d.label + ' — CF: ' + d.cf.toFixed(2)">
              {{ d.label }} ({{ d.coverage }}/{{ d.total }})
            </span>
          </div>
        </div>
      </ng-container>
      <ng-template #emptyTpl>
        <div class="empty-state">No reasoning steps yet</div>
      </ng-template>
    </div>
  `,
})
export class AuditTrailComponent implements OnChanges, AfterViewChecked {
  @Input() steps: IReasoningStep[] = [];
  @Input() allSteps: IReasoningStep[] = [];
  @Input() scrollToNodeId: string | null = null;

  @Output() onStepClick = new EventEmitter<IReasoningStep>();

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  /** Whether the user is at the bottom of the scroll container. */
  isAtBottom = true;

  /** Whether we need to auto-scroll after the next render. */
  private needsAutoScroll = false;

  /** Whether we need to scroll to a specific step after the next render. */
  private needsScrollToNode = false;

  /** Whether older steps are being shown (scroll-up demand). */
  private showingOlderSteps = false;

  get displayedSteps(): IReasoningStep[] {
    if (this.showingOlderSteps) {
      return this.allSteps;
    }
    return this.steps;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['steps']) {
      if (this.isAtBottom) {
        this.needsAutoScroll = true;
      }
    }
    if (changes['scrollToNodeId'] && this.scrollToNodeId) {
      this.needsScrollToNode = true;
    }
  }

  ngAfterViewChecked(): void {
    if (this.needsScrollToNode && this.scrollContainer && this.scrollToNodeId) {
      this.scrollToStep(this.scrollToNodeId);
      this.needsScrollToNode = false;
    } else if (this.needsAutoScroll && this.scrollContainer) {
      const el = this.scrollContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.needsAutoScroll = false;
    }
  }

  onScroll(): void {
    if (!this.scrollContainer) { return; }
    const el = this.scrollContainer.nativeElement;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.isAtBottom = distanceFromBottom <= 50;

    // Show older steps when user scrolls to top
    if (el.scrollTop === 0 && this.allSteps.length > this.steps.length) {
      this.showingOlderSteps = true;
    }

    // Resume showing only recent steps when back at bottom
    if (this.isAtBottom) {
      this.showingOlderSteps = false;
    }
  }

  getBarWidth(step: IReasoningStep, impact: number): number {
    const maxAbs = Math.max(...(step.factors ?? []).map(f => Math.abs(f.impact)), 1);
    return (Math.abs(impact) / maxAbs) * 100;
  }

  getProseSummary(step: IReasoningStep): string {
    const goal = step.selectedGoal;
    if (!goal) { return step.actionTaken; }
    const highestFactor = step.factors && step.factors.length > 0
      ? step.factors.reduce((a, b) => Math.abs(b.impact) > Math.abs(a.impact) ? b : a)
      : null;
    const goalDesc = `${goal.anchorLabel} → ${goal.targetRelation}`;
    if (highestFactor) {
      const sign = highestFactor.impact >= 0 ? '+' : '';
      return `Selected [${goalDesc}] because ${highestFactor.label} was dominant (${sign}${highestFactor.impact.toFixed(1)})`;
    }
    return `Selected [${goalDesc}]`;
  }

  trackByTimestamp(_index: number, step: IReasoningStep): number {
    return step.timestamp;
  }

  /** Reactive state for the copy button feedback. */
  readonly copyState = signal<'idle' | 'copied'>('idle');

  /** Copy the full audit trail as LLM-friendly Markdown to the clipboard. */
  copyToClipboard(): void {
    const md = this.formatAsMarkdown(this.allSteps);
    navigator.clipboard.writeText(md).then(() => {
      this.copyState.set('copied');
      timer(2000).subscribe(() => this.copyState.set('idle'));
    });
  }

  /** Format the full history as structured Markdown for LLM consumption. */
  private formatAsMarkdown(steps: IReasoningStep[]): string {
    if (!steps || steps.length === 0) { return '# Audit Trail\n\nNo reasoning steps recorded.'; }

    const lines: string[] = ['# Audit Trail', ''];
    const manualStrategies = new Set(['Manual']);

    steps.forEach((step, i) => {
      const isUserAction = manualStrategies.has(step.strategyName);
      const sectionType = isUserAction ? '👤 User Action' : '⚙️ System Pulse';
      const time = new Date(step.timestamp).toISOString().slice(11, 19);

      lines.push(`### Step ${i + 1} — ${sectionType}`);
      lines.push('');
      lines.push(`- **Time:** ${time}`);
      lines.push(`- **Strategy:** ${step.strategyName}`);
      lines.push(`- **Action:** ${step.actionTaken}`);

      if (step.selectedGoal) {
        const g = step.selectedGoal;
        lines.push(`- **Goal:** \`${g.kind}\` on \`${g.anchorLabel}\` → \`${g.targetRelation}\` (${g.direction})`);
      }

      lines.push(`- **Score:** ${step.totalScore.toFixed(1)}`);

      if (step.factors && step.factors.length > 0) {
        lines.push('- **Factors:**');
        for (const f of step.factors) {
          const sign = f.impact >= 0 ? '+' : '';
          lines.push(`  - ${f.label}: ${sign}${f.impact.toFixed(1)} — ${f.explanation}`);
        }
      }

      if (step.differentialSnapshot && step.differentialSnapshot.length > 0) {
        lines.push('- **Differential:**');
        for (const d of step.differentialSnapshot) {
          const badge = d.isComplete ? ' ✅ WINNER' : '';
          lines.push(`  - ${d.label}: ${d.coverage}/${d.total} seeds, CF=${d.cf.toFixed(2)}${badge}`);
        }
      }

      lines.push('');
    });

    return lines.join('\n');
  }

  /** Scroll to the most recent step referencing the given node ID as anchorNodeId. */
  private scrollToStep(nodeId: string): void {
    const steps = this.displayedSteps;
    // Find the most recent step referencing this node
    let targetIndex = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].selectedGoal.anchorNodeId === nodeId) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex < 0 || !this.scrollContainer) { return; }

    const container = this.scrollContainer.nativeElement;
    const cards = container.querySelectorAll('.step-card');
    if (targetIndex < cards.length) {
      cards[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}
