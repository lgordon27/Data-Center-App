export const EVIDENCE_SEMANTIC_POLICY_VERSION = 1;

export const EVIDENCE_SEMANTIC_IDS = Object.freeze([
  "electricity_cost",
  "water_consumption",
  "grid_interconnection",
  "water_escalation",
  "community_risk",
  "renewable_percentage",
  "cooling_capex",
  "electricity_escalation",
  "carbon_compliance",
  "permitting_timeline",
  "customer_concentration",
  "water_rights",
  "site_hazard_exposure",
  "backup_power_capacity",
  "water_source_resilience",
  "downtime_cost",
]);

const numeric = (canonicalUnit, allowedUnits, min, max, options = {}) => ({
  valueKind: "numeric",
  canonicalUnit,
  allowedUnits,
  plausibleBounds: { min, max },
  zeroSemantics: options.zeroSemantics ?? "explicit-source-only",
  modelDestination: options.modelDestination ?? null,
  impactRole: options.impactRole ?? "Context Indicator",
  materiality: options.materiality ?? "context-only",
  fallbackPolicy: options.fallbackPolicy ?? "missing-evidence-default",
  requiresFacilityContext: options.requiresFacilityContext === true,
});

const qualitative = (allowedValues, options = {}) => ({
  valueKind: "qualitative",
  canonicalUnit: "qualitative",
  allowedUnits: [
    "qualitative",
    "context",
    "project context",
    "profile",
    "risk profile",
    "supply",
    "local impact",
    "facility rights",
    "facility exposure",
  ],
  allowedValues,
  plausibleBounds: null,
  zeroSemantics: "not-applicable",
  modelDestination: options.modelDestination ?? null,
  impactRole: options.impactRole ?? "Context Indicator",
  materiality: options.materiality ?? "context-only",
  fallbackPolicy: options.fallbackPolicy ?? "missing-evidence-default",
  requiresFacilityContext: false,
});

export const EVIDENCE_SEMANTIC_POLICY = Object.freeze({
  electricity_cost: Object.freeze({
    id: "electricity_cost",
    label: "Electricity Cost / MWh",
    meaning: "Facility-level delivered electricity tariff or contract price paid by the named project.",
    dimension: "currency / energy",
    ...numeric("USD/MWh", ["USD/MWh", "cents/kWh", "USD/kWh", "USD/GWh"], 0, 5_000, {
      allowedUnits: ["USD/MWh", "cents/kWh", "USD/kWh", "USD/GWh"],
      modelDestination: "electricityRate",
      impactRole: "Financial Driver",
      materiality: "material",
      requiresFacilityContext: true,
      fallbackPolicy: "42 USD/MWh synthetic fallback remains separate from research",
    }),
    eligibleSourceScope: "exact-project facility tariff, utility filing, or named contract",
    eligibleSourceTypes: ["primary-government", "primary-utility", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  water_consumption: Object.freeze({
    id: "water_consumption",
    label: "Annual Cooling Water",
    meaning: "Annual water consumed or withdrawn by the named facility for cooling operations.",
    dimension: "volume / time",
    ...numeric("Mgal/year", ["Mgal/year", "gallons/year", "m3/year"], 0, 1_000_000, {
      allowedUnits: ["Mgal/year", "gallons/year", "m3/year"],
      modelDestination: "annualCoolingWaterMgal",
      impactRole: "Financial Driver",
      materiality: "material",
      fallbackPolicy: "23 Mgal/year synthetic fallback remains separate from research",
    }),
    eligibleSourceScope: "exact-project facility design, permit, utility record, or operator disclosure",
    eligibleSourceTypes: ["primary-government", "primary-utility", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  grid_interconnection: Object.freeze({
    id: "grid_interconnection",
    label: "Grid Interconnection Timeline",
    meaning: "Elapsed delay or time to energized grid interconnection for the named project.",
    dimension: "time",
    ...numeric("months", ["months", "days", "weeks", "years"], 0, 240, {
      allowedUnits: ["months", "days", "weeks", "years"],
      modelDestination: "gridInterconnectionMonths",
      impactRole: "Financial Driver",
      materiality: "material",
      fallbackPolicy: "14 months synthetic stress fallback remains separate from research",
    }),
    eligibleSourceScope: "exact-project interconnection milestone, queue filing, study, or named behind-the-meter exemption",
    eligibleSourceTypes: ["primary-government", "primary-utility", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  water_escalation: Object.freeze({
    id: "water_escalation",
    label: "5-Yr Water Cost Escalation",
    meaning: "Annualized or stated five-year increase in the named facility's water cost.",
    dimension: "percentage",
    ...numeric("%", ["%", "fraction", "basis points"], -100, 1_000, {
      allowedUnits: ["%", "fraction", "basis points"],
      modelDestination: "waterEscalationRate",
      impactRole: "Financial Driver",
      materiality: "material",
      fallbackPolicy: "7% synthetic fallback remains separate from research",
    }),
    eligibleSourceScope: "exact-project tariff, contract, or explicitly identified facility cost forecast",
    eligibleSourceTypes: ["primary-government", "primary-utility", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  community_risk: Object.freeze({
    id: "community_risk",
    label: "Community Infrastructure Strain",
    meaning: "Community, infrastructure, permitting, or public-opposition conditions around the named project.",
    dimension: "qualitative context",
    ...qualitative(["low", "moderate", "high"]),
    eligibleSourceScope: "named project community or clearly labeled local/regional context",
    eligibleSourceTypes: ["primary-government", "secondary-reporting", "primary-company"],
    projectSpecificityRequired: false,
    humanAcceptanceRequired: true,
  }),
  renewable_percentage: Object.freeze({
    id: "renewable_percentage",
    label: "Renewable Procurement",
    meaning: "Share of electricity delivered to or contractually procured for the named facility from renewable sources.",
    dimension: "percentage",
    ...numeric("%", ["%", "fraction", "basis points"], 0, 100, {
      allowedUnits: ["%", "fraction", "basis points"],
      impactRole: "Context Indicator",
      materiality: "context-only",
      fallbackPolicy: "25% synthetic context baseline does not change cash flow",
    }),
    eligibleSourceScope: "exact-project delivered power, PPA, REC, or contract disclosure",
    eligibleSourceTypes: ["primary-government", "primary-utility", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  cooling_capex: Object.freeze({
    id: "cooling_capex",
    label: "Cooling Infrastructure CAPEX",
    meaning: "Capital cost attributable to cooling and heat-rejection infrastructure for the named project.",
    dimension: "currency",
    ...numeric("USD millions", ["USD millions", "USD", "USD thousands"], 0, 100_000, {
      allowedUnits: ["USD millions", "USD", "USD thousands"],
      modelDestination: "coolingCapex",
      impactRole: "Financial Driver",
      materiality: "material",
      fallbackPolicy: "450 USD millions synthetic fallback remains separate from research",
    }),
    eligibleSourceScope: "exact-project budget, contract, filing, or disclosed project cost",
    eligibleSourceTypes: ["primary-government", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  electricity_escalation: Object.freeze({
    id: "electricity_escalation",
    label: "5-Yr Electricity Price Increase",
    meaning: "Annualized or stated five-year increase in the named facility's electricity cost.",
    dimension: "percentage",
    ...numeric("%", ["%", "fraction", "basis points"], -100, 1_000, {
      allowedUnits: ["%", "fraction", "basis points"],
      modelDestination: "electricityEscalationRate",
      impactRole: "Financial Driver",
      materiality: "material",
      fallbackPolicy: "6% synthetic fallback remains separate from research",
    }),
    eligibleSourceScope: "exact-project tariff, contract, or explicitly identified facility cost forecast",
    eligibleSourceTypes: ["primary-government", "primary-utility", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  carbon_compliance: Object.freeze({
    id: "carbon_compliance",
    label: "Carbon Compliance Cost",
    meaning: "Annual compliance, allowance, emissions, or carbon cost attributable to the named facility.",
    dimension: "currency / time",
    ...numeric("USD millions/year", ["USD millions/year", "USD/year", "USD/month"], 0, 100_000, {
      allowedUnits: ["USD millions/year", "USD/year", "USD/month"],
      modelDestination: "annualCarbonCompliance",
      impactRole: "Financial Driver",
      materiality: "material",
      fallbackPolicy: "20 USD millions/year synthetic fallback remains separate from research",
    }),
    eligibleSourceScope: "exact-project permit, filing, allowance obligation, or operator disclosure",
    eligibleSourceTypes: ["primary-government", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  permitting_timeline: Object.freeze({
    id: "permitting_timeline",
    label: "Core Build Timeline",
    meaning: "Elapsed time from the named project's permit or construction start milestone to the stated completion milestone.",
    dimension: "time",
    ...numeric("months", ["months", "days", "weeks", "years", "date range"], 0, 240, {
      allowedUnits: ["months", "days", "weeks", "years", "date range"],
      modelDestination: "permittingMonths",
      impactRole: "Financial Driver",
      materiality: "material",
      fallbackPolicy: "10 months synthetic schedule fallback remains separate from research",
    }),
    eligibleSourceScope: "exact-project permit schedule, construction notice, or dated operator milestone",
    eligibleSourceTypes: ["primary-government", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  customer_concentration: Object.freeze({
    id: "customer_concentration",
    label: "Customer Terms & Concentration",
    meaning: "Share of the named facility's contracted demand or revenue attributable to its largest customer.",
    dimension: "percentage",
    ...numeric("%", ["%", "fraction", "basis points"], 0, 100, {
      allowedUnits: ["%", "fraction", "basis points"],
      impactRole: "Decision Gate",
      materiality: "decision-gate",
      fallbackPolicy: "90% utilization posture remains a separate synthetic assumption",
    }),
    eligibleSourceScope: "exact-project lease, offtake, tenant, or customer allocation with explicit percentage",
    eligibleSourceTypes: ["primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  water_rights: Object.freeze({
    id: "water_rights",
    label: "Local Water Rights & Allocation",
    meaning: "Water entitlement, allocation, seniority, curtailment, or permit rights held by the named facility.",
    dimension: "qualitative context",
    ...qualitative(["low", "moderate", "high"]),
    impactRole: "Decision Gate",
    materiality: "decision-gate",
    fallbackPolicy: "Water-rights cost posture remains a separate synthetic gate assumption",
    eligibleSourceScope: "exact-project water right, permit, allocation, or utility agreement",
    eligibleSourceTypes: ["primary-government", "primary-utility", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  site_hazard_exposure: Object.freeze({
    id: "site_hazard_exposure",
    label: "Site Hazard Exposure Profile",
    meaning: "Qualitative hazard exposure profile for the named facility site, distinct from county-wide context.",
    dimension: "qualitative risk",
    ...qualitative(["low", "moderate", "high"], {
      modelDestination: "siteHazardExposure",
      impactRole: "Financial Driver",
      materiality: "material",
      fallbackPolicy: "high exposure synthetic stress fallback remains separate from research",
    }),
    eligibleSourceScope: "exact parcel/site assessment or explicitly labeled geographic hazard context",
    eligibleSourceTypes: ["primary-government", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: false,
    humanAcceptanceRequired: true,
  }),
  backup_power_capacity: Object.freeze({
    id: "backup_power_capacity",
    label: "Backup Power Capacity",
    meaning: "Hours of backup generation or storage coverage available to the named facility.",
    dimension: "time",
    ...numeric("hours", ["hours", "minutes", "days"], 0, 8_760, {
      allowedUnits: ["hours", "minutes", "days"],
      impactRole: "Decision Gate",
      materiality: "decision-gate",
      fallbackPolicy: "0 hours remains a disclosed-capacity gate, not an automatic CAPEX effect",
    }),
    eligibleSourceScope: "exact-project generator/storage permit, design, contract, or operator disclosure",
    eligibleSourceTypes: ["primary-government", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  water_source_resilience: Object.freeze({
    id: "water_source_resilience",
    label: "Water Source Resilience",
    meaning: "Diversification and backup resilience of water sources serving the named facility.",
    dimension: "qualitative supply",
    ...qualitative(["single-source", "diversified"], {
      impactRole: "Decision Gate",
      materiality: "decision-gate",
      fallbackPolicy: "single-source synthetic gate posture remains separate from research",
    }),
    eligibleSourceScope: "exact-project water supply agreement, source disclosure, or facility design",
    eligibleSourceTypes: ["primary-government", "primary-utility", "primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
  downtime_cost: Object.freeze({
    id: "downtime_cost",
    label: "Estimated Downtime Cost",
    meaning: "Daily operating loss attributable to interruption or degraded service at the named facility.",
    dimension: "currency / time",
    ...numeric("USD/day", ["USD/day", "USD/month"], 0, 1_000_000_000_000, {
      allowedUnits: ["USD/day", "USD/month"],
      modelDestination: "downtimeCostPerDay",
      impactRole: "Financial Driver",
      materiality: "material",
      fallbackPolicy: "5,000,000 USD/day minimum stress fallback remains separate from research",
    }),
    eligibleSourceScope: "exact-project SLA, outage penalty, operational loss disclosure, or explicit facility estimate",
    eligibleSourceTypes: ["primary-company", "secondary-reporting"],
    projectSpecificityRequired: true,
    humanAcceptanceRequired: true,
  }),
});

function normalizeUnit(unit) {
  return String(unit ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/·/g, "/");
}

function numberFromValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.trim().replaceAll(",", "").match(/-?(?:\d+(?:\.\d+)?|\.\d+)/);
  return match ? Number(match[0]) : null;
}

function dateFromValue(value) {
  const match = String(value ?? "").match(/(\d{4}-\d{2}-\d{2})\s*(?:to|through|-|–|—)\s*(\d{4}-\d{2}-\d{2})/i);
  if (!match) return null;
  const start = Date.parse(`${match[1]}T00:00:00.000Z`);
  const end = Date.parse(`${match[2]}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start: match[1], end: match[2], months: (end - start) / (1000 * 60 * 60 * 24 * 30.4375) };
}

function convertNumeric(definition, value, unit) {
  const normalizedUnit = normalizeUnit(unit);
  const aliases = {
    "usd/mwh": ["usd/mwh", "$/mwh", "$ / mwh"],
    "cents/kwh": ["cents/kwh", "¢/kwh", "c/kwh"],
    "usd/kwh": ["usd/kwh", "$/kwh"],
    "usd/gwh": ["usd/gwh", "$/gwh"],
    "mgal/year": ["mgal/year", "mgal/yr", "m gal/year", "m gal/yr"],
    "gallons/year": ["gallons/year", "gallons/yr", "gal/year", "gal/yr"],
    "m3/year": ["m3/year", "m³/year", "cubic meters/year", "cubic metres/year"],
    "%": ["%", "percent", "percentage"],
    "fraction": ["fraction", "decimal", "ratio"],
    "basis points": ["basis points", "bps", "bp"],
    "usd millions": ["usd millions", "$m", "$m", "million usd", "millions usd"],
    "usd": ["usd", "$", "dollars"],
    "usd thousands": ["usd thousands", "$k", "thousand usd", "thousands usd"],
    "usd millions/year": ["usd millions/year", "$m/year", "$m/yr", "million usd/year"],
    "usd/year": ["usd/year", "$/year", "usd/yr", "$/yr"],
    "usd/month": ["usd/month", "$/month", "usd/mo", "$/mo"],
    "months": ["months", "month", "mo"],
    "days": ["days", "day", "d"],
    "weeks": ["weeks", "week", "w"],
    "years": ["years", "year", "yr", "y"],
    "hours": ["hours", "hour", "h", "hrs"],
    "minutes": ["minutes", "minute", "min"],
    "date range": ["date range", "dates", "start/end dates"],
  };
  const matching = Object.entries(aliases).find(([, values]) => values.includes(normalizedUnit))?.[0];
  if (!matching) return { error: "Missing or unsupported unit; a human User Assumption must supply the unit." };
  if (!definition.allowedUnits.some((allowed) => {
    const normalizedAllowed = normalizeUnit(allowed);
    return normalizedAllowed === matching || (aliases[normalizedAllowed] ?? []).includes(normalizedUnit);
  })) {
    return { error: `Unit "${unit}" is incompatible with the ${definition.dimension} dimension for this evidence variable.` };
  }
  if (matching === "date range") {
    const dates = dateFromValue(value);
    if (!dates) return { error: "A date range must contain two valid ISO dates in order to derive a duration." };
    if (definition.canonicalUnit !== "months") return { error: "Date ranges are only valid for duration evidence." };
    return {
      normalizedValue: dates.months,
      normalizedUnit: definition.canonicalUnit,
      conversion: `date range ${dates.start} → ${dates.end} → ${definition.canonicalUnit}`,
    };
  }
  const n = numberFromValue(value);
  if (n === null) return { error: "No numeric value was supplied for this numeric evidence variable." };
  let converted = n;
  switch (definition.canonicalUnit) {
    case "USD/MWh":
      converted = matching === "cents/kwh" ? n * 10 : matching === "usd/kwh" ? n * 1_000 : matching === "usd/gwh" ? n / 1_000 : n;
      break;
    case "Mgal/year":
      converted = matching === "gallons/year" ? n / 1_000_000 : matching === "m3/year" ? n / 3_785.411784 : n;
      break;
    case "%":
      converted = matching === "fraction" ? n * 100 : matching === "basis points" ? n / 100 : n;
      break;
    case "USD millions":
      converted = matching === "usd" ? n / 1_000_000 : matching === "usd thousands" ? n / 1_000 : n;
      break;
    case "USD millions/year":
      converted = matching === "usd/year" ? n / 1_000_000 : matching === "usd/month" ? n * 12 / 1_000_000 : n;
      break;
    case "USD/day":
      converted = matching === "usd/month" ? n * 12 / 365 : matching === "usd" ? n : n;
      break;
    case "months":
      converted = matching === "days" ? n / 30.4375 : matching === "weeks" ? n / 4.348214 : matching === "years" ? n * 12 : n;
      break;
    case "hours":
      converted = matching === "minutes" ? n / 60 : matching === "days" ? n * 24 : n;
      break;
    default:
      break;
  }
  return {
    normalizedValue: converted,
    normalizedUnit: definition.canonicalUnit,
    conversion: matching === definition.canonicalUnit.toLowerCase()
      ? "none"
      : `${matching} → ${definition.canonicalUnit}`,
  };
}

export function getEvidenceSemanticDefinition(id) {
  return EVIDENCE_SEMANTIC_POLICY[id] ?? null;
}

export function evaluateEvidenceSourceEligibility(input = {}) {
  const definition = getEvidenceSemanticDefinition(input.id);
  if (!definition) return { eligible: false, reasons: ["Unknown evidence identifier."] };
  const sources = Array.isArray(input.sources) ? input.sources.filter((source) => source && typeof source === "object") : [];
  const nonReviewerSources = sources.filter((source) => source.sourceClass !== "reviewer-submitted");
  const hasSource = Boolean(input.sourceUrl) || sources.length > 0;
  const hasEligibleType = nonReviewerSources.some((source) => definition.eligibleSourceTypes.includes(source.sourceClass));
  const hasExactProject = sources.some((source) => source.exactProject === true);
  const reasons = [];
  if (!hasSource) reasons.push("No validated source was returned.");
  if (!hasEligibleType) reasons.push("No source matches the eligible source types for this evidence variable.");
  if (definition.projectSpecificityRequired && !hasExactProject) {
    reasons.push("An exact-project source is required for this evidence variable.");
  }
  if (nonReviewerSources.length === 0) reasons.push("Reviewer-submitted sources cannot establish research provenance.");
  if (!["Verified Evidence", "Management Assertion"].includes(input.classification)) {
    reasons.push("Only source-backed classifications can activate research evidence.");
  }
  if ((input.sourceSupportConfidence ?? 0) < 60) reasons.push("Source support confidence is below the model-eligibility threshold.");
  if (input.coverageStatus === "conflicting") reasons.push("Conflicting source coverage requires reviewer resolution.");
  return { eligible: reasons.length === 0, reasons };
}

export function assertEvidenceSemanticPolicyCoverage(ids = EVIDENCE_SEMANTIC_IDS) {
  const expected = [...EVIDENCE_SEMANTIC_IDS].sort();
  const actual = [...ids].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("Evidence semantic policy must define exactly the 16 SafeLoc evidence identifiers.");
  }
  return true;
}

export function normalizeEvidenceRecord(input) {
  const definition = getEvidenceSemanticDefinition(input?.id);
  if (!definition) {
    return {
      policyVersion: EVIDENCE_SEMANTIC_POLICY_VERSION,
      validationStatus: "quarantined",
      modelEligible: false,
      quarantineReasons: ["Unknown evidence identifier."],
    };
  }
  const result = {
    policyVersion: EVIDENCE_SEMANTIC_POLICY_VERSION,
    validationStatus: "unresolved",
    modelEligible: false,
    quarantineReasons: [],
    conversion: "none",
    normalizedValue: undefined,
    normalizedUnit: definition.canonicalUnit,
  };
  if (definition.valueKind === "qualitative") {
    const normalizedUnit = normalizeUnit(input.unit);
    if (!normalizedUnit || !definition.allowedUnits.some((allowed) => normalizeUnit(allowed) === normalizedUnit)) {
      result.quarantineReasons.push("Missing or incompatible qualitative unit; a human User Assumption must supply the unit.");
      return result;
    }
    if (input.qualitativeValue && definition.allowedValues.includes(input.qualitativeValue)) {
      result.validationStatus = "valid";
      result.modelEligible = definition.modelDestination !== null;
    } else if (input.value && definition.allowedValues.includes(String(input.value).trim().toLowerCase())) {
      result.normalizedValue = String(input.value).trim().toLowerCase();
      result.validationStatus = "valid";
      result.modelEligible = definition.modelDestination !== null;
    } else {
      result.quarantineReasons.push("Qualitative value is missing or outside the canonical vocabulary.");
    }
    return result;
  }
  if (input.numericValue === undefined && !input.value) {
    result.quarantineReasons.push("Numeric value is missing; no model input can be derived.");
    return result;
  }
  const converted = convertNumeric(definition, input.numericValue ?? input.value, input.unit);
  if (converted.error) {
    result.quarantineReasons.push(converted.error);
    return result;
  }
  result.normalizedValue = converted.normalizedValue;
  result.normalizedUnit = converted.normalizedUnit;
  result.conversion = converted.conversion;
  const { min, max } = definition.plausibleBounds;
  if (!Number.isFinite(converted.normalizedValue) || converted.normalizedValue < min || converted.normalizedValue > max) {
    result.quarantineReasons.push(`Value is outside the plausible ${min}–${max} ${definition.canonicalUnit} range; it was not clipped.`);
    return result;
  }
  if (definition.requiresFacilityContext && /\b(residential|household|homeowner|domestic)\b/i.test(
    [input.value, input.description, input.citation, input.sourceContext].join(" "),
  )) {
    result.quarantineReasons.push("Residential electricity pricing is not eligible as a facility tariff.");
    return result;
  }
  if (definition.requiresFacilityContext && !/\b(facility|data\s*center|industrial|utility|tariff|contract|campus|project)\b/i.test(
    [input.value, input.description, input.citation, input.sourceContext].join(" "),
  )) {
    result.quarantineReasons.push("Facility-tariff context is not established; market or residential prices cannot activate the model.");
    return result;
  }
  if (converted.normalizedValue === 0 && definition.zeroSemantics === "explicit-source-only" && input.explicitZero !== true) {
    result.quarantineReasons.push("Zero is valid only when an exact-project source explicitly establishes zero.");
    return result;
  }
  result.validationStatus = "valid";
  result.modelEligible = definition.modelDestination !== null;
  return result;
}

assertEvidenceSemanticPolicyCoverage();