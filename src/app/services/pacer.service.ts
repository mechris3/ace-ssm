/**
 * @fileoverview Heartbeat Pacer Service — the sole driver of inference timing.
 *
 * The Pacer emits `pulse$` events that trigger the Triple-Operator cycle in
 * the Inference Engine. It supports three modes:
 * - **Run** — Continuous pulses at a configurable delay (for automated reasoning).
 * - **Step** — Emit exactly one pulse, then auto-pause (for debugging/teaching).
 * - **Pause** — Emit nothing (engine is idle or waiting for user input).
 *
 * The Pacer is intentionally decoupled from the NgRx store — it is a pure
 * RxJS service that the Inference Engine subscribes to. The store's Strategy
 * slice owns the delay value; the Pacer just applies it.
 *
 * @remarks
 * DESIGN DECISION: The Pacer is the sole timing driver. The Inference Engine
 * never calls operators directly — it only reacts to `pulse$` emissions.
 * This ensures that all inference is clock-driven and observable, which is
 * critical for the "Glass Box" transparency goal. A user can slow down the
 * pacer to watch reasoning unfold step by step.
 *
 * DESIGN DECISION: RxJS `timer()` is used instead of `setInterval()` because
 * `timer()` integrates naturally with the Observable pipeline and can be
 * cancelled cleanly via `switchMap`. This avoids the classic `setInterval`
 * cleanup problem and makes the pacer fully reactive.
 */

import { Injectable } from '@angular/core';
import { asyncScheduler, BehaviorSubject, EMPTY, Observable, of, timer } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PacerService {
  /**
   * Current operating mode. BehaviorSubject ensures late subscribers
   * immediately receive the current mode.
   */
  private mode$ = new BehaviorSubject<'run' | 'step' | 'pause'>('pause');

  /**
   * Current delay between pulses in milliseconds.
   * Updated via `setDelay()`, which clamps to [0, 2000].
   */
  private delay$ = new BehaviorSubject<number>(1500);

  /**
   * The main pulse stream that drives the Inference Engine.
   *
   * @remarks
   * DESIGN DECISION: `switchMap` on `mode$` ensures that mode changes
   * immediately cancel the previous timer/emission. If the user switches
   * from Run to Pause, the current timer is torn down instantly — no
   * stale pulses leak through.
   *
   * In Run mode, a nested `switchMap` on `delay$` ensures that delay
   * changes take effect within one cycle — the old timer is cancelled
   * and a new one starts with the updated interval.
   *
   * In Step mode, we emit exactly one `void` value, then schedule an
   * auto-pause on the `asyncScheduler`. The `asyncScheduler` is used
   * (rather than synchronous `this.mode$.next('pause')`) to avoid a
   * re-entrant BehaviorSubject emission — the pause must happen AFTER
   * the current `switchMap` projection completes, not during it.
   */
  public pulse$: Observable<void> = this.mode$.pipe(
    switchMap(mode => {
      // Pause mode: emit nothing. EMPTY completes immediately, so the
      // outer switchMap just waits for the next mode$ emission.
      if (mode === 'pause') return EMPTY;

      if (mode === 'step') {
        // Step mode: emit exactly one pulse, then auto-pause.
        return of(undefined as void).pipe(
          tap(() => {
            // DESIGN DECISION: Use asyncScheduler to defer the pause.
            // Without this, calling mode$.next('pause') synchronously inside
            // the switchMap projection would cause a re-entrant emission on
            // mode$ while the current emission is still being processed.
            // asyncScheduler pushes the pause to the next microtask.
            asyncScheduler.schedule(() => this.mode$.next('pause'));
          })
        );
      }

      // Run mode: continuous timer with configurable delay.
      // The inner switchMap on delay$ ensures delay changes restart the timer.
      return this.delay$.pipe(
        switchMap(d => timer(0, Math.max(0, d))),
        map(() => undefined as void)
      );
    })
  );

  /** Switch to Run mode — continuous pulses at the current delay. */
  run(): void { this.mode$.next('run'); }

  /** Switch to Step mode — emit one pulse, then auto-pause. */
  step(): void { this.mode$.next('step'); }

  /** Switch to Pause mode — stop emitting pulses immediately. */
  pause(): void { this.mode$.next('pause'); }

  /**
   * Update the delay between pulses.
   *
   * @param ms - Desired delay in milliseconds. Clamped to [0, 2000].
   *
   * @remarks
   * DESIGN DECISION: The delay is clamped silently rather than throwing
   * an error. This is a user-facing control — out-of-range values are
   * corrected to the nearest bound. The 2000ms upper limit prevents
   * the engine from appearing frozen; the 0ms lower limit allows
   * maximum-speed reasoning for batch processing.
   */
  setDelay(ms: number): void { this.delay$.next(Math.max(0, Math.min(2000, ms))); }
}
