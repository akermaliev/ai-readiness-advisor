/**
 * The one place the model's output is verified against code rather than trusted.
 *
 * - Any model use case whose categories intersect a BLOCKED gate's categories is dropped,
 *   and the drop is recorded in `blocked` with the gate and what would unblock it.
 * - The model's own blockedAcknowledged entries are kept only if they name a gate that is
 *   actually blocked in this assessment, for a category that gate actually covers.
 * - The back-office fixture (nudge active) is injected after the model's use cases; if the
 *   fixture itself trips a blocked gate it is surfaced in `blocked`, never dropped silently.
 * - The pilot is checked against the fix-first dimension (Fix 1): a pilot that depends on the
 *   dimension to fix first is flagged, not dropped.
 * - The model's `scoreNarrative` and `imbalanceNote` do not pass through (Fix 2). The result
 *   carries the deterministic summary instead, so a wrong restated number cannot be rendered.
 */
import type {
  BackOfficeFixture, BlockedAcknowledgement, DimensionId, GateResult, ModelResponse, ModelUseCase, Roadmap, ScoringOutput, UseCaseCategory,
} from '../data/types';
import { deterministicSummary, fixFirstDimension, type DeterministicSummary } from './summary';

export interface DisplayUseCase {
  readonly useCase: ModelUseCase;
  readonly source: 'model' | 'fixture';
  /** Authored tradeoff line, present only on the injected fixture. */
  readonly tradeoff: string | null;
}

export interface DisplayBlocked extends BlockedAcknowledgement {
  /** 'model' = acknowledged by the model; 'client-check' = dropped by this module; 'fixture' = the gated back-office alternative. */
  readonly source: 'model' | 'client-check' | 'fixture';
}

export interface VerifiedRecommendations {
  /** Computed from ScoringOutput, no model involved. Shown in place of the model's narrative. */
  readonly summary: DeterministicSummary;
  readonly useCases: readonly DisplayUseCase[];
  readonly roadmap: Roadmap;
  /** True when the roadmap's pilot was dropped by the gate check, or is the gated fixture. */
  readonly pilotBlocked: boolean;
  /** The fix-first dimension when the surviving pilot depends on it; otherwise null (Fix 1). */
  readonly pilotDependsOnFixFirst: DimensionId | null;
  readonly blocked: readonly DisplayBlocked[];
  /** Titles of model use cases removed by the client-side check. */
  readonly dropped: readonly string[];
}

function blockingGates(gates: readonly GateResult[], category: UseCaseCategory): readonly GateResult[] {
  return gates.filter((g) => g.status === 'blocked'
    && (g.affectedCategories === 'all' || g.affectedCategories.includes(category)));
}

/** Every (category, gate) pair that blocks this use case, one entry each. */
function violations(uc: ModelUseCase, gates: readonly GateResult[], source: DisplayBlocked['source']): DisplayBlocked[] {
  return uc.categories.flatMap((category) => blockingGates(gates, category).map((g) => ({
    title: uc.title, description: uc.description, useCaseCategory: category, gateId: g.id, unblockCondition: g.unblockCondition, source,
  })));
}

export function applyGateVerification(
  response: ModelResponse, output: ScoringOutput, fixture: BackOfficeFixture | null,
): VerifiedRecommendations {
  const kept: DisplayUseCase[] = [];
  const blocked: DisplayBlocked[] = [];
  const dropped: string[] = [];

  for (const uc of response.useCases) {
    const v = violations(uc, output.gates, 'client-check');
    if (v.length === 0) kept.push({ useCase: uc, source: 'model', tradeoff: null });
    else { dropped.push(uc.title); blocked.push(...v); }
  }

  for (const b of response.blockedAcknowledged) {
    const real = blockingGates(output.gates, b.useCaseCategory).some((g) => g.id === b.gateId);
    if (real) blocked.push({ ...b, source: 'model' });
  }

  // Titles the reader must not see as live suggestions: dropped model use cases, and the
  // fixture when a gate blocks it (the model may name the fixture as its pilot or a deferral).
  const unavailable = new Set<string>();
  if (fixture !== null) {
    const { tradeoff, ...useCase } = fixture;
    const v = violations(useCase, output.gates, 'fixture');
    if (v.length === 0) kept.push({ useCase, source: 'fixture', tradeoff });
    else { blocked.push(...v); unavailable.add(fixture.title); }
  }

  const seen = new Set<string>();
  const uniqueBlocked = blocked.filter((b) => {
    const key = `${b.title}|${b.useCaseCategory}|${b.gateId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const d of dropped) unavailable.add(d);
  const pilotTitle = response.roadmap.pilotFirst.useCaseTitle;
  const pilotBlocked = unavailable.has(pilotTitle);
  const fixFirst = fixFirstDimension(output);
  const pilot = pilotBlocked ? undefined : kept.find((k) => k.useCase.title === pilotTitle);
  return {
    summary: deterministicSummary(output),
    useCases: kept,
    roadmap: { ...response.roadmap, defer: response.roadmap.defer.filter((d) => !unavailable.has(d.useCaseTitle)) },
    pilotBlocked,
    pilotDependsOnFixFirst: fixFirst !== null && pilot?.useCase.dependsOnDimension === fixFirst ? fixFirst : null,
    blocked: uniqueBlocked,
    dropped,
  };
}
