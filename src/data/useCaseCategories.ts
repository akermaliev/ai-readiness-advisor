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
