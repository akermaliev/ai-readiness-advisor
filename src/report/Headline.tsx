import { IMBALANCE_NOTE_THRESHOLD } from '../data/bands';
import type { ScoringOutput } from '../data/types';
import { Callout, Section } from '../ui/primitives';
import { bandFraming, bandIsMature, compensationText, dimensionLabel, industryLabel, industryRationale, sizeLabel } from './lookups';

/**
 * Section 1 — band + composite: geometric headline, arithmetic beside it, gap note when
 * ≥ 5 (spec ruling 5), and a floor note when any dimension scores 0 (spec ruling 1).
 */
export function Headline({ output }: { output: ScoringOutput }) {
  const zeroed = output.dimensions.filter((d) => d.normalized === 0);
  return (
    <Section index={1} title="Readiness band and score">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-3xl font-semibold text-ink">{output.band.label}</p>
        <p className="text-sm text-ink-3">band range {output.band.lower}–{output.band.upper}</p>
      </div>
      <p className="mt-1 text-sm text-ink-2">{bandFraming(output.band.label)}</p>

      <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="text-6xl font-semibold leading-none text-ink" data-testid="score-geometric">{output.scoreGeometric}</p>
          <p className="mt-2 text-sm text-ink-2">Headline score · weighted geometric mean</p>
        </div>
        <div>
          <p className="text-3xl font-medium leading-none text-ink-2" data-testid="score-arithmetic">{output.scoreArithmetic}</p>
          <p className="mt-2 text-sm text-ink-2">Weighted average, for comparison</p>
          <p className="mt-0.5 text-xs text-ink-3" data-testid="compensation-gap">
            Gap {output.compensationGap} {output.compensationGap === 1 ? 'point' : 'points'} · {output.compensationBand}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {zeroed.length > 0 && (
          <Callout tone="serious" title={`${zeroed.map((d) => dimensionLabel(d.id)).join(', ')} ${zeroed.length === 1 ? 'scores' : 'score'} 0, so the floor sets your headline`}>
            <span data-testid="floor-note">
              The headline treats a dimension at 0 as 1, its floor, and a dimension at the floor adds nothing to the
              geometric mean. With a zero here, the headline is dominated by the floor: a single one-point answer
              could move it by a whole band. Read it as "this capability is missing", not as a precise measurement.
            </span>
          </Callout>
        )}
        {output.compensationGap >= IMBALANCE_NOTE_THRESHOLD && (
          <Callout tone="serious" title={`The average overstates you by ${output.compensationGap} points`}>
            {compensationText(output.compensationBand)}. The headline uses a geometric mean, which does
            not let a strong dimension paper over a weak one.
          </Callout>
        )}
        {bandIsMature(output.band.label) && (
          <Callout tone="warning" title="Uniformly high self-assessment is statistically unusual">
            On a different instrument, ServiceNow's 2025 Enterprise AI Maturity Index, fewer than 1% of
            respondents scored above 50 of 100. Check the confidence flags below before relying on this band.
          </Callout>
        )}
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink" data-testid="disclaimer">
          This is a directional input based on unverified self-report. Budget, timing, and internal context
          are not captured, and the decision rests with you.
        </p>
        <p className="text-xs leading-relaxed text-ink-2">
          Weighted for <span className="font-medium text-ink">{industryLabel(output.industry)}</span>, company size{' '}
          <span className="font-medium text-ink">{sizeLabel(output.sizeBand)}</span>. {industryRationale(output.industry)}
        </p>
      </div>
    </Section>
  );
}
