/**
 * The only module in the engine that reads the weight tables. Every other function
 * receives resolved weights as an argument — asserted by the boundary test.
 */
import { sizeModifiers } from '../data/sizeModifiers';
import { industryIds, weightProfiles } from '../data/weightProfiles';
import type { IndustryId, ResolvedWeights, SizeBand } from '../data/types';
import { mapDimensions } from './dimensions';

/** All five industries, for cross-profile sensitivity. */
export const INDUSTRY_IDS: readonly IndustryId[] = industryIds;

/**
 * `finalWeight_i = baseWeight_i(industry) + sizeModifier_i(sizeBand)`.
 * Called once per assessment by `computeReadiness`; the result is passed to every
 * function that needs `w_i`.
 */
export function resolveWeights(industry: IndustryId, sizeBand: SizeBand): ResolvedWeights {
  if (!Object.hasOwn(weightProfiles, industry)) throw new RangeError(`Unknown industry: ${String(industry)}`);
  if (!Object.hasOwn(sizeModifiers, sizeBand)) throw new RangeError(`Unknown size band: ${String(sizeBand)}`);
  const base = weightProfiles[industry];
  const delta = sizeModifiers[sizeBand];
  return mapDimensions((d) => base[d] + delta[d]);
}
