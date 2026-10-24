// Spec 01 R-PS-2. The one place that decides whether a URL is on this computer.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

export const LOOPBACK_ERROR = 'The model must run on this computer (localhost).';

export function isLoopbackUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return LOOPBACK_HOSTS.has(url.hostname);
}
