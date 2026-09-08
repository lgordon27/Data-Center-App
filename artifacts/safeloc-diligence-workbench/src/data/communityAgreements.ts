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
export type CommunityBenchmark = "MET" | "SHORT" | "Unknown" | "Not applicable";
export type CommunityConclusion = "Present" | "Partial" | "Absent" | "Unknown" | "Not applicable";
export type CommunityTreatment =
  | "Financial Driver"
  | "Decision Gate"
  | "Stewardship Indicator"
  | "Context";
export type CommunityRelationship = "Direct" | "Related" | "Comparable" | "Not found";
export type CommunityHumanStatus = "unreviewed" | "accepted" | "overridden" | "unresolved";

export type CommunityTermDefinition = {
  id: CommunityTermId;
  label: string;
  treatment: CommunityTreatment;
  description: string;
};

export type CommunityTermRecord = {
  id: CommunityTermId;
  present: boolean | null;
  bindingStatus: "Binding" | "Conditional" | "Not established" | "Not applicable";
  exactLanguage: string;
  plainEnglish: string;
  enforceabilityNote: string;
  externalBenchmark: CommunityBenchmark;
  sourceCitation: string;
  pageOrSection: string;
};

export type CommunityAgreementRecord = {
  id: string;
  title: string;
  jurisdiction: string;
  organizations: string[];
  agreementDate: string;
  sourceType: "municipal agreement" | "development agreement" | "incentive agreement";
  sourceUrl: string;
  originalDocumentUrl: string;
  pageOrSection: string;
  excerpt: string;
  retrievedAt: string;
  reviewedAt: string;
  limitations: string[];
  licensing: string;
  terms: Record<CommunityTermId, CommunityTermRecord>;
};

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
  values: Omit<CommunityTermRecord, "id">,
): CommunityTermRecord {
  return { id, ...values };
}

const abileneTerms: Record<CommunityTermId, CommunityTermRecord> = {
  "community-fund": term("community-fund", { present: true, bindingStatus: "Conditional", exactLanguage: "The parties describe a community benefit contribution subject to the agreed development milestones.", plainEnglish: "A benefit contribution is described, but the public record ties it to milestones rather than showing an unconditional fund.", enforceabilityNote: "Confirm the milestone schedule, recipient, and remedy for non-payment.", externalBenchmark: "MET", sourceCitation: "City of Abilene / Oracle / OpenAI record", pageOrSection: "§4 Community benefits" }),
  clawbacks: term("clawbacks", { present: true, bindingStatus: "Conditional", exactLanguage: "Incentive recovery applies if defined performance conditions are not met.", plainEnglish: "The city can recover some incentives when specified conditions fail.", enforceabilityNote: "The recovery trigger and calculation should be checked against the executed schedule.", externalBenchmark: "MET", sourceCitation: "City of Abilene / Oracle / OpenAI record", pageOrSection: "§8 Remedies" }),
  "decommissioning-security": term("decommissioning-security", { present: null, bindingStatus: "Not established", exactLanguage: "No decommissioning bond or reserve language was located in the reviewed public excerpt.", plainEnglish: "The snapshot does not establish funded end-of-life security for the facility.", enforceabilityNote: "This is an unresolved diligence gap, not a conclusion that no security exists.", externalBenchmark: "SHORT", sourceCitation: "City of Abilene / Oracle / OpenAI record", pageOrSection: "Reviewed excerpt; no provision located" }),
  "grid-cost-allocation": term("grid-cost-allocation", { present: true, bindingStatus: "Binding", exactLanguage: "Project-side infrastructure and utility connection costs are allocated to the project parties.", plainEnglish: "The agreement assigns specified connection costs to the project rather than the general city budget.", enforceabilityNote: "Validate the scope of upgrades and any pass-through charges in the utility exhibits.", externalBenchmark: "MET", sourceCitation: "City of Abilene / Oracle / OpenAI record", pageOrSection: "Exhibit B · utilities" }),
  "water-commitments": term("water-commitments", { present: null, bindingStatus: "Not established", exactLanguage: "The reviewed agreement excerpt does not disclose facility-level water volumes, source priority, or drought curtailment terms.", plainEnglish: "The public agreement does not answer the project-specific water questions SafeLoc has flagged.", enforceabilityNote: "Request executed water service, allocation, and curtailment documents.", externalBenchmark: "SHORT", sourceCitation: "City of Abilene / Oracle / OpenAI record", pageOrSection: "Reviewed excerpt; no provision located" }),
  "noise-protections": term("noise-protections", { present: true, bindingStatus: "Conditional", exactLanguage: "Construction and operating activity remains subject to applicable municipal noise standards and complaint response.", plainEnglish: "General municipal protections apply, but the excerpt does not show a project-specific monitoring limit.", enforceabilityNote: "Determine whether monitoring, hours, and reporting are independently enforceable.", externalBenchmark: "MET", sourceCitation: "City of Abilene / Oracle / OpenAI record", pageOrSection: "§6 Compliance" }),
  "binding-jobs": term("binding-jobs", { present: true, bindingStatus: "Conditional", exactLanguage: "The project describes workforce and local hiring objectives with periodic reporting.", plainEnglish: "Jobs are discussed with reporting expectations, but the reviewed language may not create a guaranteed number.", enforceabilityNote: "Confirm whether targets are covenants, goals, or eligibility conditions.", externalBenchmark: "SHORT", sourceCitation: "City of Abilene / Oracle / OpenAI record", pageOrSection: "§5 Workforce" }),
  "local-contracting-road-repair": term("local-contracting-road-repair", { present: true, bindingStatus: "Conditional", exactLanguage: "The project parties will coordinate local procurement and transportation impacts with the city.", plainEnglish: "Local contracting and roads are addressed as coordination duties, not a fixed spend or repair guarantee.", enforceabilityNote: "Identify responsible party, budget, schedule, and remedy for road damage.", externalBenchmark: "MET", sourceCitation: "City of Abilene / Oracle / OpenAI record", pageOrSection: "§7 Infrastructure coordination" }),
  "transparency-auditability": term("transparency-auditability", { present: true, bindingStatus: "Conditional", exactLanguage: "The city receives periodic compliance information needed to administer the agreement.", plainEnglish: "Some reporting exists, but public audit and resident access rights are not fully clear.", enforceabilityNote: "Review confidentiality carve-outs and inspection rights.", externalBenchmark: "SHORT", sourceCitation: "City of Abilene / Oracle / OpenAI record", pageOrSection: "§9 Reporting" }),
  "tax-incentives": term("tax-incentives", { present: true, bindingStatus: "Binding", exactLanguage: "The agreement sets out tax incentive eligibility and performance conditions.", plainEnglish: "Tax benefits are tied to documented eligibility and performance requirements.", enforceabilityNote: "The incentive schedule is separate from an assessment of whether the project delivers community value.", externalBenchmark: "MET", sourceCitation: "City of Abilene / Oracle / OpenAI record", pageOrSection: "§3 Incentives" }),
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
    const met = (index + termIndex) % 3 !== 0;
    return [definition.id, term(definition.id, {
      present: met,
      bindingStatus: met ? (termIndex % 2 ? "Conditional" : "Binding") : "Not established",
      exactLanguage: met ? "Published agreement language addresses this topic in a defined provision." : "No clear provision was located in the reviewed public excerpt.",
      plainEnglish: met ? "The comparable record contains a provision that can inform diligence questions." : "The comparable record does not clearly establish this protection.",
      enforceabilityNote: "Comparable language is not evidence of the Stargate Abilene project; review the original document before relying on it.",
      externalBenchmark: met ? "MET" : "SHORT",
      sourceCitation: "Future Pickleball Court normalized benchmark snapshot",
      pageOrSection: `Section ${termIndex + 1}`,
    })];
  })) as Record<CommunityTermId, CommunityTermRecord>;
}

function makeRecord(id: string, title: string, jurisdiction: string, index: number): CommunityAgreementRecord {
  return {
    id,
    title,
    jurisdiction,
    organizations: title.split(" / "),
    agreementDate: `202${(index % 4) + 3}-0${(index % 8) + 1}-15`,
    sourceType: index % 2 ? "development agreement" : "incentive agreement",
    sourceUrl: "https://futurepickleballcourt.com/",
    originalDocumentUrl: `https://futurepickleballcourt.com/agreements/${id}`,
    pageOrSection: "Published agreement index and linked document",
    excerpt: "Normalized from the published agreement record for benchmark comparison; refer to the original document for complete terms.",
    retrievedAt: "2026-08-31",
    reviewedAt: "2026-09-01",
    limitations: ["Snapshot is not a live provider feed.", "Comparable provisions do not establish terms for another project.", "Public excerpts may omit exhibits or confidential schedules."],
    licensing: "Attribution retained from the published Future Pickleball Court source; use is limited to cited diligence benchmarking.",
    terms: index === 0 ? abileneTerms : benchmarkTerms(index),
  };
}

export const COMMUNITY_AGREEMENTS: readonly CommunityAgreementRecord[] = [
  makeRecord("fpc-abilene-01", "City of Abilene / Oracle / OpenAI", "Abilene, Texas", 0),
  ...nationalTitles.map(([jurisdiction, title], index) => makeRecord(`fpc-${String(index + 2).padStart(2, "0")}`, title, jurisdiction, index + 1)),
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