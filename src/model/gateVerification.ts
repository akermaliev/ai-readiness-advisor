/**
 * The one place the model's output is verified against code rather than trusted.
 *
 * - Any model use case whose categories intersect a BLOCKED gate's categories is dropped,
 *   and the drop is recorded in `blocked` with the gate and what would unblock it.
 * - The model's own blockedAcknowledged entries are kept only if they name a gate that is
 *   actually blocked in this assessment, for a category that gate actually covers.
 * - The back-office fixture (nudge active) is injected after the model's use cases; if the
 *   fixture itself trips a blocked gate it is surfaced in `blocked`, never dropped silently.
 */
import type {
  BackOfficeFixture, BlockedAcknowledgement, GateResult, ModelResponse, ModelUseCase, Roadmap, ScoringOutput, UseCaseCategory,
} from '../data/types';

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
  readonly scoreNarrative: string;
  readonly imbalanceNote: string | null;
  readonly useCases: readonly DisplayUseCase[];
  readonly roadmap: Roadmap;
  /** True when the roadmap's pilot was one of the dropped use cases. */
  readonly pilotBlocked: boolean;
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

  if (fixture !== null) {
    const { tradeoff, ...useCase } = fixture;
    const v = violations(useCase, output.gates, 'fixture');
    if (v.length === 0) kept.push({ useCase, source: 'fixture', tradeoff });
    else blocked.push(...v);
  }

  const seen = new Set<string>();
  const uniqueBlocked = blocked.filter((b) => {
    const key = `${b.title}|${b.useCaseCategory}|${b.gateId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const droppedSet = new Set(dropped);
  return {
    scoreNarrative: response.scoreNarrative,
    imbalanceNote: response.imbalanceNote,
    useCases: kept,
    roadmap: { ...response.roadmap, defer: response.roadmap.defer.filter((d) => !droppedSet.has(d.useCaseTitle)) },
    pilotBlocked: droppedSet.has(response.roadmap.pilotFirst.useCaseTitle),
    blocked: uniqueBlocked,
    dropped,
  };
}
