/** Text lookups for the report. Labels only — every number rendered comes from ScoringOutput. */
import { bands, compensationBands } from '../data/bands';
import { gates } from '../data/gates';
import { dimensions } from '../data/questionBank';
import { sizeBands } from '../data/sizeModifiers';
import type { DimensionId, GateId, IndustryId, SizeBand, UseCaseCategory } from '../data/types';
import { useCaseCategoryLabels } from '../data/useCaseCategories';
import { industryProfiles } from '../data/weightProfiles';

export const dimensionName = (id: DimensionId): string => dimensions.find((d) => d.id === id)?.name ?? id;
/** Id plus exact name, e.g. "D2 Integration architecture" — the one form used in generated text. */
export const dimensionLabel = (id: DimensionId): string => `${id} ${dimensionName(id)}`;
export const industryLabel = (id: IndustryId): string => industryProfiles.find((p) => p.id === id)?.label ?? id;
export const industryRationale = (id: IndustryId): string => industryProfiles.find((p) => p.id === id)?.rationale ?? '';
export const sizeLabel = (id: SizeBand): string => sizeBands.find((s) => s.id === id)?.label ?? id;
export const bandFraming = (label: string): string => bands.find((b) => b.label === label)?.framing ?? '';
export const bandIsMature = (label: string): boolean => bands.find((b) => b.label === label)?.id === 5;
export const compensationText = (id: string): string => compensationBands.find((b) => b.id === id)?.interpretation ?? '';
export const gateEffectText = (id: GateId): string => gates.find((g) => g.id === id)?.effectText ?? '';
export const categoryLabel = (c: UseCaseCategory): string => useCaseCategoryLabels[c];
