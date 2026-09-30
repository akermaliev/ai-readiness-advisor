/** Display labels for the gate vocabulary (`UseCaseCategory`). */
import type { UseCaseCategory } from './types';

export const useCaseCategoryLabels: Readonly<Record<UseCaseCategory, string>> = {
  'retrieval-over-internal-content': 'Search or Q&A over internal content',
  'entity-resolution': 'Matching records across systems',
  'phi-touching': 'Uses protected health information',
  'clinical-decision': 'Influences clinical decisions',
  'credit-pricing-underwriting-eligibility': 'Credit, pricing, underwriting or eligibility decisions',
  'customer-affecting': 'Customer-affecting decisions',
  'personalization-targeting': 'Personalization or targeting',
  'unified-customer-view': 'Needs a unified customer view',
  'predictive-maintenance': 'Predictive maintenance / failure prediction',
  'live-system-integration': 'Live integration with operational systems',
};

/**
 * v1.2 (A5) — what each gate category means, for the model's tagging. One line on what
 * counts, one "does not count" example. Over-tagging stays the safe direction (the prompt
 * says to tag whenever a category plausibly applies); the examples exist to stop tags
 * that are plainly wrong, which cause false blocks.
 */
export const useCaseCategoryDefinitions: Readonly<Record<UseCaseCategory, { readonly counts: string; readonly doesNotCount: string }>> = {
  'retrieval-over-internal-content': {
    counts: 'searches, retrieves or answers from the company\'s own documents, tickets, records or knowledge bases',
    doesNotCount: 'working only from the one document a person hands it in the moment',
  },
  'entity-resolution': {
    counts: 'matches or joins records about the same customer, supplier, product or asset across systems or files',
    doesNotCount: 'reading fields from a single document or a single table',
  },
  'phi-touching': {
    counts: 'reads, stores or produces protected health information about identifiable patients',
    doesNotCount: 'aggregate, de-identified volume or staffing statistics',
  },
  'clinical-decision': {
    counts: 'its output could change a diagnosis, treatment, triage or other care decision',
    doesNotCount: 'scheduling, billing, coding or staffing work',
  },
  'credit-pricing-underwriting-eligibility': {
    counts: 'its output feeds a decision on credit, price, underwriting, coverage or eligibility for a customer or applicant',
    doesNotCount: 'internal finance reporting or vendor invoice review',
  },
  'customer-affecting': {
    counts: 'its output reaches customers or shapes something they receive (a reply, an offer, a decision), even if staff review it first',
    doesNotCount: 'internal reports or staff-only tools whose output never reaches a customer',
  },
  'personalization-targeting': {
    counts: 'tailors content, offers, prices or outreach to an individual or segment from their data or behavior',
    doesNotCount: 'the same message or catalogue shown to everyone',
  },
  'unified-customer-view': {
    counts: 'needs one combined record of each customer across channels or systems',
    doesNotCount: 'work inside a single system\'s own customer list',
  },
  'predictive-maintenance': {
    counts: 'predicts equipment failure or schedules maintenance from sensor or maintenance history',
    doesNotCount: 'forecasting demand, sales or inventory',
  },
  'live-system-integration': {
    counts: 'reads from or writes to an operational system (ERP, MES, core banking, POS, OT) while it runs',
    doesNotCount: 'forecasting or analysis from historical exports or periodic extracts',
  },
};
