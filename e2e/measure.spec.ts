// Lazy Payoff numbers for the write-up. Real model only: pnpm measure (see README).
import { clearCards, startRun, test, USE_OLLAMA } from './harness';

for (const fixture of ['greenhouse.html', 'lever.html', 'ashby.html']) {
  test(`measure ${fixture}`, async ({ context, openPanel }) => {
    test.skip(!USE_OLLAMA, 'real model only');
    const t0 = Date.now();
    const { panel } = await startRun(context, openPanel, fixture);
    // Agent work is done when the model has nothing left in flight.
    await panel.locator('.phase').waitFor();
    await panel.waitForTimeout(300);
    await panel.locator('.thinking').waitFor({ state: 'detached', timeout: 240_000 });
    const agentSeconds = (Date.now() - t0) / 1000;
    const kinds = await panel.locator('.card-kind').allInnerTexts();
    const filled = (await panel.locator('.log li.log-filled').count());
    await clearCards(panel);
    const how = await panel.locator('.review-table td .decision').allInnerTexts();
    const count = (k: string) => how.filter((h) => h === k).length;
    console.log(
      JSON.stringify({
        model: process.env.LAZYAPPLY_E2E_MODEL ?? 'gemma3:4b-it-qat',
        fixture,
        agentSeconds,
        autoFilledBeforeCards: filled,
        cards: { approval: kinds.filter((k) => /check/i.test(k)).length, question: kinds.filter((k) => /question/i.test(k)).length, handoff: kinds.filter((k) => /turn/i.test(k)).length },
        review: { auto: count('Auto'), approved: count('Approved'), edited: count('Edited'), human: count('You did it'), skipped: count('Skipped') },
      }),
    );
  });
}
