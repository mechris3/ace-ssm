/**
 * @fileoverview App Component — the blank shell that activates the inference engine.
 *
 * This component serves two purposes:
 * 1. It is the Angular application's root component (required by the framework).
 * 2. It subscribes to the Inference Engine's `orchestrate$` Observable, which
 *    activates the Triple-Operator cycle.
 *
 * The template is intentionally minimal — a single heading. The real UI
 * (D3.js visualization, controls) is planned for Spec #2. This component
 * exists solely to bootstrap the engine and manage its subscription lifecycle.
 *
 * @remarks
 * DESIGN DECISION: `orchestrate$` is subscribed here (not in a service constructor
 * or NgRx effect) because Angular's `takeUntilDestroyed()` ties the subscription
 * to the component's lifecycle. When the component is destroyed, the subscription
 * is automatically cleaned up — no manual unsubscribe needed, no orphaned timers.
 *
 * DESIGN DECISION: `ChangeDetectionStrategy.OnPush` is used because this component
 * has no template bindings that change — it's a static shell. OnPush prevents
 * unnecessary change detection cycles, which matters when the engine is running
 * at high pulse rates.
 */

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InferenceEngineService } from './services/inference-engine.service';
import { DashboardComponent } from './components/dashboard/dashboard.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DashboardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-dashboard></app-dashboard>`,
  styles: [],
})
export class AppComponent {
  private engine = inject(InferenceEngineService);

  constructor() {
    // Subscribe to the orchestration pipeline to activate the engine.
    // takeUntilDestroyed() ensures the subscription is cleaned up when
    // the component is destroyed, preventing memory leaks and orphaned timers.
    this.engine.orchestrate$.pipe(takeUntilDestroyed()).subscribe();
  }
}
