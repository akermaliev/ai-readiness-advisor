import type { ReactNode } from 'react';
import type { ScoringOutput } from '../data/types';
import { ConfidenceBanner } from './ConfidenceBanner';
import { CrossProfile } from './CrossProfile';
import { Diagnostics } from './Diagnostics';
import { DimensionBreakdown } from './DimensionBreakdown';
import { GateResults } from './GateResults';
import { Headline } from './Headline';

/**
 * Stage 4 — the deterministic report, in the tech doc's section order. Renders entirely
 * from `ScoringOutput`; no network, no model. `children` is the slot Stage 5 appends to.
 */
export function Report({ output, children }: { output: ScoringOutput; children?: ReactNode }) {
  return (
    <div className="space-y-5" data-testid="report">
      <Headline output={output} />
      <DimensionBreakdown output={output} />
      <Diagnostics output={output} />
      <GateResults output={output} />
      <ConfidenceBanner output={output} />
      <CrossProfile output={output} />
      {children}
    </div>
  );
}
