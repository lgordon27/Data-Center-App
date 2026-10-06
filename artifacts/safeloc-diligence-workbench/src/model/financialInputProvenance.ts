import type { EvidenceItem } from "@/context/DiligenceContext";
import type { EiaElectricityData } from "@/services/eiaService";

export type FinancialInputType = "disclosed" | "benchmark" | "derived" | "user-assumption" | "blank";
export type FinancialRegistryEntry = Readonly<{
  id: string;
  label: string;
  value: number | null;
  low: number | null;
  high: number | null;
  unit: string;
  type: FinancialInputType;
  sourceTier: "primary" | "research-firm" | "secondary" | null;
  specificity: "project" | "local" | "state" | "national" | null;
  sourceName: string | null;
  sourceUrl: string | null;
  asOfDate: string | null;
  applicability: string;
  resolutionRule: string;
  provisional: boolean;
  visibility: "public" | "methodology";
  required: boolean;
}>;
export type FinancialRegistry = Readonly<Record<string, FinancialRegistryEntry>>;
export type FinancialRegistryContext = {
  isStargate: boolean;
  state: string | null;
  eia?: EiaElectricityData;
  retainedEia?: EiaElectricityData;
  candidates?: FinancialRegistryEntry[];
};

/** Only the existing provider's TX/IND series is available. Embedded values are never receipts. */
export function authenticEiaObservation(data: EiaElectricityData | undefined, state: string | null) {
  if (state !== "TX" || data?.dataOrigin !== "provider"
    || data.sourceMetadata.dataOrigin !== "provider"
    || !["live", "cached"].includes(data.status)
    || !data.fetchedAt || !Number.isFinite(Date.parse(data.fetchedAt))
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.latestPricePeriod ?? "")
    || !Number.isFinite(data.latestPrice) || data.latestPrice < 0) return null;
  const receipt = data.priceHistory.find(point =>
    point.period === data.latestPricePeriod && point.pricePerMwh === data.latestPrice);
  return receipt ? { value: receipt.pricePerMwh, date: receipt.period, fetchedAt: data.fetchedAt } : null;
}

export function resolveFinancialInput(blank: FinancialRegistryEntry, candidates: FinancialRegistryEntry[]) {
  const priority = (entry: FinancialRegistryEntry) =>
    entry.type === "disclosed" && entry.specificity === "project" ? 0
      : entry.specificity === "local" ? 1
        : entry.specificity === "state" || entry.specificity === "national" ? 2 : 3;
  return candidates.filter(entry => entry.id === blank.id && entry.value !== null && Number.isFinite(entry.value)
    && entry.low !== null && entry.high !== null && Number.isFinite(entry.low) && Number.isFinite(entry.high)
    && entry.low <= entry.value && entry.value <= entry.high
    && (entry.type !== "disclosed" || entry.low === entry.high || /source.*range/i.test(entry.applicability))
    && entry.sourceName && entry.sourceUrl && priority(entry) < 3)
    .sort((a, b) => priority(a) - priority(b))[0] ?? blank;
}

const SOURCE = {
  crusoe: ["Crusoe newsroom, campus financing announcement", "https://www.crusoe.ai/newsroom", "2025-05-21"],
  financing: ["Spyglass, Stargate data center layer cake (citing FT)", "https://spyglass.org", null],
  interest: ["New York Fed via sofrrate.com; HB Capital RE and Global Data Center Hub spread benchmarks", "https://sofrrate.com", "2026-10-01"],
  cbre: ["CBRE NA Data Center Trends H1 2026 via Data Center Frontier, national 10MW+ tier", "https://www.datacenterfrontier.com", "2026 H1"],
  cap: ["JLL Q1 2026 via apers.app", "https://apers.app", "2026 Q1"],
  discount: ["apers.app levered hyperscale and Global Data Center Hub equity targets", "https://globaldatacenterhub.com", "2026"],
  water: ["City of Abilene, Texas commercial water and sewer tariff", "https://abilenetx.gov/430/Billing-Structures", "2025-11-01"],
  epoch: ["Epoch AI, Total cost of ownership of a one-gigawatt AI data center", "https://epoch.ai", "2026"],
  schedule: ["Crusoe and Newmark campus delivery reporting", "https://www.nmrk.com", "2025-05-22"],
} as const;

/** Specification-supplied citations; domain links are not claimed to be verified article permalinks. */
export function buildFinancialRegistry(context: FinancialRegistryContext): FinancialRegistry {
  const entries: Record<string, FinancialRegistryEntry> = {};
  function add(id: string, label: string, value: number | null, low: number | null, high: number | null,
    unit: string, type: FinancialInputType, source: readonly [string, string, string | null] | null,
    tier: FinancialRegistryEntry["sourceTier"], specificity: FinancialRegistryEntry["specificity"],
    applicability: string, required = true, provisional = false, visibility: FinancialRegistryEntry["visibility"] = "public") {
    entries[id] = {
      id, label, value, low, high, unit, type, sourceTier: tier, specificity,
      sourceName: source?.[0] ?? null, sourceUrl: source?.[1] ?? null, asOfDate: source?.[2] ?? null,
      applicability, required, provisional, visibility,
      resolutionRule: "Project disclosure → local public → state/national public → blank; no invented defaults.",
    };
  }
  const project = context.isStargate;
  const disclosed = (id: string, label: string, value: number, unit: string, source: typeof SOURCE.crusoe | typeof SOURCE.financing) =>
    add(id, label, project ? value : null, project ? value : null, project ? value : null, unit,
      project ? "disclosed" : "blank", project ? source : null,
      project ? (source === SOURCE.crusoe ? "primary" : "secondary") : null,
      project ? "project" : null, "Reported campus terms; not independently researched in this track. Exact article permalink unresolved.");
  disclosed("capacityMW", "Campus capacity", 1200, "MW", SOURCE.crusoe);
  disclosed("buildings", "Buildings", 8, "buildings", SOURCE.crusoe);
  disclosed("totalCost", "Reported campus cost", 15000, "USD millions", SOURCE.crusoe);
  disclosed("debtAmount", "Reported debt", 9600, "USD millions", SOURCE.financing);
  disclosed("reportedEquity", "Approximate reported equity", 5000, "USD millions", SOURCE.financing);
  disclosed("leaseYears", "Reported Oracle lease length", 15, "years", SOURCE.financing);
  entries.reportedEquity = { ...entries.reportedEquity, required: false, applicability: "About $5B reported; distinct from modeled sources-and-uses equity, not a balancing plug." };
  add("costPerMW", "Cost per MW", project ? 12.5 : null, project ? 12.5 : null, project ? 12.5 : null,
    "USD millions/MW", project ? "derived" : "blank", project ? SOURCE.crusoe : null,
    project ? "primary" : null, project ? "project" : null, "Reported $15B divided by 1,200MW; no separately added cooling buildout. Exact article permalink unresolved.");
  add("debtShare", "Debt share", project ? 64 : null, project ? 64 : null, project ? 64 : null,
    "%", project ? "derived" : "blank", project ? SOURCE.financing : null,
    project ? "secondary" : null, project ? "project" : null, "Reported debt / reported direct cost. Debt amount, not an acquisition LTV proxy, is the default.");
  add("interestRate", "Borrowing rate", 7.5, 6.4, 9.4, "%", "benchmark", SOURCE.interest,
    "secondary", "national", "SOFR 3.87% plus cited 250–550bp spread; central 7.5% per specification, not disclosed loan pricing. Spread article links/dates unresolved.");
  add("sofr", "SOFR reference", 3.87, 3.87, 3.87, "%", "benchmark", SOURCE.interest,
    "primary", "national", "New York Fed via secondary relay; reference only, not added again to the borrowing rate.", false);
  add("leaseRate", "Lease revenue per kW-month", 172, 160, 185, "USD/kW-month", "benchmark", SOURCE.cbre,
    "research-firm", "national", "National 10MW+ tier; not Oracle's disclosed rent. Exact article permalink unresolved.");
  add("exitCapRate", "Exit capitalization rate", 6, 5.5, 6.5, "%", "benchmark", SOURCE.cap,
    "secondary", "national", "Hyperscale asset benchmark, not a disclosed transaction cap rate. Exact article permalink unresolved.");
  add("discountRate", "Equity discount rate", 13, 13, 20, "%", "benchmark", SOURCE.discount,
    "secondary", "national", "Equity target benchmarks; affects discounted value, not the cash-flow return. Exact article permalink unresolved.");
  const observation = authenticEiaObservation(context.eia, context.state)
    ?? authenticEiaObservation(context.retainedEia, context.state);
  add("electricityPrice", "Tenant electricity price", observation?.value ?? null, observation?.value ?? null, observation?.value ?? null,
    "USD/MWh", observation ? "benchmark" : "blank",
    observation ? ["U.S. EIA Texas industrial retail-sales series", "https://www.eia.gov/opendata/browser/electricity/retail-sales/data", observation.date] : null,
    observation ? "primary" : null, observation ? "state" : null,
    observation ? `Statewide industrial benchmark, not a project tariff; retrieved ${observation.fetchedAt}. Tenant context only.` : "No authentic state-matched EIA observation retained. Tenant context remains unavailable.", false);
  add("waterTariff", "Tenant water and sewer tariff", project ? 11.65 : null, project ? 11.65 : null, project ? 11.65 : null,
    "USD/1,000 gallons", project ? "benchmark" : "blank", project ? SOURCE.water : null, project ? "primary" : null,
    project ? "local" : null, "Abilene TX water $7.70 + sewer $3.95; actual service contract and consumption unresolved. Never Abilene KS.", false);
  add("maintenancePerMW", "Annual maintenance per MW", .12, .12, .12, "USD millions/MW-year", "benchmark", SOURCE.epoch,
    "research-firm", "national", "National operating benchmark, not project expenditure. Exact article permalink unresolved.");
  add("laborPerMW", "Annual labor per MW", .04, .04, .04, "USD millions/MW-year", "benchmark", SOURCE.epoch,
    "research-firm", "national", "National operating benchmark, not project expenditure. Exact article permalink unresolved.");
  add("propertyTaxPerGW", "Annual property tax per GW", 143, 0, 143, "USD millions/GW-year", "benchmark", SOURCE.epoch,
    "research-firm", "national", "Local abatement not verified; low zero and high national benchmark. Exact article permalink unresolved.");
  add("deliveredFirstYearMW", "First-year delivered capacity", project ? 206 : null, project ? 206 : null, project ? 206 : null,
    "MW", project ? "derived" : "blank", project ? SOURCE.schedule : null,
    project ? "primary" : null, project ? "project" : null, "About 206MW in 2025, 1,200MW in 2026; reported delivery plan, not verified present utilization. Exact article permalink unresolved.");
  add("deliveryDelay", "Additional delivery delay", project ? 0 : null, project ? 0 : null, project ? 0 : null,
    "months", project ? "derived" : "blank", project ? SOURCE.schedule : null,
    project ? "primary" : null, project ? "project" : null, "Zero additional months relative to the reported plan; existing internal evidence stress still applies. Exact article permalink unresolved.");
  add("insuranceRate", "Insurance allowance", .35, .35, .35, "% of direct cost/year", "user-assumption",
    null, null, null, "Provisional — weak source; research needed.", true, true);
  add("downtimeCost", "Revenue-derived daily downtime cost", project ? 1200 * 1000 * 172 * 12 / 365 : null,
    project ? 1200 * 1000 * 160 * 12 / 365 : null, project ? 1200 * 1000 * 185 * 12 / 365 : null,
    "USD/day", project ? "derived" : "blank", SOURCE.cbre, "research-firm", "national",
    "Annual lease revenue divided by 365; recalculated in every scenario, not reported loss.", false);
  add("utilityPassThrough", "Tenant utility pass-through", 1, 1, 1, "assumption indicator", "user-assumption",
    null, null, null, "Hyperscale lease-structure assumption; actual Oracle electricity/water pass-through terms are not public.", true, true);
  // All retained fixed economics and stress policies are inventoried, never public drivers.
  const internal: Array<[string, string, number | null, string, boolean]> = [
    ["waterConversionCapex", "Water conversion allowance", 80, "USD millions at 1,200MW", true],
    ["waterRightsMultiplier", "Water rights multiplier", 1.5, "multiplier", true],
    ["waterSourceMultiplier", "Water source multiplier", 1.5, "multiplier", true],
    ["carbonFallback", "Carbon fallback", 20, "USD millions/year at 1,200MW", true],
    ["amortizationYears", "Debt amortization", 10, "years", true],
    ["holdYears", "Model hold period", 5, "years", false],
    ["hoursPerYear", "Annual hours conversion", 8760, "hours/year", false],
    ["daysPerYear", "Annual days conversion", 365, "days/year", false],
    ["kwPerMW", "Capacity conversion", 1000, "kW/MW", false],
    ["monthsPerYear", "Annual months conversion", 12, "months/year", false],
    ["usdPerMillion", "Currency conversion", 1000000, "USD/USD million", false],
    ["customerUtilization", "Internal customer utilization", .9, "fraction", true],
    ["powerDifferential", "Internal power differential", .0945, "fraction", true],
    ["backupPowerOpex", "Backup operating allowance", 2, "USD millions/year", true],
  ];
  for (const [id, label, value, unit, provisional] of internal) {
    add(id, label, value, value, value, unit, "user-assumption", null, null, null,
      provisional ? "Provisional — research needed; internal methodology, not sourced project terms." : "Internal mathematical modeling convention.",
      false, provisional, "methodology");
  }
  for (const [id, current] of Object.entries(entries)) {
    if (context.candidates?.some(candidate => candidate.id === id)) {
      const blank = { ...current, value: null, low: null, high: null, type: "blank" as const };
      // Restrict disclosure-only inputs and local-only water resolution.
      const candidates = context.candidates.filter(candidate => candidate.id === id && (
        ["capacityMW", "totalCost", "costPerMW", "debtAmount", "deliveredFirstYearMW", "deliveryDelay"].includes(id)
          ? candidate.type === "disclosed" && candidate.specificity === "project"
          : id === "waterTariff" ? candidate.specificity === "local"
            : id === "electricityPrice" ? false : true));
      entries[id] = resolveFinancialInput(blank, [...candidates, ...(current.value === null ? [] : [current])]);
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, Object.freeze(entry)])));
}

export type FinancialInputProvenance = "Sourced" | "Derived from sourced evidence" | "Illustrative assumption" | "Unresolved";

export function getFinancialInputProvenance(
  item: EvidenceItem | undefined,
  _sourceClassification?: string,
): FinancialInputProvenance {
  if (!item) return "Unresolved";
  const derivedFromEvidence = /analyst inference from .*public records|derived from sourced evidence|calculated from sourced evidence/i.test(item.sourceRole);
  if (
    item.acceptedForModel === true
    && item.eligibleForModel === true
    && item.researchState === "accepted"
    && item.sourceValidation?.state === "financially-eligible"
    && Boolean(item.sourceUrl)
  ) return derivedFromEvidence ? "Derived from sourced evidence" : "Sourced";
  if (item.origin === "synthetic-default") return "Illustrative assumption";
  if (item.classification === "Missing Evidence" || /unresolved|missing evidence|not established/i.test(item.sourceRole)) {
    return "Unresolved";
  }
  if (
    item.origin === "dossier"
    && derivedFromEvidence
  ) return "Derived from sourced evidence";
  if (item.origin === "dossier" && (Boolean(item.sourceUrl) || Boolean(item.sources?.length))) return "Sourced";
  return "Unresolved";
}

export function getFinancialInputProvenanceDescription(label: FinancialInputProvenance): string {
  switch (label) {
    case "Sourced":
      return "This input has retained source evidence and an accepted or dossier lineage.";
    case "Derived from sourced evidence":
      return "This input is an inference or calculation based on sourced evidence, not a direct source statement.";
    case "Illustrative assumption":
      return "This is an underwriting assumption, not established project evidence.";
    case "Unresolved":
      return "No accepted source lineage is established for this input.";
  }
}