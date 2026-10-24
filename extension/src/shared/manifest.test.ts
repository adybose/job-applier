import { describe, expect, it } from 'vitest';
import config from '../../../wxt.config';

// AC-PS-10: the manifest CSP and permissions honor spec 01.
describe('manifest', () => {
  const manifest = config.manifest as Record<string, unknown>;

  it('sets the extension page CSP from spec 01 R-PS-3', () => {
    expect(manifest.content_security_policy).toEqual({
      extension_pages:
        "script-src 'self'; object-src 'self'; connect-src 'self' http://localhost:* http://127.0.0.1:*",
    });
  });

  it('only requests loopback host permissions', () => {
    const hosts = (manifest.host_permissions as string[] | undefined) ?? [];
    for (const host of hosts) {
      expect(host).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)\/\*$/);
    }
  });

  it('asks for other sites only at run time, per site', () => {
    expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://*/*']);
  });

  it('does not request broad or network-sensitive permissions', () => {
    const permissions = (manifest.permissions as string[] | undefined) ?? [];
    for (const forbidden of ['<all_urls>', 'webRequest', 'cookies', 'history', 'tabs']) {
      expect(permissions).not.toContain(forbidden);
    }
    expect(permissions).toContain('sidePanel');
    expect(permissions).toContain('storage');
  });
});
