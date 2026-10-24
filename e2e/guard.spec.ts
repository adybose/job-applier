import { expect, test } from '@playwright/test';
import { findViolations } from './guard';

test('findViolations allows only the extension and the configured model origins', () => {
  const id = 'abcdefghijklmnopabcdefghijklmnop';
  const violations = findViolations(
    [
      { url: `chrome-extension://${id}/sidepanel.html`, source: 'extension-page' },
      { url: 'http://127.0.0.1:11435/api/chat', source: 'service-worker' },
      { url: 'http://127.0.0.1:4173/fixture.html', source: 'extension-page' },
      { url: 'http://localhost:11435/api/chat', source: 'service-worker' },
      { url: 'https://example.com/', source: 'service-worker' },
      { url: 'chrome-extension://otherextensionidotherextensionid/x.js', source: 'extension-page' },
      { url: 'http://localhost:11434/api/tags', source: 'extension-page' },
      { url: 'http://localhost:11999/api/tags', source: 'extension-page' },
    ],
    id,
    ['http://127.0.0.1:11435', 'http://localhost:11434'],
  );
  expect(violations.map((v) => v.url)).toEqual([
    'http://127.0.0.1:4173/fixture.html',
    'http://localhost:11435/api/chat',
    'https://example.com/',
    'chrome-extension://otherextensionidotherextensionid/x.js',
    'http://localhost:11999/api/tags',
  ]);
});
