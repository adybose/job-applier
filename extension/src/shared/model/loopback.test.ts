import { describe, expect, it } from 'vitest';
import { isLoopbackUrl } from './loopback';

// AC-PS-2
describe('isLoopbackUrl', () => {
  it.each(['http://localhost:11434', 'http://127.0.0.1:1234', 'http://localhost', 'https://localhost:8443/v1'])(
    'accepts %s',
    (url) => {
      expect(isLoopbackUrl(url)).toBe(true);
    },
  );

  it.each([
    'http://localhost.evil.com',
    'http://127.0.0.2.nip.io',
    'https://10.0.0.1',
    'http://[::1]:8080',
    'http://example.com:11434',
    'http://192.168.1.5:11434',
    'http://user:pass@localhost:11434',
    'ftp://localhost',
    'file:///etc/passwd',
    'localhost:11434',
    '',
  ])('rejects %s', (url) => {
    expect(isLoopbackUrl(url)).toBe(false);
  });
});
