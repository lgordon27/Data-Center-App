import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(serverDir, "..");
const publicDir = path.join(artifactDir, "dist", "public");
const packageJson = JSON.parse(readFileSync(path.join(artifactDir, "package.json"), "utf8"));

function gitValue(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function bundleDigest(directory) {
  const files = [];
  const visit = (current, relative = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const entryRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(absolute, entryRelative);
      else if (entry.name !== "release.json") files.push([entryRelative, readFileSync(absolute)]);
    }
  };
  visit(directory);
  const hash = createHash("sha256");
  for (const [relative, content] of files.sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(relative);
    hash.update("\0");
    hash.update(content);
  }
  return hash.digest("hex").slice(0, 16);
}

const commitSha = process.env.COMMIT_SHA
  || process.env.GIT_COMMIT_SHA
  || process.env.REPLIT_GIT_COMMIT_SHA
  || gitValue(["rev-parse", "HEAD"]);
const deploymentId = process.env.RELEASE_ID || process.env.REPLIT_DEPLOYMENT_ID || null;
const buildTimestamp = process.env.BUILD_TIMESTAMP
  || process.env.REPLIT_BUILD_TIMESTAMP
  || new Date().toISOString();

mkdirSync(publicDir, { recursive: true });
const releaseId = `bundle-${bundleDigest(publicDir)}`;
writeFileSync(
  path.join(publicDir, "release.json"),
  `${JSON.stringify({
    applicationVersion: process.env.npm_package_version || packageJson.version || "0.0.0",
    releaseId,
    commitSha,
    deploymentId,
    buildTimestamp,
  })}\n`,
);