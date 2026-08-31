import type { DirectoryFacility } from "@/services/directoryService";

export type CompanyKey = "NVIDIA" | "Microsoft" | "Meta" | "Google" | "Oracle" | "Amazon";

export type CompanyProfile = {
  key: CompanyKey;
  ticker: string;
  displayName: string;
  headline: string;
  detail: string;
  funds: string[];
  marketFunds: string[];
  accent: "lime" | "blue" | "coral" | "violet" | "sky" | "gold";
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
  description: string;
  kind: "curated" | "directory";
  facility?: DirectoryFacility;
};

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
  },
];

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
      description: "Reported NVIDIA GPU deployment connects the chip supplier to a grid-dependent Stargate buildout.",
      kind: "curated",
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
      description: "Public market context describes behind-the-meter generation that bypasses the grid.",
      kind: "curated",
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
      description: "Oracle's reported lease and customer relationship are reviewed alongside Stargate's public evidence profile.",
      kind: "curated",
    },
  ],
};

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