import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 11 AC-DS-4: the landing page collects nothing and loads nothing from elsewhere.
const html = readFileSync(join(import.meta.dirname, 'index.html'), 'utf8');

describe('landing page', () => {
  it('has no forms, scripts or analytics', () => {
    expect(html).not.toMatch(/<form/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/google-analytics|gtag|googletagmanager|plausible|segment|mixpanel|hotjar/i);
  });

  it('loads no remote stylesheets, fonts or images', () => {
    expect(html).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
    expect(html).not.toMatch(/<(img|source|iframe)[^>]+src=["']https?:/i);
    expect(html).not.toMatch(/@import|fonts\.googleapis/i);
  });

  it('shows the install steps', () => {
    expect(html).toContain('ollama pull gemma3:4b-it-qat');
    expect(html).toContain('extension/output/chrome-mv3');
  });
});
