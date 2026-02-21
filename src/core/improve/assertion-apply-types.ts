import type { Step } from "../yaml-schema.js";
import type {
  AssertionApplyStatus,
  AssertionCandidate,
} from "./report-schema.js";
import type { AssertionPolicyConfig } from "./assertion-policy.js";

export interface AssertionCandidateRef {
  candidateIndex: number;
  candidate: AssertionCandidate;
}

export interface AssertionApplyOutcome {
  candidateIndex: number;
  applyStatus: AssertionApplyStatus;
  applyMessage?: string;
}

export interface AssertionApplyValidationOptions {
  timeout: number;
  baseUrl?: string;
  waitForNetworkIdle?: boolean;
  policyConfig?: AssertionPolicyConfig;
}

export interface AssertionInsertion {
  sourceIndex: number;
  assertionStep: Step;
}

export interface SelectCandidatesForApplyOptions {
  perCandidateMinConfidence?: (candidate: AssertionCandidate) => number;
  forcedPolicyMessages?: Map<number, string>;
  useStabilityScore?: boolean;
  policyConfig?: AssertionPolicyConfig;
}
