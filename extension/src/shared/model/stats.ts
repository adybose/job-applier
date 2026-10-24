import { openLazyApplyDb } from '../db';

export type Stage = 'extraction' | 'planning' | 'drafting' | 'benchmark';

// Spec 07 R-MR-16. Never add prompt or response text to this record.
export interface CallStat {
  ts: number;
  model: string;
  promptId: string;
  promptVersion: number;
  stage: Stage;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ok: boolean;
}

export interface StatsSink {
  log(stat: CallStat): Promise<void>;
}

export class MemoryStatsSink implements StatsSink {
  readonly rows: CallStat[] = [];

  async log(stat: CallStat): Promise<void> {
    this.rows.push(stat);
  }
}

export class IdbStatsSink implements StatsSink {
  constructor(private readonly dbName?: string) {}

  async log(stat: CallStat): Promise<void> {
    const db = await openLazyApplyDb(this.dbName);
    await db.add('calls', stat);
  }

  async all(): Promise<CallStat[]> {
    const db = await openLazyApplyDb(this.dbName);
    return db.getAll('calls');
  }
}
