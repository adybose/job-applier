// Network guard (spec 10 R-TE-9, spec 01 AC-PS-3).
export interface ExtensionRequest {
  url: string;
  source: 'service-worker' | 'extension-page';
}

/** Returns every extension request that went somewhere other than the extension itself or the model endpoint. */
export function findViolations(requests: readonly ExtensionRequest[], extensionId: string, modelOrigin: string): ExtensionRequest[] {
  const model = new URL(modelOrigin);
  return requests.filter(({ url }) => {
    const u = new URL(url);
    if (u.protocol === 'chrome-extension:' && u.host === extensionId) return false;
    if (u.protocol === 'data:' || u.protocol === 'blob:') return false;
    return !(u.protocol === model.protocol && u.hostname === model.hostname && u.port === model.port);
  });
}
