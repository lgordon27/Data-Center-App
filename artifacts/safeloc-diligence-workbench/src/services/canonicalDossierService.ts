import type { Classification } from "@/model/cashFlowEngine";
import type {
  CustomEvidenceRecord,
  CustomResearchResponse,
  ResearchCoverageStatus,
} from "@/services/researchProjectService";

export const CANONICAL_DOSSIERS_ENDPOINT = "/api/dossiers";

export type CanonicalDossierSummary = {
  slug: string;
  name: string;
  version: string;
  coverageState: string;
  asOfDate: string | null;
  canonicalData: CanonicalDossierData;
};

type CanonicalSource = {
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  accessedAt: string | null;
  exactPassage: string;
};

type CanonicalEvidence = {
  variableId: string;
  label: string;
  value: string | number;
  unit: string;
  classification: Classification;
  claim: string;
  description: string;
  coverageStatus: ResearchCoverageStatus;
  source: CanonicalSource;
  conflictSummary?: string;
  scope?: string;
};

type CanonicalDossierData = {
  identity: {
    location: string;
    operator: string;
    scope: string;
    capacityMW?: number;
    capacityProvenance?: string;
  };
  originatingCompany: string | null;
  relationshipType: string;
  relationships: Array<Record<string, unknown>>;
  phases?: Array<Record<string, unknown>>;
  evidence: CanonicalEvidence[];
  materiality: {
    project: string;
    issuer: string;
    portfolio: string;
  };
  questions: string[];
  triggers: string[];
};

type DossierListEnvelope = { dossiers: CanonicalDossierSummary[] };
type DossierEnvelope = { dossier: CanonicalDossierSummary };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Canonical dossier request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

export async function listCanonicalDossiers(): Promise<CanonicalDossierSummary[]> {
  const result = await getJson<DossierListEnvelope>(CANONICAL_DOSSIERS_ENDPOINT);
  return result.dossiers;
}

export async function getCanonicalDossier(slug: string): Promise<CanonicalDossierSummary> {
  const result = await getJson<DossierEnvelope>(
    `${CANONICAL_DOSSIERS_ENDPOINT}/${encodeURIComponent(slug)}`,
  );
  return result.dossier;
}

function toEvidence(item: CanonicalEvidence): CustomEvidenceRecord {
  const source = {
    url: item.source.url,
    title: item.source.title,
    publisher: item.source.publisher,
    publishedAt: item.source.publishedAt,
    accessedAt: item.source.accessedAt,
    accessStatus: "open" as const,
    excerpt: item.source.exactPassage,
    claimPassage: item.source.exactPassage,
    sourceClass: "primary-company" as const,
    searchDomain: new URL(item.source.url).hostname,
    relationship: item.conflictSummary ? "conflicting" as const : "primary" as const,
    exactProject: true,
    relevanceNote: item.scope,
    canonicalUrl: item.source.url,
    sourceState: "canonical-reviewed",
    claimCited: true,
    accessOutcome: {
      state: "accessible" as const,
      reason: "Maintainer-reviewed canonical source passage.",
      canonicalUrl: item.source.url,
      retrievalTime: item.source.accessedAt,
      passage: item.source.exactPassage,
    },
  };
  return {
    id: item.variableId,
    label: item.label,
    value: item.value,
    unit: item.unit,
    classification: item.classification,
    citation: `${item.source.title}${item.source.publishedAt ? ` (${item.source.publishedAt})` : ""}`,
    description: item.description,
    sourceRole: `Canonical dossier · ${item.source.publisher}`,
    sourceUrl: item.source.url,
    sourceTitle: item.source.title,
    sourcePublisher: item.source.publisher,
    sourcePublishedAt: item.source.publishedAt,
    sourceAccessedAt: item.source.accessedAt,
    sourceAccessStatus: "open",
    sourceRelevance: "exact-project",
    coverageStatus: item.coverageStatus,
    conflictSummary: item.conflictSummary,
    sources: [source],
    researchState: "accepted",
    eligibleForModel: false,
    acceptedForModel: false,
    classificationReason: "Maintainer-reviewed canonical claim; model treatment remains separate.",
  };
}

export function dossierToResearchResponse(
  dossier: CanonicalDossierSummary,
): CustomResearchResponse {
  const evidence = dossier.canonicalData.evidence.map(toEvidence);
  return {
    projectSummary: {
      name: dossier.name,
      location: dossier.canonicalData.identity.location,
      description: dossier.canonicalData.identity.scope,
      capacityMW: dossier.canonicalData.identity.capacityMW ?? 1_200,
      capacityProvenance: dossier.canonicalData.identity.capacityMW
        ? "directory-reported"
        : "standardized-default",
    },
    researchMode: "ai-researched",
    researchStatus: "completed",
    researchCoverage: {
      searchedDomains: [...new Set(evidence.flatMap((item) => item.sources?.map((source) => source.searchDomain) ?? []))],
      failedDomains: [],
      retrievedSourceCount: evidence.length,
      searchTerms: [],
      searchTermsSource: "unavailable",
    },
    evidence,
    eligibleEvidence: evidence,
    retrievedLeads: [],
    proposedInputs: [],
    acceptedModelInputs: [],
    quarantineReasons: [],
  };
}
