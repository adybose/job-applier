import { withDb } from '../db';

export type Stage = 'extraction' | 'planning' | 'drafting' | 'benchmark' | 'embedding';

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
    await withDb((db) => db.add('calls', stat), this.dbName);
  }

  all(): Promise<CallStat[]> {
    return withDb((db) => db.getAll('calls'), this.dbName);
  }
}
