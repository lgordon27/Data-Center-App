import type { DirectoryFacility } from "@/services/directoryService";
import { getClaimSources, type ClaimId } from "@/data/claimSources";

export type CompanyKey = "NVIDIA" | "Microsoft" | "Meta" | "Google" | "Oracle" | "Amazon";

export const COMPANY_CONNECTION_TYPES = [
  "Supplier Relationship",
  "Thematic Exposure",
  "Developer/Operator",
  "Customer Dependency",
  "Direct Contractual",
  "Sourced Indirect Role",
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
  tier: 1 | 2 | null;
  tierLabel: string;
  connectionType: CompanyConnectionType;
  description: string;
  kind: "curated" | "directory";
  relationshipBasis: "source-backed" | "operator-derived" | "sourced-indirect" | "unresolved";
  claimIds?: ClaimId[];
  facility?: DirectoryFacility;
};

export type CompanyRelationshipState = "Source-backed" | "Discovery match" | "Research required";

export type ProjectSelectionContext = {
  company: CompanyKey;
  projectId: string;
  projectName: string;
  operator: string;
  location: string;
  capacityMW: number | null;
  status: string;
  relationshipType: CompanyConnectionType;
  evidenceState: CompanyRelationshipState;
  kind: CompanyProject["kind"];
  sourceUrl: string | null;
  providerId: string | null;
};

export const COMPANY_PROFILES: CompanyProfile[] = [
  {
    key: "NVIDIA",
    ticker: "NVDA",
    displayName: "NVIDIA",
    headline: "Largest contributor to S&P 500 earnings growth",
    detail: "Included in reviewed public-market context; fund weights change over time.",
    funds: ["iShares ESG Advanced MSCI USA ETF", "MSCI KLD 400 Social Index"],
    marketFunds: ["QQQ", "SMH"],
    accent: "lime",
    claimIds: ["fund-usxf", "fund-kld400"],
  },
  {
    key: "Microsoft",
    ticker: "MSFT",
    displayName: "Microsoft",
    headline: "Public-market context with project links requiring verification",
    detail: "Project Kilby and directory matches are shown with their evidence basis.",
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
    detail: "Directory matches require project-level verification.",
    funds: ["iShares ESG Advanced MSCI USA ETF", "MSCI KLD 400 Social Index"],
    marketFunds: ["QQQ", "XLC"],
    accent: "coral",
    claimIds: ["abbott-data-center-audit"],
  },
  {
    key: "Google",
    ticker: "GOOGL",
    displayName: "Google (Alphabet)",
    headline: "Texas project context subject to public-system review",
    detail: "Abbott audit context does not establish a facility or issuer relationship.",
    funds: ["iShares ESG Advanced MSCI USA ETF", "MSCI KLD 400 Social Index"],
    marketFunds: ["QQQ", "XLK"],
    accent: "violet",
    claimIds: ["abbott-data-center-audit"],
  },
  {
    key: "Oracle",
    ticker: "ORCL",
    displayName: "Oracle",
    headline: "Public reporting links Oracle and Stargate capacity",
    detail: "The available claim is relationship context, not a lease or holding-weight proof.",
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
      tier: null,
      tierLabel: "Source-backed context · review evidence",
      connectionType: "Supplier Relationship",
      description: "Reported NVIDIA GPU deployment connects the chip supplier to a grid-dependent Stargate buildout.",
      kind: "curated",
      relationshipBasis: "source-backed",
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
      tier: null,
      tierLabel: "Unresolved role · citation required",
      connectionType: "Developer/Operator",
      description: "Project Kilby appears in current market context, but no attached citation establishes its generation, tenancy, or operating status.",
      kind: "curated",
      relationshipBasis: "unresolved",
      claimIds: [],
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
      tier: null,
      tierLabel: "Source-backed context · review evidence",
      connectionType: "Sourced Indirect Role",
      description: "Public reporting links Oracle and Stargate capacity; no lease, tenancy, ownership, or materiality conclusion is made.",
      kind: "curated",
      relationshipBasis: "source-backed",
      claimIds: ["stargate-oracle-gpus", "stargate-campus"],
    },
  ],
  Meta: [
    {
      id: "meta-el-paso-tx",
      name: "Meta El Paso project",
      operator: "Meta",
      location: "El Paso · El Paso County · TX",
      capacityMW: null,
      status: "Status not reported",
      tier: null,
      tierLabel: "Operator-derived discovery · review required",
      connectionType: "Developer/Operator",
      description: "Compute Atlas discovery context matched by operator/company name; project-level power, water, ownership, and capacity evidence require verification.",
      kind: "directory",
      relationshipBasis: "operator-derived",
      facility: {
        id: "meta-el-paso-tx",
        name: "Meta El Paso project",
        operator: "Meta",
        city: "El Paso",
        county: "El Paso",
        state: "TX",
        capacityMW: null,
        availableCapacityMW: null,
        status: "unknown",
        confidence: "reported",
        aiClassification: "ai_training",
        sourceUrl: "https://www.compute-atlas.com/facilities/meta-el-paso-tx",
        connectedCompanies: ["Meta"],
        connectedFunds: ["QQQ", "XLC"],
        lastUpdated: null,
      },
    },
  ],
  Google: [
    {
      id: "google-goodnight-tx",
      name: "Google Goodnight project",
      operator: "Google",
      location: "Goodnight · TX",
      capacityMW: null,
      status: "Status not reported",
      tier: null,
      tierLabel: "Operator-derived discovery · review required",
      connectionType: "Developer/Operator",
      description: "Compute Atlas discovery context matched by operator/company name; project-level power, water, ownership, and capacity evidence require verification.",
      kind: "directory",
      relationshipBasis: "operator-derived",
      facility: {
        id: "google-goodnight-tx",
        name: "Google Goodnight project",
        operator: "Google",
        city: "Goodnight",
        county: "El Paso",
        state: "TX",
        capacityMW: null,
        availableCapacityMW: null,
        status: "unknown",
        confidence: "reported",
        aiClassification: "ai_training",
        sourceUrl: "https://www.compute-atlas.com/facilities/google-goodnight-tx",
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
      tier: null,
      tierLabel: "Operator-derived discovery · review required",
      connectionType: "Developer/Operator",
      description: "Bundled Compute Atlas discovery context matched by operator/company name; power, water, and ownership relationships require project-level verification.",
      kind: "directory",
      relationshipBasis: "operator-derived",
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

export function projectRelationshipState(company: CompanyKey, project: CompanyProject): CompanyRelationshipState {
  if (project.relationshipBasis === "source-backed") return "Source-backed";
  if (project.relationshipBasis === "operator-derived") return "Discovery match";
  return "Research required";
}

export function toProjectSelectionContext(company: CompanyKey, project: CompanyProject): ProjectSelectionContext {
  return {
    company,
    projectId: project.id,
    projectName: project.name,
    operator: project.operator,
    location: project.location,
    capacityMW: project.capacityMW,
    status: project.status,
    relationshipType: project.connectionType,
    evidenceState: projectRelationshipState(company, project),
    kind: project.kind,
    sourceUrl: project.facility?.sourceUrl ?? null,
    providerId: project.facility?.id ?? project.id,
  };
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
   if ((company === "NVIDIA" || company === "Oracle") && name === "stargate abilene") return "Sourced Indirect Role";
  return COMPANY_DEFAULT_CONNECTION_TYPES[company];
}

export function profileForCompany(company: CompanyKey) {
  return COMPANY_PROFILES.find((profile) => profile.key === company) ?? COMPANY_PROFILES[0];
}

export function companyProjects(company: CompanyKey, facilities: DirectoryFacility[]): CompanyProject[] {
  const curated = CURATED_PROJECTS[company] ?? [];
  const registeredFacilityIds = new Set(
    curated
      .map((project) => project.facility?.id ?? project.id)
      .map((id) => id.trim().toLowerCase()),
  );
  const seenFacilityIds = new Set<string>();
  const directoryProjects = facilities
    .filter((facility) => facility.connectedCompanies.includes(company))
    .filter((facility) => {
      const facilityId = facility.id.trim().toLowerCase();
      if (registeredFacilityIds.has(facilityId) || seenFacilityIds.has(facilityId)) return false;
      seenFacilityIds.add(facilityId);
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
       tier: null,
       tierLabel: "Operator-derived discovery · review required",
       connectionType: connectionTypeForCompanyProject(company, facility.name),
      description: "Compute Atlas discovery metadata matched by operator/company name; power, water, and ownership relationships require project-level verification.",
      kind: "directory",
       relationshipBasis: "operator-derived",
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