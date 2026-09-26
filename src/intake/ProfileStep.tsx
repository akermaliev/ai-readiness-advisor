import { sizeBands } from '../data/sizeModifiers';
import type { IndustryId, SizeBand } from '../data/types';
import { industryProfiles } from '../data/weightProfiles';
import { RadioOption } from '../ui/primitives';

export function ProfileStep({ industry, sizeBand, onIndustry, onSize }: {
  industry: IndustryId | null; sizeBand: SizeBand | null;
  onIndustry: (id: IndustryId) => void; onSize: (id: SizeBand) => void;
}) {
  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-surface px-4 py-3 text-sm text-ink-2">
        These two answers earn no points. They select how your answers are weighted: which
        dimensions matter most in your sector, adjusted for company size, and which sector
        gates apply.
      </p>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Industry</legend>
        <div className="grid gap-2">
          {industryProfiles.map((p) => (
            <RadioOption key={p.id} name="industry" checked={industry === p.id} onSelect={() => onIndustry(p.id)}
              label={p.label} detail={p.rationale} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Company size (employees)</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sizeBands.map((s) => (
            <RadioOption key={s.id} name="size" checked={sizeBand === s.id} onSelect={() => onSize(s.id)} label={s.label} />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
