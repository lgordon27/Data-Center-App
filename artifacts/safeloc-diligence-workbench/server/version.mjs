import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

function gitValue(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function normalizeCommitSha(value) {
  return value?.trim().toLowerCase() || null;
}

function readBuiltIdentity() {
  try {
    return JSON.parse(readFileSync(path.join(serverDir, "..", "dist", "public", "release.json"), "utf8"));
  } catch {
    return null;
  }
}

const isProduction = process.env.NODE_ENV === "production";
const builtIdentity = isProduction ? readBuiltIdentity() : null;
const liveSourceCommitSha = gitValue(["rev-parse", "HEAD"]);
const applicationVersion = builtIdentity?.applicationVersion || process.env.npm_package_version || "0.0.0";
const sourceCommitSha = builtIdentity?.sourceCommitSha ?? liveSourceCommitSha;
const commitSha = builtIdentity?.commitSha
  || (isProduction && (
    process.env.COMMIT_SHA
    || process.env.GIT_COMMIT_SHA
    || process.env.REPLIT_GIT_COMMIT_SHA
  ))
  || sourceCommitSha;
const commitShaMatchesSource = builtIdentity?.commitShaMatchesSource
  ?? (commitSha && sourceCommitSha
    ? normalizeCommitSha(commitSha) === normalizeCommitSha(sourceCommitSha)
    : null);
const commitShaSource = builtIdentity?.commitShaSource
  || (isProduction && process.env.COMMIT_SHA ? "COMMIT_SHA"
    : isProduction && process.env.GIT_COMMIT_SHA ? "GIT_COMMIT_SHA"
      : isProduction && process.env.REPLIT_GIT_COMMIT_SHA ? "REPLIT_GIT_COMMIT_SHA"
        : sourceCommitSha ? "git" : "unavailable");
const releaseId = builtIdentity?.releaseId
  || (isProduction && (
    process.env.RELEASE_ID
    || process.env.REPLIT_DEPLOYMENT_ID
    || commitSha
  ))
  || (commitSha ? `dev-${commitSha}` : `local-${applicationVersion}`);
const buildTimestamp = builtIdentity?.buildTimestamp
  || process.env.BUILD_TIMESTAMP
  || process.env.REPLIT_BUILD_TIMESTAMP
  || gitValue(["show", "-s", "--format=%cI", "HEAD"])
  || (() => {
    try {
      return statSync(fileURLToPath(new URL("../package.json", import.meta.url))).mtime.toISOString();
    } catch {
      return "unknown";
    }
  })();

export const releaseIdentity = Object.freeze({
  applicationVersion,
  releaseId,
  commitSha,
  sourceCommitSha,
  commitShaSource,
  commitShaMatchesSource,
  deploymentId: builtIdentity?.deploymentId ?? null,
  buildTimestamp,
  assetManifestStatus: builtIdentity ? "available" : "unavailable",
  assets: Object.freeze(Array.isArray(builtIdentity?.assets)
    ? builtIdentity.assets.map((asset) => Object.freeze({ file: asset.file, hash: asset.hash }))
    : []),
});

export function handleVersionRequest(_req, res) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(releaseIdentity));
}

export function handleReleaseDocumentRequest(_req, res) {
  const identity = isProduction ? (readBuiltIdentity() ?? releaseIdentity) : releaseIdentity;
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(identity));
}