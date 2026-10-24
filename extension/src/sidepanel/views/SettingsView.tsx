import { useEffect, useState } from 'react';
import { createModelClient } from '../../shared/model';
import { modelOptions, type ModelOption } from '../../shared/model/checks';
import { presetFor } from '../../shared/model/presets';
import {
  loadModelSettings,
  saveModelSettings,
  type ModelSettings,
  type SlotConfig,
  type SlotName,
} from '../../shared/model/settings';
import { CopyCommand } from '../components/CopyCommand';

export function SettingsView() {
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [options, setOptions] = useState<ModelOption[]>(modelOptions([]));
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const loaded = await loadModelSettings();
      setSettings(loaded);
      try {
        setOptions(modelOptions(await createModelClient(loaded).listModels()));
      } catch {
        // Model server not reachable: show presets only. Onboarding explains how to fix it.
      }
    })();
  }, []);

  if (!settings) return <p role="status">Loading…</p>;

  const update = (patch: Partial<ModelSettings>) => {
    setSettings({ ...settings, ...patch });
    setMessage(null);
  };

  async function save() {
    if (!settings) return;
    const result = await saveModelSettings(settings);
    setMessage(result.ok ? { kind: 'ok', text: 'Saved.' } : { kind: 'error', text: result.error });
  }

  return (
    <section aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>

      <fieldset>
        <legend>Model server</legend>
        <label className="field">
          <span>Address</span>
          <input
            type="url"
            value={settings.endpoint}
            onChange={(e) => update({ endpoint: e.target.value })}
            aria-describedby="endpoint-help"
          />
        </label>
        <p id="endpoint-help" className="muted">
          Must be localhost or 127.0.0.1. Your data stays on this computer.
        </p>
        <div role="radiogroup" aria-label="Server type" className="radio-row">
          <label>
            <input
              type="radio"
              name="apiStyle"
              checked={settings.apiStyle === 'ollama'}
              onChange={() => update({ apiStyle: 'ollama' })}
            />
            Ollama
          </label>
          <label>
            <input
              type="radio"
              name="apiStyle"
              checked={settings.apiStyle === 'openai'}
              onChange={() => update({ apiStyle: 'openai' })}
            />
            OpenAI-compatible (LM Studio, llama.cpp)
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Models</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.sameModelForBoth}
            onChange={(e) => update({ sameModelForBoth: e.target.checked })}
          />
          Use the same model for both
        </label>
        <SlotEditor
          slot="mapping"
          title={settings.sameModelForBoth ? 'Model' : 'Mapping model (reads forms and your CV)'}
          value={settings.mapping}
          options={options}
          onChange={(mapping) => update({ mapping })}
        />
        {!settings.sameModelForBoth && (
          <SlotEditor
            slot="drafting"
            title="Drafting model (writes longer answers)"
            value={settings.drafting}
            options={options}
            onChange={(drafting) => update({ drafting })}
          />
        )}
        {options
          .filter((o) => o.preset && !o.installed)
          .map((o) => (
            <div key={o.model} className="missing-model">
              <p className="muted">
                {o.label} is not downloaded. {o.note}
              </p>
              <CopyCommand command={o.pullCommand} />
            </div>
          ))}
      </fieldset>

      <div className="actions">
        <button type="button" className="primary" onClick={save}>
          Save settings
        </button>
      </div>
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'error' : 'muted'}>
          {message.text}
        </p>
      )}
    </section>
  );
}

const CUSTOM = '__custom__';

function SlotEditor(props: {
  slot: SlotName;
  title: string;
  value: SlotConfig;
  options: ModelOption[];
  onChange: (value: SlotConfig) => void;
}) {
  const { slot, title, value, options, onChange } = props;
  const known = options.some((o) => o.model === value.model);
  const [custom, setCustom] = useState(!known);

  function choose(model: string) {
    if (model === CUSTOM) {
      setCustom(true);
      return;
    }
    setCustom(false);
    onChange({ model, numCtx: presetFor(model)?.numCtx ?? value.numCtx });
  }

  return (
    <div className="slot">
      <label className="field">
        <span>{title}</span>
        <select value={custom ? CUSTOM : value.model} onChange={(e) => choose(e.target.value)}>
          {options.map((o) => (
            <option key={o.model} value={o.model} disabled={!o.installed}>
              {o.label}
              {o.installed ? '' : ' (not downloaded)'}
            </option>
          ))}
          <option value={CUSTOM}>Other model name…</option>
        </select>
      </label>
      {custom && (
        <label className="field">
          <span>Model name</span>
          <input
            type="text"
            value={value.model}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
            id={`${slot}-model-name`}
          />
        </label>
      )}
      <label className="field">
        <span>Context size (num_ctx)</span>
        <input
          type="number"
          min={2048}
          max={131072}
          step={1024}
          value={value.numCtx}
          onChange={(e) => onChange({ ...value, numCtx: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
