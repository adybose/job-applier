import type { ModelClient } from '../../shared/model/client';
import type { ModelSettings } from '../../shared/model/settings';
import type { Drafter } from './runner';

/** Stage 3 drafting arrives in T14; until then free-text fields become questions or are skipped. */
export function createDrafter(_client: ModelClient, _settings: ModelSettings): Drafter | undefined {
  return undefined;
}
