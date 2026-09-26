/** Closed value sets the model's output is validated against. */
import type {
  DimensionId, GateId, GovernanceFlagType, ImplementationRisk, OutcomeConfidence, UseCaseCategory,
} from '../data/types';

export const USE_CASE_CATEGORIES = [
  'retrieval-over-internal-content', 'entity-resolution', 'phi-touching', 'clinical-decision',
  'credit-pricing-underwriting-eligibility', 'customer-affecting', 'personalization-targeting',
  'unified-customer-view', 'predictive-maintenance', 'live-system-integration',
] as const satisfies readonly UseCaseCategory[];

export const GATE_IDS = [
  'G-U1', 'G-U2', 'G-U3', 'G-U4', 'G-H1', 'G-H2', 'G-H3', 'G-F1', 'G-F2', 'G-F3', 'G-R1', 'G-R2', 'G-M1', 'G-M2',
] as const satisfies readonly GateId[];

export const DIMENSION_IDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const satisfies readonly DimensionId[];
export const OUTCOME_CONFIDENCE = ['high', 'medium', 'low'] as const satisfies readonly OutcomeConfidence[];
export const IMPLEMENTATION_RISK = ['low', 'medium', 'high'] as const satisfies readonly ImplementationRisk[];
export const GOVERNANCE_FLAG_TYPES = ['data-sensitivity', 'compliance', 'reliability', 'oversight'] as const satisfies readonly GovernanceFlagType[];

export const isOneOf = <T extends string>(set: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (set as readonly string[]).includes(v);
