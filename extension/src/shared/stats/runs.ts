import { withDb } from '../db';
import type { CallStat } from '../model/stats';

// Spec 08 R-UI-2 / R-UI-7: local "Lazy Payoff" numbers. Never leaves the browser.

export interface RunRecord {
  ts: number;
  host: string;
  auto: number;
  approved: number;
  edited: number;
  human: number;
  skipped: number;
  /** Seconds with at least one card waiting for the user, plus one minute of review. */
  humanSeconds: number;
  agentSeconds: number;
}

export const MANUAL_MINUTES = 17;

/** R-UI-7: max(0, 17 − human minutes) per application. An estimate, and labeled as one. */
export function minutesSaved(run: Pick<RunRecord, 'humanSeconds'>): number {
  return Math.max(0, MANUAL_MINUTES - run.humanSeconds / 60);
}

export interface ModelSummary {
  model: string;
  calls: number;
  failed: number;
  avgLatencyMs: number;
  tokensPerSecond: number;
}

export function summarizeCalls(calls: readonly CallStat[]): ModelSummary[] {
  const byModel = new Map<string, CallStat[]>();
  for (const c of calls) byModel.set(c.model, [...(byModel.get(c.model) ?? []), c]);
  return [...byModel.entries()].map(([model, rows]) => {
    const ok = rows.filter((r) => r.ok);
    const latency = ok.reduce((n, r) => n + r.latencyMs, 0);
    const tokens = ok.reduce((n, r) => n + r.outputTokens, 0);
    return {
      model,
      calls: rows.length,
      failed: rows.length - ok.length,
      avgLatencyMs: ok.length ? latency / ok.length : 0,
      tokensPerSecond: latency ? tokens / (latency / 1000) : 0,
    };
  });
}

export function recordRun(run: RunRecord, dbName?: string): Promise<void> {
  return withDb(async (db) => {
    await db.add('runs', run);
  }, dbName);
}

export function listRuns(dbName?: string): Promise<RunRecord[]> {
  return withDb((db) => db.getAll('runs'), dbName);
}

export function listCalls(dbName?: string): Promise<CallStat[]> {
  return withDb((db) => db.getAll('calls'), dbName);
}
