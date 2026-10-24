import { findViolations } from './guard';
import { ALLOWED_MODEL_ORIGINS, expect, FIXTURE_ORIGIN, MODEL_ORIGIN, mockMode, mockRequests, mockReset, test, USE_OLLAMA } from './harness';

test.describe('network guard', () => {
  test.beforeEach(async () => {
    if (!USE_OLLAMA) await mockReset();
  });

  // AC-PS-3: onboarding + benchmark only talk to the model endpoint (asserted by the harness on teardown).
  test('onboarding and benchmark only reach the model endpoint', async ({ openPanel, extensionRequests }) => {
    const panel = await openPanel();
    await expect(panel.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await panel.getByRole('button', { name: 'Quick benchmark' }).click();
    await expect(panel.getByRole('table', { name: 'Quick benchmark' })).toContainText('gemma3:4b-it-qat');

    const modelCalls = extensionRequests.filter((r) => r.url.startsWith(MODEL_ORIGIN));
    expect(modelCalls.length).toBeGreaterThanOrEqual(3);

    if (!USE_OLLAMA) {
      // AC-MR-1 end to end: the real request carries num_ctx, temperature and stream:false.
      const chat = (await mockRequests()).find((r) => r.path === '/api/chat');
      expect(chat?.body).toMatchObject({ stream: false, options: { num_ctx: 16384, temperature: 0.2 } });
    }
  });

  // AC-TE-2: the guard catches a request to any other destination, even another loopback port.
  test('flags a request to a non-model destination', async ({ openPanel, extensionRequests, extensionId }) => {
    const panel = await openPanel();
    await panel.evaluate(async (url) => {
      await fetch(url).catch(() => undefined);
    }, `${FIXTURE_ORIGIN}/README.md`);
    await expect.poll(() => extensionRequests.some((r) => r.url.startsWith(FIXTURE_ORIGIN))).toBe(true);

    const violations = findViolations(extensionRequests, extensionId, ALLOWED_MODEL_ORIGINS);
    expect(violations.map((v) => v.url)).toEqual([`${FIXTURE_ORIGIN}/README.md`]);
    // Clear the log so the harness teardown does not fail this intentional violation.
    extensionRequests.length = 0;
  });

  // AC-PS-10 / R-PS-3: the CSP blocks non-loopback hosts outright.
  test('CSP blocks requests to remote hosts', async ({ openPanel }) => {
    const panel = await openPanel();
    const result = await panel.evaluate(async () => {
      try {
        await fetch('https://example.com/');
        return 'reached';
      } catch {
        return 'blocked';
      }
    });
    expect(result).toBe('blocked');
  });

  // AC-MR-5 end to end.
  test('shows CORS steps when Ollama answers 403', async ({ openPanel }) => {
    test.skip(USE_OLLAMA, 'needs the mock');
    await mockMode('forbidden');
    const panel = await openPanel();
    await expect(panel.getByText('Ollama allows Lazy Apply to connect')).toBeVisible();
    await expect(panel.getByText(/OLLAMA_ORIGINS/).first()).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
