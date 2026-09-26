import type { GateResult, ScoringOutput } from '../data/types';
import { Section, StatusLabel, type Tone } from '../ui/primitives';
import { categoryLabel, gateEffectText } from './lookups';

const STATUS: Readonly<Record<Exclude<GateResult['status'], 'passed'>, { tone: Tone; label: string; rank: number }>> = {
  blocked: { tone: 'critical', label: 'Blocked', rank: 0 },
  'warned-severe': { tone: 'serious', label: 'Severe warning', rank: 1 },
  warned: { tone: 'warning', label: 'Warning', rank: 2 },
};

/** Section 4 — gate results. Blocked and warned items are shown with what would clear them, never hidden. */
export function GateResults({ output }: { output: ScoringOutput }) {
  const active = output.gates
    .flatMap((g) => (g.status === 'passed' ? [] : [{ g, meta: STATUS[g.status] }]))
    .sort((a, b) => a.meta.rank - b.meta.rank);
  const passed = output.gates.filter((g) => g.status === 'passed');
  return (
    <Section index={4} title="Gates">
      <p className="mb-4 text-sm text-ink-2">
        Gates are hard rules, checked independently of the score. A high score can still have blocked use cases.
      </p>
      {active.length === 0 ? (
        <StatusLabel tone="good">No gate is triggered by your answers</StatusLabel>
      ) : (
        <ul className="space-y-3" data-testid="gate-list">
          {active.map(({ g, meta }) => (
            <li key={g.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusLabel tone={meta.tone}>{meta.label}</StatusLabel>
                <span className="font-mono text-xs text-ink-3">{g.id}</span>
              </div>
              <p className="mt-2 text-sm text-ink">{gateEffectText(g.id)}</p>
              <p className="mt-1 text-xs text-ink-2">Triggered by: {g.condition}</p>
              <p className="mt-1 text-xs text-ink-2">
                Applies to: {g.affectedCategories === 'all' ? 'every recommendation' : g.affectedCategories.map(categoryLabel).join(', ')}
              </p>
              <p className="mt-2 text-sm text-ink"><span className="font-medium">What would clear it:</span> {g.unblockCondition}</p>
            </li>
          ))}
        </ul>
      )}
      {passed.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink-2">{passed.length} other gate{passed.length === 1 ? '' : 's'} checked and passed</summary>
          <ul className="mt-2 space-y-1 pl-4 text-xs text-ink-2">
            {passed.map((g) => <li key={g.id}><span className="font-mono">{g.id}</span> · {g.condition}</li>)}
          </ul>
        </details>
      )}
    </Section>
  );
}
