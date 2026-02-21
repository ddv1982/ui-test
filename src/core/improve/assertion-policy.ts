import type { Step } from "../yaml-schema.js";
import type { ImproveAssertionPolicy } from "./improve-types.js";
import { UserError } from "../../utils/errors.js";

type AssertionApplyAction = Extract<
  Step["action"],
  | "assertValue"
  | "assertChecked"
  | "assertText"
  | "assertVisible"
  | "assertUrl"
  | "assertTitle"
  | "assertEnabled"
>;

export interface SnapshotCandidateVolumeCap {
  navigate: number;
  other: number;
}

export type SnapshotVisiblePolicy =
  | "stable_structural_only"
  | "runtime_validated";

export interface AssertionPolicyConfig {
  appliedAssertionsPerStepCap: number;
  snapshotCandidateVolumeCap: SnapshotCandidateVolumeCap;
  allowSnapshotVisible: SnapshotVisiblePolicy;
  snapshotTextMinScore: number;
  hardFilterDynamicSignals: ReadonlySet<string>;
  actionPriorityForApply: Readonly<Record<AssertionApplyAction, number>>;
}

const ACTION_PRIORITY: Readonly<Record<AssertionApplyAction, number>> = {
  assertUrl: 0,
  assertTitle: 1,
  assertText: 2,
  assertValue: 3,
  assertChecked: 4,
  assertEnabled: 5,
  assertVisible: 6,
};

export const DEFAULT_IMPROVE_ASSERTION_POLICY: ImproveAssertionPolicy = "balanced";

export const ASSERTION_POLICY_CONFIG: Readonly<
  Record<ImproveAssertionPolicy, AssertionPolicyConfig>
> = {
  reliable: {
    appliedAssertionsPerStepCap: 1,
    snapshotCandidateVolumeCap: { navigate: 1, other: 2 },
    allowSnapshotVisible: "stable_structural_only",
    snapshotTextMinScore: 0.82,
    hardFilterDynamicSignals: new Set([
      "contains_numeric_fragment",
      "contains_date_or_time_fragment",
      "contains_weather_or_news_fragment",
      "long_text",
      "contains_headline_like_text",
      "contains_pipe_separator",
    ]),
    actionPriorityForApply: ACTION_PRIORITY,
  },
  balanced: {
    appliedAssertionsPerStepCap: 2,
    snapshotCandidateVolumeCap: { navigate: 2, other: 3 },
    allowSnapshotVisible: "runtime_validated",
    snapshotTextMinScore: 0.78,
    hardFilterDynamicSignals: new Set([
      "contains_headline_like_text",
      "contains_pipe_separator",
    ]),
    actionPriorityForApply: ACTION_PRIORITY,
  },
  aggressive: {
    appliedAssertionsPerStepCap: 3,
    snapshotCandidateVolumeCap: { navigate: 3, other: 4 },
    allowSnapshotVisible: "runtime_validated",
    snapshotTextMinScore: 0.72,
    hardFilterDynamicSignals: new Set(["contains_headline_like_text"]),
    actionPriorityForApply: ACTION_PRIORITY,
  },
} as const;

export function resolveAssertionPolicyConfig(
  policy: ImproveAssertionPolicy | undefined
): AssertionPolicyConfig {
  const resolvedPolicy = policy ?? DEFAULT_IMPROVE_ASSERTION_POLICY;
  const config = ASSERTION_POLICY_CONFIG[resolvedPolicy];
  if (!config) {
    throw new UserError(
      `Invalid assertion policy: ${String(policy)}`,
      "Use --assertion-policy reliable, --assertion-policy balanced, or --assertion-policy aggressive"
    );
  }
  return config;
}
