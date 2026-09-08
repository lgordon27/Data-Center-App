import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EVIDENCE_SEMANTIC_POLICY_VERSION } from "../src/data/evidenceSemanticPolicy.mjs";

export const RESEARCH_CACHE_VERSION = 4;
export const RESEARCH_CACHE_RESEARCH_POLICY_VERSION = 1;
export const RESEARCH_CACHE_MODEL_VERSION = "gpt-4o";
export const RESEARCH_CACHE_FRESH_MS = 6 * 60 * 60 * 1000;
export const RESEARCH_CACHE_RECENT_MS = 24 * 60 * 60 * 1000;
export const RESEARCH_CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function normalizedText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function researchProjectCacheKey(project) {
  const identity = {
    cacheContractVersion: RESEARCH_CACHE_VERSION,
    researchPolicyVersion: RESEARCH_CACHE_RESEARCH_POLICY_VERSION,
    modelVersion: RESEARCH_CACHE_MODEL_VERSION,
    name: normalizedText(project?.name),
    location: normalizedText(project?.location),
    knownData: stableValue(project?.knownData ?? null),
    focusIds: [...(project?.focusIds ?? [])].sort(),
    currentEvidence: stableValue(project?.currentEvidence ?? null),
  };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

export function classifyResearchCacheAge(storedAt, now = Date.now()) {
  const timestamp = Date.parse(storedAt);
  if (!Number.isFinite(timestamp)) return "expired";
  const age = Math.max(0, now - timestamp);
  if (age <= RESEARCH_CACHE_FRESH_MS) return "fresh";
  if (age <= RESEARCH_CACHE_RECENT_MS) return "recent";
  if (age <= RESEARCH_CACHE_STALE_MS) return "stale";
  return "expired";
}

function cacheFile(directory, key) {
  return path.join(directory, `${key}.json`);
}

export function createResearchProjectCache({
  directory = process.env.RESEARCH_CACHE_DIR || path.join(os.tmpdir(), "safeloc-research-cache"),
  now = () => Date.now(),
} = {}) {
  const memory = new Map();
  const inFlight = new Map();
  const statuses = new Map();

  async function read(key) {
    const retained = memory.get(key);
    if (retained) return retained;
    try {
      const parsed = JSON.parse(await readFile(cacheFile(directory, key), "utf8"));
      if (
        ![2, 3, RESEARCH_CACHE_VERSION].includes(parsed?.version) ||
        parsed?.key !== key ||
        typeof parsed?.storedAt !== "string" ||
        !parsed?.result
      ) return null;
      parsed.validationPolicyVersion = parsed.validationPolicyVersion ?? parsed.result.semanticPolicyVersion ?? 0;
      parsed.needsRevalidation = parsed.validationPolicyVersion !== EVIDENCE_SEMANTIC_POLICY_VERSION;
      parsed.researchPolicyVersion = parsed.researchPolicyVersion ?? parsed.result.researchAudit?.policyVersion ?? 0;
      parsed.modelVersion = parsed.modelVersion ?? parsed.result.researchAudit?.model ?? null;
      parsed.needsRevalidation = parsed.needsRevalidation
        || parsed.researchPolicyVersion !== RESEARCH_CACHE_RESEARCH_POLICY_VERSION
        || parsed.modelVersion !== RESEARCH_CACHE_MODEL_VERSION;
      memory.set(key, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  async function write(key, result) {
    const entry = {
      version: RESEARCH_CACHE_VERSION,
      validationPolicyVersion: EVIDENCE_SEMANTIC_POLICY_VERSION,
      researchPolicyVersion: RESEARCH_CACHE_RESEARCH_POLICY_VERSION,
      modelVersion: RESEARCH_CACHE_MODEL_VERSION,
      needsRevalidation: false,
      key,
      storedAt: new Date(now()).toISOString(),
      result,
    };
    await mkdir(directory, { recursive: true });
    const temporary = `${cacheFile(directory, key)}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, cacheFile(directory, key));
    memory.set(key, entry);
    return entry;
  }

  function refresh(key, runner) {
    const existing = inFlight.get(key);
    if (existing) return { promise: existing, started: false };
    const startedAt = new Date(now()).toISOString();
    statuses.set(key, { refreshStatus: "running", startedAt });
    const promise = Promise.resolve()
      .then(runner)
      .then(async (result) => {
        const entry = await write(key, result);
        statuses.set(key, {
          refreshStatus: "completed",
          startedAt,
          finishedAt: new Date(now()).toISOString(),
          storedAt: entry.storedAt,
          result: entry.result,
        });
        return entry;
      })
      .catch((error) => {
        statuses.set(key, {
          refreshStatus: "failed",
          startedAt,
          finishedAt: new Date(now()).toISOString(),
          errorType: error?.researchErrorType ?? "upstream",
        });
        throw error;
      })
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, promise);
    return { promise, started: true };
  }

  return {
    keyFor: researchProjectCacheKey,
    read,
    write,
    refresh,
    status(key) {
      return statuses.get(key) ?? { refreshStatus: "idle" };
    },
    age(entry) {
      return classifyResearchCacheAge(entry?.storedAt, now());
    },
    clearMemory() {
      memory.clear();
      statuses.clear();
      inFlight.clear();
    },
  };
}

export const defaultResearchProjectCache = createResearchProjectCache();