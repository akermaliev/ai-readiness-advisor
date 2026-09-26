/**
 * Stage 1 — the 5 × 6 base industry weight table.
 *
 * Transcribed from "AI Readiness Advisor — Scoring Methodology Specification"
 * → Industry Weight Profiles → The profiles.
 *
 * These are BASE weights only. They are combined with `sizeModifiers.ts` at
 * runtime by Stage 2's `resolveWeights(industry, sizeBand)` — deliberately not
 * pre-crossed, per Technical Requirements → Stage 1.
 *
 * Invariant (asserted in the Stage 1 test): each profile's six values sum to exactly 100.
 *
 * Honesty constraint from the methodology: these weights are the project's own
 * criticality estimates, not derived from a validated empirical study. The UI must
 * show the applied profile, its rationale, and the cross-profile sensitivity range.
 */

import type { IndustryId, IndustryProfile, WeightProfile } from './types';

/**
 * A weight expresses criticality: how badly a failure in this dimension kills an
 * AI initiative in this sector. It does NOT express discriminating power.
 */
export const weightProfiles = {
  'tech-saas': { D1: 20, D2: 25, D3: 15, D4: 10, D5: 15, D6: 15 },
  healthcare: { D1: 25, D2: 15, D3: 10, D4: 30, D5: 10, D6: 10 },
  financial: { D1: 20, D2: 15, D3: 15, D4: 30, D5: 10, D6: 10 },
  'retail-ecommerce': { D1: 30, D2: 20, D3: 15, D4: 15, D5: 10, D6: 10 },
  'manufacturing-logistics': { D1: 30, D2: 25, D3: 15, D4: 10, D5: 10, D6: 10 },
} as const satisfies Record<IndustryId, WeightProfile>;

/** The five industries in display order, with the doc's one-line tooltip rationale. */
export const industryProfiles = [
  {
    id: 'tech-saas',
    label: 'Tech / SaaS',
    rationale:
      'Architecture-led. Data and talent are usually adequate; what kills initiatives is system sprawl and no defined owner. Highest strategy weight in the set for that reason.',
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    rationale:
      'Governance-dominant. Clinical data complexity, HIPAA exposure, and outputs clinicians must be able to trust mean an undetected data quality issue carries direct patient risk rather than only a technical cost. Data stays high because interoperability is the real bottleneck.',
  },
  {
    id: 'financial',
    label: 'Financial',
    rationale:
      "Governance-dominant through a different mechanism: model risk management (the SR 11-7 lineage), explainability, auditability, fair-lending exposure. Data infrastructure is typically more mature than healthcare's, so D1 sits slightly lower.",
  },
  {
    id: 'retail-ecommerce',
    label: 'Retail & E-commerce',
    rationale:
      'Data-led. Transaction and behavioral volume exists; the constraint is quality, cross-channel unification, and whether there is a single customer system of record.',
  },
  {
    id: 'manufacturing-logistics',
    label: 'Manufacturing & Logistics',
    rationale:
      'Data plus architecture. The sector\'s signature failure is the "value exists but data doesn\'t" trap: predictive maintenance is high-value but only feasible with sufficient sensor data and historical failure records, and OT/IT integration is the gate.',
  },
] as const satisfies readonly IndustryProfile[];

/** All five industry ids — used by Stage 2's cross-profile sensitivity. */
export const industryIds = [
  'tech-saas',
  'healthcare',
  'financial',
  'retail-ecommerce',
  'manufacturing-logistics',
] as const satisfies readonly IndustryId[];

/** Every profile's weights sum to this. */
export const WEIGHT_TOTAL = 100;
