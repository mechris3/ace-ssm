import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IStrategyWeights } from '../../models/strategy.model';
import { StrategyPanelComponent } from '../strategy-panel/strategy-panel.component';

@Component({
  selector: 'app-domain-console',
  standalone: true,
  imports: [CommonModule, FormsModule, StrategyPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './domain-console.component.html',
  styleUrls: ['./domain-console.component.css'],
})
export class DomainConsoleComponent {
  @Input() entityTypes: string[] = [];
  @Input() taskStructureError: string | null = null;
  @Input() kbError: string | null = null;
  @Input() weights: IStrategyWeights = { urgency: 1, parsimony: 1, costAversion: 1 };

  @Output() onLoadTaskStructure = new EventEmitter<string>();
  @Output() onLoadKnowledgeBase = new EventEmitter<string>();
  @Output() onSeedFinding = new EventEmitter<{ label: string; type: string }>();
  @Output() onResetOnLoadChange = new EventEmitter<boolean>();
  @Output() onWeightsChange = new EventEmitter<IStrategyWeights>();

  taskStructureJson = '';
  kbJson = '';
  seedLabel = '';
  seedType = '';
  resetOnLoad = true;
  collapsed = false;

  loadTaskStructure(): void {
    this.onLoadTaskStructure.emit(this.taskStructureJson);
  }

  loadKnowledgeBase(): void {
    this.onLoadKnowledgeBase.emit(this.kbJson);
  }

  addSeedFinding(): void {
    if (this.seedLabel && this.seedType) {
      this.onSeedFinding.emit({ label: this.seedLabel, type: this.seedType });
      this.seedLabel = '';
    }
  }

  toggleResetOnLoad(): void {
    this.resetOnLoad = !this.resetOnLoad;
    this.onResetOnLoadChange.emit(this.resetOnLoad);
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
  }
}
