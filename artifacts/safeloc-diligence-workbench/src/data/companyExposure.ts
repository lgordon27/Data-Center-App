import type { DirectoryFacility } from "@/services/directoryService";
import { getClaimSources, type ClaimId } from "@/data/claimSources";

export type CompanyKey = "NVIDIA" | "Microsoft" | "Meta" | "Google" | "Oracle" | "Amazon";

export const COMPANY_CONNECTION_TYPES = [
  "Supplier Relationship",
  "Thematic Exposure",
  "Developer/Operator",
  "Customer Dependency",
  "Direct Contractual",
] as const;

export type CompanyConnectionType = typeof COMPANY_CONNECTION_TYPES[number];

export type CompanyExposureProvenance = {
  sourceCount: number;
  sourceTitles: string[];
  asOf: string | null;
};

export type CompanyProfile = {
  key: CompanyKey;
  ticker: string;
  displayName: string;
  headline: string;
  detail: string;
  funds: string[];
  marketFunds: string[];
  accent: "lime" | "blue" | "coral" | "violet" | "sky" | "gold";
  claimIds: ClaimId[];
};

export type CompanyProject = {
  id: string;
  name: string;
  operator: string;
  location: string;
  capacityMW: number | null;
  status: string;
  tier: 1 | 2;
  tierLabel: string;
  connectionType: CompanyConnectionType;
  description: string;
  kind: "curated" | "directory";
  claimIds?: ClaimId[];
  facility?: DirectoryFacility;
};

export type CompanyRelationshipState = "Source-backed" | "Discovery match" | "Research required";

export const COMPANY_PROFILES: CompanyProfile[] = [
  {
    key: "NVIDIA",
    ticker: "NVDA",
    displayName: "NVIDIA",
    headline: "Largest contributor to S&P 500 earnings growth",
    detail: "20%+ of iShares ESG Advanced MSCI USA ETF",
    funds: ["iShares ESG Advanced MSCI USA ETF", "MSCI KLD 400 Social Index"],
    marketFunds: ["QQQ", "SMH"],
    accent: "lime",
    claimIds: ["fund-usxf", "fund-kld400"],
  },
  {
    key: "Microsoft",
    ticker: "MSFT",
    displayName: "Microsoft",
    headline: "Partially hedged: Tier 1 and Tier 2 projects",
    detail: "Project Kilby (behind-the-meter) + grid-dependent projects",
    funds: ["iShares ESG Advanced MSCI USA ETF", "MSCI KLD 400 Social Index"],
    marketFunds: ["QQQ", "XLK"],
    accent: "blue",
    claimIds: ["stargate-initiative"],
  },
  {
    key: "Meta",
    ticker: "META",
    displayName: "Meta",
    headline: "Grid-dependent Texas projects",
    detail: "More exposed to Tier 2 delays",
    funds: ["iShares ESG Advanced MSCI USA ETF", "MSCI KLD 400 Social Index"],
    marketFunds: ["QQQ", "XLC"],
    accent: "coral",
    claimIds: ["abbott-data-center-audit"],
  },
  {
    key: "Google",
    ticker: "GOOGL",
    displayName: "Google (Alphabet)",
    headline: "$40B+ Texas investment dependent on grid",
    detail: "Subject to Abbott's audit",
    funds: ["iShares ESG Advanced MSCI USA ETF", "MSCI KLD 400 Social Index"],
    marketFunds: ["QQQ", "XLK"],
    accent: "violet",
    claimIds: ["abbott-data-center-audit"],
  },
  {
    key: "Oracle",
    ticker: "ORCL",
    displayName: "Oracle",
    headline: "15-year Stargate lease for 450,000+ GPUs",
    detail: "Directly tied to Stargate's evidence profile",
    funds: ["iShares ESG Advanced MSCI USA ETF", "MSCI KLD 400 Social Index"],
    marketFunds: ["QQQ", "XLK"],
    accent: "sky",
    claimIds: ["stargate-oracle-gpus"],
  },
  {
    key: "Amazon",
    ticker: "AMZN",
    displayName: "Amazon",
    headline: "AWS largest cloud infrastructure provider",
    detail: "Major Virginia and Ohio data center operator",
    funds: ["iShares ESG Advanced MSCI USA ETF", "MSCI KLD 400 Social Index"],
    marketFunds: ["QQQ", "XLY"],
    accent: "gold",
    claimIds: [],
  },
];

export function getCompanyExposureProvenance(company: CompanyKey): CompanyExposureProvenance {
  const profile = COMPANY_PROFILES.find((candidate) => candidate.key === company);
  const sources = [...new Map((profile?.claimIds ?? []).flatMap((claimId) => getClaimSources(claimId)).map((source) => [source.id, source])).values()];
  const verifiedDates = sources.map((source) => source.lastVerifiedAt ?? source.accessedAt).filter((date): date is string => Boolean(date)).sort();
  return {
    sourceCount: sources.length,
    sourceTitles: sources.map((source) => source.title),
    asOf: verifiedDates.at(-1) ?? null,
  };
}

const CURATED_PROJECTS: Partial<Record<CompanyKey, CompanyProject[]>> = {
  NVIDIA: [
    {
      id: "curated-stargate-nvidia",
      name: "Stargate Abilene",
      operator: "OpenAI / Oracle / Crusoe",
      location: "Taylor County, TX",
      capacityMW: 1200,
      status: "Under construction",
      tier: 2,
      tierLabel: "Tier 2 · at risk of delay",
      connectionType: "Supplier Relationship",
      description: "Reported NVIDIA GPU deployment connects the chip supplier to a grid-dependent Stargate buildout.",
      kind: "curated",
      claimIds: ["stargate-oracle-gpus", "stargate-campus"],
    },
  ],
  Microsoft: [
    {
      id: "project-kilby",
      name: "Project Kilby",
      operator: "Chevron / Microsoft",
      location: "Public location not disclosed",
      capacityMW: null,
      status: "Proceeding",
      tier: 1,
      tierLabel: "Tier 1 · proceeding",
      connectionType: "Developer/Operator",
      description: "Public market context describes behind-the-meter generation that bypasses the grid.",
      kind: "curated",
      claimIds: [],
    },
    {
      id: "project-rainier-microsoft-wi",
      name: "Project Rainier",
      operator: "Microsoft",
      location: "Mount Pleasant · Racine County · WI",
      capacityMW: 315,
      status: "Construction",
      tier: 2,
      tierLabel: "Tier 2 · review required",
      connectionType: "Customer Dependency",
      description: "Bundled Compute Atlas discovery context matched by operator/company name; power, water, and ownership relationships require project-level verification.",
      kind: "directory",
      facility: {
        id: "project-rainier-microsoft-wi",
        name: "Project Rainier",
        operator: "Microsoft",
        city: "Mount Pleasant",
        county: "Racine",
        state: "WI",
        capacityMW: 315,
        availableCapacityMW: 315,
        status: "construction",
        confidence: "reported",
        aiClassification: "ai_training",
        sourceUrl: "https://www.compute-atlas.com/facilities/project-rainier-microsoft-wi",
        connectedCompanies: ["Microsoft"],
        connectedFunds: ["QQQ", "XLK"],
        lastUpdated: null,
      },
    },
  ],
  Oracle: [
    {
      id: "curated-stargate-oracle",
      name: "Stargate Abilene",
      operator: "OpenAI / Oracle / Crusoe",
      location: "Taylor County, TX",
      capacityMW: 1200,
      status: "Under construction",
      tier: 2,
      tierLabel: "Tier 2 · at risk of delay",
      connectionType: "Direct Contractual",
      description: "Oracle's reported lease and customer relationship are reviewed alongside Stargate's public evidence profile.",
      kind: "curated",
      claimIds: ["stargate-oracle-gpus", "stargate-campus"],
    },
  ],
  Meta: [
    {
      id: "project-volcano-meta-la",
      name: "Project Volcano",
      operator: "Meta",
      location: "Richland Parish · LA",
      capacityMW: 1500,
      status: "Planned",
      tier: 2,
      tierLabel: "Tier 2 · review required",
      connectionType: "Developer/Operator",
      description: "Bundled Compute Atlas discovery context matched by operator/company name; power, water, and ownership relationships require project-level verification.",
      kind: "directory",
      facility: {
        id: "project-volcano-meta-la",
        name: "Project Volcano",
        operator: "Meta",
        city: "Richland Parish",
        county: "Richland",
        state: "LA",
        capacityMW: 1500,
        availableCapacityMW: 1500,
        status: "planned",
        confidence: "reported",
        aiClassification: "ai_training",
        sourceUrl: "https://www.compute-atlas.com/facilities/project-volcano-meta-la",
        connectedCompanies: ["Meta"],
        connectedFunds: ["QQQ", "XLC"],
        lastUpdated: null,
      },
    },
  ],
  Google: [
    {
      id: "google-willow-rock-oh",
      name: "Google New Albany Campus",
      operator: "Google",
      location: "New Albany · Licking County · OH",
      capacityMW: 600,
      status: "Construction",
      tier: 2,
      tierLabel: "Tier 2 · review required",
      connectionType: "Developer/Operator",
      description: "Bundled Compute Atlas discovery context matched by operator/company name; power, water, and ownership relationships require project-level verification.",
      kind: "directory",
      facility: {
        id: "google-willow-rock-oh",
        name: "Google New Albany Campus",
        operator: "Google",
        city: "New Albany",
        county: "Licking",
        state: "OH",
        capacityMW: 600,
        availableCapacityMW: 600,
        status: "construction",
        confidence: "confirmed",
        aiClassification: "ai_training",
        sourceUrl: "https://www.compute-atlas.com/facilities/google-willow-rock-oh",
        connectedCompanies: ["Google"],
        connectedFunds: ["QQQ", "XLK"],
        lastUpdated: null,
      },
    },
  ],
  Amazon: [
    {
      id: "amazon-data-center-ohio-oh",
      name: "Amazon Central Ohio Campus",
      operator: "Amazon",
      location: "New Albany · Licking County · OH",
      capacityMW: 300,
      status: "Operating",
      tier: 2,
      tierLabel: "Tier 2 · review required",
      connectionType: "Developer/Operator",
      description: "Bundled Compute Atlas discovery context matched by operator/company name; power, water, and ownership relationships require project-level verification.",
      kind: "directory",
      facility: {
        id: "amazon-data-center-ohio-oh",
        name: "Amazon Central Ohio Campus",
        operator: "Amazon",
        city: "New Albany",
        county: "Licking",
        state: "OH",
        capacityMW: 300,
        availableCapacityMW: 300,
        status: "operating",
        confidence: "confirmed",
        aiClassification: "hyperscale",
        sourceUrl: "https://www.compute-atlas.com/facilities/amazon-data-center-ohio-oh",
        connectedCompanies: ["Amazon"],
        connectedFunds: ["QQQ", "XLY"],
        lastUpdated: null,
      },
    },
  ],
};

export function startingRelationshipState(company: CompanyKey): CompanyRelationshipState {
  if (company === "NVIDIA" || company === "Oracle") return "Source-backed";
  return (CURATED_PROJECTS[company] ?? []).some((project) => project.kind === "curated")
    ? "Discovery match"
    : "Research required";
}

export function startingRelationshipProject(company: CompanyKey): CompanyProject | null {
  return (CURATED_PROJECTS[company] ?? []).find((project) => project.kind === "curated") ?? null;
}

const COMPANY_DEFAULT_CONNECTION_TYPES: Record<CompanyKey, CompanyConnectionType> = {
  NVIDIA: "Thematic Exposure",
  Microsoft: "Customer Dependency",
  Meta: "Developer/Operator",
  Google: "Developer/Operator",
  Oracle: "Thematic Exposure",
  Amazon: "Developer/Operator",
};

function normalizedProjectName(projectName: string) {
  return projectName.trim().toLowerCase();
}

/**
 * Relationship labels describe public-market context only. Project names are
 * used for the reviewed exceptions; directory metadata never upgrades a
 * relationship to a stronger claim.
 */
export function connectionTypeForCompanyProject(company: CompanyKey, projectName: string): CompanyConnectionType {
  const name = normalizedProjectName(projectName);
  if (company === "NVIDIA" && name === "stargate abilene") return "Supplier Relationship";
  if (company === "Microsoft" && name === "project kilby") return "Developer/Operator";
  if (company === "Oracle" && name === "stargate abilene") return "Direct Contractual";
  return COMPANY_DEFAULT_CONNECTION_TYPES[company];
}

export function profileForCompany(company: CompanyKey) {
  return COMPANY_PROFILES.find((profile) => profile.key === company) ?? COMPANY_PROFILES[0];
}

export function companyProjects(company: CompanyKey, facilities: DirectoryFacility[]): CompanyProject[] {
  const curated = CURATED_PROJECTS[company] ?? [];
  const seenFacilityIds = new Set<string>();
  const directoryProjects = facilities
    .filter((facility) => facility.connectedCompanies.includes(company))
    .filter((facility) => {
      if (seenFacilityIds.has(facility.id)) return false;
      seenFacilityIds.add(facility.id);
      return true;
    })
    .filter((facility) => !curated.some((project) => project.name.toLowerCase() === facility.name.toLowerCase()))
    .map((facility): CompanyProject => ({
      id: facility.id,
      name: facility.name,
      operator: facility.operator,
      location: [facility.city, facility.county ? `${facility.county} County` : "", facility.state].filter(Boolean).join(" · "),
      capacityMW: facility.capacityMW,
      status: {
        operating: "Operating",
        construction: "Construction",
        planned: "Planned",
        delayed: "Delayed",
        cancelled: "Cancelled",
        unknown: "Status not reported",
      }[facility.status],
      tier: 2,
      tierLabel: "Tier 2 · review required",
       connectionType: connectionTypeForCompanyProject(company, facility.name),
      description: "Compute Atlas discovery metadata matched by operator/company name; power, water, and ownership relationships require project-level verification.",
      kind: "directory",
      facility,
    }));
  return [...curated, ...directoryProjects];
}

export function projectSummary(projects: CompanyProject[]) {
  const disclosedCapacity = projects.reduce((total, project) => total + (project.capacityMW ?? 0), 0);
  return {
    count: projects.length,
    capacityMW: disclosedCapacity,
    tier1: projects.filter((project) => project.tier === 1).length,
    tier2: projects.filter((project) => project.tier === 2).length,
    undisclosedCapacity: projects.filter((project) => project.capacityMW === null).length,
  };
}