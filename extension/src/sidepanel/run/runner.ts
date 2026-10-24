import { mapField, type MapperContext } from '../../shared/agent/mapper';
import { initialState, reduce, type RunEvent, type RunState } from '../../shared/agent/machine';
import { isFreeText, planFields } from '../../shared/agent/planner';
import type { Proposal } from '../../shared/agent/types';
import type { Action, ActionResult } from '../../shared/actions';
import type { ModelClient } from '../../shared/model/client';
import type { ModelSettings } from '../../shared/model/settings';
import { handoffInstruction, route } from '../../shared/policy/route';
import { findMatch, type SavedAnswer } from '../../shared/memory/answers';
import { sensitiveCategory } from '../../shared/policy/sensitive';
import type { Profile } from '../../shared/profile/schema';
import type { RunRecord } from '../../shared/stats/runs';
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
  draft(field: Field, profile: Profile, jobDescription: string | undefined, force?: boolean): Promise<Proposal | undefined>;
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
  memory?: {
    list(): Promise<SavedAnswer[]>;
    save(input: { questionText: string; answer: string; fieldKind: Field['kind']; sensitive: boolean }): Promise<void>;
    markUsed(key: string): Promise<void>;
  };
  recordRun?: (run: RunRecord) => Promise<void>;
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
  // Lazy Payoff bookkeeping (spec 08 R-UI-7).
  private startedAt = 0;
  private agentDoneAt = 0;
  private cardsOpenSince: number | undefined;
  private humanMs = 0;
  private recorded = false;
  /** Next/Continue buttons the user said "not yet" to, until new fields appear. */
  private declinedNav = new Set<string>();

  constructor(private readonly deps: RunnerDeps) {}

  subscribe(fn: (s: RunState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private dispatch(event: RunEvent): void {
    const before = this.state;
    this.state = reduce(this.state, event);
    const now = Date.now();
    if (this.state.cards.length && this.cardsOpenSince === undefined) this.cardsOpenSince = now;
    if (!this.state.cards.length && this.cardsOpenSince !== undefined) {
      this.humanMs += now - this.cardsOpenSince;
      this.cardsOpenSince = undefined;
    }
    if (!this.agentDoneAt && before.pendingWork > 0 && this.state.pendingWork === 0) this.agentDoneAt = now;
    if (this.state !== before) for (const fn of this.listeners) fn(this.state);
    if (before.phase !== this.state.phase) this.onPhase(before.phase);
  }

  private get active(): boolean {
    return !['IDLE', 'NEEDS_PROFILE', 'STOPPED', 'DONE'].includes(this.state.phase);
  }

  // ---- lifecycle -----------------------------------------------------------------------------

  async start(): Promise<void> {
    this.startedAt = Date.now();
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
      // A full page load (a multi-step form's next page) drops the content script: inject again.
      const empty = !snapshot.fields.length && !snapshot.buttons.length;
      if (empty || (this.state.url && snapshot.url && !sameDocument(this.state.url, snapshot.url))) {
        await this.deps.page.injectContent(this.deps.tabId).catch(() => undefined);
        snapshot = await this.deps.page.snapshotTab(this.deps.tabId);
      }
    } catch {
      return;
    }
    if (!snapshot.url) return;
    if (this.state.url && !sameDocument(this.state.url, snapshot.url)) {
      this.dispatch({ type: 'NAVIGATED', url: snapshot.url });
    }
    const known = this.state.order.length;
    this.dispatch({ type: 'SNAPSHOT', snapshot });
    if (this.state.order.length > known) this.declinedNav.clear();
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
      const saved = (await this.deps.memory?.list().catch(() => [])) ?? [];

      for (const fs of fresh) {
        if (!fs) continue;
        const field = fs.field;
        const proposal = mapField(field, profile, mapperContext) ?? this.fromMemory(field, saved);
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
        if (!this.active) break;
        const proposal = this.deps.drafter ? await this.deps.drafter.draft(field, profile, this.state.jobDescription).catch(() => undefined) : undefined;
        this.decide(field, proposal);
      }
    } finally {
      this.dispatch({ type: 'WORK', delta: -1 });
    }
  }

  /** Spec 09 R-AM-5: a remembered answer is a proposal like any other; the policy still decides. */
  private fromMemory(field: Field, saved: readonly SavedAnswer[]): Proposal | undefined {
    const match = findMatch(field, saved);
    if (!match) return undefined;
    return {
      fieldId: field.id,
      action: field.kind === 'select' || field.kind === 'radio-group' || field.kind === 'combobox' ? 'select_option' : field.kind === 'checkbox' ? 'set_checked' : 'fill',
      value: match.value,
      confidence: match.score,
      rationale: `You answered "${match.entry.questionText}" before.`,
      sensitive: match.entry.sensitive,
      origin: 'memory',
      memoryKey: match.entry.normalizedKey,
    };
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

  /** Human answers jump the queue: the person is waiting on them, the page is not. */
  private enqueue(task: () => Promise<void>, urgent = false): void {
    if (urgent) this.queue.unshift(task);
    else this.queue.push(task);
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
      if (fs.proposal?.origin === 'memory' && fs.proposal.memoryKey) void this.deps.memory?.markUsed(fs.proposal.memoryKey).catch(() => undefined);
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
    if (card.nav) return this.goNext(card.id, card.frameId);
    return new Promise((resolve) => {
      this.enqueue(async () => resolve(await this.apply(id, value, edited ? 'edited' : 'approved', true)), true);
    });
  }

  /** Spec 05 R-AL-16: the one click Lazy Apply makes, after approval, on a Next/Continue button. */
  private goNext(buttonId: string, frameId: number): Promise<boolean> {
    return new Promise((resolve) => {
      this.enqueue(async () => {
        const result = await this.deps.page
          .act(this.deps.tabId, frameId, { action: 'click', buttonId, approvedNav: true })
          .catch(() => ({ ok: false as const, reason: 'not-found' as const }));
        this.dispatch({ type: 'NAV_RESOLVED', buttonId, clicked: result.ok });
        if (!result.ok) {
          this.declinedNav.add(buttonId);
          this.dispatch({ type: 'LOG', kind: 'blocked', text: "Lazy Apply won't click that button. If it isn't Submit, click it yourself." });
        }
        setTimeout(() => void this.poll(), 400);
        resolve(result.ok);
      }, true);
    });
  }

  /** "Skip" on any card, or "I did it" on a handoff. */
  async resolve(id: string, how: 'skipped' | 'human'): Promise<void> {
    const card = this.state.cards.find((c) => c.id === id);
    if (!card) return;
    if (card.nav) {
      this.declinedNav.add(id);
      this.dispatch({ type: 'NAV_RESOLVED', buttonId: id, clicked: false });
      return;
    }
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
    await this.deps.memory
      ?.save({ questionText: key, answer: value, fieldKind: field.kind, sensitive: !!sensitiveCategory(field) })
      .catch(() => undefined);
  }

  /** Re-drafts a free-text answer (spec 06 R-HL-1 "Regenerate"). */
  async regenerate(id: string): Promise<Proposal | undefined> {
    const fs = this.state.fields[id];
    if (!fs || !this.deps.drafter) return undefined;
    const proposal = await this.deps.drafter.draft(fs.field, this.deps.profile, this.state.jobDescription, true).catch(() => undefined);
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
    if (this.state.phase === 'REVIEW' && previous !== 'REVIEW') {
      // A multi-step form: the step is done, so offer Next before the final review (R-AL-16).
      const next = this.state.buttons.find((b) => b.isNavLike && !b.isSubmitLike && !this.declinedNav.has(b.id));
      if (next) {
        this.dispatch({ type: 'NAV_PROPOSED', buttonId: next.id, frameId: next.frameId, text: next.text });
        return;
      }
      void this.highlightSubmit();
      void this.record();
    }
    if (this.state.phase === 'SCANNING') void this.clearHighlights();
  }

  /** Spec 08 R-UI-2/R-UI-7: one summary per application, the first time it reaches review. */
  private async record(): Promise<void> {
    if (this.recorded || !this.deps.recordRun) return;
    this.recorded = true;
    const decided = Object.values(this.state.fields).filter((f) => f.decidedBy && f.route !== 'skip');
    const count = (d: string) => decided.filter((f) => f.decidedBy === d).length;
    const host = URL.canParse(this.state.url ?? '') ? new URL(this.state.url ?? '').hostname : '';
    await this.deps
      .recordRun({
        ts: Date.now(),
        host,
        auto: count('auto'),
        approved: count('approved'),
        edited: count('edited'),
        human: count('human'),
        skipped: count('skipped'),
        humanSeconds: Math.round((this.humanMs + (this.cardsOpenSince ? Date.now() - this.cardsOpenSince : 0)) / 1000) + 60,
        agentSeconds: Math.round(((this.agentDoneAt || Date.now()) - this.startedAt) / 100) / 10,
      })
      .catch(() => undefined);
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
