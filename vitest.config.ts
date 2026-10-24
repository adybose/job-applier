import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['extension/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
