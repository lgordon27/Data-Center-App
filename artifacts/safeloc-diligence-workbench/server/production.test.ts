import { strict as assert } from "node:assert";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const packageMetadata = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version: string };
const artifactToml = readFileSync(path.join(packageRoot, ".replit-artifact", "artifact.toml"), "utf8");

type PreviewRegistration = {
  previewPath: string;
  paths: string[];
  localPort: number;
  configuredPort: string;
  configuredBasePath: string;
  developmentCommand: string;
};

function readPreviewRegistration(): PreviewRegistration {
  const previewPath = artifactToml.match(/^previewPath\s*=\s*"([^"]*)"$/m)?.[1];
  const serviceBlocks = [...artifactToml.matchAll(/\[\[services\]\]\s*([\s\S]*?)(?=\n\[\[services\]\]|\n\[services\.)/g)].map(
    (match) => match[1],
  );
  const serviceBlock = serviceBlocks[0];
  const pathsSource = serviceBlock?.match(/^paths\s*=\s*\[([^\]]*)\]$/m)?.[1];
  const localPortSource = serviceBlock?.match(/^localPort\s*=\s*(\S+)$/m)?.[1];
  const serviceName = serviceBlock?.match(/^name\s*=\s*"([^"]*)"$/m)?.[1];
  const developmentBlock = artifactToml.match(/\[services\.development\]\s*([\s\S]*?)(?=\n\[services\.)/)?.[1] ?? "";
  const developmentCommand = developmentBlock.match(/^run\s*=\s*"([^"]*)"$/m)?.[1];
  const environmentBlock = artifactToml.match(/\[services\.env\]\s*([\s\S]*)$/)?.[1] ?? "";
  const configuredPort = environmentBlock.match(/^PORT\s*=\s*"([^"]*)"$/m)?.[1];
  const configuredBasePath = environmentBlock.match(/^BASE_PATH\s*=\s*"([^"]*)"$/m)?.[1];

  if (!previewPath) {
    throw new Error("Preview registration check failed: artifact.toml must declare previewPath.");
  }
  if (serviceBlocks.length !== 1 || !serviceBlock || !pathsSource || !localPortSource || !serviceName) {
    throw new Error(
      "Preview registration check failed: artifact.toml must declare exactly one named web service with paths and localPort.",
    );
  }
  if (!developmentCommand) {
    throw new Error("Preview registration check failed: artifact.toml must declare services.development.run.");
  }
  if (configuredPort === undefined || configuredBasePath === undefined) {
    throw new Error("Preview registration check failed: artifact.toml must declare PORT and BASE_PATH in services.env.");
  }

  const localPort = Number(localPortSource);
  const paths = Array.from(pathsSource.matchAll(/"([^"]*)"/g), (match) => match[1]);

  if (previewPath !== "/" || !previewPath.startsWith("/") || previewPath.includes("*")) {
    throw new Error(`Preview registration check failed: previewPath "${previewPath}" must be the root path "/".`);
  }
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65_535) {
    throw new Error(`Preview registration check failed: localPort "${localPortSource}" must be an integer between 1 and 65535.`);
  }
  if (String(localPort) !== configuredPort) {
    throw new Error(`Preview registration check failed: localPort ${localPort} must match services.env.PORT "${configuredPort}".`);
  }
  if (configuredBasePath !== previewPath) {
    throw new Error(`Preview registration check failed: services.env.BASE_PATH "${configuredBasePath}" must match previewPath "${previewPath}".`);
  }
  if (paths.length !== 1 || paths[0] !== "/") {
    throw new Error(
      `Preview registration check failed: web service paths must be the single root application path "/"; received ${JSON.stringify(paths)}.`,
    );
  }
  if (serviceName !== "web") {
    throw new Error(`Preview registration check failed: the canonical service must be named "web", received "${serviceName}".`);
  }
  const expectedDevelopmentCommand = "pnpm --filter @workspace/safeloc-diligence-workbench run dev";
  if (developmentCommand !== expectedDevelopmentCommand) {
    throw new Error(`Preview registration check failed: services.development.run must be "${expectedDevelopmentCommand}".`);
  }

  return { previewPath, paths, localPort, configuredPort, configuredBasePath, developmentCommand };
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = spawn(command, args, {
    cwd: packageRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
  const [result] = await once(child, "close");
  if (result !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result}\n${Buffer.concat(chunks).toString()}`);
  }
}

async function runExpectingFailure(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = spawn(command, args, {
    cwd: packageRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
  const [code] = await once(child, "close");
  return { code, output: Buffer.concat(chunks).toString() };
}

function bundleDigest(directory: string) {
  const files: Array<[string, Buffer]> = [];
  const visit = (current: string, relative = "") => {
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

async function waitForJson(url: string, child: ReturnType<typeof spawn>) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      const contentType = response.headers.get("content-type") ?? "";
      assert.match(contentType, /application\/json/, `${url} should be a JSON API response`);
      return await response.json() as Record<string, unknown>;
    } catch (error) {
      if (child.exitCode !== null) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForResponse(url: string, child: ReturnType<typeof spawn>) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      if (child.exitCode !== null) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForPreviewResponse(url: string, child: ReturnType<typeof spawn>, output: string[]) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      if (child.exitCode !== null) {
        const details = output.join("").trim();
        throw new Error(
          `Managed artifact development workflow exited before serving ${url} with code ${child.exitCode}. ` +
            `Check artifact.toml previewPath/localPort registration.\n${details}`,
          { cause: error },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(
    `Managed preview startup failed before ${url} responded. ` +
      `The local process stayed alive, so check the managed artifact route registration and port agreement ` +
      `(previewPath=${JSON.stringify(process.env.BASE_PATH ?? "/")}, localPort=${process.env.PORT ?? "unset"}).`,
  );
}

async function stopProcess(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) return;
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([
    once(child, "close"),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

function getManagedPreviewBaseUrl() {
  const configuredUrl = process.env.SAFELOC_MANAGED_PREVIEW_URL ?? process.env.PLAYWRIGHT_BASE_URL;
  const domainUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined;
  const candidate = configuredUrl ?? domainUrl;
  if (!candidate || candidate.includes("127.0.0.1") || candidate.includes("localhost")) return undefined;
  try {
    return new URL(candidate).origin;
  } catch {
    throw new Error(
      `Managed preview configuration failed: SAFELOC_MANAGED_PREVIEW_URL/PLAYWRIGHT_BASE_URL must be an absolute URL, received "${candidate}".`,
    );
  }
}

async function assertPreviewContract(baseUrl: string, label: "local" | "managed") {
  const request = async (route: string) => {
    const url = new URL(route, `${baseUrl}/`).toString();
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(
        `${label} SafeLoc preview request failed for ${route}. ` +
          `Check server startup, PORT, and BASE_PATH before investigating routing.`,
        { cause: error },
      );
    }
    return { response, url };
  };

  for (const route of ["/", "/client-route"]) {
    const { response, url } = await request(route);
    const body = await response.text();
    if (label === "managed" && response.status === 404) {
      throw new Error(
        `Managed preview registration mismatch for ${route}: the proxy returned HTTP 404 instead of the SafeLoc shell at ${url}. ` +
          `Restart the artifact-owned workflow to reload the root application path; response=${JSON.stringify(body.slice(0, 180))}`,
      );
    }
    assert.equal(response.status, 200, `${label} ${route} should return the React shell; received ${response.status} from ${url}`);
    assert.match(
      response.headers.get("content-type") ?? "",
      /text\/html/,
      `${label} ${route} should return HTML; received ${response.headers.get("content-type") ?? "no content type"}`,
    );
    assert.match(body, /<div id="root"><\/div>/, `${label} ${route} should return the SafeLoc shell`);
    assert.doesNotMatch(body, /"message"\s*:\s*"this route doesn't exist"/, `${label} ${route} must not be the artifact-router 404`);
  }

  const { response: versionResponse, url: versionUrl } = await request("/api/version");
  const versionBody = await versionResponse.text();
  if (label === "managed" && versionResponse.status === 404) {
    throw new Error(
      `Managed preview registration mismatch for /api/version: the proxy returned HTTP 404 at ${versionUrl}. ` +
        `Check that the single root application path is registered and that the workflow is using the configured port.`,
    );
  }
  assert.equal(
    versionResponse.status,
    200,
    `${label} /api/version should reach SafeLoc, not the artifact router; received ${versionResponse.status} from ${versionUrl}`,
  );
  assert.match(versionResponse.headers.get("content-type") ?? "", /application\/json/, `${label} /api/version should remain JSON`);
  const version = JSON.parse(versionBody) as Record<string, unknown>;
  assert.equal(typeof version.applicationVersion, "string", `${label} /api/version should expose applicationVersion`);

  const { response: releaseResponse, url: releaseUrl } = await request("/release.json");
  const releaseBody = await releaseResponse.text();
  if (label === "managed" && releaseResponse.status === 404) {
    throw new Error(
      `Managed preview registration mismatch for /release.json: the proxy returned HTTP 404 at ${releaseUrl}. ` +
        `Check that the single root application path is registered and that the workflow is using the configured port.`,
    );
  }
  assert.equal(
    releaseResponse.status,
    200,
    `${label} /release.json should reach SafeLoc, not the artifact router; received ${releaseResponse.status} from ${releaseUrl}`,
  );
  assert.match(releaseResponse.headers.get("content-type") ?? "", /application\/json/, `${label} /release.json should remain JSON`);
  const release = JSON.parse(releaseBody) as Record<string, unknown>;
  assert.equal(release.applicationVersion, version.applicationVersion, `${label} release metadata should match /api/version`);

  const { response: unknownApiResponse, url: unknownApiUrl } = await request("/api/does-not-exist");
  const unknownApiBody = await unknownApiResponse.text();
  assert.equal(
    unknownApiResponse.status,
    404,
    `${label} unknown API route should be a SafeLoc JSON 404; received ${unknownApiResponse.status} from ${unknownApiUrl}`,
  );
  assert.match(
    unknownApiResponse.headers.get("content-type") ?? "",
    /application\/json/,
    `${label} unknown API route should remain JSON rather than becoming the SPA shell`,
  );
  assert.deepEqual(JSON.parse(unknownApiBody), { status: "error", message: "API route not found" });
}

test("managed artifact registration and preview preserve the SPA/API route contract", async () => {
  const registration = readPreviewRegistration();
  const port = 4600 + (process.pid % 500);
  const output: string[] = [];
  const child = spawn("sh", ["-c", registration.developmentCommand], {
    cwd: packageRoot,
    env: { ...process.env, NODE_ENV: "development", PORT: String(port), BASE_PATH: registration.previewPath },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    for (const route of ["/", "/client-route", "/api/version"]) {
      await waitForPreviewResponse(`${baseUrl}${route}`, child, output);
    }
    await assertPreviewContract(baseUrl, "local");

    const managedPreviewBaseUrl = getManagedPreviewBaseUrl();
    if (managedPreviewBaseUrl) {
      await assertPreviewContract(managedPreviewBaseUrl, "managed");
    }
  } finally {
    await stopProcess(child);
  }
});

test("development identity ignores a stale generated release document", async () => {
  const releasePath = path.join(packageRoot, "dist/public/release.json");
  const originalReleaseDocument = readFileSync(releasePath, "utf8");
  const staleRelease = {
    ...JSON.parse(originalReleaseDocument),
    releaseId: "bundle-stale-production-document",
    commitSha: "0".repeat(40),
    sourceCommitSha: "0".repeat(40),
    commitShaMatchesSource: true,
    assetManifestStatus: "available",
    assets: [{ file: "assets/stale.js", hash: `sha256-${"0".repeat(64)}` }],
  };
  writeFileSync(releasePath, `${JSON.stringify(staleRelease)}\n`);

  const port = 4650 + (process.pid % 500);
  const child = spawn("sh", ["-c", "pnpm run dev"], {
    cwd: packageRoot,
    env: { ...process.env, NODE_ENV: "development", PORT: String(port), BASE_PATH: "/" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const version = await waitForJson(`${baseUrl}/api/version`, child);
    const releaseDocument = await waitForJson(`${baseUrl}/release.json`, child);
    const currentCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: packageRoot, encoding: "utf8" }).trim();
    assert.equal(version.sourceCommitSha, currentCommitSha);
    assert.equal(version.commitSha, currentCommitSha);
    assert.equal(version.commitShaMatchesSource, true);
    assert.equal(version.releaseId, `dev-${currentCommitSha}`);
    assert.equal(version.assetManifestStatus, "unavailable");
    assert.deepEqual(version.assets, []);
    assert.deepEqual(releaseDocument, version, "development release.json must use the live source identity");
    assert.equal((await fetch(`${baseUrl}/api/version`)).headers.get("cache-control"), "no-store");
    assert.equal((await fetch(`${baseUrl}/release.json`)).headers.get("cache-control"), "no-store");
  } finally {
    await stopProcess(child);
    writeFileSync(releasePath, originalReleaseDocument);
  }
});

test("release builds reject a configured commit SHA that does not match Git HEAD", async () => {
  const mismatch = "0".repeat(40);
  const result = await runExpectingFailure("node", ["server/writeRelease.mjs"], { COMMIT_SHA: mismatch });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Release identity mismatch/);
  assert.match(result.output, new RegExp(`COMMIT_SHA="${mismatch}"`));
  assert.match(result.output, /Refusing to write/);
});

test("production entry point serves active API routes without retired endpoints", async () => {
  const port = 4700 + (process.pid % 500);
  await run("pnpm", ["run", "build"], { PORT: String(port), BASE_PATH: "/" });
  const child = spawn("pnpm", ["run", "start"], {
    cwd: packageRoot,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), BASE_PATH: "/" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const root = await waitForResponse(`${baseUrl}/`, child);
    assert.equal(root.status, 200);
    assert.match(root.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await root.text(), /<div id="root"><\/div>/);

    const clientRoute = await waitForResponse(`${baseUrl}/client-route`, child);
    assert.equal(clientRoute.status, 200);
    assert.match(clientRoute.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await clientRoute.text(), /<div id="root"><\/div>/);

    const ercot = await waitForJson(`${baseUrl}/api/ercot-queue`, child);
    assert.ok(["live", "cached", "error"].includes(String(ercot.status)));
    assert.equal(typeof ercot.diagnostics, "object");
    const eia = await waitForJson(`${baseUrl}/api/eia/electricity`, child);
    assert.ok(["live", "cached", "unavailable", "error"].includes(String(eia.status)));
    assert.equal(typeof eia.diagnostics, "object");
    const directory = await waitForJson(`${baseUrl}/api/directory`, child);
    assert.ok(Array.isArray(directory.facilities));
    assert.ok(["live", "cached", "embedded"].includes(String((directory.sourceMetadata as Record<string, unknown>)?.status)));
    const directoryStats = await waitForJson(`${baseUrl}/api/directory/stats`, child);
    assert.equal(typeof directoryStats.stats, "object");
    assert.ok(["live", "cached", "embedded"].includes(String((directoryStats.sourceMetadata as Record<string, unknown>)?.status)));
    const version = await waitForJson(`${baseUrl}/api/version`, child);
    const versionAgain = await waitForJson(`${baseUrl}/api/version`, child);
    assert.equal(typeof version.applicationVersion, "string");
    assert.equal(version.applicationVersion, packageMetadata.version);
    assert.notEqual(version.applicationVersion, "0.0.0", "the user-facing product version must not be the package placeholder");
    assert.equal(typeof version.releaseId, "string");
    assert.equal(typeof version.buildTimestamp, "string");
    assert.ok(version.commitSha || version.releaseId, "release identity must include a commit SHA or release ID");
    assert.equal(typeof version.sourceCommitSha, "string");
    assert.equal(typeof version.commitShaSource, "string");
    assert.equal(version.commitShaMatchesSource, true, "production release metadata must be verified against Git HEAD");
    assert.equal(version.sourceCommitSha, execFileSync("git", ["rev-parse", "HEAD"], { cwd: packageRoot, encoding: "utf8" }).trim());
    assert.equal(version.assetManifestStatus, "available");
    assert.ok(Array.isArray(version.assets) && version.assets.length > 0, "production release metadata must include generated assets");
    for (const asset of version.assets as Array<{ file: string; hash: string }>) {
      assert.match(asset.file, /^assets\/.+\.(?:js|css)$/);
      assert.match(asset.hash, /^sha256-[0-9a-f]{64}$/);
    }
    assert.deepEqual(versionAgain, version, "release identity must be immutable for the process lifetime");
    const releaseDocument = await waitForJson(`${baseUrl}/release.json`, child);
    const generatedReleaseDocument = JSON.parse(readFileSync(path.join(packageRoot, "dist/public/release.json"), "utf8"));
    assert.deepEqual(generatedReleaseDocument, version, "runtime release identity must match the generated release document");
    assert.deepEqual(releaseDocument, generatedReleaseDocument, "the public release route must serve the generated release document");
    assert.deepEqual(releaseDocument, version, "the public build release document must match the API identity");
    const versionHeaders = await fetch(`${baseUrl}/api/version`);
    assert.equal(versionHeaders.headers.get("cache-control"), "no-store");
    const releaseHeaders = await fetch(`${baseUrl}/release.json`);
    assert.equal(releaseHeaders.headers.get("cache-control"), "no-store");
    assert.equal(
      version.releaseId,
      `bundle-${bundleDigest(path.join(packageRoot, "dist/public"))}`,
      "release ID must identify the generated public bundle digest",
    );
    const aiMethod = await fetch(`${baseUrl}/api/analyze-evidence`);
    assert.equal(aiMethod.status, 405);
    const unknownApi = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(unknownApi.status, 404);
    assert.match(unknownApi.headers.get("content-type") ?? "", /application\/json/);
    for (const retiredPath of ["/api/grid/status", "/api/grid/diagnostics", "/api/grid/query"]) {
      const retiredResponse = await fetch(`${baseUrl}${retiredPath}`);
      assert.equal(retiredResponse.status, 404, `${retiredPath} should not be exposed`);
    }
  } finally {
    await stopProcess(child);
  }
});