import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProjectIdentity } from "../src/model/safelocProofContract.js";
import { createShowcaseDossierHandlers } from "./showcaseDossierApi.js";
import {
  createMemoryShowcaseDossierRepository,
  FileShowcaseDossierRepository,
} from "./showcaseDossierStore.js";

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

// Deliberately test-only data. It has no human-review assertion, live origin,
// research/access dates, or provider/cache metadata.
const project = createProjectIdentity({
  projectReference: "test-only-campus",
  name: "Test-only illustrative campus",
  scope: { kind: "campus", key: "test-only-campus" },
});
const testOnlyEntry = {
  slug: "test-only-campus",
  displayName: "Test-only illustrative campus",
  canonicalProjectId: project.projectId,
  project,
  researchAsOfDate: null,
  reviewStatus: "test-only",
  reviewProvenance: null,
  payloadReference: "test-only-illustrative.json",
  origin: "test-only-illustrative",
  version: 1,
  illustrative: true,
  presentationLabel: "test-only illustrative fixture",
  testOnly: true,
};
const testOnlySnapshot = {
  schemaVersion: 1,
  slug: testOnlyEntry.slug,
  displayName: testOnlyEntry.displayName,
  canonicalProjectId: project.projectId,
  project,
  researchAsOfDate: null,
  origin: "test-only-illustrative",
  version: 1,
  illustrative: true,
  fixtureStatus: "test-only",
  sources: [],
  payload: { testOnly: true, illustrative: true },
};

test("public showcase catalog succeeds empty and refuses test-only dossier fixtures", async () => {
  const repository = createMemoryShowcaseDossierRepository(
    [testOnlyEntry],
    { [testOnlyEntry.slug]: testOnlySnapshot },
  );
  const handlers = createShowcaseDossierHandlers(repository);
  const listResponse = response();
  await handlers.list({ method: "GET" } as never, listResponse as never);
  assert.deepEqual(listResponse.body, { dossiers: [] });

  const detailResponse = response();
  await handlers.get({ method: "GET", params: { slug: testOnlyEntry.slug } } as never, detailResponse as never);
  assert.equal(detailResponse.statusCode, 404);
  assert.deepEqual(detailResponse.body, { error: "Reviewed showcase dossier not found." });
});

test("showcase routes are read-only and missing or malformed slugs do not fall back to research", async () => {
  let repositoryReads = 0;
  let providerCalls = 0;
  const base = createMemoryShowcaseDossierRepository();
  const handlers = createShowcaseDossierHandlers({
    async list() {
      repositoryReads += 1;
      return base.list();
    },
    async get(slug) {
      repositoryReads += 1;
      return base.get(slug);
    },
  });
  const list = response();
  await handlers.list({ method: "GET" } as never, list as never);
  const absent = response();
  await handlers.get({ method: "GET", params: { slug: "not-present" } } as never, absent as never);
  const malformed = response();
  await handlers.get({ method: "GET", params: { slug: "../research" } } as never, malformed as never);
  const mutation = response();
  await handlers.list({ method: "POST" } as never, mutation as never);

  assert.equal(repositoryReads, 2);
  assert.equal(providerCalls, 0);
  assert.equal(absent.statusCode, 404);
  assert.equal(malformed.statusCode, 400);
  assert.equal(mutation.statusCode, 405);
  assert.deepEqual(list.body, { dossiers: [] });
});

test("empty file registry and unavailable snapshots remain read-only and fail closed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-showcase-empty-"));
  const registryPath = path.join(directory, "catalog", "showcase-registry.json");
  const snapshotsPath = path.join(directory, "snapshots");
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(registryPath, JSON.stringify({
    schemaVersion: 1,
    entries: [testOnlyEntry],
  }));
  const repository = new FileShowcaseDossierRepository(registryPath, snapshotsPath);
  try {
    assert.deepEqual(await repository.list(), []);
    assert.equal(await repository.get(testOnlyEntry.slug), null);
    const registryAfterRead = JSON.parse(await readFile(registryPath, "utf8")) as { entries: unknown[] };
    assert.deepEqual(registryAfterRead.entries, [testOnlyEntry]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("explicit replacement refuses illustrative fixtures instead of promoting them to reviewed examples", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "safeloc-showcase-reject-"));
  const registryPath = path.join(directory, "showcase-registry.json");
  const repository = new FileShowcaseDossierRepository(registryPath, path.join(directory, "snapshots"));
  try {
    await assert.rejects(
      repository.replaceReviewedSnapshot(testOnlyEntry as never, testOnlySnapshot as never),
      /explicitly reviewed, non-illustrative/,
    );
    await assert.rejects(readFile(registryPath, "utf8"), /./);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
