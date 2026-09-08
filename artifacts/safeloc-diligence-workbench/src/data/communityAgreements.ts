export const COMMUNITY_SNAPSHOT_VERSION = "future-pickleball-court-2026-08-31.v1";
export const COMMUNITY_PROVIDER_ATTRIBUTION =
  "Future Pickleball Court published agreement index; locally normalized by SafeLoc for diligence benchmarking. No partnership, endorsement, or sponsorship is implied.";
export const COMMUNITY_NOT_FOUND_TEXT =
  "No public community agreement was located for this project in the reviewed snapshot.";

export const COMMUNITY_TERM_IDS = [
  "community-fund",
  "clawbacks",
  "decommissioning-security",
  "grid-cost-allocation",
  "water-commitments",
  "noise-protections",
  "binding-jobs",
  "local-contracting-road-repair",
  "transparency-auditability",
  "tax-incentives",
] as const;

export type CommunityTermId = (typeof COMMUNITY_TERM_IDS)[number];
export type CommunityBenchmark = "MET" | "SHORT" | "UNKNOWN" | "Not applicable";
export type CommunityConclusion = "Present" | "Partial" | "Absent" | "Unknown" | "Not applicable";
export type CommunityTreatment =
  | "Financial Driver"
  | "Decision Gate"
  | "Stewardship Indicator"
  | "Context";
export type CommunityRelationship = "Direct" | "Related" | "Comparable" | "Not found";
export type CommunityHumanStatus = "unreviewed" | "accepted" | "overridden" | "unresolved";
export type CommunityRelationshipType =
  | "co-mentioned-in-source"
  | "same-project"
  | "project-phase"
  | "same-campus"
  | "contractual-relationship"
  | "supplier-relationship"
  | "thematic-relationship"
  | "unverified";

export type CommunitySourceValidation = {
  originalUrl: string | null;
  resolvedUrl: string | null;
  canonicalUrl: string | null;
  sourceState: "discovered" | "unknown" | "context-only";
  identityState: "exact" | "related" | "unknown";
  passageState: "captured" | "absent";
  eligibilityState: "context-only" | "ineligible" | "unknown";
  rejectionCodes: string[];
};

export type CommunityTermDefinition = {
  id: CommunityTermId;
  label: string;
  treatment: CommunityTreatment;
  description: string;
};

export type CommunityTermRecord = {
  id: CommunityTermId;
  projectEntityId: string;
  sourceRecordId: string;
  benchmarkTerm: string;
  benchmarkStatus: CommunityBenchmark;
  sourceRecordUrl: string | null;
  primaryDocumentUrl: string | null;
  sourceTitle: string;
  sourceLocation: string;
  sourceExactQuote: string | null;
  sourceSummary: string;
  sourceSectionOrPage: string | null;
  relationshipType: CommunityRelationshipType;
  relationshipConfidence: number;
  relationshipReasoning: string;
  analystConclusion?: CommunityConclusion;
  analystEvidenceClassification?: string;
  analystNotes?: string;
  lastVerifiedAt: string;
  sourceValidation?: CommunitySourceValidation;
};

export type CommunityAgreementRecord = {
  id: string;
  projectEntityId: string;
  title: string;
  sourceTitle: string;
  jurisdiction: string;
  organizations: string[];
  sourceLocation: string;
  agreementDate: string | null;
  sourceType: "municipal agreement" | "development agreement" | "incentive agreement";
  sourceRecordUrl: string | null;
  primaryDocumentUrl: string | null;
  sourceSectionOrPage: string | null;
  sourceSummary: string;
  retrievedAt: string;
  lastVerifiedAt: string;
  limitations: string[];
  licensing: string;
  terms: Record<CommunityTermId, CommunityTermRecord>;
  sourceValidation?: CommunitySourceValidation;
};

export type CommunityEntityRelationship = {
  id: string;
  fromEntityId: string;
  fromLabel: string;
  toEntityId: string;
  toLabel: string;
  relationshipType: CommunityRelationshipType;
  relationshipConfidence: number;
  relationshipReasoning: string;
  supportingSourceIds: string[];
  supportingSourceUrls: string[];
  verificationStatus: "source-supported" | "unverified";
};

const ABILENE_SOURCE_RECORD_ID = "us-tx-abilene-2025";
const ABILENE_SOURCE_RECORD_URL = "https://futurepickleballcourt.com/#us-tx-abilene-2025";
const ABILENE_LAST_VERIFIED_AT = "2026-09-01";
const NO_EXACT_QUOTE = null;
const NO_SOURCE_SECTION = null;
type CommunityTermSource = Pick<CommunityTermRecord, "sourceRecordUrl" | "primaryDocumentUrl" | "sourceTitle" | "sourceLocation">;
const ABILENE_TERM_SOURCE: CommunityTermSource = {
  sourceRecordUrl: ABILENE_SOURCE_RECORD_URL,
  primaryDocumentUrl: null,
  sourceTitle: "Future Pickleball Court · Abilene record",
  sourceLocation: "Abilene, Texas · #us-tx-abilene-2025",
};
const COMPARABLE_TERM_SOURCE: CommunityTermSource = {
  sourceRecordUrl: null,
  primaryDocumentUrl: null,
  sourceTitle: "Future Pickleball Court · normalized benchmark snapshot",
  sourceLocation: "Location not captured in reviewed snapshot",
};

export const COMMUNITY_ENTITY_RELATIONSHIPS: readonly CommunityEntityRelationship[] = [
  {
    id: "stargate-abilene-site-1",
    fromEntityId: "stargate-abilene",
    fromLabel: "Stargate Abilene",
    toEntityId: "stargate-site-1",
    toLabel: "Stargate Site 1",
    relationshipType: "co-mentioned-in-source",
    relationshipConfidence: 60,
    relationshipReasoning: "The cited Abilene record names Stargate Site 1, but the reviewed source does not establish whether it is the same facility, a phase, or a separate project under the same program.",
    supportingSourceIds: [ABILENE_SOURCE_RECORD_ID],
    supportingSourceUrls: [ABILENE_SOURCE_RECORD_URL],
    verificationStatus: "source-supported",
  },
  {
    id: "stargate-abilene-lancium-campus",
    fromEntityId: "stargate-abilene",
    fromLabel: "Stargate Abilene",
    toEntityId: "lancium-clean-campus",
    toLabel: "Lancium Clean Campus",
    relationshipType: "co-mentioned-in-source",
    relationshipConfidence: 60,
    relationshipReasoning: "The cited Abilene record names Lancium Clean Campus, but the reviewed source does not establish that it is the same campus or interchangeable with Stargate Abilene.",
    supportingSourceIds: [ABILENE_SOURCE_RECORD_ID],
    supportingSourceUrls: [ABILENE_SOURCE_RECORD_URL],
    verificationStatus: "source-supported",
  },
  {
    id: "stargate-abilene-crusoe-capacity",
    fromEntityId: "stargate-abilene",
    fromLabel: "Stargate Abilene",
    toEntityId: "crusoe-operated-capacity",
    toLabel: "Crusoe-operated capacity",
    relationshipType: "co-mentioned-in-source",
    relationshipConfidence: 55,
    relationshipReasoning: "The cited record and independent reporting name Crusoe in the Abilene context, but do not establish a supplier relationship or the scope and duration of every Crusoe-operated component.",
    supportingSourceIds: [ABILENE_SOURCE_RECORD_ID, "dcd-stargate-cancellation"],
    supportingSourceUrls: [ABILENE_SOURCE_RECORD_URL, "https://www.datacenterdynamics.com/en/news/oracleopenai-drop-plans-to-expand-flagship-abilene-stargate-site-meta-in-talks-to-pick-up-crusoe-capacity-with-nvidias-help/"],
    verificationStatus: "source-supported",
  },
  {
    id: "stargate-abilene-oracle-openai",
    fromEntityId: "stargate-abilene",
    fromLabel: "Stargate Abilene",
    toEntityId: "oracle-openai-participation",
    toLabel: "Oracle / OpenAI participation",
    relationshipType: "co-mentioned-in-source",
    relationshipConfidence: 70,
    relationshipReasoning: "The cited record and OpenAI disclosure support that Oracle and OpenAI are named participants in the Abilene Stargate context; they do not establish a contractual relationship or contract economics.",
    supportingSourceIds: [ABILENE_SOURCE_RECORD_ID, "openai-stargate-sites"],
    supportingSourceUrls: [ABILENE_SOURCE_RECORD_URL, "https://openai.com/index/five-new-stargate-sites/"],
    verificationStatus: "source-supported",
  },
  {
    id: "stargate-abilene-cancelled-expansion",
    fromEntityId: "stargate-abilene",
    fromLabel: "Stargate Abilene",
    toEntityId: "stargate-expansion-cancelled",
    toLabel: "Separately reported expansion / cancelled phase",
    relationshipType: "project-phase",
    relationshipConfidence: 82,
    relationshipReasoning: "Independent reporting describes an expansion beyond the core Abilene campus as cancelled. It is shown as a separate phase and is not silently merged into the operating or under-construction core.",
    supportingSourceIds: ["dcd-stargate-cancellation"],
    supportingSourceUrls: ["https://www.datacenterdynamics.com/en/news/oracleopenai-drop-plans-to-expand-flagship-abilene-stargate-site-meta-in-talks-to-pick-up-crusoe-capacity-with-nvidias-help/"],
    verificationStatus: "source-supported",
  },
  {
    id: "stargate-abilene-adjacent-capacity",
    fromEntityId: "stargate-abilene",
    fromLabel: "Stargate Abilene",
    toEntityId: "adjacent-capacity",
    toLabel: "Adjacent or separately reported capacity",
    relationshipType: "unverified",
    relationshipConfidence: 0,
    relationshipReasoning: "No reviewed source establishes that adjacent capacity belongs to the same legal project, site, phase, or customer. Keep the mapping unverified until attributable documentation is available.",
    supportingSourceIds: [],
    supportingSourceUrls: [],
    verificationStatus: "unverified",
  },
];

export type CommunitySnapshot = {
  version: string;
  provider: string;
  attribution: string;
  retrievedAt: string;
  reviewedAt: string;
  records: readonly CommunityAgreementRecord[];
};

const TERM_DEFINITIONS: readonly CommunityTermDefinition[] = [
  { id: "community-fund", label: "Community fund", treatment: "Stewardship Indicator", description: "A dedicated public-benefit, mitigation, or community investment fund." },
  { id: "clawbacks", label: "Clawbacks", treatment: "Decision Gate", description: "Repayment or recovery rights if commitments are missed." },
  { id: "decommissioning-security", label: "Decommissioning security", treatment: "Decision Gate", description: "Bond, reserve, or other funded end-of-life obligation." },
  { id: "grid-cost-allocation", label: "Grid-cost allocation", treatment: "Financial Driver", description: "Who carries interconnection, transmission, or upgrade costs." },
  { id: "water-commitments", label: "Water commitments", treatment: "Decision Gate", description: "Water source, volume, conservation, or curtailment commitments." },
  { id: "noise-protections", label: "Noise protections", treatment: "Stewardship Indicator", description: "Noise limits, monitoring, construction hours, or complaint controls." },
  { id: "binding-jobs", label: "Binding jobs", treatment: "Stewardship Indicator", description: "Enforceable jobs, wage, apprenticeship, or reporting commitments." },
  { id: "local-contracting-road-repair", label: "Local contracting / road repair", treatment: "Stewardship Indicator", description: "Local procurement, road maintenance, or construction mitigation." },
  { id: "transparency-auditability", label: "Transparency / auditability", treatment: "Context", description: "Reporting, inspection, audit, or public disclosure rights." },
  { id: "tax-incentives", label: "Tax incentives", treatment: "Context", description: "Tax abatements, credits, or incentive conditions." },
];

export const COMMUNITY_TERM_DEFINITIONS = TERM_DEFINITIONS;

function term(
  id: CommunityTermId,
  values: Omit<CommunityTermRecord, "id" | "sourceRecordUrl" | "primaryDocumentUrl" | "sourceTitle" | "sourceLocation">,
  source: CommunityTermSource = ABILENE_TERM_SOURCE,
): CommunityTermRecord {
  const sourceUrl = source.sourceRecordUrl ?? source.primaryDocumentUrl;
  const exactQuote = values.sourceExactQuote;
  return {
    id,
    ...source,
    ...values,
    sourceValidation: {
      originalUrl: sourceUrl,
      resolvedUrl: sourceUrl,
      canonicalUrl: sourceUrl,
      sourceState: sourceUrl ? "context-only" : "unknown",
      identityState: values.relationshipType === "same-project" ? "exact" : values.relationshipType === "unverified" ? "unknown" : "related",
      passageState: exactQuote ? "captured" : "absent",
      eligibilityState: values.relationshipType === "unverified"
        ? "context-only"
        : values.relationshipType === "same-project" && exactQuote
          ? "context-only"
          : sourceUrl ? "ineligible" : "unknown",
      rejectionCodes: [
        ...(values.relationshipType === "same-project" ? [] : ["not-project-specific"]),
        ...(!exactQuote ? ["missing-passage"] : []),
      ],
    },
  };
}

function abileneTerm(
  id: CommunityTermId,
  benchmarkTerm: string,
  benchmarkStatus: CommunityBenchmark,
): CommunityTermRecord {
  return term(id, {
    projectEntityId: "source-record-us-tx-abilene-2025",
    sourceRecordId: ABILENE_SOURCE_RECORD_ID,
    benchmarkTerm,
    benchmarkStatus,
    sourceExactQuote: NO_EXACT_QUOTE,
    sourceSummary: `Future Pickleball Court records ${benchmarkTerm.toLowerCase()} as ${benchmarkStatus} in the Abilene record.`,
    sourceSectionOrPage: NO_SOURCE_SECTION,
    relationshipType: "unverified",
    relationshipConfidence: 0,
    relationshipReasoning: "The cited record is an external benchmark; it does not establish that this term applies to the curated Stargate Abilene facility.",
    lastVerifiedAt: ABILENE_LAST_VERIFIED_AT,
  });
}

const abileneTerms: Record<CommunityTermId, CommunityTermRecord> = {
  "community-fund": abileneTerm("community-fund", "Community fund", "SHORT"),
  clawbacks: abileneTerm("clawbacks", "Clawbacks", "SHORT"),
  "decommissioning-security": abileneTerm("decommissioning-security", "Decommissioning", "SHORT"),
  "grid-cost-allocation": abileneTerm("grid-cost-allocation", "Grid costs", "SHORT"),
  "water-commitments": abileneTerm("water-commitments", "Water", "SHORT"),
  "noise-protections": abileneTerm("noise-protections", "Noise", "UNKNOWN"),
  "binding-jobs": abileneTerm("binding-jobs", "Jobs", "MET"),
  "local-contracting-road-repair": abileneTerm("local-contracting-road-repair", "Local contracting", "UNKNOWN"),
  "transparency-auditability": abileneTerm("transparency-auditability", "Transparency", "SHORT"),
  "tax-incentives": abileneTerm("tax-incentives", "Tax incentives", "UNKNOWN"),
};

const nationalTitles = [
  ["Mesa, AZ", "City of Mesa / data center development agreement"],
  ["Hillsboro, OR", "City of Hillsboro / campus development agreement"],
  ["Quincy, WA", "City of Quincy / data center mitigation agreement"],
  ["Moses Lake, WA", "Port of Moses Lake / development agreement"],
  ["The Dalles, OR", "City of The Dalles / incentive agreement"],
  ["Dublin, OH", "City of Dublin / campus agreement"],
  ["Chandler, AZ", "City of Chandler / technology campus agreement"],
  ["San Antonio, TX", "City of San Antonio / development agreement"],
  ["Fort Worth, TX", "City of Fort Worth / incentive agreement"],
  ["Austin, TX", "City of Austin / infrastructure agreement"],
  ["Dallas, TX", "City of Dallas / development agreement"],
  ["Loudoun County, VA", "Loudoun County / data center agreement"],
  ["Henrico County, VA", "Henrico County / economic development agreement"],
  ["Des Moines, IA", "City of Des Moines / campus agreement"],
] as const;

function benchmarkTerms(index: number): Record<CommunityTermId, CommunityTermRecord> {
  return Object.fromEntries(TERM_DEFINITIONS.map((definition, termIndex) => {
    return [definition.id, term(definition.id, {
      projectEntityId: `benchmark-${index + 1}`,
      sourceRecordId: `benchmark-${index + 1}`,
      benchmarkTerm: definition.label,
      benchmarkStatus: "UNKNOWN",
      sourceExactQuote: NO_EXACT_QUOTE,
      sourceSummary: "No verified source record or external status was captured for this comparison candidate.",
      sourceSectionOrPage: NO_SOURCE_SECTION,
      relationshipType: "unverified",
      relationshipConfidence: 0,
      relationshipReasoning: "This comparison candidate has no attributable source status and is not presented as an external benchmark fact.",
      lastVerifiedAt: "2026-09-01",
    }, COMPARABLE_TERM_SOURCE)];
  })) as Record<CommunityTermId, CommunityTermRecord>;
}

function makeRecord(id: string, title: string, jurisdiction: string, index: number): CommunityAgreementRecord {
  const isAbilene = index === 0;
  return {
    id,
    projectEntityId: isAbilene ? "stargate-abilene" : `benchmark-${index + 1}`,
    title,
    sourceTitle: title,
    jurisdiction,
    organizations: title.split(" / "),
    sourceLocation: jurisdiction,
    agreementDate: null,
    sourceType: index % 2 ? "development agreement" : "incentive agreement",
    sourceRecordUrl: isAbilene ? ABILENE_SOURCE_RECORD_URL : null,
    primaryDocumentUrl: null,
    sourceSectionOrPage: null,
    sourceSummary: isAbilene
      ? "Future Pickleball Court's Abilene record is retained as an external benchmark snapshot. No exact quotation or verified primary document URL was captured."
      : "Normalized comparable-only benchmark context from the Future Pickleball Court snapshot. No project-specific quotation or primary document URL was captured.",
    retrievedAt: "2026-08-31",
    lastVerifiedAt: "2026-09-01",
    limitations: ["Snapshot is not a live provider feed.", "Comparable provisions do not establish terms for another project.", "Public excerpts may omit exhibits or confidential schedules."],
    licensing: "Attribution retained from the published Future Pickleball Court source; use is limited to cited diligence benchmarking.",
    terms: index === 0 ? abileneTerms : benchmarkTerms(index),
    sourceValidation: {
      originalUrl: isAbilene ? ABILENE_SOURCE_RECORD_URL : null,
      resolvedUrl: isAbilene ? ABILENE_SOURCE_RECORD_URL : null,
      canonicalUrl: isAbilene ? ABILENE_SOURCE_RECORD_URL : null,
      sourceState: isAbilene ? "context-only" : "unknown",
      identityState: "unknown",
      passageState: "absent",
      eligibilityState: isAbilene ? "context-only" : "unknown",
      rejectionCodes: isAbilene ? ["not-project-specific", "missing-passage"] : [],
    },
  };
}

export const COMMUNITY_AGREEMENTS: readonly CommunityAgreementRecord[] = [
  makeRecord(ABILENE_SOURCE_RECORD_ID, "City of Abilene / Oracle / OpenAI", "Abilene, Texas", 0),
  ...nationalTitles.map(([jurisdiction, title], index) => makeRecord(`benchmark-${String(index + 2).padStart(2, "0")}`, title, jurisdiction, index + 1)),
];

export const COMMUNITY_SNAPSHOT: CommunitySnapshot = {
  version: COMMUNITY_SNAPSHOT_VERSION,
  provider: "Future Pickleball Court",
  attribution: COMMUNITY_PROVIDER_ATTRIBUTION,
  retrievedAt: "2026-08-31",
  reviewedAt: "2026-09-01",
  records: COMMUNITY_AGREEMENTS,
};

export function getCommunityAgreement(id: string) {
  return COMMUNITY_AGREEMENTS.find((agreement) => agreement.id === id);
}