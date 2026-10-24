// Network guard (spec 10 R-TE-9, spec 01 AC-PS-3).
export interface ExtensionRequest {
  url: string;
  source: 'service-worker' | 'extension-page';
}

/**
 * Returns every extension request that went somewhere other than the extension itself or a model
 * endpoint the extension was configured with at the time (the mock, or the default before tests switch to it).
 */
export function findViolations(
  requests: readonly ExtensionRequest[],
  extensionId: string,
  modelOrigins: string | readonly string[],
): ExtensionRequest[] {
  const models = (typeof modelOrigins === 'string' ? [modelOrigins] : modelOrigins).map((o) => new URL(o));
  return requests.filter(({ url }) => {
    const u = new URL(url);
    if (u.protocol === 'chrome-extension:' && u.host === extensionId) return false;
    if (u.protocol === 'data:' || u.protocol === 'blob:') return false;
    return !models.some((m) => u.protocol === m.protocol && u.hostname === m.hostname && u.port === m.port);
  });
}
