export const RESEARCH_FINDING_TOPICS = [
  "identity",
  "capacity",
  "power",
  "grid",
  "water",
  "permitting",
  "community",
  "construction",
  "financing",
  "tenant",
  "hazard",
  "other",
] as const;

export type ResearchFindingTopic = typeof RESEARCH_FINDING_TOPICS[number];
export type ResearchFindingKind = "reported" | "plan" | "estimate" | "disputed";
export type ResearchProjectMatch = "matches-requested-project" | "scope-unconfirmed";
export type ResearchEntityRole =
  | "owner"
  | "developer"
  | "operator"
  | "offtaker"
  | "contractor"
  | "utility"
  | "other";
export type ResearchTopicCoverageState =
  | "analyzed-findings"
  | "analyzed-nothing-found"
  | "not-analyzed";

export type ResearchFindingSource = {
  url: string;
  title: string;
  publisher: string | null;
  publishedAt: string | null;
  retrievedAt: string | null;
};

export type ResearchFindingEntityRole = {
  name: string;
  role: ResearchEntityRole;
};

export type ResearchFindingScope = {
  entityRoles: ResearchFindingEntityRole[];
  facility: string | null;
  phase: string | null;
  timeframe: string | null;
};

export type ProposedResearchModelMapping = {
  evidenceId: string;
  proposedValue: string | number;
  status: "proposed-not-accepted";
};

/** Display-only research content. It is not financial evidence or a model input. */
export type ResearchFinding = {
  findingId: string;
  statement: string;
  exactQuotation: string;
  quotationVerified: true;
  topic: ResearchFindingTopic;
  kind: ResearchFindingKind;
  source: ResearchFindingSource;
  scope: ResearchFindingScope;
  projectMatch: ResearchProjectMatch;
  proposedModelMapping: ProposedResearchModelMapping | null;
};

export type ResearchTopicCoverage = {
  state: ResearchTopicCoverageState;
  reason: string | null;
};

export type ResearchTopicCoverageMap = Partial<
  Record<ResearchFindingTopic, ResearchTopicCoverage>
>;

const FINDING_KINDS = new Set<ResearchFindingKind>(["reported", "plan", "estimate", "disputed"]);
const ENTITY_ROLES = new Set<ResearchEntityRole>([
  "owner",
  "developer",
  "operator",
  "offtaker",
  "contractor",
  "utility",
  "other",
]);
const COVERAGE_STATES = new Set<ResearchTopicCoverageState>([
  "analyzed-findings",
  "analyzed-nothing-found",
  "not-analyzed",
]);
const PROJECT_MATCHES = new Set<ResearchProjectMatch>([
  "matches-requested-project",
  "scope-unconfirmed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value.trim() || null : undefined;
}

function safePublicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:")
      || !url.hostname
      || url.username
      || url.password
      || url.hostname === "localhost"
      || url.hostname.endsWith(".localhost")
      || url.hostname === "127.0.0.1"
      || url.hostname === "::1"
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseSource(value: unknown): ResearchFindingSource | null {
  if (!isRecord(value)) return null;
  const url = safePublicUrl(value.url);
  const title = nonEmptyText(value.title);
  const publisher = nullableText(value.publisher);
  const publishedAt = nullableText(value.publishedAt);
  const retrievedAt = nullableText(value.retrievedAt);
  if (!url || !title || publisher === undefined || publishedAt === undefined || retrievedAt === undefined) return null;
  return { url, title, publisher, publishedAt, retrievedAt };
}

function parseScope(value: unknown): ResearchFindingScope | null {
  if (!isRecord(value) || !Array.isArray(value.entityRoles)) return null;
  const facility = nullableText(value.facility);
  const phase = nullableText(value.phase);
  const timeframe = nullableText(value.timeframe);
  if (facility === undefined || phase === undefined || timeframe === undefined) return null;
  const entityRoles = value.entityRoles.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const name = nonEmptyText(entry.name);
    if (!name || typeof entry.role !== "string" || !ENTITY_ROLES.has(entry.role as ResearchEntityRole)) return [];
    return [{ name, role: entry.role as ResearchEntityRole }];
  });
  return { entityRoles, facility, phase, timeframe };
}

function parseProposedMapping(value: unknown): ProposedResearchModelMapping | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || value.status !== "proposed-not-accepted") return undefined;
  const evidenceId = nonEmptyText(value.evidenceId);
  if (
    !evidenceId
    || (typeof value.proposedValue !== "string" && typeof value.proposedValue !== "number")
    || (typeof value.proposedValue === "number" && !Number.isFinite(value.proposedValue))
  ) return undefined;
  return {
    evidenceId,
    proposedValue: value.proposedValue,
    status: "proposed-not-accepted",
  };
}

/**
 * Missing data stays missing; a present empty array remains an explicit empty
 * result so legacy saved research can keep its existing presentation.
 */
export function parseResearchFindings(value: unknown): ResearchFinding[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const findingId = nonEmptyText(candidate.findingId);
    const statement = nonEmptyText(candidate.statement);
    const exactQuotation = nonEmptyText(candidate.exactQuotation);
    const source = parseSource(candidate.source);
    const scope = parseScope(candidate.scope);
    const proposedModelMapping = parseProposedMapping(candidate.proposedModelMapping);
    if (
      !findingId
      || seen.has(findingId)
      || !statement
      || !exactQuotation
      || candidate.quotationVerified !== true
      || typeof candidate.topic !== "string"
      || !RESEARCH_FINDING_TOPICS.includes(candidate.topic as ResearchFindingTopic)
      || typeof candidate.kind !== "string"
      || !FINDING_KINDS.has(candidate.kind as ResearchFindingKind)
      || !source
      || !scope
      || typeof candidate.projectMatch !== "string"
      || !PROJECT_MATCHES.has(candidate.projectMatch as ResearchProjectMatch)
      || proposedModelMapping === undefined
    ) return [];
    seen.add(findingId);
    return [{
      findingId,
      statement,
      exactQuotation,
      quotationVerified: true,
      topic: candidate.topic as ResearchFindingTopic,
      kind: candidate.kind as ResearchFindingKind,
      source,
      scope,
      projectMatch: candidate.projectMatch as ResearchProjectMatch,
      proposedModelMapping,
    }];
  });
}

export function parseResearchTopicCoverage(value: unknown): ResearchTopicCoverageMap | undefined {
  if (!isRecord(value)) return undefined;
  const coverage: ResearchTopicCoverageMap = {};
  for (const topic of RESEARCH_FINDING_TOPICS) {
    const record = value[topic];
    if (!isRecord(record) || typeof record.state !== "string" || !COVERAGE_STATES.has(record.state as ResearchTopicCoverageState)) continue;
    const reason = nullableText(record.reason);
    if (reason === undefined) continue;
    coverage[topic] = { state: record.state as ResearchTopicCoverageState, reason };
  }
  return coverage;
}
