import type { ScoringOutput } from '../data/types';
import { Section, StatusLabel } from '../ui/primitives';

/** Section 5 — shown only when a consistency check tripped. Flags never change the score. */
export function ConfidenceBanner({ output }: { output: ScoringOutput }) {
  if (output.confidenceFlags.length === 0) return null;
  return (
    <Section index={5} title="Low-confidence input">
      <StatusLabel tone="warning">Some answers don't fit together</StatusLabel>
      <ul className="mt-3 space-y-1.5 text-sm text-ink" data-testid="confidence-flags">
        {output.confidenceFlags.map((f) => (
          <li key={f.id}><span className="mr-2 font-mono text-xs text-ink-3">{f.id}</span>{f.description}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-3">These flags never adjust the score. They mark answers worth double-checking.</p>
    </Section>
  );
}
