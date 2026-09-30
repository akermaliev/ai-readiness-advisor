/**
 * Stage 1 — the 24-question intake rubric.
 *
 * Transcribed from "AI Readiness Advisor — Scoring Methodology Specification"
 * → Intake Question Bank. Option labels and point values are verbatim.
 *
 * Invariant (asserted in the Stage 1 test): each dimension's four questions have
 * maximum option values summing to exactly 20.
 */

import type { Dimension, DimensionId, ImpactAssessmentStatus, Question } from './types';

/** Methodology → The Six Dimensions. */
export const dimensions = [
  {
    id: 'D1',
    name: 'Data maturity & accessibility',
    measures:
      'Is relevant data collected, structured, unified, and retrievable by the people who need it',
    whySeparate: 'The most frequently cited root cause of stalled pilots',
  },
  {
    id: 'D2',
    name: 'Integration architecture',
    measures:
      'Can systems expose data via stable APIs, is there a system of record, are permissions consistent across connected systems',
    whySeparate: 'Distinct from D1: you can have clean data that no system can reach',
  },
  {
    id: 'D3',
    name: 'Process definition',
    measures: 'Are the target workflows documented and repeatable, or ad hoc and tribal',
    whySeparate: 'AI automates a process; an undefined process has nothing to automate',
  },
  {
    id: 'D4',
    name: 'Governance & compliance',
    measures:
      'Data handling policy, regulatory exposure, model oversight capability, auditability',
    whySeparate: 'The gating dimension in regulated sectors',
  },
  {
    id: 'D5',
    name: 'Team & tooling capacity',
    measures:
      'In-house capability to build, validate, and maintain an AI-assisted workflow',
    whySeparate: 'Distinguishes "can pilot" from "can sustain"',
  },
  {
    id: 'D6',
    name: 'Strategy & sponsorship',
    measures: 'Named owner, allocated budget, a defined success metric, executive backing',
    whySeparate:
      'Cheap to ask about, strongly predictive, almost always omitted by naive rubrics',
  },
] as const satisfies readonly Dimension[];

/** All 24 questions, in document order. */
export const questionBank = [
  /* ---------------- D1 — Data maturity & accessibility ---------------- */
  {
    id: '1.1',
    dimension: 'D1',
    prompt: 'Where does the data for the target process primarily live?',
    options: [
      { label: 'Paper/email only', points: 0 },
      { label: 'Spreadsheets on individual machines', points: 1 },
      { label: 'Shared drive spreadsheets', points: 2 },
      { label: 'A database or SaaS system', points: 4 },
      { label: 'Integrated system with a defined schema', points: 5 },
    ],
  },
  {
    id: '1.2',
    dimension: 'D1',
    prompt:
      'Is there a single agreed source of truth for your core business entities (customers, orders, patients, assets)?',
    options: [
      { label: 'No, teams keep separate versions', points: 0 },
      { label: 'Partly, one domain only', points: 2 },
      { label: 'Yes, documented and enforced', points: 5 },
    ],
  },
  {
    id: '1.3',
    dimension: 'D1',
    prompt:
      'Can a non-technical employee pull a report on this process without asking IT or an analyst?',
    options: [
      { label: 'No', points: 0 },
      { label: 'Only pre-built reports', points: 2 },
      { label: 'Yes, self-serve', points: 4 },
      { label: 'Yes, plus ad-hoc query access', points: 5 },
    ],
  },
  {
    id: '1.4',
    dimension: 'D1',
    prompt: 'Is data quality actively monitored (duplicates, missing fields, staleness)?',
    options: [
      { label: 'Never checked', points: 0 },
      { label: 'Checked when something breaks', points: 1 },
      { label: 'Periodic manual review', points: 3 },
      { label: 'Automated monitoring with alerts', points: 5 },
    ],
  },

  /* ---------------- D2 — Integration architecture ---------------- */
  {
    id: '2.1',
    dimension: 'D2',
    prompt: 'Do your core business systems expose data through APIs?',
    options: [
      { label: 'No / unknown', points: 0 },
      { label: 'Manual export only', points: 1 },
      { label: 'Some systems, inconsistently', points: 3 },
      { label: 'Most systems, stable and documented', points: 5 },
    ],
  },
  {
    id: '2.2',
    dimension: 'D2',
    prompt: 'How old are the systems this process depends on?',
    options: [
      { label: 'Legacy, vendor no longer supports', points: 0 },
      { label: 'Older on-prem, still supported', points: 2 },
      { label: 'Modern on-prem or hybrid', points: 4 },
      { label: 'Current cloud/SaaS', points: 5 },
    ],
  },
  {
    id: '2.3',
    dimension: 'D2',
    prompt:
      'Are access permissions consistent across the systems that would be connected?',
    options: [
      { label: 'Unknown / never audited', points: 0 },
      { label: 'Known to be inconsistent', points: 1 },
      { label: 'Mostly consistent, some legacy gaps', points: 3 },
      { label: 'Audited and consistent', points: 5 },
    ],
    note:
      'This question earns its place. When a retrieval-based assistant answers a question, it draws on everything the requesting user can already access — so an over-shared folder containing sensitive records becomes an AI exposure the moment the system is connected. Inconsistent permissions convert a data-governance debt into an active leak.',
  },
  {
    id: '2.4',
    dimension: 'D2',
    prompt:
      'Can structured records and unstructured content (documents, tickets, notes) be searched together?',
    options: [
      { label: 'No', points: 0 },
      { label: 'Separately only', points: 2 },
      { label: 'Partially unified', points: 3 },
      { label: 'Yes, unified search with usable metadata', points: 5 },
    ],
  },

  /* ---------------- D3 — Process definition ---------------- */
  {
    id: '3.1',
    dimension: 'D3',
    prompt: 'Is the target workflow documented?',
    options: [
      { label: 'Not at all', points: 0 },
      { label: "Informally, in someone's head", points: 1 },
      { label: 'Partially documented', points: 3 },
      { label: 'Fully documented and maintained', points: 5 },
    ],
  },
  {
    id: '3.2',
    dimension: 'D3',
    prompt: 'How consistently is it executed across people doing the same job?',
    options: [
      { label: 'Everyone does it differently', points: 0 },
      { label: 'Broadly similar', points: 2 },
      { label: 'Standardized with known exceptions', points: 4 },
      { label: 'Standardized and measured', points: 5 },
    ],
  },
  {
    id: '3.3',
    dimension: 'D3',
    prompt:
      'Is there a measurable baseline for this process today (time, cost, error rate, volume)?',
    options: [
      { label: 'No measurement', points: 0 },
      { label: 'Anecdotal', points: 1 },
      { label: 'Measured occasionally', points: 3 },
      { label: 'Tracked continuously', points: 5 },
    ],
  },
  {
    id: '3.4',
    dimension: 'D3',
    prompt:
      'Where does a human decision currently enter the workflow, and is that decision point defined?',
    options: [
      { label: 'Undefined / varies', points: 0 },
      { label: 'Known informally', points: 2 },
      { label: 'Explicitly defined', points: 5 },
    ],
  },

  /* ---------------- D4 — Governance & compliance ---------------- */
  {
    id: '4.1',
    dimension: 'D4',
    prompt: 'Is there a written data handling / classification policy?',
    options: [
      { label: 'No', points: 0 },
      { label: 'Draft or informal', points: 1 },
      { label: 'Written, partially followed', points: 3 },
      { label: 'Written, enforced, reviewed', points: 5 },
    ],
  },
  {
    id: '4.2',
    dimension: 'D4',
    prompt:
      'Does this process touch regulated or sensitive data (PII, PHI, payment, financial records)?',
    options: [
      { label: 'Yes, heavily, no controls mapped', points: 0 },
      { label: 'Yes, with documented controls', points: 3 },
      { label: 'Minimal sensitive data', points: 4 },
      { label: 'None', points: 5 },
    ],
    note:
      'Inverted scale. Higher sensitivity scores lower on readiness because it raises the control bar, not because handling sensitive data is bad. This must be stated in the UI or it reads as a bug.',
  },
  {
    id: '4.3',
    dimension: 'D4',
    prompt: 'Is there an existing model / algorithm review or validation function?',
    options: [
      { label: 'None', points: 0 },
      { label: 'Ad hoc, project by project', points: 2 },
      { label: 'Formal review for some systems', points: 4 },
      { label: 'Established model risk function', points: 5 },
    ],
  },
  {
    id: '4.4',
    dimension: 'D4',
    prompt:
      'Could you produce an audit trail explaining how an automated decision was reached?',
    options: [
      { label: 'No', points: 0 },
      { label: 'Partially, with effort', points: 2 },
      { label: 'Yes, for most systems', points: 4 },
      { label: 'Yes, as standard practice', points: 5 },
    ],
  },

  /* ---------------- D5 — Team & tooling capacity ---------------- */
  {
    id: '5.1',
    dimension: 'D5',
    prompt: 'Who would maintain an AI-assisted workflow after launch?',
    options: [
      { label: 'Nobody identified', points: 0 },
      { label: 'Whoever built it, informally', points: 1 },
      { label: 'An existing IT/ops team', points: 3 },
      { label: 'A named owner with allocated time', points: 5 },
    ],
  },
  {
    id: '5.2',
    dimension: 'D5',
    prompt: 'In-house technical capability for this kind of work?',
    options: [
      { label: 'None', points: 0 },
      { label: 'General IT only', points: 2 },
      { label: 'Some data/analytics capability', points: 4 },
      { label: 'Data engineering or ML capability', points: 5 },
    ],
  },
  {
    id: '5.3',
    dimension: 'D5',
    prompt: 'Have you shipped and sustained a comparable internal system before?',
    options: [
      { label: 'Never', points: 0 },
      { label: 'Tried, stalled', points: 1 },
      { label: 'Yes, one', points: 3 },
      { label: 'Yes, repeatedly', points: 5 },
    ],
  },
  {
    id: '5.4',
    dimension: 'D5',
    prompt: 'Would you build in-house, partner, or buy?',
    options: [
      { label: 'Undecided / no plan yet', points: 0 },
      { label: 'In-house only', points: 2 },
      // v1.1, issue 8: was 3. MIT NANDA's primary report groups buying and co-developing with
      // vendors as "Strategic Partnerships (Buy)", 66% successful deployment, vs 33% for fully
      // in-house builds; a hybrid (internal team co-develops with a vendor) had insufficient data.
      // So buying and partnering score alike (ruled 2026-09-29). Answers are stored as points,
      // so two options worth 5 would be indistinguishable; they are merged into one option,
      // which is also how the report defines its "Buy" group.
      { label: 'Buy or partner: a vendor tool, or in-house plus external expertise', points: 5 },
    ],
    note:
      "Why in-house only scores low: in MIT NANDA's 2025 study of generative-AI deployments (52 organizations interviewed), projects bought from or co-developed with external vendors reached successful deployment about twice as often as fully in-house builds (66% vs 33%). Buying and partnering therefore score the same. The study reports a correlation, not proof of cause.",
  },

  /* ---------------- D6 — Strategy & sponsorship ---------------- */
  {
    id: '6.1',
    dimension: 'D6',
    prompt: 'Is there a named executive sponsor for this initiative?',
    options: [
      { label: 'No', points: 0 },
      { label: 'Interested but uncommitted', points: 2 },
      { label: 'Named and engaged', points: 5 },
    ],
  },
  {
    id: '6.2',
    dimension: 'D6',
    prompt: 'Is there allocated budget?',
    options: [
      { label: 'None', points: 0 },
      { label: 'Being discussed', points: 1 },
      { label: 'Approved for a pilot', points: 3 },
      { label: 'Approved through production', points: 5 },
    ],
  },
  {
    id: '6.3',
    dimension: 'D6',
    prompt: 'Is there a defined success metric agreed in advance?',
    options: [
      { label: 'No', points: 0 },
      { label: 'Vague ("improve efficiency")', points: 1 },
      { label: 'Specific but unmeasured', points: 3 },
      { label: 'Specific, measurable, baselined', points: 5 },
    ],
  },
  {
    id: '6.4',
    dimension: 'D6',
    prompt: 'What happens to the staff time this frees up?',
    options: [
      { label: 'Not considered', points: 0 },
      { label: 'Assumed headcount reduction', points: 2 },
      { label: 'Redeployment planned', points: 5 },
    ],
  },
] as const satisfies readonly Question[];

/** The same 24 questions grouped by dimension, in document order. */
export const questionsByDimension: Readonly<Record<DimensionId, readonly Question[]>> = {
  D1: questionBank.filter((q) => q.dimension === 'D1'),
  D2: questionBank.filter((q) => q.dimension === 'D2'),
  D3: questionBank.filter((q) => q.dimension === 'D3'),
  D4: questionBank.filter((q) => q.dimension === 'D4'),
  D5: questionBank.filter((q) => q.dimension === 'D5'),
  D6: questionBank.filter((q) => q.dimension === 'D6'),
};

/** Maximum raw score per dimension. 20 for every dimension — asserted by the Stage 1 test. */
export const MAX_DIMENSION_RAW = 20;

/**
 * v1.1, issue 9 — one UNSCORED question, shown on the D4 screen after the four scored ones.
 * Leaving it unscored keeps the 4 × 5 = 20 structure and the calibration intact. It feeds
 * gate G-U5 and consistency check C6 only. The tool does not perform an assessment and does
 * not determine whether one is legally required; it narrows and flags.
 */
export const impactAssessmentQuestion = {
  prompt: 'Has a privacy or AI impact assessment been completed for this process?',
  options: [
    { value: 'no-personal-data', label: 'No personal data involved' },
    { value: 'no', label: 'No' },
    { value: 'in-progress', label: 'In progress' },
    { value: 'completed', label: 'Completed and current' },
  ],
  note:
    'Not scored. A privacy impact assessment (PIA or DPIA) or an AI impact assessment is run before processing personal data, and in some cases the law requires one. Your answer only feeds a warning and a consistency check.',
} as const satisfies {
  readonly prompt: string;
  readonly options: readonly { readonly value: ImpactAssessmentStatus; readonly label: string }[];
  readonly note: string;
};
