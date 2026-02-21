import type { Target } from "../../yaml-schema.js";

export function selectorTargetKey(target: Target): string {
  return JSON.stringify({
    value: target.value,
    kind: target.kind,
    framePath: target.framePath ?? [],
  });
}
