import { defineConfig } from '@playwright/test';

const useOllama = process.env.LAZYAPPLY_E2E_OLLAMA === '1';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: useOllama ? 300_000 : 60_000,
  reporter: [['list']],
  webServer: [
    ...(useOllama
      ? []
      : [
          {
            command: 'node mock-model/server.ts 11435',
            url: 'http://127.0.0.1:11435/api/version',
            reuseExistingServer: !process.env.CI,
          },
        ]),
    {
      command: 'node scripts/static-server.ts fixtures 4173',
      url: 'http://127.0.0.1:4173/README.md',
      reuseExistingServer: !process.env.CI,
    },
    {
      // Second origin for cross-origin iframe fixtures (Greenhouse embed).
      command: 'node scripts/static-server.ts fixtures 4174',
      url: 'http://127.0.0.1:4174/README.md',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
