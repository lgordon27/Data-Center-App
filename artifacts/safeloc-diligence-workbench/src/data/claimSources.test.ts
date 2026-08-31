import assert from "node:assert/strict";
import test from "node:test";
import {
  claimRecords,
  claimSourceRecords,
  get2026FreshnessIssues,
  getClaimSources,
  isSafeDirectSourceUrl,
} from "./claimSources";

test("public claim sources use safe exact URLs and explicit metadata fallbacks", () => {
  for (const source of Object.values(claimSourceRecords)) {
    assert.equal(isSafeDirectSourceUrl(source.url), true, `${source.id} needs a safe non-homepage source URL`);
    assert.ok(source.publisher);
    assert.ok(source.title);
    assert.ok(source.accessedAt);
    assert.ok(["open", "paywall", "registration", "not provided"].includes(source.accessStatus));
    assert.ok(source.publishedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(source.publishedAt));
  }
});

test("every source-backed claim resolves records and every boundary claim remains uncited", () => {
  for (const claim of Object.values(claimRecords)) {
    const sources = getClaimSources(claim.id as keyof typeof claimRecords);
    if (["synthetic assumption", "analyst inference", "unresolved disclosure"].includes(claim.provenance)) {
      assert.deepEqual(sources, [], `${claim.id} must remain intentionally uncited`);
    } else {
      assert.ok(sources.length > 0, `${claim.id} needs at least one source`);
    }
  }
});

test("all 2026 public claims pass the shared deterministic freshness window", () => {
  assert.deepEqual(get2026FreshnessIssues(), []);
  for (const source of Object.values(claimSourceRecords).filter((item) => item.publishedAt?.startsWith("2026"))) {
    assert.ok(source.lastVerifiedAt, `${source.id} needs visible last verification metadata`);
  }
});

test("rejects generic homepages, credentials, scripts, and malformed URLs", () => {
  assert.equal(isSafeDirectSourceUrl("https://example.com"), false);
  assert.equal(isSafeDirectSourceUrl("https://user:pass@example.com/source"), false);
  assert.equal(isSafeDirectSourceUrl("javascript:alert(1)"), false);
  assert.equal(isSafeDirectSourceUrl("not a url"), false);
});