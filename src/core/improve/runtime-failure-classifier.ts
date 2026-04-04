import type { Step } from "../yaml-schema.js";
import {
  buildRuntimeFailureSignals,
  detectCookieConsentDismiss,
} from "./runtime-failure-classifier-support.js";

export type RuntimeFailureDisposition = "remove" | "retain";
export type RuntimeFailureMutationSafety =
  | "safe"
  | "review_required"
  | "unsafe_to_auto_apply";

export interface RuntimeFailureClassification {
  disposition: RuntimeFailureDisposition;
  reason: string;
  decisionConfidence: number;
  mutationSafety: RuntimeFailureMutationSafety;
  evidenceRefs: string[];
}

export function classifyRuntimeFailingStep(
  step: Step
): RuntimeFailureClassification {
  if (step.action === "navigate") {
    return makeClassification("retain", "navigation steps are never auto-removed", {
      decisionConfidence: 1,
      mutationSafety: "safe",
      evidenceRefs: ["action:navigate"],
    });
  }

  const isInteraction = step.action === "click" || step.action === "press";
  if (!isInteraction) {
    return makeClassification(
      "retain",
      "non-interaction steps are never auto-removed by transient policy",
      {
        decisionConfidence: 1,
        mutationSafety: "safe",
        evidenceRefs: [`action:${step.action}`],
      }
    );
  }

  // --- Early cookie-consent detection via shared patterns ---
  const targetValue = "target" in step ? step.target.value : "";
  const targetKind = "target" in step ? step.target.kind : "unknown";

  const cookieConsentDismiss = detectCookieConsentDismiss(targetValue, targetKind);
  if (cookieConsentDismiss.matched && cookieConsentDismiss.via === "text") {
    return makeClassification(
      "remove",
      "classified as cookie-consent dismiss interaction (multilingual pattern match)",
      {
        decisionConfidence: 0.98,
        mutationSafety: "safe",
        evidenceRefs: [
          "pattern:cookie_consent_text",
          `accessible_name:${cookieConsentDismiss.accessibleName ?? ""}`,
        ],
      }
    );
  }

  if (cookieConsentDismiss.matched && cookieConsentDismiss.via === "cmp_selector") {
    return makeClassification("remove", "classified as cookie-consent CMP selector interaction", {
      decisionConfidence: 0.97,
      mutationSafety: "safe",
      evidenceRefs: ["pattern:cmp_selector", `target_kind:${targetKind}`],
    });
  }

  // --- Existing transient-context classification ---
  const signals = buildRuntimeFailureSignals({
    targetValue,
    targetKind,
    ...(step.description !== undefined ? { description: step.description } : {}),
  });

  if (!signals.hasAnyTransientContext) {
    return makeClassification("retain", "classified as non-transient interaction", {
      decisionConfidence: 0.93,
      mutationSafety: "safe",
      evidenceRefs: ["context:non_transient"],
    });
  }

  if (signals.looksLikeContentLink) {
    return makeClassification(
      "retain",
      "transient-context safeguard: likely content link interaction",
      {
        decisionConfidence: 0.9,
        mutationSafety: "review_required",
        evidenceRefs: ["safeguard:content_link", "role:link"],
      }
    );
  }

  if (signals.hasBusinessIntent && !signals.hasStrongTransientContext) {
    return makeClassification(
      "retain",
      "transient-context safeguard: likely business-intent interaction",
      {
        decisionConfidence: 0.88,
        mutationSafety: "review_required",
        evidenceRefs: ["safeguard:business_intent"],
      }
    );
  }

  if (signals.hasStrongTransientContext && (signals.hasDismissIntent || signals.hasControlCue)) {
    return makeClassification("remove", "classified as transient dismissal/control interaction", {
      decisionConfidence: 0.92,
      mutationSafety: "safe",
      evidenceRefs: [
        "context:strong_transient",
        signals.hasDismissIntent ? "signal:dismiss_intent" : "signal:no_dismiss_intent",
        signals.hasControlCue ? "signal:control_cue" : "signal:no_control_cue",
      ],
    });
  }

  if (signals.hasStrongTransientContext) {
    return makeClassification("remove", "classified as strong transient-context interaction", {
      decisionConfidence: 0.78,
      mutationSafety: "review_required",
      evidenceRefs: ["context:strong_transient"],
    });
  }

  if (signals.hasDismissIntent && signals.hasControlCue) {
    return makeClassification(
      "remove",
      "classified as soft transient dismissal/control interaction",
      {
        decisionConfidence: 0.72,
        mutationSafety: "unsafe_to_auto_apply",
        evidenceRefs: ["context:soft_transient", "signal:dismiss_intent", "signal:control_cue"],
      }
    );
  }

  return makeClassification("retain", "transient context without dismissal/control confidence", {
    decisionConfidence: 0.74,
    mutationSafety: "review_required",
    evidenceRefs: ["context:soft_transient", "signal:insufficient_confidence"],
  });
}

function makeClassification(
  disposition: RuntimeFailureDisposition,
  reason: string,
  extras: {
    decisionConfidence: number;
    mutationSafety: RuntimeFailureMutationSafety;
    evidenceRefs: string[];
  }
): RuntimeFailureClassification {
  return {
    disposition,
    reason,
    decisionConfidence: extras.decisionConfidence,
    mutationSafety: extras.mutationSafety,
    evidenceRefs: extras.evidenceRefs,
  };
}
