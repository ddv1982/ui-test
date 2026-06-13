import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function normalizeReleaseTag(tag) {
  if (typeof tag !== "string" || tag.trim().length === 0) {
    throw new Error("Release tag is required.");
  }

  return tag.trim().replace(/^refs\/tags\//, "");
}

export function expectedReleaseTag(version) {
  if (typeof version !== "string" || version.trim().length === 0) {
    throw new Error("Package version is required.");
  }

  return `v${version.trim()}`;
}

export function assertReleaseTagMatchesVersion(tag, version) {
  const normalizedTag = normalizeReleaseTag(tag);
  const expectedTag = expectedReleaseTag(version);

  if (normalizedTag !== expectedTag) {
    throw new Error(
      `Release tag ${normalizedTag} does not match package version ${version}. Expected ${expectedTag}.`
    );
  }
}

export function readPackageVersion(packageJsonPath = path.join(repoRoot, "package.json")) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  if (typeof packageJson.version !== "string") {
    throw new Error("package.json must contain a string version.");
  }

  return packageJson.version;
}

export function runReleaseTagAssertion(env = process.env) {
  const tag = env.GITHUB_REF_NAME ?? env.GITHUB_REF;
  assertReleaseTagMatchesVersion(tag, readPackageVersion());
  process.stdout.write(`release-tag-ok ${normalizeReleaseTag(tag)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runReleaseTagAssertion();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
