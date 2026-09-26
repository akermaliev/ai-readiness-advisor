import { useState } from 'react';
import { dimensions, questionsByDimension } from '../data/questionBank';
import type { DimensionId, ProblemStatement, ReadinessInput } from '../data/types';
import { Button } from '../ui/primitives';
import { DimensionStep } from './DimensionStep';
import {
  EMPTY_PROBLEM, EMPTY_READINESS, isCompleteReadiness, problemDraftFrom, toProblemStatement,
  type ProblemDraft, type ReadinessDraft,
} from './draft';
import { demoPresets } from './presets';
import { ProblemStep } from './ProblemStep';
import { ProfileStep } from './ProfileStep';

type StepId = 'profile' | DimensionId | 'problem';
const STEPS: readonly StepId[] = ['profile', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'problem'];
/** Rubric-side screens (profile + six dimensions) are counted; the intent screen is not. */
const READINESS_STEP_COUNT = 7;

export function IntakeWizard({ onSubmit }: { onSubmit: (readiness: ReadinessInput, problem: ProblemStatement) => void }) {
  const [readiness, setReadiness] = useState<ReadinessDraft>(EMPTY_READINESS);
  const [problem, setProblem] = useState<ProblemDraft>(EMPTY_PROBLEM);
  const [index, setIndex] = useState(0);
  const step: StepId = STEPS[index] ?? 'profile';

  const stepComplete = (s: StepId): boolean => {
    if (s === 'profile') return readiness.industry !== null && readiness.sizeBand !== null;
    if (s === 'problem') return toProblemStatement(problem) !== null;
    return questionsByDimension[s].every((q) => readiness.rubricAnswers[q.id] !== undefined);
  };

  const go = (next: number) => { setIndex(next); window.scrollTo({ top: 0 }); };

  const submit = () => {
    const statement = toProblemStatement(problem);
    if (!isCompleteReadiness(readiness) || statement === null) return;
    onSubmit(readiness, statement); // the draft itself: zero transformation
  };

  const loadPreset = (id: string) => {
    const preset = demoPresets.find((p) => p.id === id);
    if (preset === undefined) return;
    setReadiness(preset.readiness);
    setProblem(problemDraftFrom(preset.problem));
    go(STEPS.indexOf('problem'));
  };

  if (step === 'problem') {
    return (
      <div className="rounded-xl border border-intent-line bg-intent p-5 sm:p-7">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Separate from your score</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">What do you want from AI?</h1>
        <p className="mt-2 text-sm text-ink-2">
          Nothing on this screen affects your readiness score. The score is computed only from the
          previous screens. These answers only shape the recommendations generated afterwards.
        </p>
        <div className="mt-6"><ProblemStep value={problem} onChange={setProblem} /></div>
        <div className="mt-8 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => go(index - 1)}>Back to the rubric</Button>
          <Button onClick={submit} disabled={!stepComplete('problem') || !isCompleteReadiness(readiness)}>
            See my assessment
          </Button>
        </div>
        {!stepComplete('problem') && <p className="mt-3 text-right text-xs text-ink-3">Choose a bottleneck and a target area to continue.</p>}
      </div>
    );
  }

  const dimMeta = step === 'profile' ? undefined : dimensions.find((d) => d.id === step);
  return (
    <div className="rounded-xl border border-line bg-panel p-5 sm:p-7">
      <div className="flex items-center gap-2" aria-hidden="true">
        {Array.from({ length: READINESS_STEP_COUNT }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-accent' : 'bg-line'}`} />
        ))}
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-3">
        Readiness · step {index + 1} of {READINESS_STEP_COUNT}
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-ink">
        {step === 'profile' ? 'About your company' : `${step} · ${dimMeta?.name ?? ''}`}
      </h1>

      {step === 'profile' && (
        <div className="mt-4 rounded-lg border border-line p-4">
          <p className="text-sm font-medium text-ink">Just exploring?</p>
          <p className="mt-0.5 text-xs text-ink-2">Load a worked example. It fills every answer and takes you to the last screen.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {demoPresets.map((p) => (
              <Button key={p.id} variant="secondary" onClick={() => loadPreset(p.id)}>{p.label}</Button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        {step === 'profile' ? (
          <ProfileStep industry={readiness.industry} sizeBand={readiness.sizeBand}
            onIndustry={(industry) => setReadiness({ ...readiness, industry })}
            onSize={(sizeBand) => setReadiness({ ...readiness, sizeBand })} />
        ) : (
          <DimensionStep dimension={step} answers={readiness.rubricAnswers}
            onAnswer={(q, points) => setReadiness({ ...readiness, rubricAnswers: { ...readiness.rubricAnswers, [q]: points } })} />
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>Back</Button>
        <Button onClick={() => go(index + 1)} disabled={!stepComplete(step)}>Continue</Button>
      </div>
      {!stepComplete(step) && (
        <p className="mt-3 text-right text-xs text-ink-3">
          {step === 'profile' ? 'Choose an industry and a company size to continue.' : 'Answer all four questions to continue.'}
        </p>
      )}
    </div>
  );
}
