/** Closed value sets the model's output is validated against. */
import type {
  DimensionId, GateId, GovernanceFlagType, ImplementationRisk, OutcomeConfidence, QuestionId, UseCaseCategory,
} from '../data/types';

export const USE_CASE_CATEGORIES = [
  'retrieval-over-internal-content', 'entity-resolution', 'phi-touching', 'clinical-decision',
  'credit-pricing-underwriting-eligibility', 'customer-affecting', 'personalization-targeting',
  'unified-customer-view', 'predictive-maintenance', 'live-system-integration',
] as const satisfies readonly UseCaseCategory[];

export const GATE_IDS = [
  'G-U1', 'G-U2', 'G-U3', 'G-U4', 'G-U5', 'G-H1', 'G-H2', 'G-H3', 'G-F1', 'G-F2', 'G-F3', 'G-R1', 'G-R2', 'G-M1', 'G-M2',
] as const satisfies readonly GateId[];

export const DIMENSION_IDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const satisfies readonly DimensionId[];
/** v1.3: the 24 rubric question ids, for `roadmap.defer[].unlockAnswers`. */
export const QUESTION_IDS = [
  '1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3', '2.4', '3.1', '3.2', '3.3', '3.4',
  '4.1', '4.2', '4.3', '4.4', '5.1', '5.2', '5.3', '5.4', '6.1', '6.2', '6.3', '6.4',
] as const satisfies readonly QuestionId[];
export const OUTCOME_CONFIDENCE = ['high', 'medium', 'low'] as const satisfies readonly OutcomeConfidence[];
export const IMPLEMENTATION_RISK = ['low', 'medium', 'high'] as const satisfies readonly ImplementationRisk[];
export const GOVERNANCE_FLAG_TYPES = ['data-sensitivity', 'compliance', 'reliability', 'oversight'] as const satisfies readonly GovernanceFlagType[];

export const isOneOf = <T extends string>(set: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (set as readonly string[]).includes(v);

/**
 * The canonical member of `set` that matches `v` ignoring case, or undefined. Structured
 * output does not guarantee enum casing (Anthropic docs), so a "High" is accepted as "high".
 */
export const canonicalOf = <T extends string>(set: readonly T[], v: unknown): T | undefined =>
  typeof v === 'string' ? set.find((x) => x.toLowerCase() === v.toLowerCase()) : undefined;
