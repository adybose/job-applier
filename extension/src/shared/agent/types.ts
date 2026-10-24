// A proposed value for one field, from any stage. Routing is decided separately by the policy (spec 05 R-AL-11).
export type Origin = 'mapper' | 'model' | 'memory' | 'draft' | 'user';

export type ProposalAction = 'fill' | 'select_option' | 'set_checked' | 'upload_file' | 'skip' | 'ask';

export interface Proposal {
  fieldId: string;
  action: ProposalAction;
  value: string;
  confidence: number;
  rationale: string;
  /** The model's own sensitivity flag; OR'ed with the code-side classifier, never trusted alone. */
  sensitive: boolean;
  origin: Origin;
  /** Set when the only "resume" available is the LinkedIn PDF (spec 02 R-PI-13). */
  usesLinkedinPdf?: boolean;
}
