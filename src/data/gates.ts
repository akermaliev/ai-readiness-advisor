/**
 * Stage 1 — the gate layer, as declarative data.
 *
 * Transcribed from "AI Readiness Advisor — Scoring Methodology Specification"
 * → Gate Layer. Stage 2's `evaluateGates` interprets these; this file only states them.
 *
 * Each gate has two independent tests:
 *   - `condition` — the answer-side test, a conjunction of machine-checkable clauses
 *     over rubric answers.
 *   - `scope` — the recommendation-side test. `{ kind: 'categories' }` means the gate
 *     only reaches recommendations carrying one of those categories; `{ kind: 'global' }`
 *     means it reaches every recommendation. Global is explicit rather than an empty
 *     category list, so an evaluator cannot read "no category filter" as "never fires".
 *
 * Gates are evaluated independently of the composite score and are not score penalties.
 * A company can score 78 and still have three blocked use cases.
 *
 * Tuning note carried from the methodology: thresholds are deliberately conservative.
 * A false block costs a user one unnecessary caution; a false pass in a regulated
 * sector costs the credibility of the tool.
 */

import type { ConsistencyCheck, Gate } from './types';

export const gates = [
  /* ---------------- Universal gates (all sectors) ---------------- */
  {
    id: 'G-U1',
    appliesTo: 'universal',
    effect: 'block',
    condition: { all: [{ questionId: '2.3', op: 'eq', value: 0 }] },
    scope: { kind: 'categories', categories: ['retrieval-over-internal-content'] },
    conditionText:
      'Q2.3 = 0 (permissions never audited) AND recommendation involves retrieval over internal content',
    effectText:
      'Connecting a retrieval system to unaudited permissions turns existing over-sharing into active exposure.',
    unblockCondition:
      'Audit access permissions across the systems that would be connected, so Q2.3 is no longer "Unknown / never audited".',
  },
  {
    id: 'G-U2',
    appliesTo: 'universal',
    effect: 'block',
    condition: { all: [{ questionId: '1.2', op: 'eq', value: 0 }] },
    scope: { kind: 'categories', categories: ['entity-resolution'] },
    conditionText:
      'Q1.2 = 0 (no single source of truth) AND recommendation depends on entity resolution',
    effectText: 'No reliable join key.',
    unblockCondition:
      'Establish an agreed source of truth for the core business entity this use case joins on, at least for one domain (Q1.2 ≥ 2).',
  },
  {
    id: 'G-U3',
    appliesTo: 'universal',
    effect: 'warn-severe',
    condition: { all: [{ questionId: '3.1', op: 'eq', value: 0 }] },
    scope: { kind: 'global' },
    conditionText: 'Q3.1 = 0 (process not documented at all)',
    effectText:
      'Nothing stable to automate; recommend process definition as the prerequisite pilot.',
    unblockCondition:
      'Document the target workflow, even informally, before automating it (Q3.1 ≥ 1).',
  },
  {
    id: 'G-U4',
    appliesTo: 'universal',
    effect: 'warn-severe',
    condition: { all: [{ questionId: '5.1', op: 'eq', value: 0 }] },
    scope: { kind: 'global' },
    conditionText: 'Q5.1 = 0 (no maintainer identified)',
    effectText:
      'Predicts pilot-to-production failure regardless of technical readiness.',
    unblockCondition:
      'Identify who owns the workflow after launch — a named person or team, not "whoever builds it" (Q5.1 ≥ 1).',
  },

  /* ---------------- Healthcare gates ---------------- */
  {
    id: 'G-H1',
    appliesTo: 'healthcare',
    effect: 'block',
    condition: {
      all: [
        { questionId: '4.2', op: 'lte', value: 3 },
        { questionId: '4.1', op: 'lte', value: 1 },
      ],
    },
    scope: { kind: 'categories', categories: ['phi-touching'] },
    conditionText:
      'Q4.2 indicates PHI AND Q4.1 ≤ 1 (no written handling policy)',
    effectText: 'Block all PHI-touching use cases.',
    unblockCondition:
      'Put a written data handling / classification policy in place and follow it (Q4.1 ≥ 3).',
  },
  {
    id: 'G-H2',
    appliesTo: 'healthcare',
    effect: 'block',
    condition: { all: [{ questionId: '4.4', op: 'lte', value: 2 }] },
    scope: { kind: 'categories', categories: ['clinical-decision'] },
    conditionText:
      'Recommendation would influence a clinical decision AND Q4.4 ≤ 2 (no audit trail)',
    effectText: 'Route to non-clinical / administrative use cases instead.',
    unblockCondition:
      'Be able to produce an audit trail for how an automated decision was reached, for most systems (Q4.4 ≥ 4).',
  },
  {
    id: 'G-H3',
    appliesTo: 'healthcare',
    effect: 'warn',
    condition: { all: [{ questionId: '4.3', op: 'eq', value: 0 }] },
    scope: { kind: 'global' },
    conditionText: 'Q4.3 = 0 (no validation function)',
    effectText: 'Cap recommendations at human-in-the-loop assistive scope.',
    unblockCondition:
      'Stand up a model / algorithm review function, even project by project (Q4.3 ≥ 2).',
  },

  /* ---------------- Financial gates ---------------- */
  {
    id: 'G-F1',
    appliesTo: 'financial',
    effect: 'block',
    condition: { all: [{ questionId: '4.3', op: 'lte', value: 2 }] },
    scope: {
      kind: 'categories',
      categories: ['credit-pricing-underwriting-eligibility'],
    },
    conditionText:
      'Recommendation affects credit, pricing, underwriting, or eligibility AND Q4.3 ≤ 2',
    effectText:
      'These are model-risk-governed decisions; without a validation function there is no route to production.',
    unblockCondition:
      'Establish formal model review for these systems (Q4.3 ≥ 4).',
  },
  {
    id: 'G-F2',
    appliesTo: 'financial',
    effect: 'block',
    condition: { all: [{ questionId: '4.4', op: 'lte', value: 2 }] },
    scope: { kind: 'categories', categories: ['customer-affecting'] },
    conditionText:
      'Q4.4 ≤ 2 (no audit trail) AND recommendation is customer-affecting',
    effectText: 'Adverse-action explainability cannot be satisfied.',
    unblockCondition:
      'Be able to produce an audit trail for how an automated decision was reached, for most systems (Q4.4 ≥ 4).',
  },
  {
    id: 'G-F3',
    appliesTo: 'financial',
    effect: 'warn-severe',
    condition: {
      all: [
        { questionId: '4.1', op: 'lte', value: 1 },
        { questionId: '4.2', op: 'lte', value: 3 },
      ],
    },
    scope: { kind: 'global' },
    conditionText: 'Q4.1 ≤ 1 AND process touches financial records',
    effectText:
      'Regulated records handled without a written, followed data handling policy.',
    unblockCondition:
      'Put a written data handling / classification policy in place and follow it (Q4.1 ≥ 3).',
  },

  /* ---------------- Retail & E-commerce gates ---------------- */
  {
    id: 'G-R1',
    appliesTo: 'retail-ecommerce',
    effect: 'warn-severe',
    condition: { all: [{ questionId: '4.1', op: 'eq', value: 0 }] },
    scope: { kind: 'categories', categories: ['personalization-targeting'] },
    conditionText: 'Recommendation is personalization/targeting AND Q4.1 = 0',
    effectText: 'Consumer privacy exposure with no policy backing.',
    unblockCondition:
      'Write a data handling / classification policy covering consumer data (Q4.1 ≥ 1).',
  },
  {
    id: 'G-R2',
    appliesTo: 'retail-ecommerce',
    effect: 'block',
    condition: { all: [{ questionId: '1.2', op: 'eq', value: 0 }] },
    scope: { kind: 'categories', categories: ['unified-customer-view'] },
    conditionText:
      'Q1.2 = 0 AND recommendation requires a unified customer view',
    effectText: 'Sector-specific instance of G-U2.',
    unblockCondition:
      'Establish a single agreed customer system of record (Q1.2 ≥ 2).',
  },

  /* ---------------- Manufacturing & Logistics gates ---------------- */
  {
    id: 'G-M1',
    appliesTo: 'manufacturing-logistics',
    effect: 'block',
    condition: { all: [{ questionId: '1.1', op: 'lte', value: 2 }] },
    scope: { kind: 'categories', categories: ['predictive-maintenance'] },
    conditionText:
      'Recommendation is predictive maintenance / failure prediction AND Q1.1 ≤ 2 (no systematic data capture)',
    effectText:
      'The signature sector trap — high value, no historical failure record to learn from.',
    unblockCondition:
      'Capture the process data in a database or SaaS system rather than spreadsheets or paper (Q1.1 ≥ 4).',
  },
  {
    id: 'G-M2',
    appliesTo: 'manufacturing-logistics',
    effect: 'block',
    condition: { all: [{ questionId: '2.2', op: 'eq', value: 0 }] },
    scope: { kind: 'categories', categories: ['live-system-integration'] },
    conditionText:
      'Q2.2 = 0 (unsupported legacy OT systems) AND recommendation requires live system integration',
    effectText: 'No supported integration surface on the systems involved.',
    unblockCondition:
      'Move off vendor-unsupported legacy systems, or add a supported integration layer in front of them (Q2.2 ≥ 2).',
  },
] as const satisfies readonly Gate[];

/**
 * Methodology → Intake Question Bank → Consistency checks.
 *
 * Definitions only. C1, C2 and C4 read normalized dimension scores rather than raw
 * answers, so their predicates live in Stage 2's `runConsistencyChecks`; this file
 * supplies the stable ids and the banner text `ScoringOutput.confidenceFlags` carries.
 *
 * Each triggers a low-confidence input flag. None is a score penalty.
 */
export const consistencyChecks = [
  {
    id: 'C1',
    conditionText: 'D1 normalized ≥ 75 but Q3.1 ≤ 1',
    description: 'Claims mature data on an undocumented process',
  },
  {
    id: 'C2',
    conditionText: 'D4 normalized ≥ 75 but Q4.1 = 0',
    description: 'Claims governance readiness with no written policy',
  },
  {
    id: 'C3',
    conditionText: 'Q6.2 ≥ 3 but Q6.1 = 0',
    description: 'Budget without a sponsor — usually means neither is real',
  },
  {
    id: 'C4',
    conditionText: 'Every dimension ≥ 80',
    description:
      'Uniformly high self-assessment; the pattern the calibration data says is rare',
  },
  {
    id: 'C5',
    conditionText: 'Q2.1 = 0 but Q2.4 ≥ 3',
    description: 'Unified search claimed without system connectivity',
  },
] as const satisfies readonly ConsistencyCheck[];
