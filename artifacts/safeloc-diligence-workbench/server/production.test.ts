import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
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
  const serviceBlock = artifactToml.match(/\[\[services\]\]\s*([\s\S]*?)(?=\n\[services\.)/)?.[1];
  const pathsSource = serviceBlock?.match(/^paths\s*=\s*\[([^\]]*)\]$/m)?.[1];
  const localPortSource = serviceBlock?.match(/^localPort\s*=\s*(\S+)$/m)?.[1];
  const developmentBlock = artifactToml.match(/\[services\.development\]\s*([\s\S]*?)(?=\n\[services\.)/)?.[1] ?? "";
  const developmentCommand = developmentBlock.match(/^run\s*=\s*"([^"]*)"$/m)?.[1];
  const environmentBlock = artifactToml.match(/\[services\.env\]\s*([\s\S]*)$/)?.[1] ?? "";
  const configuredPort = environmentBlock.match(/^PORT\s*=\s*"([^"]*)"$/m)?.[1];
  const configuredBasePath = environmentBlock.match(/^BASE_PATH\s*=\s*"([^"]*)"$/m)?.[1];

  if (!previewPath) {
    throw new Error("Preview registration check failed: artifact.toml must declare previewPath.");
  }
  if (!serviceBlock || !pathsSource || !localPortSource) {
    throw new Error("Preview registration check failed: artifact.toml must declare a web service with paths and localPort.");
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
  if (paths.length === 0 || paths.some((registeredPath) => !registeredPath.startsWith("/") || registeredPath.includes("*"))) {
    throw new Error("Preview registration check failed: service paths must be non-empty absolute paths without wildcards.");
  }
  if (!paths.includes(previewPath)) {
    throw new Error(`Preview registration check failed: service paths must include previewPath "${previewPath}".`);
  }
  if (!paths.includes("/api/version")) {
    throw new Error('Preview registration check failed: service paths must include "/api/version" so the release API is not swallowed by the SPA.');
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
  throw new Error(`Timed out waiting for managed artifact preview route ${url}. Check artifact.toml previewPath/localPort registration.`);
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

test("managed artifact development workflow serves SPA routes and keeps the version API JSON", async () => {
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
    for (const route of [registration.previewPath, `${registration.previewPath}client-route`]) {
      const response = await waitForPreviewResponse(`${baseUrl}${route}`, child, output);
      assert.equal(response.status, 200, `${route} should return the React shell`);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/, `${route} should return HTML`);
      assert.match(await response.text(), /<div id="root"><\/div>/, `${route} should return the React shell`);
    }

    const version = await waitForPreviewResponse(`${baseUrl}${registration.previewPath}api/version`, child, output);
    assert.equal(version.status, 200, "/api/version should remain available during preview startup");
    assert.match(version.headers.get("content-type") ?? "", /application\/json/, "/api/version should remain JSON");
    assert.equal(typeof (await version.json()).applicationVersion, "string");
  } finally {
    await stopProcess(child);
  }
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
    assert.deepEqual(versionAgain, version, "release identity must be immutable for the process lifetime");
    const releaseDocument = await waitForJson(`${baseUrl}/release.json`, child);
    const generatedReleaseDocument = JSON.parse(readFileSync(path.join(packageRoot, "dist/public/release.json"), "utf8"));
    assert.deepEqual(generatedReleaseDocument, version, "runtime release identity must match the generated release document");
    assert.deepEqual(releaseDocument, generatedReleaseDocument, "the public release route must serve the generated release document");
    assert.deepEqual(releaseDocument, version, "the public build release document must match the API identity");
    const versionHeaders = await fetch(`${baseUrl}/api/version`);
    assert.equal(versionHeaders.headers.get("cache-control"), "no-store");
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