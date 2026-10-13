/**
 * v1.3 — the roadmap as numbered steps, shared by the page and the PDF. Pure: built from the
 * verified recommendations, the scoring output and the selected answers.
 *
 *   Step 1  the gap to close (the model's text) plus the answer changes that would close it,
 *           computed by the engine (improvementPath), no model involved
 *   Step 2  the pilot: why, how to tell it worked, when to stop, and when it can start
 *   Step 3  what waits, and which of the company's answers it waits on
 *
 * Only numbers from the engine appear here; the model's text is shown as written.
 */
import { SENSITIVITY_TARGET } from '../data/bands';
import { dimensionLabel } from '../report/lookups';
import { questionBank } from '../data/questionBank';
import type { DimensionId, QuestionId, ReadinessInput, ScoringOutput } from '../data/types';
import { improvementPath, type ImprovementPath } from '../engine';
import type { VerifiedRecommendations } from './gateVerification';
import { fixFirstDimension, isFlatSensitivity } from './summary';

export interface RoadmapStep1 {
  /** required: the fix-first gap; optional: groundwork on a flat ranking; none: nothing to close first. */
  readonly kind: 'required' | 'optional' | 'none';
  /** The step's heading, shared by the page and the PDF. */
  readonly title: string;
  readonly text: string | null;
  readonly dimension: DimensionId | null;
  readonly path: ImprovementPath | null;
  /** Why there is nothing (or nothing mandatory) to close first. */
  readonly note: string | null;
}

export interface RoadmapStep2 {
  readonly blocked: boolean;
  readonly title: string;
  readonly rationale: string;
  readonly successMeasure: string;
  readonly stopCondition: string;
  readonly goalNote: string | null;
  /** 'alongside': can start while step 1 is under way; 'after': depends on the step 1 dimension; null: blocked or no step 1. */
  readonly timing: 'alongside' | 'after' | null;
}

export interface UnlockAnswer { readonly questionId: QuestionId; readonly question: string; readonly current: string }

export interface RoadmapStep3 { readonly title: string; readonly until: string; readonly unlock: readonly UnlockAnswer[] }

export interface RoadmapView {
  readonly step1: RoadmapStep1;
  readonly step2: RoadmapStep2;
  readonly step3: readonly RoadmapStep3[];
}

const NO_GAP = `Every dimension is at or above adequate (${SENSITIVITY_TARGET}), so there is no gap to close first.`;
const FLAT = 'No dimension is a clear priority (every fix-first move is worth 2 points or less), so nothing has to be closed before the pilot.';

function currentLabel(input: ReadinessInput, id: QuestionId): UnlockAnswer | null {
  const q = questionBank.find((x) => x.id === id);
  const o = q?.options.find((x) => x.points === input.rubricAnswers[id]);
  return q === undefined || o === undefined ? null : { questionId: id, question: q.prompt, current: o.label };
}

export function buildRoadmapView(result: VerifiedRecommendations, output: ScoringOutput, input: ReadinessInput): RoadmapView {
  const { roadmap } = result;
  const flat = isFlatSensitivity(output);
  const fixFirst = fixFirstDimension(output);

  let step1: RoadmapStep1;
  if (roadmap.prerequisite === null) {
    step1 = { kind: 'none', title: 'Nothing to close first', text: null, dimension: null, path: null, note: fixFirst === null ? NO_GAP : flat ? FLAT : null };
  } else if (flat) {
    const below = output.dimensions.filter((d) => d.normalized < SENSITIVITY_TARGET).map((d) => d.id);
    const named = below.find((id) => new RegExp(`\\b${id}\\b`).test(roadmap.prerequisite ?? '')) ?? null;
    // A prerequisite that is only the dimension's name adds nothing the heading doesn't say (first live run, strong preset).
    const bare = named !== null && roadmap.prerequisite.replace(new RegExp(`\\b${named}\\b`), '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase()
      === dimensionLabel(named).replace(/^D\d\s*/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
    step1 = {
      kind: 'optional', title: named === null ? 'Optional groundwork' : `Optional groundwork: ${dimensionLabel(named)}`,
      text: bare ? null : roadmap.prerequisite, dimension: named, path: named === null ? null : improvementPath(input, named), note: FLAT,
    };
  } else {
    step1 = { kind: 'required', title: 'Close this gap first', text: roadmap.prerequisite, dimension: fixFirst, path: fixFirst === null ? null : improvementPath(input, fixFirst), note: null };
  }

  const pilot = result.useCases.find((u) => u.useCase.title === roadmap.pilotFirst.useCaseTitle);
  const step2: RoadmapStep2 = {
    blocked: result.pilotBlocked,
    title: roadmap.pilotFirst.useCaseTitle,
    rationale: roadmap.pilotFirst.rationale,
    successMeasure: roadmap.pilotFirst.successMeasure,
    stopCondition: roadmap.pilotFirst.stopCondition,
    goalNote: roadmap.pilotFirst.goalNote,
    timing: result.pilotBlocked || step1.kind !== 'required' || pilot === undefined ? null
      : pilot.useCase.dependsOnDimension === step1.dimension ? 'after' : 'alongside',
  };

  const step3 = roadmap.defer.map((d) => ({
    title: d.useCaseTitle,
    until: d.until,
    unlock: d.unlockAnswers.flatMap((id) => { const u = currentLabel(input, id); return u === null ? [] : [u]; }),
  }));

  return { step1, step2, step3 };
}
