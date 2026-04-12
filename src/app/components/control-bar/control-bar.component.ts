import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { EngineState } from '../../models/engine.model';

@Component({
  selector: 'app-control-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './control-bar.component.html',
  styleUrls: ['./control-bar.component.css'],
})
export class ControlBarComponent {
  @Input() engineState: EngineState = EngineState.IDLE;
  @Input() pacerDelay: number = 500;

  @Output() onRun = new EventEmitter<void>();
  @Output() onStep = new EventEmitter<void>();
  @Output() onPause = new EventEmitter<void>();
  @Output() onReset = new EventEmitter<void>();
  @Output() onSpeedChange = new EventEmitter<number>();

  get runDisabled(): boolean {
    return this.engineState === EngineState.THINKING
      || this.engineState === EngineState.INQUIRY
      || this.engineState === EngineState.RESOLVED;
  }

  get stepDisabled(): boolean {
    return this.engineState === EngineState.THINKING
      || this.engineState === EngineState.INQUIRY
      || this.engineState === EngineState.RESOLVED;
  }

  get pauseDisabled(): boolean {
    return this.engineState === EngineState.IDLE
      || this.engineState === EngineState.INQUIRY
      || this.engineState === EngineState.RESOLVED;
  }

  onSliderInput(event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    this.onSpeedChange.emit(value);
  }
}
