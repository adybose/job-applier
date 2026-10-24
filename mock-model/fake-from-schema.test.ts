import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fakeFromSchema } from './fake-from-schema';

describe('fakeFromSchema', () => {
  it('produces a value that passes the zod schema it was generated from', () => {
    const Schema = z.object({
      actions: z.array(z.object({ field_id: z.string(), confidence: z.number().min(0).max(1) })),
      mode: z.enum(['fill', 'skip']),
      ok: z.boolean(),
      note: z.string().nullable(),
    });
    const value = fakeFromSchema(z.toJSONSchema(Schema));
    expect(Schema.safeParse(value).success).toBe(true);
  });
});
