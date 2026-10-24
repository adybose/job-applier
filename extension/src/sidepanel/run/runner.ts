import { mapField, type MapperContext } from '../../shared/agent/mapper';
import { initialState, reduce, type RunEvent, type RunState } from '../../shared/agent/machine';
import { isFreeText, planFields } from '../../shared/agent/planner';
import type { Proposal } from '../../shared/agent/types';
import type { Action, ActionResult } from '../../shared/actions';
import type { ModelClient } from '../../shared/model/client';
import type { ModelSettings } from '../../shared/model/settings';
import { handoffInstruction, route } from '../../shared/policy/route';
import type { Profile } from '../../shared/profile/schema';
import type { Field, FormSnapshot, Option } from '../../shared/snapshot';

// Spec 05: the run's effects. State lives in the pure reducer (shared/agent/machine.ts); this class
// talks to the page and the model, and reports what happened as events. It only ever touches `tabId`
// (spec 01 R-PS-13) and lives in the side panel, so closing the panel ends it (R-PS-14).

export interface PageApi {
  injectContent(tabId: number): Promise<void>;
  snapshotTab(tabId: number): Promise<FormSnapshot>;
  readOptions(tabId: number, frameId: number, fieldId: string): Promise<Option[]>;
  act(tabId: number, frameId: number, action: Action): Promise<ActionResult>;
  resumePayload(kind?: 'resume' | 'linkedin'): Promise<{ name: string; type: string; base64: string } | undefined>;
}

export interface Drafter {
  draft(field: Field, profile: Profile, jobDescription: string | undefined): Promise<Proposal | undefined>;
}

export interface RunnerDeps {
  tabId: number;
  page: PageApi;
  client: ModelClient;
  settings: ModelSettings;
  profile: Profile;
  mapperContext: MapperContext;
  drafter?: Drafter;
  saveProfile?: (profile: Profile) => Promise<unknown>;
  pollMs?: number;
}

const POLL_MS = 1500;

export class Runner {
  state: RunState = initialState;
  private listeners = new Set<(s: RunState) => void>();
  private queue: (() => Promise<void>)[] = [];
  private draining = false;
  private written = new Map<string, string>();
  private failed = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private polling = false;
  private highlighted = new Set<string>();
  /** Fields already handed to stages 1–3, so overlapping polls never process a field twice. */
  private processing = new Set<string>();
  /** A card's field value when the card appeared; a change from it means the human acted. */
  private baseline = new Map<string, string>();
  /** Fields with an action in flight, and the last value we tried to write, so our own writes never look human. */
  private inFlight = new Set<string>();
  private attempted = new Map<string, string>();

  constructor(private readonly deps: RunnerDeps) {}

  subscribe(fn: (s: RunState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private dispatch(event: RunEvent): void {
    const before = this.state;
    this.state = reduce(this.state, event);
    if (this.state !== before) for (const fn of this.listeners) fn(this.state);
    if (before.phase !== this.state.phase) this.onPhase(before.phase);
  }

  private get active(): boolean {
    return !['IDLE', 'NEEDS_PROFILE', 'STOPPED', 'DONE'].includes(this.state.phase);
  }

  // ---- lifecycle -----------------------------------------------------------------------------

  async start(): Promise<void> {
    this.dispatch({ type: 'START', hasProfile: true });
    try {
      await this.deps.page.injectContent(this.deps.tabId);
    } catch {
      this.dispatch({ type: 'LOG', kind: 'failed', text: "Lazy Apply can't read this page. Click the Lazy Apply icon on the job page, then try again." });
      this.dispatch({ type: 'STOP' });
      return;
    }
    await this.scan();
    this.schedulePoll();
  }

  pause(): void {
    this.dispatch({ type: 'PAUSE' });
  }

  resume(): void {
    this.dispatch({ type: 'RESUME' });
    void this.drain();
  }

  async stop(): Promise<void> {
    this.dispatch({ type: 'STOP' });
    clearTimeout(this.timer);
    this.queue = [];
    await this.clearHighlights();
  }

  async finish(): Promise<void> {
    this.dispatch({ type: 'DONE' });
    clearTimeout(this.timer);
  }

  // ---- scanning and stage 1–3 -----------------------------------------------------------------

  private async scan(): Promise<void> {
    let snapshot: FormSnapshot;
    try {
      snapshot = await this.deps.page.snapshotTab(this.deps.tabId);
    } catch {
      return;
    }
    if (this.state.url && sameDocument(this.state.url, snapshot.url) === false) {
      this.dispatch({ type: 'NAVIGATED', url: snapshot.url });
    }
    this.dispatch({ type: 'SNAPSHOT', snapshot });
    this.checkHumanProgress(snapshot);
    await this.processNewFields();
  }

  private async processNewFields(): Promise<void> {
    const fresh = this.state.order
      .map((id) => this.state.fields[id])
      .filter((f) => f?.status === 'new' && !this.processing.has(f.field.id));
    if (!fresh.length) return;
    for (const f of fresh) if (f) this.processing.add(f.field.id);
    this.dispatch({ type: 'WORK', delta: 1 });
    try {
      const { profile, mapperContext } = this.deps;
      const forModel: Field[] = [];
      const forDraft: Field[] = [];

      for (const fs of fresh) {
        if (!fs) continue;
        const field = fs.field;
        const proposal = mapField(field, profile, mapperContext);
        if (proposal) this.decide(field, proposal);
        else if (isFreeText(field)) forDraft.push(field);
        else if (['file', 'password', 'unknown'].includes(field.kind)) this.decide(field, undefined);
        else forModel.push(field);
      }

      // Combobox options are read lazily (spec 03 R-PP-10) so the model can pick a real one.
      for (const field of forModel) {
        if (field.kind === 'combobox' && !field.options?.length) {
          field.options = await this.deps.page.readOptions(this.deps.tabId, field.frameId, field.id).catch(() => []);
        }
      }

      if (forModel.length) {
        const numCtx = this.deps.settings.mapping.numCtx;
        const result = await planFields(this.deps.client, forModel, profile, this.state.jobDescription, numCtx);
        const byField = new Map(result.proposals.map((p) => [p.fieldId, p]));
        for (const d of result.discarded) this.dispatch({ type: 'LOG', kind: 'blocked', text: `Ignored a model answer: ${d.reason}` });
        if (result.failed.length) this.dispatch({ type: 'LOG', kind: 'failed', text: 'The model could not answer some fields. They need you.' });
        for (const field of forModel) this.decide(field, byField.get(field.id));
      }

      for (const field of forDraft) {
        const proposal = this.deps.drafter ? await this.deps.drafter.draft(field, profile, this.state.jobDescription).catch(() => undefined) : undefined;
        this.decide(field, proposal);
      }
    } finally {
      this.dispatch({ type: 'WORK', delta: -1 });
    }
  }

  /** Spec 05 R-AL-11: the policy routes; autos are queued, everything else becomes a card. */
  private decide(field: Field, proposal: Proposal | undefined): void {
    if (!this.active) return;
    const decision = route(field, proposal, { failed: this.failed, written: this.written });
    this.dispatch({
      type: 'ROUTED',
      fieldId: field.id,
      route: decision.route,
      reason: decision.reason,
      category: decision.category,
      proposal,
      instruction: decision.route === 'handoff' ? handoffInstruction(field) : undefined,
    });
    if (decision.route !== 'auto' && decision.route !== 'skip') this.baseline.set(field.id, field.value);
    if (decision.route === 'auto' && proposal) {
      this.enqueue(async () => {
        await this.apply(field.id, proposal.value, 'auto');
      });
    }
    if (decision.route === 'handoff') this.enqueue(() => this.point(field.id, field.frameId));
  }

  // ---- actions ---------------------------------------------------------------------------------

  private enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    void this.drain();
  }

  /** One action at a time, never while paused (spec 06 R-HL-14). */
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length && this.active && this.state.phase !== 'PAUSED') {
        const task = this.queue.shift();
        // One failing task must never stall the queue.
        if (task) await task().catch(() => undefined);
      }
    } finally {
      this.draining = false;
    }
  }

  private async apply(fieldId: string, value: string, decidedBy: 'auto' | 'approved' | 'edited', overwrite = false): Promise<boolean> {
    const fs = this.state.fields[fieldId];
    if (!fs || !this.active) return false;
    const field = fs.field;
    const action = await this.actionFor(field, value, fs.proposal, overwrite);
    if (!action) {
      this.fail(field, 'Nothing to put here.');
      return false;
    }
    this.inFlight.add(fieldId);
    this.attempted.set(fieldId, value);
    const result: ActionResult = await this.deps.page
      .act(this.deps.tabId, field.frameId, action)
      .catch(() => ({ ok: false as const, reason: 'not-found' as const, detail: "Lazy Apply couldn't reach this field." }))
      .finally(() => this.inFlight.delete(fieldId));
    if (result.ok) {
      this.written.set(fieldId, result.value);
      this.dispatch({ type: 'FILLED', fieldId, value: result.value, decidedBy });
      return true;
    }
    if (result.reason === 'needs-approval' && decidedBy === 'auto') {
      this.dispatch({ type: 'ROUTED', fieldId, route: 'approval', reason: 'This would replace what is already there.', proposal: fs.proposal });
      return false;
    }
    this.fail(field, result.detail ?? "Lazy Apply couldn't set this field.");
    return false;
  }

  private fail(field: Field, reason: string): void {
    this.failed.add(field.id);
    this.baseline.set(field.id, this.state.fields[field.id]?.field.value ?? '');
    this.dispatch({ type: 'FILL_FAILED', fieldId: field.id, reason, instruction: handoffInstruction(field) });
    void this.point(field.id, field.frameId);
  }

  private async actionFor(field: Field, value: string, proposal: Proposal | undefined, overwrite: boolean): Promise<Action | undefined> {
    switch (field.kind) {
      case 'file': {
        const file = await this.deps.page.resumePayload(proposal?.usesLinkedinPdf ? 'linkedin' : 'resume');
        return file ? { action: 'upload_file', fieldId: field.id, fileKind: 'resume', file } : undefined;
      }
      case 'checkbox':
        return { action: 'set_checked', fieldId: field.id, checked: /^(true|yes)$/i.test(value) };
      case 'select':
      case 'combobox':
      case 'radio-group':
        return { action: 'select_option', fieldId: field.id, value, overwrite };
      default:
        return { action: 'fill', fieldId: field.id, value, overwrite };
    }
  }

  /** Scrolls to a field and highlights it for the human (spec 06 R-HL-6). */
  private async point(id: string, frameId: number, note = 'Your turn'): Promise<void> {
    await this.deps.page.act(this.deps.tabId, frameId, { action: 'scroll_to', fieldId: id }).catch(() => undefined);
    await this.deps.page.act(this.deps.tabId, frameId, { action: 'highlight', fieldId: id, style: 'handoff', note }).catch(() => undefined);
    this.highlighted.add(`${frameId}:${id}`);
  }

  private async unpoint(id: string, frameId: number): Promise<void> {
    if (!this.highlighted.delete(`${frameId}:${id}`)) return;
    await this.deps.page.act(this.deps.tabId, frameId, { action: 'clear_highlight', fieldId: id }).catch(() => undefined);
  }

  private async clearHighlights(): Promise<void> {
    const frames = new Set([...this.highlighted].map((k) => Number(k.split(':')[0])));
    frames.add(0);
    this.highlighted.clear();
    for (const frameId of frames) {
      await this.deps.page.act(this.deps.tabId, frameId, { action: 'clear_highlight' }).catch(() => undefined);
    }
  }

  // ---- cards -----------------------------------------------------------------------------------

  /** Approve or edit an approval/question card. Returns false if the value did not stick (card becomes a handoff). */
  async answer(id: string, value: string, edited: boolean): Promise<boolean> {
    const card = this.state.cards.find((c) => c.id === id);
    if (!card || !this.active) return false;
    return new Promise((resolve) => {
      this.enqueue(async () => resolve(await this.apply(id, value, edited ? 'edited' : 'approved', true)));
    });
  }

  /** "Skip" on any card, or "I did it" on a handoff. */
  async resolve(id: string, how: 'skipped' | 'human'): Promise<void> {
    const card = this.state.cards.find((c) => c.id === id);
    if (!card) return;
    if (card.blocker) this.dispatch({ type: 'BLOCKER_RESOLVED', id });
    else this.dispatch({ type: 'RESOLVED', id, decidedBy: how, value: how === 'human' ? this.state.fields[id]?.field.value : undefined });
    await this.unpoint(id, card.frameId);
  }

  /** Spec 06 R-HL-2: "Remember this answer" saves to profile.custom, keyed by the question. */
  async remember(field: Field, value: string): Promise<void> {
    const key = field.label.trim();
    if (!key || !value.trim()) return;
    this.deps.profile = {
      ...this.deps.profile,
      custom: { ...this.deps.profile.custom, [key]: { value: value.trim(), source: 'user' } },
    };
    await this.deps.saveProfile?.(this.deps.profile);
  }

  /** Re-drafts a free-text answer (spec 06 R-HL-1 "Regenerate"). */
  async regenerate(id: string): Promise<Proposal | undefined> {
    const fs = this.state.fields[id];
    if (!fs || !this.deps.drafter) return undefined;
    const proposal = await this.deps.drafter.draft(fs.field, this.deps.profile, this.state.jobDescription);
    if (proposal) this.dispatch({ type: 'ROUTED', fieldId: id, route: 'approval', reason: 'Written answer: please review.', proposal });
    return proposal;
  }

  async focus(id: string): Promise<void> {
    const fs = this.state.fields[id];
    const card = this.state.cards.find((c) => c.id === id);
    const frameId = fs?.field.frameId ?? card?.frameId ?? 0;
    await this.deps.page.act(this.deps.tabId, frameId, { action: 'scroll_to', fieldId: id }).catch(() => undefined);
  }

  // ---- watching the human ----------------------------------------------------------------------

  private schedulePoll(): void {
    clearTimeout(this.timer);
    if (!this.active) return;
    this.timer = setTimeout(() => void this.poll(), this.deps.pollMs ?? POLL_MS);
  }

  /** Called on a timer and on dom-changed messages. */
  async poll(): Promise<void> {
    if (this.polling || !this.active) return;
    this.polling = true;
    try {
      if (this.state.phase !== 'PAUSED') await this.scan();
    } finally {
      this.polling = false;
      this.schedulePoll();
    }
  }

  /** Spec 06 R-HL-7: a card resolves itself when the human does the step in the page. */
  private checkHumanProgress(snapshot: FormSnapshot): void {
    const fields = new Map(snapshot.fields.map((f) => [f.id, f]));
    const blockers = new Map(snapshot.blockers.map((b) => [b.id, b]));
    for (const card of this.state.cards) {
      if (card.blocker) {
        const b = blockers.get(card.id);
        if (!b || b.resolved) {
          this.dispatch({ type: 'BLOCKER_RESOLVED', id: card.id });
          void this.unpoint(card.id, card.frameId);
        }
        continue;
      }
      const f = fields.get(card.id);
      if (!f || this.inFlight.has(card.id)) continue;
      if (!this.baseline.has(card.id)) {
        this.baseline.set(card.id, f.value);
        continue;
      }
      const hasValue = f.kind === 'checkbox' ? f.value === 'true' : f.value.trim() !== '';
      const ours = [this.written.get(f.id), this.attempted.get(f.id)].some((v) => v !== undefined && v.trim() === f.value.trim());
      if (hasValue && f.value !== this.baseline.get(card.id) && !ours) {
        this.dispatch({ type: 'RESOLVED', id: card.id, decidedBy: 'human', value: f.value });
        void this.unpoint(card.id, card.frameId);
      }
    }
  }

  // ---- review ----------------------------------------------------------------------------------

  private onPhase(previous: RunState['phase']): void {
    if (this.state.phase === 'REVIEW' && previous !== 'REVIEW') void this.highlightSubmit();
    if (this.state.phase === 'SCANNING') void this.clearHighlights();
  }

  /** Spec 06 R-HL-13: point at Submit. The agent never clicks it. */
  async highlightSubmit(): Promise<void> {
    const submit = pickSubmit(this.state.buttons);
    if (!submit) return;
    await this.deps.page.act(this.deps.tabId, submit.frameId, { action: 'scroll_to', fieldId: submit.id }).catch(() => undefined);
    await this.deps.page
      .act(this.deps.tabId, submit.frameId, { action: 'highlight', fieldId: submit.id, style: 'submit', note: 'Review and click Submit yourself' })
      .catch(() => undefined);
    this.highlighted.add(`${submit.frameId}:${submit.id}`);
  }
}

/** The page's final submit control: submit-like, not an OAuth button, preferring the word "submit". */
export function pickSubmit<T extends { text: string; isSubmitLike: boolean }>(buttons: readonly T[]): T | undefined {
  const candidates = buttons.filter((b) => b.isSubmitLike && !/apply (with|using|via)/i.test(b.text));
  return candidates.find((b) => /submit/i.test(b.text)) ?? candidates.at(-1);
}

function sameDocument(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname && x.search === y.search;
  } catch {
    return a === b;
  }
}
