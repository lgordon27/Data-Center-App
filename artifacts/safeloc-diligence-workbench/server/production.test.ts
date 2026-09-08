import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { test } from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");

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
    assert.equal(typeof version.releaseId, "string");
    assert.equal(typeof version.buildTimestamp, "string");
    assert.ok(version.commitSha || version.releaseId, "release identity must include a commit SHA or release ID");
    assert.deepEqual(versionAgain, version, "release identity must be immutable for the process lifetime");
    const aiMethod = await fetch(`${baseUrl}/api/analyze-evidence`);
    assert.equal(aiMethod.status, 405);
    for (const retiredPath of ["/api/grid/status", "/api/grid/diagnostics", "/api/grid/query"]) {
      const retiredResponse = await fetch(`${baseUrl}${retiredPath}`);
      assert.equal(retiredResponse.status, 404, `${retiredPath} should not be exposed`);
    }
  } finally {
    await stopProcess(child);
  }
});