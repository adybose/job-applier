import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_MODEL_SETTINGS, loadModelSettings, resolveSlot, saveModelSettings } from './settings';
import { LOOPBACK_ERROR } from './loopback';

describe('model settings', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('defaults to Ollama on localhost with the 4B preset for both slots', async () => {
    const settings = await loadModelSettings();
    expect(settings.endpoint).toBe('http://localhost:11434');
    expect(settings.apiStyle).toBe('ollama');
    expect(settings.sameModelForBoth).toBe(true);
    expect(settings.mapping).toEqual({ model: 'gemma3:4b-it-qat', numCtx: 16384 });
  });

  // AC-PS-1
  it('refuses to save a non-loopback endpoint', async () => {
    const result = await saveModelSettings({ ...DEFAULT_MODEL_SETTINGS, endpoint: 'http://example.com:11434' });
    expect(result).toEqual({ ok: false, error: LOOPBACK_ERROR });
    expect(LOOPBACK_ERROR).toBe('The model must run on this computer (localhost).');
    expect((await loadModelSettings()).endpoint).toBe('http://localhost:11434');
  });

  it('saves and reloads valid settings', async () => {
    const next = {
      ...DEFAULT_MODEL_SETTINGS,
      endpoint: 'http://127.0.0.1:1234',
      apiStyle: 'openai' as const,
      sameModelForBoth: false,
      drafting: { model: 'gemma3:12b-it-qat', numCtx: 8192 },
    };
    expect(await saveModelSettings(next)).toEqual({ ok: true });
    expect(await loadModelSettings()).toEqual(next);
  });

  it('uses the mapping slot for drafting when "same model for both" is on', () => {
    const settings = {
      ...DEFAULT_MODEL_SETTINGS,
      sameModelForBoth: true,
      drafting: { model: 'gemma3:12b-it-qat', numCtx: 8192 },
    };
    expect(resolveSlot(settings, 'drafting')).toEqual(settings.mapping);
    expect(resolveSlot({ ...settings, sameModelForBoth: false }, 'drafting')).toEqual(settings.drafting);
  });
});
