/**
 * @fileoverview Application Configuration — NgRx store registration and providers.
 *
 * This is the Angular application's root configuration. It registers all five
 * NgRx store slices (one per layer of the Data Trinity, plus Strategy and Engine FSM)
 * and sets up the effects system (currently empty — all orchestration is in the
 * Inference Engine service, not in NgRx effects).
 *
 * @remarks
 * DESIGN DECISION: `provideEffects([])` is called with an empty array rather than
 * being omitted entirely. This is intentional — it initializes the NgRx effects
 * infrastructure so that effects can be added later (e.g., for async KB loading
 * from a server) without changing the app configuration. The empty array has
 * zero runtime cost.
 *
 * DESIGN DECISION: All five store slices are registered at the root level (not
 * lazy-loaded) because the inference engine needs all of them simultaneously.
 * There's no benefit to lazy-loading store slices when the engine reads from
 * all five on every pulse.
 *
 * DESIGN DECISION: `provideZoneChangeDetection({ eventCoalescing: true })` enables
 * event coalescing, which batches multiple synchronous change detection triggers
 * into a single cycle. This is important when the engine dispatches multiple
 * actions in rapid succession (e.g., `applyPatch` + `engineResolved`).
 */

import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { taskStructureReducer } from './store/task-structure/task-structure.reducer';
import { knowledgeBaseReducer } from './store/knowledge-base/knowledge-base.reducer';
import { ssmReducer } from './store/ssm/ssm.reducer';
import { strategyReducer } from './store/strategy/strategy.reducer';
import { engineReducer } from './store/engine/engine.reducer';

/**
 * Root application configuration.
 *
 * Registers all NgRx store slices corresponding to the five state domains:
 * - `taskStructure` — Layer 1: The Rules (domain grammar)
 * - `knowledgeBase` — Layer 2: The Library (domain facts)
 * - `ssm` — Layer 3: Working Memory (evolving hypothesis graph)
 * - `strategy` — Heuristic weights and timing configuration
 * - `engine` — FSM lifecycle state (IDLE/THINKING/INQUIRY/RESOLVED)
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideStore({
      taskStructure: taskStructureReducer,
      knowledgeBase: knowledgeBaseReducer,
      ssm: ssmReducer,
      strategy: strategyReducer,
      engine: engineReducer,
    }),
    // Empty effects array — initializes the effects infrastructure for future use.
    // All current orchestration lives in InferenceEngineService, not in effects.
    provideEffects([]),
  ],
};
