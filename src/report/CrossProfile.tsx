import type { ScoringOutput } from '../data/types';
import { Section } from '../ui/primitives';
import { industryLabel, sizeLabel } from './lookups';

/** Section 6 — cross-profile sensitivity: how much the weights, our own estimates, move the result. */
export function CrossProfile({ output }: { output: ScoringOutput }) {
  const scores = output.crossProfile.map((c) => c.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const applied = output.crossProfile.find((c) => c.industry === output.industry);
  return (
    <Section index={6} title="How much the weights matter">
      <p className="text-sm text-ink" data-testid="cross-profile-line">
        {min === max
          ? `Your answers score ${min} under every industry profile.`
          : `Your answers score ${min}–${max} depending on which industry profile is applied.`}{' '}
        We've applied {industryLabel(output.industry)} ({applied?.score ?? output.scoreGeometric}). Weights are our
        own criticality estimates, not a validated standard.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {output.crossProfile.map((c) => (
          <li key={c.industry}
            className={`rounded-lg border px-3 py-1.5 text-xs tabular-nums ${c.industry === output.industry ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2'}`}>
            {industryLabel(c.industry)} <span className="font-medium text-ink">{c.score}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-3">Company size held at {sizeLabel(output.sizeBand)} for every profile.</p>
    </Section>
  );
}
