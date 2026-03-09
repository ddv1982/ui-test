import type { Step, Target } from "../yaml-schema.js";

export interface CanonicalEvent {
  kind: Step["action"];
  description?: string;
  timeout?: number;
  target?: Target;
  url?: string;
  text?: string;
  key?: string;
  value?: string;
  checked?: boolean;
  title?: string;
  enabled?: boolean;
}

export function stepsToCanonicalEvents(steps: Step[]): CanonicalEvent[] {
  return steps.map((step) => stepToCanonicalEvent(step));
}

export function canonicalEventsToSteps(events: CanonicalEvent[]): Step[] {
  return events.map((event) => canonicalEventToStep(event));
}

function stepToCanonicalEvent(step: Step): CanonicalEvent {
  const base = {
    kind: step.action,
    ...(step.description !== undefined ? { description: step.description } : {}),
    ...(step.timeout !== undefined ? { timeout: step.timeout } : {}),
  } as const;

  if (step.action === "navigate") {
    return {
      ...base,
      url: step.url,
    };
  }

  const withTarget = "target" in step ? { target: cloneTarget(step.target) } : {};
  switch (step.action) {
    case "click":
    case "dblclick":
    case "hover":
    case "check":
    case "uncheck":
    case "assertVisible":
      return {
        ...base,
        ...withTarget,
      };
    case "fill":
      return {
        ...base,
        ...withTarget,
        text: step.text,
      };
    case "press":
      return {
        ...base,
        ...withTarget,
        key: step.key,
      };
    case "select":
      return {
        ...base,
        ...withTarget,
        value: step.value,
      };
    case "assertText":
      return {
        ...base,
        ...withTarget,
        text: step.text,
      };
    case "assertValue":
      return {
        ...base,
        ...withTarget,
        value: step.value,
      };
    case "assertChecked":
      return {
        ...base,
        ...withTarget,
        checked: step.checked,
      };
    case "assertUrl":
      return {
        ...base,
        url: step.url,
      };
    case "assertTitle":
      return {
        ...base,
        title: step.title,
      };
    case "assertEnabled":
      return {
        ...base,
        ...withTarget,
        enabled: step.enabled,
      };
    default:
      return {
        ...base,
      };
  }
}

function canonicalEventToStep(event: CanonicalEvent): Step {
  const base = {
    ...(event.description !== undefined ? { description: event.description } : {}),
    ...(event.timeout !== undefined ? { timeout: event.timeout } : {}),
  };

  switch (event.kind) {
    case "navigate":
      return {
        action: "navigate",
        url: event.url ?? "/",
        ...base,
      };
    case "click":
      return buildTargetStep("click", event, base);
    case "dblclick":
      return buildTargetStep("dblclick", event, base);
    case "hover":
      return buildTargetStep("hover", event, base);
    case "check":
      return buildTargetStep("check", event, base);
    case "uncheck":
      return buildTargetStep("uncheck", event, base);
    case "assertVisible":
      return buildTargetStep("assertVisible", event, base);
    case "fill":
      return {
        ...buildTargetStep("fill", event, base),
        text: event.text ?? "",
      } as Step;
    case "press":
      return {
        ...buildTargetStep("press", event, base),
        key: event.key ?? "",
      } as Step;
    case "select":
      return {
        ...buildTargetStep("select", event, base),
        value: event.value ?? "",
      } as Step;
    case "assertText":
      return {
        ...buildTargetStep("assertText", event, base),
        text: event.text ?? "",
      } as Step;
    case "assertValue":
      return {
        ...buildTargetStep("assertValue", event, base),
        value: event.value ?? "",
      } as Step;
    case "assertChecked":
      return {
        ...buildTargetStep("assertChecked", event, base),
        checked: event.checked ?? true,
      } as Step;
    case "assertUrl":
      return {
        action: "assertUrl",
        url: event.url ?? "",
        ...base,
      };
    case "assertTitle":
      return {
        action: "assertTitle",
        title: event.title ?? "",
        ...base,
      };
    case "assertEnabled":
      return {
        ...buildTargetStep("assertEnabled", event, base),
        enabled: event.enabled ?? true,
      } as Step;
    default:
      return {
        action: "navigate",
        url: "/",
        ...base,
      };
  }
}

function buildTargetStep(
  action:
    | "click"
    | "dblclick"
    | "hover"
    | "check"
    | "uncheck"
    | "fill"
    | "press"
    | "select"
    | "assertVisible"
    | "assertText"
    | "assertValue"
    | "assertChecked"
    | "assertEnabled",
  event: CanonicalEvent,
  base: { description?: string; timeout?: number }
): Step {
  return {
    action,
    target: cloneTarget(event.target),
    ...base,
  } as Step;
}

function cloneTarget(target?: Target): Target {
  if (target) {
    return {
      value: target.value,
      kind: target.kind,
      source: target.source,
      ...(target.framePath !== undefined ? { framePath: [...target.framePath] } : {}),
      ...(target.raw !== undefined ? { raw: target.raw } : {}),
      ...(target.confidence !== undefined ? { confidence: target.confidence } : {}),
      ...(target.warning !== undefined ? { warning: target.warning } : {}),
      ...(target.fallbacks !== undefined
        ? {
            fallbacks: target.fallbacks.map((fallback) => ({
              value: fallback.value,
              kind: fallback.kind,
              source: fallback.source,
            })),
          }
        : {}),
    };
  }

  return {
    value: "*",
    kind: "unknown",
    source: "manual",
  };
}
