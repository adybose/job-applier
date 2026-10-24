import { ModelClient } from './client';
import type { ModelSettings } from './settings';
import { IdbStatsSink } from './stats';

export function createModelClient(settings: ModelSettings): ModelClient {
  return new ModelClient(settings, {
    fetch: globalThis.fetch.bind(globalThis),
    now: () => performance.now(),
    stats: new IdbStatsSink(),
  });
}
