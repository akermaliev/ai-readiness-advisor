/** Demo presets: the calibration personas plus a sample problem statement each. */
import { calibrationPersonas } from '../data/calibrationPersonas';
import type { ProblemStatement, ReadinessInput } from '../data/types';

export interface DemoPreset {
  readonly id: string;
  readonly label: string;
  readonly narrative: string;
  readonly readiness: ReadinessInput;
  readonly problem: ProblemStatement;
}

const SAMPLE_PROBLEMS: Readonly<Record<string, ProblemStatement>> = {
  weak: {
    primaryBottleneck: 'repetitive-analysis-reporting',
    targetFunction: 'sales-marketing',
    elaboration: 'We want AI to write product descriptions and personalize our email campaigns.',
    timeHorizon: 'pilot-lt-3-months',
  },
  median: {
    primaryBottleneck: 'forecasting-planning',
    targetFunction: 'supply-chain',
    elaboration: 'Planners rebuild demand forecasts for ~2,000 SKUs in spreadsheets every week.',
    timeHorizon: '3-6-months',
  },
  strong: {
    primaryBottleneck: 'customer-response-time',
    targetFunction: 'customer-facing',
    elaboration: 'Faster, consistent answers to customer questions about account and loan status.',
    timeHorizon: '6-12-months',
  },
};

export const demoPresets: readonly DemoPreset[] = calibrationPersonas.flatMap((p) => {
  const problem = SAMPLE_PROBLEMS[p.id];
  return problem === undefined ? [] : [{ id: p.id, label: p.label, narrative: p.narrative, readiness: p.input, problem }];
});
