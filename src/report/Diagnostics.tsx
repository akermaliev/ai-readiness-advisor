import { DISPERSION_SIGMA_THRESHOLD, FLAT_SENSITIVITY_MAX_DELTA, SENSITIVITY_TARGET } from '../data/bands';
import type { ScoringOutput } from '../data/types';
import { Callout, Section, StatusLabel } from '../ui/primitives';
import { dimensionName } from './lookups';

/** Section 3 — dispersion, largest weighted shortfall, and the "fix this first" ranking. */
export function Diagnostics({ output }: { output: ScoringOutput }) {
  const { dispersion, bottleneck } = output;
  const moves = output.sensitivity.filter((s) => s.delta > 0);
  // Issue 2: when every move is small, the order is decided by rounding; say so.
  const flat = moves.length > 1 && moves.every((s) => s.delta <= FLAT_SENSITIVITY_MAX_DELTA);
  return (
    <Section index={3} title="Diagnostics">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-line p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Shape</p>
          <div className="mt-2">
            {dispersion.unbalanced
              ? <StatusLabel tone="serious">Unbalanced readiness</StatusLabel>
              : <StatusLabel tone="good">Balanced shape</StatusLabel>}
          </div>
          <p className="mt-2 text-sm text-ink-2">
            Spread across dimensions: σ {dispersion.sigma.toFixed(1)}, range {dispersion.range} points
            (flagged above σ {DISPERSION_SIGMA_THRESHOLD}).
          </p>
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Largest weighted shortfall</p>
          <p className="mt-2 text-sm font-medium text-ink">{dimensionName(bottleneck.dimensionId)}</p>
          <p className="mt-1 text-sm text-ink-2">
            Where you're losing the most points right now: {bottleneck.weightedShortfall.toFixed(1)} points of the
            weighted average.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-ink">Fix this first</h3>
        <p className="mt-1 text-sm text-ink-2">
          What bringing each dimension up to "adequate" ({SENSITIVITY_TARGET}/100) would do to your headline score,
          largest effect first.
        </p>
        {moves.length === 0 ? (
          <div className="mt-3"><Callout tone="good" title={`Every dimension is already at or above ${SENSITIVITY_TARGET}`} /></div>
        ) : (
          <ol className="mt-3 space-y-2" data-testid="sensitivity-list">
            {moves.map((s, i) => (
              <li key={s.dimensionId} className="flex items-baseline justify-between gap-3 rounded-lg bg-surface px-4 py-2.5 text-sm">
                <span className="text-ink"><span className="mr-2 tabular-nums text-ink-3">{i + 1}.</span>{dimensionName(s.dimensionId)}</span>
                <span className="shrink-0 tabular-nums text-ink-2">
                  {output.scoreGeometric} → <span className="font-medium text-ink">{output.scoreGeometric + s.delta}</span>{' '}
                  <span className="text-ink-3">(+{s.delta})</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {flat && (
          <div className="mt-3" data-testid="flat-sensitivity">
            <Callout tone="info" title="No dimension is a clear priority">
              Every move here is worth {FLAT_SENSITIVITY_MAX_DELTA} points or less, so the order comes down to rounding.
              Treat these as roughly equal, and choose among them on cost and timing.
            </Callout>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          The largest shortfall and "fix this first" can name different dimensions, on purpose. Shortfall counts
          points lost from the weighted average. "Fix this first" measures the effect on the headline, which is a
          geometric mean and rewards lifting the weakest links first, even lightly weighted ones.
        </p>
      </div>
    </Section>
  );
}
