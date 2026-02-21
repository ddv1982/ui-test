export type {
  AssertionCandidateRef,
  AssertionApplyOutcome,
  AssertionApplyValidationOptions,
  AssertionInsertion,
  SelectCandidatesForApplyOptions,
} from "./assertion-apply-types.js";

export { selectCandidatesForApply } from "./assertion-apply-selection.js";
export { validateCandidatesAgainstRuntime } from "./assertion-apply-validation.js";
export {
  insertAppliedAssertions,
  isDuplicateAdjacentAssertion,
} from "./assertion-apply-insertion.js";
