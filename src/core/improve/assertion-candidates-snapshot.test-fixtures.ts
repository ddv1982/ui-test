import type { StepSnapshot } from "./assertion-candidates-snapshot-cli.js";

export const richDeltaStepSnapshot: StepSnapshot = {
  index: 1,
  step: {
    action: "click",
    target: { value: "#login", kind: "css", source: "manual" },
  },
  preSnapshot: "- generic [ref=e1]:\n",
  postSnapshot:
    [
      "- generic [ref=e1]:",
      '  - heading "Dashboard" [level=1] [ref=e2]',
      '  - link "Settings" [ref=e3]',
      '  - button "Log out" [ref=e4]',
    ].join("\n") + "\n",
};
