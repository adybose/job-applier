import type { Route } from '../policy/route';
import type { SensitiveCategory } from '../policy/sensitive';
import type { Blocker, Button, Field, FormSnapshot } from '../snapshot';
import type { Proposal } from './types';

// Spec 05 R-AL-1/R-AL-2: the run as a pure reducer. The runner (side panel) performs effects and
// reports them back as events; this module never touches the page or the model.

export type Phase =
  | 'IDLE'
  | 'NEEDS_PROFILE'
  | 'SCANNING'
  | 'FILLING'
  | 'WAITING_APPROVAL'
  | 'WAITING_HUMAN'
  | 'REVIEW'
  | 'DONE'
  | 'PAUSED'
  | 'STOPPED';

export type FieldStatus = 'new' | 'working' | 'filled' | 'waiting' | 'skipped';
export type Decision = 'auto' | 'approved' | 'edited' | 'human' | 'skipped';

export interface FieldState {
  field: Field;
  status: FieldStatus;
  route?: Route;
  reason?: string;
  category?: SensitiveCategory;
  proposal?: Proposal;
  decidedBy?: Decision;
  finalValue?: string;
}

export type CardType = 'approval' | 'question' | 'handoff';

export interface Card {
  /** A field id, or a blocker id for blocker handoffs. */
  id: string;
  type: CardType;
  frameId: number;
  label: string;
  reason: string;
  instruction?: string;
  proposal?: Proposal;
  blocker?: Blocker['type'];
  createdAt: number;
}

export interface LogEntry {
  at: number;
  kind: 'info' | 'filled' | 'waiting' | 'blocked' | 'failed' | 'human';
  text: string;
}

export interface RunState {
  phase: Phase;
  pausedFrom?: Phase;
  url?: string;
  stepHint?: string;
  jobDescription?: string;
  fields: Record<string, FieldState>;
  order: string[];
  buttons: Button[];
  blockers: Blocker[];
  cards: Card[];
  log: LogEntry[];
  /** Model or planner work still in flight; REVIEW waits for it. */
  pendingWork: number;
}

export type RunEvent =
  | { type: 'START'; hasProfile: boolean }
  | { type: 'SNAPSHOT'; snapshot: FormSnapshot }
  | { type: 'WORK'; delta: 1 | -1 }
  | { type: 'ROUTED'; fieldId: string; route: Route; reason: string; category?: SensitiveCategory; proposal?: Proposal; instruction?: string }
  | { type: 'FILLED'; fieldId: string; value: string; decidedBy: Decision }
  | { type: 'FILL_FAILED'; fieldId: string; reason: string; instruction: string }
  | { type: 'RESOLVED'; id: string; decidedBy: Decision; value?: string }
  | { type: 'BLOCKER_RESOLVED'; id: string }
  | { type: 'NAVIGATED'; url: string }
  | { type: 'LOG'; kind: LogEntry['kind']; text: string }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'DONE' };

export const initialState: RunState = {
  phase: 'IDLE',
  fields: {},
  order: [],
  buttons: [],
  blockers: [],
  cards: [],
  log: [],
  pendingWork: 0,
};

const ACTIVE: ReadonlySet<Phase> = new Set(['SCANNING', 'FILLING', 'WAITING_APPROVAL', 'WAITING_HUMAN', 'REVIEW']);
const now = () => Date.now();

function log(state: RunState, kind: LogEntry['kind'], text: string): LogEntry[] {
  return [{ at: now(), kind, text }, ...state.log].slice(0, 300);
}

const BLOCKER_TEXT: Record<Blocker['type'], string> = {
  captcha: 'Solve the CAPTCHA yourself. Lazy Apply never does.',
  login: 'Sign in or create the account yourself. Lazy Apply never types passwords.',
  recorder: 'Record this answer yourself.',
  oauth: '',
};

/** Required fields resolved = filled, skipped, or done by the human (spec 06 R-HL-11). */
export function requiredProgress(state: RunState): { done: number; total: number } {
  const required = state.order.map((id) => state.fields[id]).filter((f): f is FieldState => !!f && f.field.required);
  return {
    done: required.filter((f) => f.status === 'filled' || f.status === 'skipped').length,
    total: required.length,
  };
}

/** The phase that follows from the current fields and cards while a run is active. */
export function derivePhase(state: RunState): Phase {
  if (state.cards.some((c) => c.type === 'handoff')) return 'WAITING_HUMAN';
  if (state.cards.length) return 'WAITING_APPROVAL';
  const busy = state.pendingWork > 0 || state.order.some((id) => ['new', 'working'].includes(state.fields[id]?.status ?? ''));
  if (busy) return 'FILLING';
  const { done, total } = requiredProgress(state);
  return done === total ? 'REVIEW' : 'FILLING';
}

function settle(state: RunState): RunState {
  if (state.phase === 'PAUSED') return { ...state, pausedFrom: derivePhase(state) };
  if (!ACTIVE.has(state.phase) || state.phase === 'SCANNING') return state;
  return { ...state, phase: derivePhase(state) };
}

function upsertCard(cards: Card[], card: Card): Card[] {
  return [...cards.filter((c) => c.id !== card.id), card];
}

export function reduce(state: RunState, event: RunEvent): RunState {
  // Once stopped or done, only a new START is accepted.
  if ((state.phase === 'STOPPED' || state.phase === 'DONE') && event.type !== 'START') return state;

  switch (event.type) {
    case 'START':
      if (!['IDLE', 'NEEDS_PROFILE', 'STOPPED', 'DONE'].includes(state.phase)) return state;
      return event.hasProfile
        ? { ...initialState, phase: 'SCANNING', log: [{ at: now(), kind: 'info', text: 'Reading the form…' }] }
        : { ...initialState, phase: 'NEEDS_PROFILE' };

    case 'SNAPSHOT': {
      if (!ACTIVE.has(state.phase) && state.phase !== 'PAUSED') return state;
      const s = event.snapshot;
      const fields = { ...state.fields };
      const order = [...state.order];
      let added = 0;
      for (const field of s.fields) {
        const existing = fields[field.id];
        if (existing) {
          fields[field.id] = { ...existing, field };
        } else {
          fields[field.id] = { field, status: 'new' };
          order.push(field.id);
          added++;
        }
      }
      let cards = state.cards;
      for (const b of s.blockers) {
        if (b.type === 'oauth' || b.resolved || cards.some((c) => c.id === b.id)) continue;
        if (state.blockers.some((x) => x.id === b.id) && !cards.some((c) => c.id === b.id)) continue; // already resolved
        cards = upsertCard(cards, {
          id: b.id,
          type: 'handoff',
          frameId: b.frameId,
          label: b.description,
          reason: 'Only you can do this.',
          instruction: BLOCKER_TEXT[b.type],
          blocker: b.type,
          createdAt: now(),
        });
      }
      const blockers = [...state.blockers, ...s.blockers.filter((b) => !state.blockers.some((x) => x.id === b.id))];
      const next: RunState = {
        ...state,
        phase: state.phase === 'SCANNING' ? 'FILLING' : state.phase,
        url: s.url,
        stepHint: s.stepHint,
        jobDescription: s.jobDescription ?? state.jobDescription,
        fields,
        order,
        buttons: s.buttons,
        blockers,
        cards,
        log: added ? log(state, 'info', `Found ${added} field${added === 1 ? '' : 's'}.`) : state.log,
      };
      return settle(next);
    }

    case 'WORK':
      return settle({ ...state, pendingWork: Math.max(0, state.pendingWork + event.delta) });

    case 'ROUTED': {
      const fs = state.fields[event.fieldId];
      if (!fs || fs.status === 'filled' || fs.status === 'skipped') return state;
      const base: FieldState = { ...fs, route: event.route, reason: event.reason, category: event.category, proposal: event.proposal };
      let cards = state.cards;
      let fieldState: FieldState;
      let entries = state.log;
      switch (event.route) {
        case 'auto':
          fieldState = { ...base, status: 'working' };
          break;
        case 'skip':
          fieldState = { ...base, status: 'skipped', decidedBy: 'skipped' };
          break;
        default:
          fieldState = { ...base, status: 'waiting' };
          cards = upsertCard(cards, {
            id: fs.field.id,
            type: event.route === 'handoff' ? 'handoff' : event.route,
            frameId: fs.field.frameId,
            label: fs.field.label,
            reason: event.reason,
            instruction: event.instruction,
            proposal: event.proposal,
            createdAt: now(),
          });
          entries = log(
            state,
            event.route === 'handoff' ? 'human' : 'waiting',
            `${fs.field.label}: ${event.route === 'handoff' ? 'your turn' : event.route === 'question' ? 'question for you' : 'needs your OK'}`,
          );
      }
      return settle({ ...state, fields: { ...state.fields, [fs.field.id]: fieldState }, cards, log: entries });
    }

    case 'FILLED': {
      const fs = state.fields[event.fieldId];
      if (!fs) return state;
      const label = event.decidedBy === 'auto' ? 'filled' : event.decidedBy;
      return settle({
        ...state,
        fields: { ...state.fields, [fs.field.id]: { ...fs, status: 'filled', decidedBy: event.decidedBy, finalValue: event.value } },
        cards: state.cards.filter((c) => c.id !== fs.field.id),
        log: log(state, 'filled', `${fs.field.label} → ${shorten(event.value)} (${label})`),
      });
    }

    case 'FILL_FAILED': {
      const fs = state.fields[event.fieldId];
      if (!fs) return state;
      return settle({
        ...state,
        fields: { ...state.fields, [fs.field.id]: { ...fs, status: 'waiting', route: 'handoff', reason: event.reason } },
        cards: upsertCard(state.cards, {
          id: fs.field.id,
          type: 'handoff',
          frameId: fs.field.frameId,
          label: fs.field.label,
          reason: event.reason,
          instruction: event.instruction,
          proposal: fs.proposal,
          createdAt: now(),
        }),
        log: log(state, 'failed', `${fs.field.label}: couldn't set it, your turn`),
      });
    }

    case 'RESOLVED': {
      const card = state.cards.find((c) => c.id === event.id);
      const fs = state.fields[event.id];
      const cards = state.cards.filter((c) => c.id !== event.id);
      if (!fs) return card ? settle({ ...state, cards, log: log(state, 'human', `${card.label}: done`) }) : state;
      const skipped = event.decidedBy === 'skipped';
      return settle({
        ...state,
        cards,
        fields: {
          ...state.fields,
          [fs.field.id]: {
            ...fs,
            status: skipped ? 'skipped' : 'filled',
            decidedBy: event.decidedBy,
            finalValue: skipped ? undefined : (event.value ?? fs.finalValue),
          },
        },
        log: log(state, skipped ? 'info' : 'human', `${fs.field.label}: ${skipped ? 'skipped' : event.decidedBy === 'human' ? 'done by you' : event.decidedBy}`),
      });
    }

    case 'BLOCKER_RESOLVED': {
      const card = state.cards.find((c) => c.id === event.id);
      if (!card) return state;
      return settle({ ...state, cards: state.cards.filter((c) => c.id !== event.id), log: log(state, 'human', `${card.label}: done`) });
    }

    case 'NAVIGATED':
      if (!ACTIVE.has(state.phase)) return state;
      return { ...state, phase: 'SCANNING', url: event.url, log: log(state, 'info', 'New page or step. Reading the form…') };

    case 'LOG':
      return { ...state, log: log(state, event.kind, event.text) };

    case 'PAUSE':
      if (!ACTIVE.has(state.phase)) return state;
      return { ...state, phase: 'PAUSED', pausedFrom: state.phase, log: log(state, 'info', 'Paused.') };

    case 'RESUME':
      if (state.phase !== 'PAUSED') return state;
      return settle({ ...state, phase: state.pausedFrom ?? 'FILLING', pausedFrom: undefined, log: log(state, 'info', 'Resumed.') });

    case 'STOP':
      if (state.phase === 'IDLE') return state;
      return { ...state, phase: 'STOPPED', cards: [], log: log(state, 'info', 'Stopped.') };

    case 'DONE':
      if (state.phase !== 'REVIEW') return state;
      return { ...state, phase: 'DONE', log: log(state, 'info', 'Done. Good luck!') };
  }
}

function shorten(v: string): string {
  return v.length > 60 ? `${v.slice(0, 57)}…` : v;
}
