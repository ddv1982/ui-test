import type { Step } from "../yaml-schema.js";
import type {
  AssertionCandidate,
  AssertionCandidateSource,
} from "./report-schema.js";
import {
  buildDeltaNodes,
  buildStableNodes,
} from "./assertion-candidates-snapshot-diff.js";
import {
  buildStableVisibleCandidates,
  buildStateChangeCandidates,
  buildTextCandidates,
  buildTextChangedCandidates,
  buildTitleCandidates,
  buildUrlCandidates,
  buildVisibleCandidates,
} from "./assertion-candidates-snapshot-candidate-builder.js";
import {
  extractActedTargetHint,
  MAX_TEXT_CANDIDATES_PER_STEP,
  MAX_VISIBLE_CANDIDATES_PER_STEP,
  normalizeForCompare,
} from "./assertion-candidates-snapshot-shared.js";
import { parseSnapshotNodes } from "./assertion-candidates-snapshot-parser.js";

export interface StepSnapshot {
  index: number;
  step: Step;
  preSnapshot: string;
  postSnapshot: string;
  preUrl?: string;
  postUrl?: string;
  preTitle?: string;
  postTitle?: string;
}

export function buildSnapshotAssertionCandidates(
  snapshots: StepSnapshot[],
  candidateSource: AssertionCandidateSource
): AssertionCandidate[] {
  const candidates: AssertionCandidate[] = [];

  for (const snapshot of snapshots) {
    const preNodes = parseSnapshotNodes(snapshot.preSnapshot);
    const postNodes = parseSnapshotNodes(snapshot.postSnapshot);
    const delta = buildDeltaNodes(preNodes, postNodes);

    const actedTargetHint = extractActedTargetHint(snapshot.step);
    const framePath =
      snapshot.step.action !== "navigate" &&
      snapshot.step.action !== "assertUrl" &&
      snapshot.step.action !== "assertTitle" &&
      "target" in snapshot.step &&
      snapshot.step.target
        ? snapshot.step.target.framePath
        : undefined;

    if (snapshot.step.action === "click") {
      const stableNodes = buildStableNodes(preNodes, postNodes);
      const stableCandidates = buildStableVisibleCandidates(
        snapshot.index,
        snapshot.step.action,
        stableNodes,
        actedTargetHint,
        framePath,
        candidateSource
      );
      candidates.push(...stableCandidates);
    }

    candidates.push(
      ...buildUrlCandidates(
        snapshot.index,
        snapshot.step.action,
        snapshot.preUrl,
        snapshot.postUrl,
        candidateSource
      )
    );

    candidates.push(
      ...buildTitleCandidates(
        snapshot.index,
        snapshot.step.action,
        snapshot.preTitle,
        snapshot.postTitle,
        candidateSource
      )
    );

    candidates.push(
      ...buildTextChangedCandidates(
        snapshot.index,
        snapshot.step.action,
        preNodes,
        postNodes,
        actedTargetHint,
        framePath,
        candidateSource,
        MAX_TEXT_CANDIDATES_PER_STEP
      )
    );

    candidates.push(
      ...buildStateChangeCandidates(
        snapshot.index,
        snapshot.step.action,
        preNodes,
        postNodes,
        actedTargetHint,
        framePath,
        candidateSource
      )
    );

    if (delta.length === 0) continue;

    const textCandidates = buildTextCandidates(
      snapshot.index,
      snapshot.step.action,
      delta,
      actedTargetHint,
      framePath,
      candidateSource,
      MAX_TEXT_CANDIDATES_PER_STEP
    );
    candidates.push(...textCandidates);

    const textTargetValues = new Set(
      textCandidates.map((candidate) =>
        normalizeForCompare(
          "target" in candidate.candidate && candidate.candidate.target
            ? candidate.candidate.target.value
            : ""
        )
      )
    );

    const visibleCandidates = buildVisibleCandidates(
      snapshot.index,
      snapshot.step.action,
      delta,
      actedTargetHint,
      framePath,
      candidateSource,
      MAX_VISIBLE_CANDIDATES_PER_STEP
    );

    for (const visibleCandidate of visibleCandidates) {
      const visibleTarget =
        "target" in visibleCandidate.candidate && visibleCandidate.candidate.target
          ? normalizeForCompare(visibleCandidate.candidate.target.value)
          : "";
      if (textTargetValues.has(visibleTarget)) continue;
      candidates.push(visibleCandidate);
    }
  }

  return candidates;
}

export { parseSnapshotNodes };
