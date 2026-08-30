import type { ProviderSourceMetadata } from "@/data/sources";

export const EIA_PROXY_ENDPOINT = "/api/eia/electricity";
export const EIA_ATTRIBUTION = "Electricity data: U.S. Energy Information Administration Open Data";
export const EIA_HARDCODED_RATE = 42;
export const EIA_HARDCODED_ESCALATION = 6;
export const EIA_CACHE_KEY = "safeloc:eia:electricity:v1";

export type EiaFuel = "naturalGas" | "wind" | "solar" | "nuclear" | "coal" | "other";
export type EiaTrend = "accelerating" | "decelerating" | "flat" | "unavailable";
export type EiaPricePoint = { period: string; pricePerMwh: number };
export type EiaGenerationMonth = {
  period: string;
  generationMwh: Record<EiaFuel, number>;
  totalMwh: number;
  shares: Record<EiaFuel, number>;
};
export type EiaElectricityData = {
  status: "live" | "cached" | "fallback";
  dataOrigin: "provider" | "embedded";
  fetchedAt?: string;
  sourceUpdatedAt?: string;
  priceHistory: EiaPricePoint[];
  priceCalculationHistory?: EiaPricePoint[];
  generationHistory: EiaGenerationMonth[];
  consumptionHistory: Array<{ period: string; consumptionMwh: number }>;
  latestPrice: number;
  latestPricePeriod?: string;
  latestGenerationMix?: EiaGenerationMonth;
  yoyChangePercent: number | null;
  precedingYoyChangePercent: number | null;
  trend: EiaTrend;
  sourceMetadata: ProviderSourceMetadata;
  error?: string;
};

export type EiaServiceResult = EiaElectricityData & { loading: false };

type ProxyEnvelope = {
  status?: string;
  fetchedAt?: string;
  sourceUpdatedAt?: string | null;
  data?: {
    priceHistory?: unknown;
    priceCalculationHistory?: unknown;
    generationHistory?: unknown;
    consumptionHistory?: unknown;
    latestPrice?: unknown;
    latestPricePeriod?: unknown;
    latestGenerationMix?: unknown;
  } | null;
  diagnostics?: { error?: string; sourceFreshness?: string | null };
};

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function validPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function calculateYearOverYearChange(prices: EiaPricePoint[]): number | null {
  const ordered = [...prices].sort((a, b) => a.period.localeCompare(b.period));
  if (ordered.length < 13) return null;
  const latest = ordered.at(-1)!;
  const prior = ordered.find((point) => point.period === `${Number(latest.period.slice(0, 4)) - 1}${latest.period.slice(4)}`);
  if (!prior || prior.pricePerMwh === 0) return null;
  return ((latest.pricePerMwh - prior.pricePerMwh) / prior.pricePerMwh) * 100;
}

export function calculateAcceleration(prices: EiaPricePoint[]): { latest: number | null; preceding: number | null; trend: EiaTrend } {
  const ordered = [...prices].sort((a, b) => a.period.localeCompare(b.period));
  if (ordered.length < 25) {
    const latest = calculateYearOverYearChange(ordered);
    return { latest, preceding: null, trend: "unavailable" };
  }
  const window = ordered.slice(-25);
  const latest = calculateYearOverYearChange(window);
  const preceding = calculateYearOverYearChange(window.slice(0, 13));
  if (latest === null || preceding === null) return { latest, preceding, trend: "unavailable" };
  const tolerance = 0.05;
  return { latest, preceding, trend: latest - preceding > tolerance ? "accelerating" : preceding - latest > tolerance ? "decelerating" : "flat" };
}

function normalizePriceHistory(value: unknown, limit = 24): EiaPricePoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((point) => {
    const record = point as Record<string, unknown>;
    const period = validPeriod(record.period) ? record.period : null;
    const pricePerMwh = number(record.pricePerMwh);
    return period && pricePerMwh !== null && pricePerMwh >= 0 ? { period, pricePerMwh } : null;
  }).filter((point): point is EiaPricePoint => point !== null).sort((a, b) => a.period.localeCompare(b.period)).slice(-limit);
}

function normalizeMixHistory(value: unknown): EiaGenerationMonth[] {
  if (!Array.isArray(value)) return [];
  return value.map((month) => {
    const record = month as Record<string, unknown>;
    const fuels = record.generationMwh as Record<string, unknown> | undefined;
    const shares = record.shares as Record<string, unknown> | undefined;
    const period = validPeriod(record.period) ? record.period : null;
    const totalMwh = number(record.totalMwh);
    if (!period || !fuels || !shares || totalMwh === null || totalMwh <= 0) return null;
    const generationMwh = {
      naturalGas: number(fuels.naturalGas) ?? 0,
      wind: number(fuels.wind) ?? 0,
      solar: number(fuels.solar) ?? 0,
      nuclear: number(fuels.nuclear) ?? 0,
      coal: number(fuels.coal) ?? 0,
      other: number(fuels.other) ?? 0,
    };
    const normalizedShares = {
      naturalGas: number(shares.naturalGas) ?? 0,
      wind: number(shares.wind) ?? 0,
      solar: number(shares.solar) ?? 0,
      nuclear: number(shares.nuclear) ?? 0,
      coal: number(shares.coal) ?? 0,
      other: number(shares.other) ?? 0,
    };
    return { period, generationMwh, totalMwh, shares: normalizedShares };
  }).filter((month): month is EiaGenerationMonth => month !== null).sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
}

function normalizeConsumptionHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((point) => {
    const record = point as Record<string, unknown>;
    const period = validPeriod(record.period) ? record.period : null;
    const consumptionMwh = number(record.consumptionMwh);
    return period && consumptionMwh !== null && consumptionMwh >= 0 ? { period, consumptionMwh } : null;
  }).filter((point): point is { period: string; consumptionMwh: number } => point !== null).sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
}

export function normalizeEiaEnvelope(envelope: unknown): EiaElectricityData | null {
  if (!envelope || typeof envelope !== "object") return null;
  const payload = envelope as ProxyEnvelope;
  const priceHistory = normalizePriceHistory(payload.data?.priceHistory);
  const priceCalculationHistory = normalizePriceHistory(payload.data?.priceCalculationHistory, 25);
  const generationHistory = normalizeMixHistory(payload.data?.generationHistory);
  const consumptionHistory = normalizeConsumptionHistory(payload.data?.consumptionHistory);
  const latestPrice = number(payload.data?.latestPrice) ?? priceHistory.at(-1)?.pricePerMwh;
  const sourceUpdatedAt = validTimestamp(payload.sourceUpdatedAt) ? payload.sourceUpdatedAt : null;
  const providerStatus = payload.status === "cached" ? "cached" : payload.status === "live" ? "live" : null;
  if (!providerStatus || latestPrice === undefined || latestPrice === null || priceHistory.length === 0 || generationHistory.length === 0 || consumptionHistory.length === 0 || !sourceUpdatedAt) return null;
  const acceleration = calculateAcceleration(priceCalculationHistory.length ? priceCalculationHistory : priceHistory);
  const sourceMetadata: ProviderSourceMetadata = { status: providerStatus, dataOrigin: "provider", timestamp: sourceUpdatedAt };
  return {
    status: providerStatus,
    dataOrigin: "provider",
    fetchedAt: validTimestamp(payload.fetchedAt) ? payload.fetchedAt : undefined,
    sourceUpdatedAt,
    priceHistory,
    priceCalculationHistory: priceCalculationHistory.length ? priceCalculationHistory : undefined,
    generationHistory,
    consumptionHistory,
    latestPrice,
    latestPricePeriod: validPeriod(payload.data?.latestPricePeriod) ? payload.data!.latestPricePeriod as string : priceHistory.at(-1)?.period,
    latestGenerationMix: generationHistory.at(-1),
    yoyChangePercent: acceleration.latest,
    precedingYoyChangePercent: acceleration.preceding,
    trend: acceleration.trend,
    sourceMetadata,
    error: payload.diagnostics?.error,
  };
}

function fallback(error?: string): EiaElectricityData {
  return {
    status: "fallback",
    dataOrigin: "embedded",
    priceHistory: [],
    generationHistory: [],
    consumptionHistory: [],
    latestPrice: EIA_HARDCODED_RATE,
    yoyChangePercent: EIA_HARDCODED_ESCALATION,
    precedingYoyChangePercent: null,
    trend: "unavailable",
    sourceMetadata: { status: "embedded", dataOrigin: "embedded", version: "Bundled case baseline" },
    error,
  };
}

function readCache(): EiaElectricityData | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(EIA_CACHE_KEY) ?? "null");
    const normalized = normalizeEiaEnvelope({ status: value && typeof value === "object" ? (value as { status?: string }).status : undefined, data: value, sourceUpdatedAt: value && typeof value === "object" ? (value as { sourceUpdatedAt?: string }).sourceUpdatedAt : undefined });
    return normalized ? { ...normalized, status: "cached", sourceMetadata: { ...normalized.sourceMetadata, status: "cached" } } : null;
  } catch {
    return null;
  }
}

function writeCache(data: EiaElectricityData) {
  if (typeof window === "undefined" || data.dataOrigin !== "provider") return;
  try {
    window.localStorage.setItem(EIA_CACHE_KEY, JSON.stringify(data));
  } catch {
    // A disabled or full browser cache must not block the workbench.
  }
}

export async function fetchEiaElectricity(fetchImpl: typeof fetch = fetch): Promise<EiaElectricityData> {
  try {
    const response = await fetchImpl(EIA_PROXY_ENDPOINT, { headers: { accept: "application/json" } });
    const body: unknown = await response.json();
    const normalized = normalizeEiaEnvelope(body);
    if (response.ok && normalized) {
      writeCache(normalized);
      return normalized;
    }
    const cached = readCache();
    return cached ? { ...cached, error: (body as ProxyEnvelope)?.diagnostics?.error } : fallback((body as ProxyEnvelope)?.diagnostics?.error ?? `EIA proxy returned HTTP ${response.status}`);
  } catch (error) {
    const cached = readCache();
    return cached ? { ...cached, error: error instanceof Error ? error.message : "EIA request failed" } : fallback(error instanceof Error ? error.message : "EIA request failed");
  }
}

export function getEiaModelInputs(data: Pick<EiaElectricityData, "latestPrice" | "yoyChangePercent" | "dataOrigin">) {
  return data.dataOrigin === "provider" && Number.isFinite(data.latestPrice)
    ? { electricityRate: data.latestPrice, electricityEscalationRate: data.yoyChangePercent ?? EIA_HARDCODED_ESCALATION }
    : { electricityRate: EIA_HARDCODED_RATE, electricityEscalationRate: EIA_HARDCODED_ESCALATION };
}

export { fallback as createEiaFallback };