/**
 * obix-template-node — Core Public API
 */

export * from './types.js';
export * from './runtime.js';
export * from './policies.js';

import { AppRuntime } from './runtime.js';
import { validateCompliance, checkEscalations, getEngagementReport } from './policies.js';
import { AppState } from './types.js';

/**
 * Create a fully wired app instance.
 *
 * @example
 * const app = createApp();
 * app.dispatch({ type: 'CREATE_TEAM', payload: { ... } });
 * const state = app.state();
 */
export function createApp(initial?: Partial<AppState>) {
  const runtime = new AppRuntime(initial);

  return {
    runtime,
    state: () => runtime.getState(),
    dispatch: (action: Parameters<AppRuntime['dispatch']>[0]) => runtime.dispatch(action),
    subscribe: (cb: (state: AppState) => void) => runtime.subscribe(cb),
    validateCompliance: () => validateCompliance(runtime.getState()),
    checkEscalations: () => checkEscalations(runtime.getState()),
    getEngagementReport: (teamId: string) => getEngagementReport(runtime.getState(), teamId),
  };
}

export type App = ReturnType<typeof createApp>;
