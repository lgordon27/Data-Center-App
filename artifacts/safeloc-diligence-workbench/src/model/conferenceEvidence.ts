import type { EvidenceItem, ProjectContext } from "../context/DiligenceContext";
import {
  COMPANY_PROFILES,
  companyProjects,
  type CompanyKey,
  type CompanyProfile,
} from "../data/companyExposure";
import { getClaimSources } from "../data/claimSources";
import { EVIDENCE_IMPACT_ROLE_DEFINITIONS } from "../data/evidenceImpactRoles";

export type ConferenceSource = { id: string; title: string; url: string };

export type ConferenceRelationship = {
  company: CompanyProfile | null;
  established: boolean;
  type: string;
  confidence: string;
  description: string;
  sources: ConferenceSource[];
  reason: string;
};

const NO_RELATIONSHIP = {
  established: false,
  type: "No established relationship",
  confidence: "None",
  description: "No project-specific company relationship is established by the available records.",
  sources: [] as ConferenceSource[],
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function validHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function companyForOrigin(value: string | null) {
  if (!value) return null;
  const origin = normalized(value);
  return COMPANY_PROFILES.find((profile) =>
    [profile.key, profile.displayName, profile.ticker].some((candidate) => normalized(candidate) === origin)
  ) ?? null;
}

export function getConferenceRelationship(
  project: ProjectContext,
  originatingCompany: string | null,
): ConferenceRelationship {
  const company = companyForOrigin(originatingCompany);
  if (!company) {
    return {
      company: null,
      ...NO_RELATIONSHIP,
      reason: originatingCompany
        ? "The originating company is not a recognized company profile."
        : "No originating company was supplied.",
    };
  }
  if (project.canonicalDossier) {
    const dossier = project.canonicalDossier;
    const relationship = dossier.canonicalData.relationships.find((item) =>
      normalized(String(item.organization ?? "")) === normalized(company.displayName) ||
      normalized(String(item.organization ?? "")) === normalized(company.key)
    );
    const sources = [...new Map(
      dossier.canonicalData.evidence
        .filter((item) => validHttpUrl(item.source.url))
        .map((item) => [item.source.url, {
          id: item.source.url,
          title: item.source.title,
          url: item.source.url,
        }]),
    ).values()];
    if (!relationship || sources.length === 0) {
      return {
        company,
        ...NO_RELATIONSHIP,
        reason: relationship
          ? "The canonical relationship record has no valid reviewed public source."
          : "The canonical dossier does not establish this company-project relationship.",
      };
    }
    const role = String(relationship.type ?? dossier.canonicalData.relationshipType);
    const confidence = String(relationship.confidence ?? "reviewed");
    return {
      company,
      established: true,
      type: dossier.canonicalData.relationshipType,
      confidence: confidence === "supported" ? "Source-backed" : confidence,
      description: `${company.displayName}: ${role}. ${dossier.canonicalData.identity.scope}`,
      sources,
      reason: "The canonical dossier retains a reviewed company-project relationship and source set.",
    };
  }

  const match = companyProjects(company.key as CompanyKey, []).find((candidate) => {
    if (normalized(candidate.name) !== normalized(project.name)) return false;
    return project.kind !== "custom" || normalized(candidate.location) === normalized(project.location);
  });
  if (!match || match.kind === "directory") {
    return {
      company,
      ...NO_RELATIONSHIP,
      reason: match?.kind === "directory"
        ? "Directory operator or company matching is discovery context and does not establish a relationship."
        : "No reviewed company-project record exactly matches the current project.",
    };
  }

  const sources = [...new Map(
    (match.claimIds ?? [])
      .flatMap((claimId) => getClaimSources(claimId))
      .filter((source) => validHttpUrl(source.url))
      .map((source) => [source.id, { id: source.id, title: source.title, url: source.url }]),
  ).values()];
  if (sources.length === 0) {
    return {
      company,
      ...NO_RELATIONSHIP,
      reason: "The matching project record has no valid public project-claim source.",
    };
  }

  return {
    company,
    established: true,
    type: match.connectionType,
    confidence: "Source-backed",
    description: match.description,
    sources,
    reason: "A reviewed company-project record exactly matches the current project and has public project-claim sources.",
  };
}

export type CommunityDocumentationStatus = {
  label: string;
  detail: string;
  sourceUrls: string[];
};

const NO_DOCUMENTATION = "No project-specific documentation found";

function sourcePassage(source: NonNullable<EvidenceItem["sources"]>[number]) {
  return [
    source.claimPassage,
    source.accessOutcome?.passage,
    source.excerpt,
  ].find((value): value is string => typeof value === "string" && Boolean(value.trim())) ?? "";
}

function sourceMatchesMapping(
  source: NonNullable<EvidenceItem["sources"]>[number],
  sourceId: string | null,
) {
  if (!sourceId) return false;
  return [source.url, source.originalUrl, source.resolvedUrl, source.canonicalUrl]
    .some((value) => value === sourceId);
}

function isBenchmarkMaterial(text: string) {
  return /\bbenchmark\b|\bcomparable(?:-only)?\b/i.test(text);
}

function supportedMappedMaterials(item: EvidenceItem) {
  const mappings = item.claimMappings ?? item.sourceValidation?.claimMappings ?? [];
  return (item.sources ?? []).flatMap((source) => {
    if (!validHttpUrl(source.url) || source.exactProject !== true) return [];
    if (source.accessOutcome && source.accessOutcome.state !== "accessible") return [];
    return mappings.flatMap((mapping) => {
      if (
        mapping.variable !== item.id ||
        mapping.entityScope !== "project" ||
        mapping.supportStatus !== "supported" ||
        mapping.contradictionStatus !== "none" ||
        !sourceMatchesMapping(source, mapping.sourceId)
      ) return [];
      const text = mapping.exactQuotation?.trim() || sourcePassage(source).trim();
      if (!text || isBenchmarkMaterial(text)) return [];
      return [{ source, text }];
    });
  });
}

function validatedResearchMaterials(item: EvidenceItem) {
  if (
    item.classification !== "Verified Evidence" ||
    item.semanticValidationStatus !== "valid" ||
    !(item.acceptedForModel === true || item.researchState === "accepted") ||
    !["claim-supported", "financially-eligible"].includes(item.sourceValidation?.state ?? "")
  ) return [];
  return supportedMappedMaterials(item);
}

function curatedCommunityMaterials(item: EvidenceItem) {
  if (item.classification !== "Verified Evidence") return [];
  return supportedMappedMaterials(item);
}

function labelsForPassage(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const proposed = /\b(proposed|draft|pending)\b/i.test(compact) &&
    /\bagreement\b/i.test(compact) &&
    !/\b(no|without)\b.{0,25}\b(proposed|draft|pending)\b.{0,20}\bagreement\b|\bagreement\b.{0,20}\bwas not proposed\b/i.test(compact);
  const negatedExecution = /\b(no|not|without|never)\b.{0,35}\b(executed|signed)\b.{0,25}\bagreement\b|\bagreement\b.{0,40}\b(?:(?:has|had|was)\s+)?(?:not|never)\s+(?:been\s+)?(?:executed|signed)\b|\bexecution\b.{0,25}\b(?:(?:had|has|did|was)\s+)?(?:not|never)\b.{0,15}\b(?:occurred|completed)?/i.test(compact);
  const negatedVoluntary = /\b(no|not|without|never)\b.{0,25}\bvoluntary\b.{0,25}\b(plan|program|framework|commitment|agreement)\b|\bnot a voluntary (plan|program|framework|commitment|agreement)\b/i.test(compact);
  const negatedOrdinance = /\b(no|not|without|never)\b.{0,25}\bordinance\b|\b(no|not|without)\b.{0,25}\bpermit (condition|requirement)\b/i.test(compact);
  const negatedCommitment = /\b(no|not|without|never)\b.{0,25}\bpublic commitment\b|\b(did not|has not|not)\b.{0,20}\b(commit|committed|pledge|pledged|promise|promised)\b/i.test(compact);
  const negatedOpposition = /\b(no|not|without|never)\b.{0,25}\b(public |resident |community |local |documented )?opposition\b|\bresidents? did not (oppose|object|protest)\b/i.test(compact);
  const labels: string[] = [];

  if (proposed) labels.push("Proposed agreement");
  if (!negatedVoluntary && /\bvoluntary\b.{0,35}\b(plan|program|framework|commitment|agreement)\b|\b(plan|program|framework)\b.{0,35}\bvoluntary\b/i.test(compact)) {
    labels.push("Voluntary plan");
  }
  if (!negatedOrdinance && /\bordinance\b|\bpermit (?:condition|requirement)\b|\bcondition(?:al)? use permit\b/i.test(compact)) {
    labels.push("Ordinance or permit condition");
  }
  if (!negatedCommitment && /\b(public(?:ly)? (?:committed|announced|pledged|promised)|public commitment|company (?:committed|pledged|promised)|will provide)\b/i.test(compact)) {
    labels.push("Public commitment");
  }
  if (!negatedOpposition && /\b(documented|organized|public|resident|community|local)\s+opposition\b|\bresidents? (?:opposed|objected|protested)\b|\b(protest|lawsuit|legal challenge)\b/i.test(compact)) {
    labels.push("Documented opposition");
  }
  if (!proposed && !negatedExecution && (
    /\b(executed|signed)\b.{0,35}\b(community benefits? |development |host community |)?agreement\b/i.test(compact) ||
    /\b(community benefits? |development |host community )?agreement\b.{0,35}\b(was |has been )?(executed|signed)\b/i.test(compact)
  )) {
    labels.unshift("Executed agreement");
  }
  return [...new Set(labels)];
}

export function getCommunityDocumentation(
  evidence: Record<string, EvidenceItem>,
  project: ProjectContext,
): { statuses: CommunityDocumentationStatus[]; summary: string } {
  const item = evidence.community_risk;
  if (!item) {
    return {
      statuses: [{ label: NO_DOCUMENTATION, detail: "No community_risk evidence record is available.", sourceUrls: [] }],
      summary: "No attributable, project-specific community documentation was established.",
    };
  }

  const materials = project.kind === "custom"
    ? validatedResearchMaterials(item)
    : curatedCommunityMaterials(item);
  const passages = materials.map(({ source, text }) => ({
    text,
    urls: [source.url],
  }));

  const statuses = passages.flatMap(({ text, urls }) =>
    labelsForPassage(text).map((label) => ({ label, detail: text, sourceUrls: urls }))
  );
  const unique = [...new Map(statuses.map((status) => [status.label, status])).values()];
  if (unique.length === 0) {
    const hasAttributableSource = passages.length > 0;
    return {
      statuses: [{
        label: NO_DOCUMENTATION,
        detail: hasAttributableSource
          ? "Attributable project material was reviewed, but it contains no explicit supported documentation type."
          : "No accepted, source-backed exact-project community material was available.",
        sourceUrls: [...new Set(passages.flatMap((passage) => passage.urls))],
      }],
      summary: "No attributable, project-specific community documentation was established.",
    };
  }
  return {
    statuses: unique,
    summary: unique.map((status) => status.label).join("; "),
  };
}

function isSynthetic(item: EvidenceItem) {
  const text = [item.citation, item.description, item.sourceRole].join(" ").toLowerCase();
  return item.claimIds.includes("synthetic-transaction") ||
    /\bsynthetic\b|\banalyst-selected\b|\bmodeled (?:fact|assumption|input|economics)\b/.test(text);
}

function hasCuratedSource(item: EvidenceItem) {
  if (validHttpUrl(item.sourceUrl)) return true;
  if ((item.sources ?? []).some((source) => validHttpUrl(source.url))) return true;
  return item.claimIds.some((claimId) => getClaimSources(claimId).some((source) => validHttpUrl(source.url)));
}

function isConferenceFact(item: EvidenceItem, custom: boolean) {
  if (item.classification !== "Verified Evidence" || isSynthetic(item)) return false;
  return custom ? validatedResearchMaterials(item).length > 0 : hasCuratedSource(item);
}

export function getConferenceEvidenceSummary(
  evidence: Record<string, EvidenceItem>,
  project?: ProjectContext,
): { facts: EvidenceItem[]; unresolved: EvidenceItem[] } {
  const items = Object.values(evidence);
  if (project?.canonicalDossier) {
    const facts = items
      .filter((item) => item.classification !== "Missing Evidence" && hasCuratedSource(item))
      .slice(0, 3);
    const factSet = new Set(facts);
    return {
      facts,
      unresolved: items
        .filter((item) => !factSet.has(item) && (
          item.classification === "Missing Evidence" ||
          item.coverageStatus === "partial" ||
          item.coverageStatus === "conflicting"
        ))
        .slice(0, 3),
    };
  }
  const custom = items.some((item) =>
    item.researchState !== undefined || item.semanticValidationStatus !== undefined || item.sourceValidation !== undefined
  );
  const facts = items.filter((item) => isConferenceFact(item, custom)).slice(0, 3);
  const factSet = new Set(facts);
  return {
    facts,
    unresolved: items.filter((item) => !factSet.has(item) && !isConferenceFact(item, custom)).slice(0, 3),
  };
}

export function isConferenceResearchIncomplete(
  project: ProjectContext,
  evidence: Record<string, EvidenceItem>,
) {
  if (project.kind !== "custom") return false;
  if (project.researchMode !== "ai-researched") return true;
  const decisionRelevantIds = EVIDENCE_IMPACT_ROLE_DEFINITIONS
    .filter((definition) => definition.role !== "Context Indicator")
    .map((definition) => definition.id);
  return !decisionRelevantIds.every((id) => {
    const item = evidence[id];
    return Boolean(item && validatedResearchMaterials(item).length > 0);
  });
}