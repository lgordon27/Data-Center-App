import { AI_EVIDENCE_TEMPORAL_CONFIG } from "@/data/aiEvidenceTemporal.mjs";

export type PublicAccessStatus = "open" | "paywall" | "registration" | "not provided";
export type ClaimProvenance =
  | "public evidence"
  | "management disclosure"
  | "market context"
  | "analyst inference"
  | "synthetic assumption"
  | "unresolved disclosure";

export type ClaimSourceRecord = {
  id: string;
  publisher: string;
  title: string;
  url: string;
  publishedAt: string | null;
  accessedAt: string | null;
  accessStatus: PublicAccessStatus;
  lastVerifiedAt: string | null;
  qualifier: string;
};

export type ClaimRecord = {
  id: string;
  label: string;
  provenance: ClaimProvenance;
  sourceIds: readonly string[];
  statement: string;
};

const VERIFIED_2026_08_30 = "2026-08-30";

export const claimSourceRecords = {
  "openai-stargate-sites": {
    id: "openai-stargate-sites",
    publisher: "OpenAI",
    title: "OpenAI, Oracle, and SoftBank expand Stargate with five new AI data center sites",
    url: "https://openai.com/index/five-new-stargate-sites/",
    publishedAt: "2025-09-23",
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "open",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Company disclosure; supports the announced initiative and Abilene program context, not modeled transaction economics.",
  },
  "dcd-stargate-cancellation": {
    id: "dcd-stargate-cancellation",
    publisher: "Data Center Dynamics",
    title: "Oracle/OpenAI drop plans to expand flagship Abilene Stargate site",
    url: "https://www.datacenterdynamics.com/en/news/oracleopenai-drop-plans-to-expand-flagship-abilene-stargate-site-meta-in-talks-to-pick-up-crusoe-capacity-with-nvidias-help/",
    publishedAt: "2026-03-06",
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "open",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Independent trade reporting; supports the cancellation, operating buildings, and campus-scale context.",
  },
  "winbuzzer-grid-delay": {
    id: "winbuzzer-grid-delay",
    publisher: "WinBuzzer",
    title: "OpenAI and Oracle Cap Texas AI Data Center at 1.2 GW",
    url: "https://winbuzzer.com/2026/03/09/openai-oracle-cap-texas-ai-data-center-abilene-stargate-xcxwbn/",
    publishedAt: "2026-03-09",
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "open",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Independent reporting; supports the reported 1.2 GW cap and grid delay exceeding one year.",
  },
  "toms-stargate-reliability": {
    id: "toms-stargate-reliability",
    publisher: "Tom's Hardware",
    title: "OpenAI's massive Stargate data center canceled as operator struggles with reliability issues",
    url: "https://www.tomshardware.com/tech-industry/artificial-intelligence/openais-massive-stargate-data-center-canceled-as-firm-cant-reach-terms-with-oracle-operator-struggles-with-reliability-issues-meta-said-to-be-interested-in-snatching-excess-capacity",
    publishedAt: "2026-03-08",
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "open",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Independent reporting; reliability context only and not evidence of project CAPEX or modeled downtime cost.",
  },
  "texas-abbott-audit": {
    id: "texas-abbott-audit",
    publisher: "Office of the Texas Governor",
    title: "Governor Abbott Directs Comprehensive Data Center Audit",
    url: "https://gov.texas.gov/news/post/governor-abbott-directs-comprehensive-data-center-audit",
    publishedAt: "2026-08-03",
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "open",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Primary state disclosure; supports the audit and pause on advancing data-center interconnections.",
  },
  "ercot-batch-zero-notice": {
    id: "ercot-batch-zero-notice",
    publisher: "ERCOT",
    title: "M-A080326-01 Update Regarding Batch Zero Timelines and Processes",
    url: "https://www.ercot.com/services/comm/mkt_notices/M-A080326-01",
    publishedAt: "2026-08-03",
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "open",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Primary grid-operator notice; market-process context, not a named Stargate customer record.",
  },
  "gallup-financial-guidance": {
    id: "gallup-financial-guidance",
    publisher: "Gallup",
    title: "Where Americans and Canadians Turn for Financial Guidance",
    url: "https://news.gallup.com/poll/712952/americans-canadians-turn-financial-guidance.aspx",
    publishedAt: "2026-08-05",
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "open",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Gallup study conducted in partnership with Edward Jones; population-level advisor context.",
  },
  "fema-nri-v120": {
    id: "fema-nri-v120",
    publisher: "FEMA",
    title: "National Risk Index Data — December 2025 v1.20",
    url: "https://www.fema.gov/about/openfema/data-sets/national-risk-index-data",
    publishedAt: "2025-12-01",
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "open",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Primary federal dataset; county-level hazard context, not facility-level proof.",
  },
  "ishares-usxf-holdings": {
    id: "ishares-usxf-holdings",
    publisher: "iShares",
    title: "iShares ESG Advanced MSCI USA ETF — fund page and holdings",
    url: "https://www.ishares.com/us/products/314365/ishares-esg-advanced-msci-usa-etf",
    publishedAt: null,
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "open",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Fund document; holdings change over time and do not prove ownership or control of any facility.",
  },
  "msci-kld-400": {
    id: "msci-kld-400",
    publisher: "MSCI",
    title: "MSCI KLD 400 Social Index fact sheet",
    url: "https://www.msci.com/www/fact-sheet/msci-kld-400-social-index/05954138",
    publishedAt: null,
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "registration",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Index methodology and constituent context; not a facility-level evidence source.",
  },
  "eia-electricity-data": {
    id: "eia-electricity-data",
    publisher: "U.S. Energy Information Administration",
    title: "Electricity Data Browser",
    url: "https://www.eia.gov/electricity/data/browser/",
    publishedAt: null,
    accessedAt: VERIFIED_2026_08_30,
    accessStatus: "open",
    lastVerifiedAt: VERIFIED_2026_08_30,
    qualifier: "Federal market data; Texas electricity context only, not a disclosed Stargate tariff.",
  },
} satisfies Record<string, ClaimSourceRecord>;

export type ClaimSourceId = keyof typeof claimSourceRecords;

export const claimRecords = {
  "stargate-initiative": publicClaim("stargate-initiative", "Stargate $500B initiative", "The announced Stargate program carried a $500 billion commitment.", ["openai-stargate-sites"], "management disclosure"),
  "stargate-campus": publicClaim("stargate-campus", "Stargate Abilene campus", "The Abilene core is reported at 1.2 GW with two buildings operating and further construction underway.", ["dcd-stargate-cancellation", "winbuzzer-grid-delay"], "public evidence"),
  "stargate-cancellation": publicClaim("stargate-cancellation", "Abilene expansion cancellation", "The planned Abilene expansion beyond the core was cancelled after reported grid delays exceeding one year.", ["dcd-stargate-cancellation", "winbuzzer-grid-delay"], "public evidence"),
  "stargate-cooling-damage": publicClaim("stargate-cooling-damage", "Cooling reliability event", "Public reporting describes reliability and cooling-system problems at the Abilene buildout.", ["toms-stargate-reliability"], "market context"),
  "stargate-oracle-gpus": publicClaim("stargate-oracle-gpus", "Oracle and GPU relationship", "Public reporting connects Oracle-operated Stargate capacity with large NVIDIA GPU deployments.", ["openai-stargate-sites", "dcd-stargate-cancellation"], "management disclosure"),
  "abbott-data-center-audit": publicClaim("abbott-data-center-audit", "Texas data-center audit", "Texas directed an audit before additional data-center interconnections advance.", ["texas-abbott-audit", "ercot-batch-zero-notice"], "public evidence"),
  "ercot-market-pressure": publicClaim("ercot-market-pressure", "ERCOT large-load pressure", "Large-load queue statistics describe market pressure, not a named Stargate connection.", ["ercot-batch-zero-notice"], "market context"),
  "advisor-trust-statistics": publicClaim("advisor-trust-statistics", "Financial-guidance trust statistics", "Gallup and Edward Jones report population-level use and trust in professional and AI financial guidance.", ["gallup-financial-guidance"], "market context"),
  "fema-taylor-county": publicClaim("fema-taylor-county", "Taylor County FEMA profile", "FEMA NRI v1.20 provides county-level hazard and vulnerability measurements.", ["fema-nri-v120"], "public evidence"),
  "fund-usxf": publicClaim("fund-usxf", "USXF fund holdings", "The iShares fund page provides current holdings context.", ["ishares-usxf-holdings"], "market context"),
  "fund-kld400": publicClaim("fund-kld400", "MSCI KLD 400 index", "The MSCI fact sheet provides index context.", ["msci-kld-400"], "market context"),
  "eia-texas-electricity": publicClaim("eia-texas-electricity", "Texas electricity market data", "EIA data provides statewide electricity context.", ["eia-electricity-data"], "market context"),
  "synthetic-transaction": boundaryClaim("synthetic-transaction", "Synthetic transaction assumptions", "Entry value, lease economics, CAPEX, downtime cost, and modeled returns are analyst-selected and intentionally uncited.", "synthetic assumption"),
  "analyst-inference": boundaryClaim("analyst-inference", "Analyst inference", "The value is derived from related public context and is intentionally not presented as an observed project fact.", "analyst inference"),
  "unresolved-water": boundaryClaim("unresolved-water", "Unresolved water disclosures", "Facility-level water consumption and water-rights terms were not found in the reviewed public record.", "unresolved disclosure"),
} satisfies Record<string, ClaimRecord>;

export type ClaimId = keyof typeof claimRecords;

function publicClaim(
  id: string,
  label: string,
  statement: string,
  sourceIds: readonly ClaimSourceId[],
  provenance: ClaimProvenance,
): ClaimRecord {
  return { id, label, statement, sourceIds, provenance };
}

function boundaryClaim(id: string, label: string, statement: string, provenance: ClaimProvenance): ClaimRecord {
  return { id, label, statement, sourceIds: [], provenance };
}

export function getClaimRecord(id: ClaimId) {
  return claimRecords[id];
}

export function getClaimSources(id: ClaimId) {
  return claimRecords[id].sourceIds.map((sourceId) => claimSourceRecords[sourceId as ClaimSourceId]);
}

export function isSafeDirectSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password && url.pathname !== "/";
  } catch {
    return false;
  }
}

export function formatClaimDate(value: string | null) {
  if (!value) return "not provided";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "not provided";
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function get2026FreshnessIssues() {
  const cutoff = Date.parse(`${AI_EVIDENCE_TEMPORAL_CONFIG.cutoffDate}T00:00:00.000Z`);
  const reviewWindowDays = AI_EVIDENCE_TEMPORAL_CONFIG.reviewWindowDays;
  const issues: string[] = [];

  for (const claim of Object.values(claimRecords)) {
    for (const source of getClaimSources(claim.id as ClaimId)) {
      if (!source.publishedAt?.startsWith("2026")) continue;
      if (!source.lastVerifiedAt) {
        issues.push(`${claim.id}: ${source.id} is missing lastVerifiedAt`);
        continue;
      }
      const verified = Date.parse(`${source.lastVerifiedAt}T00:00:00.000Z`);
      const ageDays = (cutoff - verified) / 86_400_000;
      if (!Number.isFinite(verified) || ageDays < 0 || ageDays > reviewWindowDays) {
        issues.push(`${claim.id}: ${source.id} was last verified ${source.lastVerifiedAt}, outside the ${reviewWindowDays}-day review window`);
      }
    }
  }
  return [...new Set(issues)];
}