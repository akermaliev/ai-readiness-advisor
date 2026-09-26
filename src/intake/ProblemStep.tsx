import {
  BACK_OFFICE_NUDGE_FUNCTIONS, ELABORATION_MAX_CHARS, primaryBottleneckOptions, targetFunctionOptions, timeHorizonOptions,
} from '../data/problemStatementOptions';
import { RadioOption, StatusIcon } from '../ui/primitives';
import type { ProblemDraft } from './draft';

export function ProblemStep({ value, onChange }: { value: ProblemDraft; onChange: (next: ProblemDraft) => void }) {
  const nudge = value.targetFunction !== null && BACK_OFFICE_NUDGE_FUNCTIONS.includes(value.targetFunction);
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Primary bottleneck</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {primaryBottleneckOptions.map((o) => (
            <RadioOption key={o.id} name="bottleneck" checked={value.primaryBottleneck === o.id}
              onSelect={() => onChange({ ...value, primaryBottleneck: o.id })} label={o.label} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Where do you want to apply AI?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {targetFunctionOptions.map((o) => (
            <RadioOption key={o.id} name="target" checked={value.targetFunction === o.id}
              onSelect={() => onChange({ ...value, targetFunction: o.id })} label={o.label} />
          ))}
        </div>
        {nudge && (
          <p className="mt-2 flex gap-2 text-xs leading-relaxed text-ink-2">
            <StatusIcon tone="info" />
            <span>Recommendations will include a back-office alternative alongside this area. Most measurable
              AI returns have come from back-office work, not sales and customer-facing pilots.</span>
          </p>
        )}
      </fieldset>
      <div>
        <label htmlFor="elaboration" className="mb-2 block text-sm font-semibold text-ink">
          Anything else? <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <textarea id="elaboration" rows={3} maxLength={ELABORATION_MAX_CHARS} value={value.elaboration}
          onChange={(e) => onChange({ ...value, elaboration: e.target.value })}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" />
        <p className="mt-1 text-right text-xs text-ink-3">{value.elaboration.length}/{ELABORATION_MAX_CHARS}</p>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">
          Time horizon <span className="font-normal text-ink-3">(optional)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {timeHorizonOptions.map((o) => (
            <RadioOption key={o.id} name="horizon" checked={value.timeHorizon === o.id}
              onSelect={() => onChange({ ...value, timeHorizon: value.timeHorizon === o.id ? null : o.id })} label={o.label} />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
