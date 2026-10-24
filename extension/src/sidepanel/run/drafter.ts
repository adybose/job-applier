import { draftAnswer, shouldDraft } from '../../shared/agent/drafter';
import type { ModelClient } from '../../shared/model/client';
import { resolveSlot, type ModelSettings } from '../../shared/model/settings';
import type { Drafter } from './runner';

/** Stage 3 with the Drafting model slot (spec 07 R-MR-6). `force` is used by "Regenerate". */
export function createDrafter(client: ModelClient, settings: ModelSettings): Drafter {
  return {
    draft: (field, profile, jobDescription, force = false) =>
      force || shouldDraft(field)
        ? draftAnswer(client, field, profile, jobDescription, resolveSlot(settings, 'drafting').numCtx)
        : Promise.resolve(undefined),
  };
}
