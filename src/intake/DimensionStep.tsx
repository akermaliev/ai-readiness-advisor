import { dimensions, impactAssessmentQuestion, questionsByDimension } from '../data/questionBank';
import type { DimensionId, ImpactAssessmentStatus, OptionPoints, QuestionId } from '../data/types';
import { RadioOption, StatusIcon } from '../ui/primitives';

export function DimensionStep({ dimension, answers, onAnswer, impactAssessment, onImpactAssessment }: {
  dimension: DimensionId;
  answers: Readonly<Partial<Record<QuestionId, OptionPoints>>>;
  onAnswer: (q: QuestionId, points: OptionPoints) => void;
  impactAssessment: ImpactAssessmentStatus | null;
  onImpactAssessment: (value: ImpactAssessmentStatus) => void;
}) {
  const meta = dimensions.find((d) => d.id === dimension);
  return (
    <div className="space-y-7">
      {meta !== undefined && <p className="text-sm text-ink-2">{meta.measures}.</p>}
      {questionsByDimension[dimension].map((q) => (
        <fieldset key={q.id}>
          <legend className="mb-2 text-sm font-semibold text-ink">
            <span className="mr-2 font-mono text-xs text-ink-3">{q.id}</span>{q.prompt}
          </legend>
          <div className="grid gap-2">
            {q.options.map((o) => (
              <RadioOption key={o.label} name={`q-${q.id}`} checked={answers[q.id] === o.points}
                onSelect={() => onAnswer(q.id, o.points)} label={o.label} />
            ))}
          </div>
          {q.note !== undefined && (
            <p className="mt-2 flex gap-2 text-xs leading-relaxed text-ink-2">
              <StatusIcon tone="info" /><span>{q.note}</span>
            </p>
          )}
        </fieldset>
      ))}
      {dimension === 'D4' && (
        <fieldset data-testid="impact-assessment">
          <legend className="mb-2 text-sm font-semibold text-ink">
            <span className="mr-2 rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-ink-3">Not scored</span>
            {impactAssessmentQuestion.prompt}
          </legend>
          <div className="grid gap-2">
            {impactAssessmentQuestion.options.map((o) => (
              <RadioOption key={o.value} name="q-impact-assessment" checked={impactAssessment === o.value}
                onSelect={() => onImpactAssessment(o.value)} label={o.label} />
            ))}
          </div>
          <p className="mt-2 flex gap-2 text-xs leading-relaxed text-ink-2">
            <StatusIcon tone="info" /><span>{impactAssessmentQuestion.note}</span>
          </p>
        </fieldset>
      )}
    </div>
  );
}
