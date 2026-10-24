// Spec 01 R-PS-3. Extension pages may only connect to themselves and the local model.
export const EXTENSION_PAGES_CSP =
  "script-src 'self'; object-src 'self'; connect-src 'self' http://localhost:* http://127.0.0.1:*";

// Loopback origins the extension may reach (model endpoint) and inject into (test fixtures).
export const LOOPBACK_HOST_PERMISSIONS = ['http://localhost/*', 'http://127.0.0.1/*'];
