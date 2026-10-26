import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

// Renders docs/brand/lazy-apply-sloth.svg to the PNG sizes Chrome uses (WXT picks up public/icon/<size>.png).
const root = resolve(import.meta.dirname, '..');
const svg = readFileSync(resolve(root, 'docs/brand/lazy-apply-sloth.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: resolve(root, `extension/public/icon/${size}.png`), omitBackground: true });
}
await browser.close();
