/**
 * @fileoverview Diagnostic Differential Panel — displays competing candidate solutions.
 * [Ref: Paper Sec 3.2.1 — G_g global goal constraint]
 *
 * Shows a ranked list of Condition-type nodes from the SSM, each with a
 * coverage indicator showing how many seed findings it explains.
 */
import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IDifferentialEntry } from '../../store/ssm/ssm.selectors';

@Component({
  selector: 'app-differential-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; font-family: var(--font-sans); font-size: 13px; color: var(--text-primary); }
    .diff-header { padding: 8px 12px; font-size: 14px; font-weight: 600; border-bottom: 1px solid var(--border-color); }
    .diff-list { padding: 8px; }
    .diff-entry { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; margin-bottom: 4px; background: var(--bg-tertiary); border: 1px solid var(--border-color); }
    .diff-entry.complete { border-color: var(--color-confirmed); }
    .diff-label { flex: 1; font-weight: 500; }
    .diff-status { font-size: 11px; font-family: var(--font-mono); }
    .diff-bar { width: 60px; height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden; }
    .diff-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .diff-bar-fill.partial { background: var(--color-hypothesis); }
    .diff-bar-fill.full { background: var(--color-confirmed); }
    .diff-badge { font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
    .badge-winner { background: rgba(52, 211, 153, 0.2); color: var(--color-confirmed); }
    .badge-candidate { background: var(--bg-secondary); color: var(--text-muted); }
    .empty { padding: 12px; color: var(--text-muted); text-align: center; font-size: 12px; }
  `],
  template: `
    <div class="diff-header">Diagnostic Differential</div>
    <div class="diff-list" *ngIf="entries.length > 0; else emptyTpl">
      <div class="diff-entry" *ngFor="let entry of entries" [class.complete]="entry.isComplete">
        <span class="diff-label">{{ entry.node.label }}</span>
        <div class="diff-bar">
          <div class="diff-bar-fill"
               [class.partial]="!entry.isComplete"
               [class.full]="entry.isComplete"
               [style.width.%]="entry.totalSeedCount > 0 ? (entry.coveredSeedCount / entry.totalSeedCount) * 100 : 0">
          </div>
        </div>
        <span class="diff-status">{{ entry.coveredSeedCount }}/{{ entry.totalSeedCount }} · CF {{ (entry.node.cf ?? 0) | number:'1.2-2' }}</span>
        <span class="diff-badge" [class.badge-winner]="entry.isComplete" [class.badge-candidate]="!entry.isComplete">
          {{ entry.isComplete ? 'WINNER' : 'candidate' }}
        </span>
      </div>
    </div>
    <ng-template #emptyTpl>
      <div class="empty">No candidates yet</div>
    </ng-template>
  `,
})
export class DifferentialPanelComponent {
  @Input() entries: IDifferentialEntry[] = [];
}
