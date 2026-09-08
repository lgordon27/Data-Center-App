import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const applicationVersion = process.env.npm_package_version || "0.0.0";
function gitValue(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}
const commitSha = process.env.COMMIT_SHA || process.env.GIT_COMMIT_SHA || process.env.REPLIT_GIT_COMMIT_SHA || gitValue(["rev-parse", "HEAD"]);
const releaseId = process.env.RELEASE_ID || process.env.REPLIT_DEPLOYMENT_ID || commitSha || `local-${applicationVersion}`;
const buildTimestamp = process.env.BUILD_TIMESTAMP
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
  buildTimestamp,
});

export function handleVersionRequest(_req, res) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(releaseIdentity));
}