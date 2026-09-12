import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const PROJECT_RESEARCH_REGISTRY_VERSION = 1;
export const PROJECT_RESEARCH_REGISTRY_FILE = "project-research-registry.v1.json";

function normalized(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? null;
}

function canonicalUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function projectParts(project = {}) {
  const known = project.knownData && typeof project.knownData === "object" ? project.knownData : {};
  const provider = firstString(project.provider, project.providerName, known.provider, known.providerName);
  const canonicalId = firstString(
    project.canonicalId,
    project.canonicalProjectId,
    project.projectId,
    known.canonicalId,
    known.canonicalProjectId,
    known.providerId,
  );
  return {
    provider,
    canonicalId,
    name: firstString(project.name, project.projectName) ?? "",
    location: firstString(project.location) ?? "",
    operator: firstString(project.operator, known.operator) ?? null,
  };
}

/**
 * A provider identifier is preferred when available. The fallback intentionally
 * includes the operator so two similarly named facilities do not collapse into
 * one registry record.
 */
export function projectResearchIdentity(project = {}) {
  const parts = projectParts(project);
  const identityInput = parts.canonicalId
    ? `provider:${normalized(parts.provider) || "unknown"}|canonical:${normalized(parts.canonicalId)}`
    : `name:${normalized(parts.name)}|location:${normalized(parts.location)}|operator:${normalized(parts.operator)}`;
  return {
    id: createHash("sha256").update(identityInput).digest("hex"),
    provider: parts.provider,
    canonicalId: parts.canonicalId,
    name: parts.name,
    location: parts.location,
    operator: parts.operator,
    identityBasis: parts.canonicalId ? "provider/canonical-id" : "normalized-name-location-operator",
  };
}

function sourceHasPassage(source) {
  const passage = firstString(source?.claimPassage, source?.accessOutcome?.passage);
  return source?.accessOutcome?.state !== "blocked"
    && source?.accessOutcome?.state !== "unsupported"
    && Boolean(passage);
}

function sourceRecord(source, fallbackPassage = null) {
  const url = canonicalUrl(source?.url ?? source?.resolvedUrl ?? source?.canonicalUrl);
  const resolved = canonicalUrl(source?.resolvedUrl ?? source?.url);
  const canonical = canonicalUrl(source?.canonicalUrl ?? resolved ?? url);
  const passage = firstString(source?.claimPassage, source?.accessOutcome?.passage, fallbackPassage);
  return {
    sourceUrl: url,
    canonicalUrl: canonical,
    exactPassage: passage,
    publishedAt: source?.publishedAt ?? source?.date ?? null,
    accessedAt: source?.accessedAt ?? source?.accessOutcome?.retrievalTime ?? null,
    publisher: firstString(source?.publisher, url ? new URL(url).hostname.replace(/^www\./, "") : null),
    title: firstString(source?.title),
    sourceClass: firstString(source?.sourceClass, "unknown"),
    accessOutcome: source?.accessOutcome
      ? {
          state: firstString(source.accessOutcome.state, "not-attempted"),
          reason: firstString(source.accessOutcome.reason, "No access outcome recorded."),
          ...(source.accessOutcome.format ? { format: source.accessOutcome.format } : {}),
          ...(source.accessOutcome.pageOrSection !== undefined ? { pageOrSection: source.accessOutcome.pageOrSection } : {}),
        }
      : { state: "not-attempted", reason: "No access receipt recorded." },
  };
}

function candidateFromOperator(identity, result, runId, audit) {
  if (!identity.operator) return null;
  const evidence = Array.isArray(result?.evidence) ? result.evidence : [];
  const matchingSources = evidence.flatMap((item) =>
    (item.sources ?? [])
      .filter((source) => source?.exactProject === true && sourceHasPassage(source))
      .filter((source) => {
        const passage = normalized(source.claimPassage ?? source.accessOutcome?.passage);
        return passage.includes(normalized(identity.operator));
      })
      .map((source) => sourceRecord(source, item.claimPassage)),
  );
  const source = matchingSources[0] ?? sourceRecord(null);
  const hasExactPassage = Boolean(source.exactPassage && source.sourceUrl);
  return {
    id: createHash("sha256").update(`${identity.id}|operator|${normalized(identity.operator)}`).digest("hex"),
    entity: identity.name,
    company: identity.operator,
    role: "operator/developer",
    scope: "project",
    basis: hasExactPassage
      ? "Exact project source passage names the operator."
      : "Operator supplied as project identity context; source confirmation is required.",
    source: { ...source },
    ...source,
    relationshipSupport: {
      state: hasExactPassage ? "source-supported-candidate" : "unsubstantiated-candidate",
      supportedBySource: hasExactPassage,
      promoted: false,
      explicitActionRequired: true,
    },
    financialEligibility: {
      state: "not-reviewed",
      eligible: false,
      explicitActionRequired: true,
    },
    provenance: {
      runId,
      auditVersion: audit?.version ?? null,
      researchPolicyVersion: audit?.policyVersion ?? null,
      researchStatus: result?.researchStatus ?? "completed",
    },
    limitations: [
      "Candidate registry support is not an approved company-project relationship.",
      "Economic inputs remain separate and require explicit analyst action.",
      ...(hasExactPassage ? [] : ["No exact attributable passage was retained for this candidate."]),
    ],
  };
}

function researchSnapshot(result) {
  return {
    projectSummary: result?.projectSummary ?? null,
    evidence: Array.isArray(result?.evidence) ? result.evidence : [],
    sourceLedger: Array.isArray(result?.sourceLedger) ? result.sourceLedger : [],
    researchCoverage: result?.researchCoverage ?? null,
    researchAudit: result?.researchAudit ?? null,
    researchStatus: result?.researchStatus ?? "completed",
    researchError: result?.researchError ?? null,
  };
}

function hasUsefulResearch(result) {
  if (!result || ["failed", "cancelled"].includes(result.researchStatus)) return false;
  const evidence = Array.isArray(result.evidence) ? result.evidence : [];
  return evidence.some((item) =>
    item?.classification !== "Missing Evidence"
      && ((item?.sources?.length ?? 0) > 0 || Boolean(item?.sourceUrl) || Boolean(item?.claimPassage)),
  ) || (Array.isArray(result.sourceLedger) && result.sourceLedger.length > 0);
}

function registryFile(directory) {
  return path.join(directory, PROJECT_RESEARCH_REGISTRY_FILE);
}

export function createProjectResearchRegistry({
  directory = process.env.PROJECT_RESEARCH_REGISTRY_DIR
    || process.env.RESEARCH_REGISTRY_DIR
    || process.env.RESEARCH_CACHE_DIR
    || path.join(os.tmpdir(), "safeloc-research-cache"),
  now = () => Date.now(),
} = {}) {
  let document = null;
  let writeQueue = Promise.resolve();

  async function load() {
    if (document) return document;
    try {
      const parsed = JSON.parse(await readFile(registryFile(directory), "utf8"));
      if (parsed?.version !== PROJECT_RESEARCH_REGISTRY_VERSION || !Array.isArray(parsed.records)) {
        document = { version: PROJECT_RESEARCH_REGISTRY_VERSION, records: [] };
      } else {
        document = parsed;
      }
    } catch {
      document = { version: PROJECT_RESEARCH_REGISTRY_VERSION, records: [] };
    }
    return document;
  }

  async function persist(next) {
    document = next;
    await mkdir(directory, { recursive: true });
    const temporary = `${registryFile(directory)}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(next), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, registryFile(directory));
  }

  async function retain(project, result, { runId = null } = {}) {
    const operation = writeQueue.then(async () => {
      if (!hasUsefulResearch(result)) return null;
      const current = await load();
      const identity = projectResearchIdentity(project);
      const audit = result.researchAudit ?? {};
      const provenanceRunId = runId ?? audit.runCorrelationId ?? result.researchCoverage?.runCorrelationId ?? null;
      const candidate = candidateFromOperator(identity, result, provenanceRunId, audit);
      const timestamp = new Date(now()).toISOString();
      const existing = current.records.find((record) => record.projectIdentity?.id === identity.id);
      const record = {
        version: PROJECT_RESEARCH_REGISTRY_VERSION,
        projectIdentity: identity,
        catalog: {
          name: identity.name,
          location: identity.location,
          operator: identity.operator,
          provider: identity.provider,
          canonicalId: identity.canonicalId,
        },
        relationshipSupport: {
          candidates: candidate ? [candidate] : [],
          supportedRelationships: [],
          approvalRequired: true,
        },
        financialEligibility: {
          eligible: false,
          state: "not-reviewed",
          explicitActionRequired: true,
          economicInputs: [],
        },
        research: researchSnapshot(result),
        provenance: {
          runId: provenanceRunId,
          auditVersion: audit.version ?? null,
          researchPolicyVersion: audit.policyVersion ?? null,
          retainedAt: timestamp,
          retentionState: result.researchStatus === "partial" || result.researchStatus === "timed-out"
            ? "partial"
            : "complete",
        },
        limitations: [
          "Local server retention only; this registry is not shared.",
          "Research completion or review does not promote a relationship.",
          ...(result.researchError?.message ? [result.researchError.message] : []),
        ],
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      const records = existing
        ? current.records.map((item) => item.projectIdentity?.id === identity.id ? record : item)
        : [...current.records, record];
      await persist({
        version: PROJECT_RESEARCH_REGISTRY_VERSION,
        updatedAt: timestamp,
        records,
      });
      return record;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  return {
    directory,
    projectIdFor: (project) => projectResearchIdentity(project).id,
    identityFor: projectResearchIdentity,
    retain,
    async read(id) {
      const current = await load();
      return current.records.find((record) => record.projectIdentity?.id === id) ?? null;
    },
    async list() {
      const current = await load();
      return [...current.records].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },
    clearMemory() {
      document = null;
    },
  };
}

export const defaultProjectResearchRegistry = createProjectResearchRegistry();

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * Read-only by design. Relationship review and financial eligibility are
 * intentionally not writable through this minimal same-origin API.
 */
export async function handleProjectResearchRegistryRequest(req, res, {
  registry = defaultProjectResearchRegistry,
} = {}) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const requestUrl = new URL(req.url ?? "/api/project-research", "http://localhost");
  const pathId = requestUrl.pathname.match(/^\/api\/project-research\/([a-f0-9]{64})\/?$/)?.[1] ?? null;
  const requestedId = req.params?.id ?? requestUrl.searchParams.get("id") ?? pathId;
  if (requestedId !== null && requestedId !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(requestedId)) {
      sendJson(res, 400, { error: "A valid project research identity is required." });
      return;
    }
    const record = await registry.read(requestedId);
    if (!record) {
      sendJson(res, 404, { error: "Project research record not found." });
      return;
    }
    sendJson(res, 200, {
      record,
      storage: { scope: "local-server", shared: false, label: "Local server retention; not shared." },
    });
    return;
  }
  sendJson(res, 200, {
    records: await registry.list(),
    storage: { scope: "local-server", shared: false, label: "Local server retention; not shared." },
  });
}
