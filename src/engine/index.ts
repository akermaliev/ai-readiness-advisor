/** Stage 2 public surface. Everything here is pure and framework-free. */
export { computeReadiness, validateRubricAnswers } from './readiness';
export { resolveWeights } from './weights';
export {
  normalizeDimension, computeArithmetic, computeGeometric, computeContribution, computeDispersion,
  computeBottleneck, computeSensitivity, computeCrossProfile,
} from './scores';
export { evaluateGates, blockedCategories } from './gateEvaluation';
export { runConsistencyChecks } from './consistency';
export { assignBand, assignCompensationBand } from './banding';
