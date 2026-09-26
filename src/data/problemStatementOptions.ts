/**
 * Methodology → Problem Statement Intake: option lists for the intent inputs, plus the
 * back-office nudge rule. Intent inputs never reach the scoring engine.
 */
import type { PrimaryBottleneck, TargetFunction, TimeHorizon } from './types';

export const primaryBottleneckOptions = [
  { id: 'manual-data-entry-document-handling', label: 'Manual data entry & document handling' },
  { id: 'slow-decision-cycles', label: 'Slow decision cycles' },
  { id: 'customer-response-time', label: 'Customer response time' },
  { id: 'forecasting-planning', label: 'Forecasting & planning' },
  { id: 'repetitive-analysis-reporting', label: 'Repetitive analysis & reporting' },
  { id: 'quality-control-inspection', label: 'Quality control & inspection' },
  { id: 'other', label: 'Other' },
] as const satisfies readonly { id: PrimaryBottleneck; label: string }[];

export const targetFunctionOptions = [
  { id: 'back-office-operations', label: 'Back office / operations' },
  { id: 'customer-facing', label: 'Customer-facing' },
  { id: 'finance', label: 'Finance' },
  { id: 'sales-marketing', label: 'Sales & marketing' },
  { id: 'engineering-product', label: 'Engineering / product' },
  { id: 'supply-chain', label: 'Supply chain' },
] as const satisfies readonly { id: TargetFunction; label: string }[];

export const timeHorizonOptions = [
  { id: 'pilot-lt-3-months', label: 'Pilot in under 3 months' },
  { id: '3-6-months', label: '3-6 months' },
  { id: '6-12-months', label: '6-12 months' },
  { id: 'exploring', label: 'Exploring' },
] as const satisfies readonly { id: TimeHorizon; label: string }[];

/** The back-office nudge fires when the target function is one of these. */
export const BACK_OFFICE_NUDGE_FUNCTIONS: readonly TargetFunction[] = ['sales-marketing', 'customer-facing'];

export const ELABORATION_MAX_CHARS = 200;
