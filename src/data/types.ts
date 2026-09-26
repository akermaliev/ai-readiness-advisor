/**
 * Stage 1 — Data Layer & Types
 *
 * Source of truth: "AI Readiness Advisor — Scoring Methodology Specification" (rev 13).
 * This file is a transcription of that document's type shapes. It contains no logic,
 * no UI, no network calls and no `any`.
 *
 * `ScoringOutput` and `ModelResponse` are transcribed field-for-field from the
 * methodology's "Output object" and "Response schema" code blocks respectively.
 */

/* ------------------------------------------------------------------ *
 * Dimensions, industries, sizes
 * ------------------------------------------------------------------ */

/** The six dimensions. Methodology → The Six Dimensions. */
export type DimensionId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';

/** The five industry profiles. Methodology → Industry Weight Profiles. */
export type IndustryId =
  | 'tech-saas'
  | 'healthcare'
  | 'financial'
  | 'retail-ecommerce'
  | 'manufacturing-logistics';

/**
 * The four company-size bands.
 * Methodology → Problem Statement Intake (Company size) and
 * Industry Weight Profiles → Company Size Modifier. `50-250` is the anchor band.
 */
export type SizeBand = 'lt-50' | '50-250' | '250-1000' | '1000-2000';

/** Human-readable metadata for a dimension. Methodology → The Six Dimensions. */
export interface Dimension {
  readonly id: DimensionId;
  readonly name: string;
  /** "What it measures" column. */
  readonly measures: string;
  /** "Why it's separate" column. */
  readonly whySeparate: string;
}

/* ------------------------------------------------------------------ *
 * Question bank
 * ------------------------------------------------------------------ */

/** Every question id in the bank. Methodology → Intake Question Bank. */
export type QuestionId =
  | '1.1' | '1.2' | '1.3' | '1.4'
  | '2.1' | '2.2' | '2.3' | '2.4'
  | '3.1' | '3.2' | '3.3' | '3.4'
  | '4.1' | '4.2' | '4.3' | '4.4'
  | '5.1' | '5.2' | '5.3' | '5.4'
  | '6.1' | '6.2' | '6.3' | '6.4';

/** "Each question is worth 0-5 points." */
export type OptionPoints = 0 | 1 | 2 | 3 | 4 | 5;

export interface QuestionOption {
  readonly label: string;
  readonly points: OptionPoints;
}

export interface Question {
  readonly id: QuestionId;
  readonly dimension: DimensionId;
  readonly prompt: string;
  /** In the order the methodology lists them, i.e. ascending by points. */
  readonly options: readonly QuestionOption[];
  /** The methodology's blockquote note on this question, where one exists. */
  readonly note?: string;
}

/** A single answered question. */
export interface RubricAnswer {
  readonly questionId: QuestionId;
  readonly points: OptionPoints;
}

/**
 * The complete rubric response. Keyed by `QuestionId` so that a missing answer
 * is a compile error — "all rubric fields required" (Technical Requirements → Stage 3).
 */
export type RubricAnswers = Readonly<Record<QuestionId, OptionPoints>>;

/* ------------------------------------------------------------------ *
 * Weights
 * ------------------------------------------------------------------ */

/** Base industry weights. Each profile's six values sum to exactly 100. */
export type WeightProfile = Readonly<Record<DimensionId, number>>;

/** Size deltas applied on top of a base profile. Each band's six values sum to exactly 0. */
export type SizeModifier = Readonly<Record<DimensionId, number>>;

/** Resolved weights: `baseWeight_i(industry) + sizeModifier_i(sizeBand)`. Stage 2 produces these. */
export type ResolvedWeights = Readonly<Record<DimensionId, number>>;

export interface IndustryProfile {
  readonly id: IndustryId;
  readonly label: string;
  /** One-line criticality rationale, shipped as a UI tooltip. */
  readonly rationale: string;
}

/* ------------------------------------------------------------------ *
 * Gate layer
 * ------------------------------------------------------------------ */

/**
 * The vocabulary of recommendation kinds that gates can block or warn on.
 *
 * Derived from the gate conditions themselves — the methodology states gate
 * applicability in prose ("recommendation involves retrieval over internal
 * content") and the Model Output Contract requires each returned use case to
 * carry `categories` drawn from this union, which is what makes Stage 5's
 * drop-check possible.
 */
export type UseCaseCategory =
  /** G-U1 — retrieval/RAG over internal documents, tickets, notes. */
  | 'retrieval-over-internal-content'
  /** G-U2 — joining records across systems by a shared entity key. */
  | 'entity-resolution'
  /** G-H1 — touches protected health information. */
  | 'phi-touching'
  /** G-H2 — influences a clinical decision. */
  | 'clinical-decision'
  /** G-F1 — affects credit, pricing, underwriting or eligibility. */
  | 'credit-pricing-underwriting-eligibility'
  /** G-F2 — produces an outcome a customer experiences directly. */
  | 'customer-affecting'
  /** G-R1 — personalization or targeting. */
  | 'personalization-targeting'
  /** G-R2 — requires a unified customer view. */
  | 'unified-customer-view'
  /** G-M1 — predictive maintenance or failure prediction. */
  | 'predictive-maintenance'
  /** G-M2 — requires live integration with an operational system. */
  | 'live-system-integration';

export type GateId =
  | 'G-U1' | 'G-U2' | 'G-U3' | 'G-U4'
  | 'G-H1' | 'G-H2' | 'G-H3'
  | 'G-F1' | 'G-F2' | 'G-F3'
  | 'G-R1' | 'G-R2'
  | 'G-M1' | 'G-M2';

/** Which industries a gate is evaluated for. */
export type GateAppliesTo = 'universal' | IndustryId;

/** Methodology → Gate Layer: Block, Warn, or "Warn, severe". */
export type GateEffect = 'block' | 'warn' | 'warn-severe';

export type ComparisonOperator = 'eq' | 'lte' | 'gte';

/** One machine-checkable clause over a rubric answer. */
export interface AnswerCondition {
  readonly questionId: QuestionId;
  readonly op: ComparisonOperator;
  readonly value: OptionPoints;
}

/**
 * A gate's answer-side condition. Every gate in the methodology is a conjunction,
 * so `all` is sufficient; Stage 2 evaluates it.
 */
export interface GateCondition {
  readonly all: readonly AnswerCondition[];
}

/**
 * Which recommendations a gate reaches.
 *
 * `global` fires on every recommendation regardless of category — distinct from
 * an empty category list, which would mean "reaches nothing". Four gates are
 * global: G-U3, G-U4, G-H3, G-F3.
 */
export type GateScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'categories'; readonly categories: readonly UseCaseCategory[] };

export interface Gate {
  readonly id: GateId;
  readonly appliesTo: GateAppliesTo;
  readonly effect: GateEffect;
  /** The answer-side test. Stage 2 interprets; this file only states it. */
  readonly condition: GateCondition;
  /** The recommendation-side test. */
  readonly scope: GateScope;
  /** The methodology's "Condition" column, verbatim, for display and audit. */
  readonly conditionText: string;
  /** The methodology's "Effect" column rationale, for display. */
  readonly effectText: string;
  /** What the respondent would have to change for this gate to stop firing. */
  readonly unblockCondition: string;
}

/* ------------------------------------------------------------------ *
 * Consistency checks
 * ------------------------------------------------------------------ */

export type ConsistencyCheckId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';

/**
 * Methodology → Intake Question Bank → Consistency checks.
 * Conditions C1/C2/C4 read normalized dimension scores rather than raw answers,
 * so they are stated here in prose and evaluated by Stage 2's `runConsistencyChecks`.
 */
export interface ConsistencyCheck {
  readonly id: ConsistencyCheckId;
  /** The methodology's "Condition" column, verbatim. */
  readonly conditionText: string;
  /** The methodology's "Flag" column — what the banner says. */
  readonly description: string;
}

/* ------------------------------------------------------------------ *
 * Bands
 * ------------------------------------------------------------------ */

export type BandId = 1 | 2 | 3 | 4 | 5;

/**
 * Methodology → Calibration & Presentation → Banding.
 *
 * `lower`/`upper` are the ranges exactly as the doc displays them (0-25, 26-45, …)
 * and are what `ScoringOutput.band` carries. `matchFrom`/`matchUntil` are the
 * half-open interval [matchFrom, matchUntil) Stage 2 matches a continuous score
 * against, since the displayed ranges leave gaps between integers.
 */
export interface Band {
  readonly id: BandId;
  readonly label: string;
  readonly lower: number;
  readonly upper: number;
  readonly framing: string;
  readonly matchFrom: number;
  readonly matchUntil: number;
}

/** Methodology → 1. Composite scores: the `S_arith − S_geom` gap table. */
export type CompensationBandId = 'balanced' | 'moderate' | 'severe';

export interface CompensationBand {
  readonly id: CompensationBandId;
  /** The doc's "Gap" column. */
  readonly gapText: string;
  /** The doc's "Interpretation shown" column. */
  readonly interpretation: string;
  readonly matchFrom: number;
  readonly matchUntil: number;
}

/* ------------------------------------------------------------------ *
 * Problem statement (intent inputs — these never enter the scoring function)
 * ------------------------------------------------------------------ */

export type PrimaryBottleneck =
  | 'manual-data-entry-document-handling'
  | 'slow-decision-cycles'
  | 'customer-response-time'
  | 'forecasting-planning'
  | 'repetitive-analysis-reporting'
  | 'quality-control-inspection'
  | 'other';

export type TargetFunction =
  | 'back-office-operations'
  | 'customer-facing'
  | 'finance'
  | 'sales-marketing'
  | 'engineering-product'
  | 'supply-chain';

export type TimeHorizon = 'pilot-lt-3-months' | '3-6-months' | '6-12-months' | 'exploring';

/**
 * Methodology → Problem Statement Intake.
 * `elaboration` is capped at 200 characters; both it and `timeHorizon` are optional
 * per Technical Requirements → Stage 3.
 */
export interface ProblemStatement {
  readonly industry: IndustryId;
  readonly companySize: SizeBand;
  readonly primaryBottleneck: PrimaryBottleneck;
  readonly targetFunction: TargetFunction;
  readonly elaboration?: string;
  readonly timeHorizon?: TimeHorizon;
}

/* ------------------------------------------------------------------ *
 * Scoring output (Stage 2's contract)
 * ------------------------------------------------------------------ */

export interface DimensionScore {
  readonly id: DimensionId;
  /** 0-20, the summed option points for this dimension's four questions. */
  readonly raw: number;
  /** `(raw / 20) × 100`, 0-100. */
  readonly normalized: number;
  /** Resolved weight: base profile + size modifier. */
  readonly weight: number;
  /** `(weight / 100) × normalized`. */
  readonly contribution: number;
  /** `contribution / scoreArithmetic`. */
  readonly contributionShare: number;
}

export interface DispersionResult {
  /** Population standard deviation of the six unweighted normalized scores. */
  readonly sigma: number;
  readonly range: number;
  /** True when `sigma > 20`. */
  readonly unbalanced: boolean;
}

export interface BottleneckResult {
  readonly dimensionId: DimensionId;
  /** `d_i × w_i / 100` for the argmin dimension. */
  readonly weightedScore: number;
}

export interface SensitivityEntry {
  readonly dimensionId: DimensionId;
  /** `S_geom(d_i → 75) − S_geom`. */
  readonly delta: number;
}

export interface CrossProfileEntry {
  readonly industry: IndustryId;
  readonly score: number;
}

/** The band fields carried on the output object: `{ label, lower, upper }`. */
export interface BandResult {
  readonly label: string;
  readonly lower: number;
  readonly upper: number;
}

export type GateStatus = 'passed' | 'warned' | 'blocked';

export interface GateResult {
  readonly id: GateId;
  readonly status: GateStatus;
  /** The gate's `conditionText`. */
  readonly condition: string;
  /** `'all'` for a global-scope gate; otherwise the categories it reaches. */
  readonly affectedCategories: readonly UseCaseCategory[] | 'all';
  readonly unblockCondition: string;
}

export interface ConfidenceFlag {
  readonly id: ConsistencyCheckId;
  readonly description: string;
}

/**
 * Methodology → Score Computation & Statistical Layer → Output object.
 * Rendered directly to the UI and passed to the model as its input context.
 */
export interface ScoringOutput {
  readonly industry: IndustryId;
  /** The resolved weights actually applied (base profile + size modifier). */
  readonly profileWeights: ResolvedWeights;
  readonly dimensions: readonly DimensionScore[];
  readonly scoreGeometric: number;
  readonly scoreArithmetic: number;
  readonly compensationGap: number;
  readonly compensationBand: CompensationBandId;
  readonly dispersion: DispersionResult;
  readonly bottleneck: BottleneckResult;
  readonly sensitivity: readonly SensitivityEntry[];
  readonly crossProfile: readonly CrossProfileEntry[];
  readonly band: BandResult;
  readonly gates: readonly GateResult[];
  readonly confidenceFlags: readonly ConfidenceFlag[];
}

/* ------------------------------------------------------------------ *
 * Model response (Stage 5's contract)
 * ------------------------------------------------------------------ */

export type OutcomeConfidence = 'high' | 'medium' | 'low';

export type ImplementationRisk = 'low' | 'medium' | 'high';

export type GovernanceFlagType = 'data-sensitivity' | 'compliance' | 'reliability' | 'oversight';

export interface GovernanceFlag {
  readonly type: GovernanceFlagType;
  /** ≤ 25 words. */
  readonly note: string;
}

export interface ModelUseCase {
  readonly title: string;
  /** ≤ 40 words. */
  readonly description: string;
  /** One or more values from the Stage 1 gate vocabulary. */
  readonly categories: readonly UseCaseCategory[];
  readonly targetFunction: string;
  /** ≤ 25 words, stated as an outcome not a feature. */
  readonly expectedOutcome: string;
  readonly outcomeConfidence: OutcomeConfidence;
  readonly implementationRisk: ImplementationRisk;
  readonly riskDrivers: readonly string[];
  readonly governanceFlags: readonly GovernanceFlag[];
  readonly dependsOnDimension: DimensionId;
  readonly isBackOfficeAlternative: boolean;
}

export interface RoadmapPilot {
  readonly useCaseTitle: string;
  /** ≤ 30 words. */
  readonly rationale: string;
}

export interface RoadmapDeferral {
  readonly useCaseTitle: string;
  readonly until: string;
}

export interface Roadmap {
  readonly pilotFirst: RoadmapPilot;
  /** The gap to close before the pilot, or null. */
  readonly prerequisite: string | null;
  readonly defer: readonly RoadmapDeferral[];
}

export interface BlockedAcknowledgement {
  readonly useCaseCategory: UseCaseCategory;
  readonly gateId: GateId;
  readonly unblockCondition: string;
}

/**
 * Methodology → Model Output Contract → Response schema.
 * Constraints: 2-4 entries in `useCases`; at least one with
 * `isBackOfficeAlternative: true` when the back-office nudge is active.
 */
export interface ModelResponse {
  /** ≤ 60 words. */
  readonly scoreNarrative: string;
  /** Present only when `compensationGap > 5`. */
  readonly imbalanceNote: string | null;
  readonly useCases: readonly ModelUseCase[];
  readonly roadmap: Roadmap;
  readonly blockedAcknowledged: readonly BlockedAcknowledgement[];
}
