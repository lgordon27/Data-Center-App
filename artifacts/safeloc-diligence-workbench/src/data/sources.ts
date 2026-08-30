import type { Classification } from "@/model/cashFlowEngine";

export const SOURCE_IDS = [
  "fema-nri",
  "ercot-queue",
  "eia",
  "gridtracker-mcp",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];
export type SourceStatus = "embedded" | "live" | "cached" | "connected" | "disconnected";
export type SourceDataOrigin = "embedded" | "provider";

export type SourceDefinition = {
  id: SourceId;
  shortName: string;
  fullName: string;
  description: string;
  role: string;
  icon: "fema" | "ercot" | "eia" | "gridtracker";
  supportedStatuses: readonly SourceStatus[];
  fallbackText: string;
  statusMeaning: string;
};

export type ProviderSourceMetadata = {
  status: SourceStatus;
  dataOrigin?: SourceDataOrigin;
  timestamp?: string;
  version?: string;
};

export type ProviderSourceBoundary = {
  live?: ProviderSourceMetadata | null;
  cached?: ProviderSourceMetadata | null;
};

export type SourceState = SourceDefinition & ProviderSourceMetadata;

export const SOURCE_FALLBACK_EXPLANATION =
  "All external feeds automatically fall back to cached values during an unavailable live demonstration.";

export const sourceDefinitions: readonly SourceDefinition[] = [
  {
    id: "fema-nri",
    shortName: "FEMA NRI",
    fullName: "FEMA National Risk Index v1.20",
    description: "Hazard exposure context for the modeled site.",
    role: "Embedded hazard profile",
    icon: "fema",
    supportedStatuses: ["embedded"],
    fallbackText: "This proof-of-concept includes the FEMA NRI v1.20 profile as embedded case context.",
    statusMeaning: "Embedded means the versioned profile ships with this client and is not a live query.",
  },
  {
    id: "ercot-queue",
    shortName: "ERCOTQueue",
    fullName: "ERCOTQueue.com",
    description: "Grid interconnection queue and timing context.",
    role: "Interconnection evidence",
    icon: "ercot",
    supportedStatuses: ["embedded", "live", "cached"],
    fallbackText: "The latest available queue response is retained when a live demonstration is unavailable.",
    statusMeaning: "Embedded means bundled case context; Live means returned by the provider; Cached means a retained provider response.",
  },
  {
    id: "eia",
    shortName: "EIA",
    fullName: "U.S. Energy Information Administration Open Data",
    description: "Electricity market and price context.",
    role: "Electricity-cost evidence",
    icon: "eia",
    supportedStatuses: ["embedded", "live", "cached"],
    fallbackText: "The latest available electricity data is retained when a live demonstration is unavailable.",
    statusMeaning: "Embedded means a bundled estimate; Live means returned by the provider; Cached means a retained provider response.",
  },
  {
    id: "gridtracker-mcp",
    shortName: "GridTracker MCP",
    fullName: "GridTracker MCP",
    description: "Grid intelligence and query context.",
    role: "Grid intelligence",
    icon: "gridtracker",
    supportedStatuses: ["connected", "disconnected"],
    fallbackText: "No live GridTracker query is claimed until a connection reports one.",
    statusMeaning: "Connected means a provider connection is available; Disconnected means no live query is available.",
  },
];

export const DEFAULT_SOURCE_STATES: readonly SourceState[] = sourceDefinitions.map((definition) => ({
  ...definition,
  status: definition.id === "fema-nri"
    ? "embedded"
    : definition.id === "gridtracker-mcp"
      ? "disconnected"
      : "embedded",
  dataOrigin: "embedded",
  version: definition.id === "fema-nri"
    ? "v1.20"
    : definition.id === "gridtracker-mcp"
      ? undefined
      : "Bundled case baseline",
}));

export function sourceStateMap(
  overrides: Partial<Record<SourceId, ProviderSourceMetadata | ProviderSourceBoundary>> = {},
): Record<SourceId, SourceState> {
  return Object.fromEntries(
    DEFAULT_SOURCE_STATES.map((source) => {
      const override = overrides[source.id];
      return [source.id, resolveSourceState(source, override)];
    }),
  ) as Record<SourceId, SourceState>;
}

export function resolveSourceState(
  source: SourceState,
  boundary?: ProviderSourceMetadata | ProviderSourceBoundary,
): SourceState {
  if (!boundary || source.id === "fema-nri") return source;
  if ("status" in boundary) return mergeValidProviderMetadata(source, boundary);
  const live = boundary.live
    ? mergeValidProviderMetadata(source, boundary.live)
    : source;
  if (live.status === "live" || live.status === "connected") return live;
  const cached = boundary.cached
    ? mergeValidProviderMetadata(source, boundary.cached)
    : source;
  return cached.status === "cached" ? cached : source;
}

function mergeValidProviderMetadata(
  source: SourceState,
  override: ProviderSourceMetadata,
): SourceState {
  const validStatus = source.supportedStatuses.includes(override.status);
  const providerState = override.status === "live" || override.status === "cached" || override.status === "connected";
  const timestampRequired = override.status === "live" || override.status === "cached";
  const validTimestamp = !timestampRequired || (
    typeof override.timestamp === "string" &&
    Number.isFinite(Date.parse(override.timestamp))
  );
  const validOrigin = !providerState || override.dataOrigin === "provider";
  return validStatus && validTimestamp && validOrigin
    ? { ...source, ...override }
    : source;
}

export function formatSourceTimestamp(timestamp?: string): string {
  if (!timestamp) return "Timestamp unavailable";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function sourceStatusLabel(source: Pick<SourceState, "status">): string {
  return source.status.charAt(0).toUpperCase() + source.status.slice(1);
}

export function formatElectricityCostAttribution(rate: number, source: SourceState): string {
  const formattedRate = `$${rate.toFixed(rate % 1 === 0 ? 0 : 1)}/MWh`;
  if (source.id === "eia" && source.status === "live" && source.dataOrigin === "provider" && source.timestamp) {
    return `Electricity cost: ${formattedRate} (EIA live data, ${formatSourceTimestamp(source.timestamp)})`;
  }
  return `Electricity cost: ${formattedRate} (embedded estimate)`;
}

export const evidenceTiers: Array<{
  name: Classification;
  color: string;
  background: string;
  border: string;
  definition: string;
  analogy: string;
}> = [
  {
    name: "Verified Evidence",
    color: "#0b7a63",
    background: "#e0f4ed",
    border: "#9bd8c5",
    definition: "A public record or dependable source directly supports the input.",
    analogy: "Like a bank statement, not someone's word.",
  },
  {
    name: "Management Assertion",
    color: "#8a6400",
    background: "#fff6c7",
    border: "#e6cf70",
    definition: "The project or its representatives say it is true, but independent proof is limited.",
    analogy: "Like a resume, not a background check.",
  },
  {
    name: "Model Inference",
    color: "#255bb7",
    background: "#e5efff",
    border: "#aac6f4",
    definition: "The tool derives a reasonable estimate from related public facts.",
    analogy: "Like estimating tomorrow's weather from today's barometric pressure.",
  },
  {
    name: "User Assumption",
    color: "#a65a00",
    background: "#fff0d6",
    border: "#f1cb8b",
    definition: "An analyst-selected value is used because the project-specific fact is not established.",
    analogy: "Like a doctor's estimate before running tests.",
  },
  {
    name: "Missing Evidence",
    color: "#ba2f45",
    background: "#fde8eb",
    border: "#efabb8",
    definition: "The information needed to support an input has not been found or disclosed.",
    analogy: "Like a blank on a loan application.",
  },
];
export const sourceGroups = [
  {
    title: "Infrastructure & Energy",
    sources: ["ERCOT", "Utility filings", "Bloomberg", "U.S. Energy Information Administration (EIA)"],
  },
  {
    title: "Water & Climate",
    sources: ["Ceres", "FEMA National Risk Index", "NOAA climate records", "Texas Water Development Board"],
  },
  {
    title: "Community & Social",
    sources: ["U.S. Census Bureau", "NAACP", "Data Center Watch"],
  },
  {
    title: "Regulatory",
    sources: ["EU AI Act", "FINRA", "Governor Abbott directive"],
  },
  {
    title: "Market & Investment",
    sources: ["Formative / FactSet", "Morningstar", "MSCI", "Gallup / Edward Jones"],
  },
] as const;
