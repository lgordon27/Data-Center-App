import assert from "node:assert/strict";
import test from "node:test";
import { createDossierHandlers } from "./dossierApi";
import { createMemoryDossierRepository } from "./dossierRepository";

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

test("dossier API reads through an injected repository", async () => {
  const repository = createMemoryDossierRepository([{ slug: "project-kilby", name: "Project Kilby" }]);
  const handlers = createDossierHandlers(repository);
  const listResponse = response();
  await handlers.list({ method: "GET" } as never, listResponse as never);
  assert.deepEqual(listResponse.body, { dossiers: [{ slug: "project-kilby", name: "Project Kilby" }] });
  const detailResponse = response();
  await handlers.get({ method: "GET", params: { slug: "project-kilby" } } as never, detailResponse as never);
  assert.equal(detailResponse.statusCode, 200);
  assert.deepEqual(detailResponse.body, { dossier: { slug: "project-kilby", name: "Project Kilby" } });
});

test("dossier API exposes no mutation path", async () => {
  const handlers = createDossierHandlers(createMemoryDossierRepository([]));
  const result = response();
  await handlers.list({ method: "POST" } as never, result as never);
  assert.equal(result.statusCode, 405);
});