import type { AssertionCandidate } from "../report-schema.js";
import { buildSnapshotAssertionCandidates, type StepSnapshot } from "./assertion-candidates-snapshot.js";

export function buildSnapshotNativeAssertionCandidates(
  snapshots: StepSnapshot[]
): AssertionCandidate[] {
  return buildSnapshotAssertionCandidates(snapshots, "snapshot_native");
}
