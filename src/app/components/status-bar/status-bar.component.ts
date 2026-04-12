import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { EngineState } from '../../models/engine.model';

@Component({
  selector: 'app-status-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-bar.component.html',
  styleUrls: ['./status-bar.component.css'],
})
export class StatusBarComponent {
  @Input() engineState: EngineState = EngineState.IDLE;
  @Input() nodeCount: number = 0;
  @Input() edgeCount: number = 0;
  @Input() pacerDelay: number = 500;

  pulseActive = false;

  get badgeClass(): string {
    switch (this.engineState) {
      case EngineState.THINKING: return 'badge-thinking';
      case EngineState.INQUIRY: return 'badge-inquiry';
      case EngineState.RESOLVED: return 'badge-resolved';
      default: return 'badge-idle';
    }
  }

  triggerHeartbeat(): void {
    this.pulseActive = true;
    setTimeout(() => this.pulseActive = false, 300);
  }
}
