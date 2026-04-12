import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IStrategyWeights } from '../../models/strategy.model';

@Component({
  selector: 'app-strategy-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './strategy-panel.component.html',
  styleUrls: ['./strategy-panel.component.css'],
})
export class StrategyPanelComponent {
  @Input() weights: IStrategyWeights = { urgency: 1, parsimony: 1, costAversion: 1 };
  @Output() onWeightsChange = new EventEmitter<IStrategyWeights>();

  onSlider(field: keyof IStrategyWeights, event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    this.onWeightsChange.emit({ ...this.weights, [field]: value });
  }
}
