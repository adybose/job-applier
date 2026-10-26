import { defineConfig } from 'wxt';
import { EXTENSION_PAGES_CSP, LOOPBACK_HOST_PERMISSIONS } from './extension/src/shared/csp';

// See plan/DECISIONS.md ADR-001 (WXT) and ADR-002 (programmatic injection).
export default defineConfig({
  srcDir: 'extension/src',
  outDir: 'extension/output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Lazy Apply',
    description: 'Fills job applications with a model on your own computer. Never submits.',
    minimum_chrome_version: '116',
    permissions: ['sidePanel', 'storage', 'unlimitedStorage', 'activeTab', 'scripting'],
    host_permissions: LOOPBACK_HOST_PERMISSIONS,
    // Requested per site when the user presses Start (ADR-012); nothing is granted at install.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: 'Open Lazy Apply' },
    content_security_policy: { extension_pages: EXTENSION_PAGES_CSP },
  },
});
