/**
 * Calibration personas — Methodology → Calibration & Presentation → Validation step.
 *
 * Each persona is written as a narrative first, and every answer is chosen to match that
 * narrative. All three are scored at the 50-250 anchor band (zero size shift), because the
 * calibration target is framed around a realistic mid-market company and the anchor
 * isolates the rubric's point values from the size modifier.
 *
 * Caveat: these are authored personas, not observed companies. Calibration against them
 * shows the point values produce sensible scores for sensible answer patterns; it cannot
 * show the scores match real organizations.
 *
 * Also used as "load an example" presets in the intake, so a demo visitor can skip the
 * 24 questions.
 */
import type { ReadinessInput, RubricAnswers } from './types';

export interface CalibrationPersona {
  readonly id: 'weak' | 'median' | 'strong' | 'foundational';
  readonly label: string;
  readonly narrative: string;
  /** The methodology's target range for S_geom, or null for a reference-only persona. */
  readonly target: { readonly min: number; readonly max: number } | null;
  readonly input: ReadinessInput;
}

const weakAnswers: RubricAnswers = {
  '1.1': 2, '1.2': 2, '1.3': 2, '1.4': 1,
  '2.1': 1, '2.2': 5, '2.3': 0, '2.4': 0,
  '3.1': 1, '3.2': 2, '3.3': 1, '3.4': 2,
  '4.1': 0, '4.2': 4, '4.3': 0, '4.4': 0,
  '5.1': 1, '5.2': 2, '5.3': 0, '5.4': 0,
  '6.1': 2, '6.2': 1, '6.3': 1, '6.4': 0,
};

export const calibrationPersonas: readonly CalibrationPersona[] = [
  {
    id: 'weak',
    label: 'Weak — regional retailer',
    narrative:
      'A 70-person regional retailer. Orders live in a SaaS e-commerce platform, but the target process — weekly sales and stock reporting — runs off spreadsheet exports on a shared drive. The product catalog is agreed; customer records are split between the store and the email tool. Nobody owns data quality, there is no written data policy, and nothing like this has been built before. The owner is curious; budget is being discussed.',
    target: { min: 25, max: 40 },
    input: { rubricAnswers: weakAnswers, industry: 'retail-ecommerce', sizeBand: '50-250', impactAssessment: 'no' },
  },
  {
    id: 'median',
    label: 'Realistic median — mid-market manufacturer',
    narrative:
      'A 150-person manufacturer and distributor. A hybrid on-prem ERP holds orders and inventory; the product master is agreed but finance and operations keep their own spreadsheets. A four-person IT team and one analyst who builds dashboards. Processes are partly documented, data handling policy is informal, and an earlier automation attempt stalled. The COO sponsors a demand-forecasting pilot with budget approved.',
    target: { min: 40, max: 60 },
    input: {
      rubricAnswers: {
        '1.1': 4, '1.2': 2, '1.3': 2, '1.4': 1,
        '2.1': 3, '2.2': 4, '2.3': 3, '2.4': 2,
        '3.1': 3, '3.2': 2, '3.3': 3, '3.4': 2,
        '4.1': 1, '4.2': 4, '4.3': 0, '4.4': 2,
        '5.1': 3, '5.2': 4, '5.3': 1, '5.4': 5, // 5.4: buy (was 3; buy and partner merged at 5, issue 8)
        '6.1': 5, '6.2': 3, '6.3': 3, '6.4': 0,
      },
      industry: 'manufacturing-logistics',
      sizeBand: '50-250',
      // Demand forecasting over orders and inventory: no personal data in the target process.
      impactAssessment: 'no-personal-data',
    },
  },
  {
    id: 'strong',
    label: 'Strong — regional bank operations',
    narrative:
      'A 240-person regional bank\'s operations group. Core banking is an older on-prem platform, still vendor-supported, with APIs on some systems. Access is audited for SOX. Procedures are fully documented and tracked; a model risk function reviews credit models. A data team exists and an earlier RPA program shipped and is maintained. A named executive sponsor, pilot budget, and a specific but not yet baselined metric.',
    target: { min: 65, max: 80 },
    input: {
      rubricAnswers: {
        '1.1': 5, '1.2': 2, '1.3': 4, '1.4': 3,
        '2.1': 3, '2.2': 2, '2.3': 5, '2.4': 3,
        '3.1': 5, '3.2': 4, '3.3': 5, '3.4': 5,
        '4.1': 5, '4.2': 3, '4.3': 5, '4.4': 4,
        '5.1': 3, '5.2': 5, '5.3': 3, '5.4': 5,
        '6.1': 5, '6.2': 3, '6.3': 3, '6.4': 2,
      },
      industry: 'financial',
      sizeBand: '50-250',
      impactAssessment: 'completed',
    },
  },
  {
    id: 'foundational',
    label: 'Reference — weak retailer, stricter reading',
    narrative:
      'The weak persona with two answers read more strictly: every team keeps its own customer list (Q1.2 = 0) and nothing is budgeted (Q6.2 = 0). Kept as a reference because it was the first draft of the weak persona, and the two-answer difference shows how sensitive the bottom of the scale is.',
    target: null,
    input: {
      rubricAnswers: { ...weakAnswers, '1.2': 0, '6.2': 0 },
      industry: 'retail-ecommerce',
      sizeBand: '50-250',
      impactAssessment: 'no',
    },
  },
];
