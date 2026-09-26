import type { ScoringOutput } from '../data/types';
import { Section } from '../ui/primitives';
import { dimensionName } from './lookups';

/**
 * Section 2 — per-dimension breakdown with contribution bars. One hue, no legend: each
 * track's length is the dimension's weight (the most it can contribute), the fill is what
 * it contributes, so the empty part of a track is points lost there.
 */
export function DimensionBreakdown({ output }: { output: ScoringOutput }) {
  const maxWeight = Math.max(...output.dimensions.map((d) => d.weight));
  return (
    <Section index={2} title="Where the score comes from">
      <p className="mb-4 text-sm text-ink-2">
        Each bar's full length is how much that dimension can contribute under your profile; the filled
        part is what it contributes to the weighted average of {output.scoreArithmetic}.
      </p>
      <ul className="space-y-4">
        {output.dimensions.map((d) => {
          const tip = `${dimensionName(d.id)}: scored ${d.normalized}/100 (raw ${d.raw}/20), weight ${d.weight}. `
            + `Contributes ${d.contribution.toFixed(1)} of ${d.weight} possible points `
            + `(${(d.contributionShare * 100).toFixed(1)}% of the weighted average).`;
          return (
            <li key={d.id} title={tip}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <p className="min-w-0 truncate text-ink">
                  <span className="mr-2 font-mono text-xs text-ink-3">{d.id}</span>{dimensionName(d.id)}
                </p>
                <p className="shrink-0 tabular-nums text-ink-2">
                  <span className="font-medium text-ink">{d.normalized}</span>/100 · weight {d.weight}
                </p>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-3 flex-1">
                  <div className="relative h-3 rounded-[4px] bg-accent-track" style={{ width: `${(d.weight / maxWeight) * 100}%` }}>
                    <div className="absolute inset-y-0 left-0 rounded-[4px] bg-accent" style={{ width: `${d.weight === 0 ? 0 : (d.contribution / d.weight) * 100}%` }} />
                  </div>
                </div>
                <p className="w-28 shrink-0 text-right text-xs tabular-nums text-ink-2">
                  {d.contribution.toFixed(1)} of {d.weight} pts
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
