const EIA_API_BASE = "https://api.eia.gov/v2";
const REQUEST_TIMEOUT_MS = 10_000;
const PRICE_DATASET = "electricity/retail-sales/data";
const POWER_DATASET = "electricity/electric-power-operational-data/data";
const FUEL_IDS = ["ALL", "NG", "WND", "SUN", "NUC", "COL"];

let retainedResponse = null;

function monthPeriod(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthWindow(now = new Date(), count = 24) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - count + 1, 1));
  return { start: monthPeriod(start), end: monthPeriod(end) };
}

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function period(value) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function records(payload) {
  return payload && typeof payload === "object" && payload.response && typeof payload.response === "object" &&
    Array.isArray(payload.response.data) ? payload.response.data : [];
}

function unitText(record, field) {
  return String(record[`${field}-units`] ?? record[`${field}_units`] ?? record.units ?? record.unit ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizePriceRecord(record) {
  const month = period(record.period);
  const value = numeric(record.price ?? record.value);
  if (!month || value === null || value < 0) return null;
  const units = unitText(record, "price");
  const pricePerMwh = units.includes("dollarspermegawatthour") || units.includes("dollarspermwh")
    ? value
    : units.includes("centsperkilowatthour") || units.includes("centsperkwh") ? value * 10 : null;
  return pricePerMwh === null || !Number.isFinite(pricePerMwh) ? null : { period: month, pricePerMwh };
}

function normalizeFuel(value) {
  const text = String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (text === "ng" || text.includes("naturalgas") || text === "gas") return "naturalGas";
  if (text === "wnd" || text.includes("wind")) return "wind";
  if (text === "sun" || text.includes("solar") || text.includes("photovoltaic")) return "solar";
  if (text === "nuc" || text.includes("nuclear")) return "nuclear";
  if (text === "col" || text.includes("coal")) return "coal";
  if (text === "all" || text === "total" || text.includes("allfuels")) return "total";
  return null;
}

function normalizeGenerationRecord(record) {
  const month = period(record.period);
  const value = numeric(record.generation ?? record.value);
  const fuel = normalizeFuel(record.fueltypeid ?? record.fuelTypeId ?? record.fueltype ?? record.fuel);
  if (!month || value === null || value < 0 || !fuel) return null;
  const units = unitText(record, "generation");
  const generationMwh = units.includes("thousandmegawatthours")
    ? value * 1_000
    : units.includes("millionkilowatthours") ? value * 1_000
      : units.includes("megawatthours") ? value : null;
  if (generationMwh === null) return null;
  return { period: month, fuel, generationMwh };
}

function normalizeConsumptionRecord(record) {
  const month = period(record.period);
  const value = numeric(record.consumption ?? record.sales ?? record.value);
  if (!month || value === null || value < 0) return null;
  const units = unitText(record, record.sales !== undefined ? "sales" : "consumption");
  const consumptionMwh = units.includes("millionkwh") || units.includes("millionkilowatthours")
    ? value * 1_000
    : units.includes("thousandmegawatthours") ? value * 1_000
      : units.includes("megawatthours") ? value : null;
  if (consumptionMwh === null) return null;
  return { period: month, consumptionMwh };
}

function latestByMonth(items) {
  const byMonth = new Map();
  for (const item of items) byMonth.set(item.period, item);
  return [...byMonth.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export function selectMonthWindow(items, count) {
  return latestByMonth(items).slice(-count);
}

export function aggregateFuelShares(generationRecords) {
  const byMonth = new Map();
  for (const item of generationRecords) {
    if (!byMonth.has(item.period)) byMonth.set(item.period, { period: item.period, fuels: {}, total: null });
    const month = byMonth.get(item.period);
    if (item.fuel === "total") month.total = (month.total ?? 0) + item.generationMwh;
    else month.fuels[item.fuel] = (month.fuels[item.fuel] ?? 0) + item.generationMwh;
  }
  return [...byMonth.values()].sort((a, b) => a.period.localeCompare(b.period)).map((month) => {
    const fuels = { naturalGas: 0, wind: 0, solar: 0, nuclear: 0, coal: 0, other: 0, ...month.fuels };
    const namedSum = fuels.naturalGas + fuels.wind + fuels.solar + fuels.nuclear + fuels.coal;
    const denominator = month.total && month.total > 0 ? month.total : 0;
    fuels.other = Math.max(0, denominator - namedSum);
    const shares = Object.fromEntries(Object.entries(fuels).map(([fuel, value]) => [fuel, denominator > 0 ? (value / denominator) * 100 : 0]));
    return { period: month.period, generationMwh: fuels, totalMwh: denominator, shares };
  }).filter((month) => month.totalMwh > 0);
}

export function normalizeEiaUpstreamPayloads({ price, generation, consumption }) {
  const priceCalculationHistory = selectMonthWindow(records(price).map(normalizePriceRecord).filter(Boolean), 25);
  const prices = priceCalculationHistory.slice(-24);
  const mixes = aggregateFuelShares(records(generation).map(normalizeGenerationRecord).filter(Boolean)).slice(-12);
  const consumptions = selectMonthWindow(records(consumption).map(normalizeConsumptionRecord).filter(Boolean), 12);
  if (prices.length === 0) throw new Error("EIA returned no valid industrial price observations");
  if (mixes.length === 0) throw new Error("EIA returned no valid Texas generation observations");
  if (consumptions.length === 0) throw new Error("EIA returned no valid Texas consumption observations");
  const latestPrice = prices.at(-1);
  const latestMix = mixes.at(-1);
  const sourceUpdatedAt = `${latestPrice.period}-01T00:00:00.000Z`;
  return {
    priceHistory: prices,
    priceCalculationHistory,
    generationHistory: mixes,
    consumptionHistory: consumptions,
    latestPrice: latestPrice.pricePerMwh,
    latestPricePeriod: latestPrice.period,
    latestGenerationMix: latestMix,
    sourceUpdatedAt,
  };
}

function buildUrl(dataset, apiKey, data, facets, window) {
  const url = new URL(`${EIA_API_BASE}/${dataset}/`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("frequency", "monthly");
  url.searchParams.set("start", window.start);
  url.searchParams.set("end", window.end);
  data.forEach((value, index) => url.searchParams.set(`data[${index}]`, value));
  for (const [key, values] of Object.entries(facets)) {
    for (const value of values) url.searchParams.append(`facets[${key}][]`, value);
  }
  url.searchParams.set("out", "json");
  return url.toString();
}

function responseMetadata(key, response, url, requestedAt) {
  return { key, url: redactKey(url), requestedAt, status: response.status, contentType: response.headers.get("content-type"), ok: response.ok };
}

function redactKey(url) {
  return url.replace(/([?&]api_key=)[^&]+/i, "$1[redacted]");
}

async function fetchJson(key, url, fetchImpl, requestedAt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { method: "GET", headers: { accept: "application/json" }, signal: controller.signal });
    const metadata = responseMetadata(key, response, url, requestedAt);
    if (!response.ok) throw new Error(`${key} upstream returned HTTP ${response.status}`);
    if (!String(metadata.contentType ?? "").includes("json")) throw new Error(`${key} upstream returned an unexpected content type`);
    return { payload: await response.json(), metadata };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchEiaSnapshot({ apiKey = process.env.EIA_API_KEY, fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  const fetchedAt = now();
  if (!apiKey) {
    return { status: "unavailable", fetchedAt, sourceUpdatedAt: null, data: null, diagnostics: { endpoint: "/api/eia/electricity", requestTimestamp: fetchedAt, responseStatus: 503, cache: retainedResponse ? "hit" : "miss", responses: [], error: "EIA_API_KEY is not configured on the server." } };
  }
  const window25 = monthWindow(new Date(fetchedAt), 25);
  const window12 = monthWindow(new Date(fetchedAt), 12);
  const urls = {
    price: buildUrl(PRICE_DATASET, apiKey, ["price"], { stateid: ["TX"], sectorid: ["IND"] }, window25),
    generation: buildUrl(POWER_DATASET, apiKey, ["generation"], { location: ["TX"], sectorid: ["99"], fueltypeid: FUEL_IDS }, window12),
    consumption: buildUrl(PRICE_DATASET, apiKey, ["sales"], { stateid: ["TX"], sectorid: ["ALL"] }, window12),
  };
  const responses = [];
  try {
    const results = await Promise.all(Object.entries(urls).map(async ([key, url]) => {
      const result = await fetchJson(key, url, fetchImpl, fetchedAt);
      responses.push(result.metadata);
      return [key, result.payload];
    }));
    const data = normalizeEiaUpstreamPayloads(Object.fromEntries(results));
    const successful = {
      status: "live",
      fetchedAt,
      sourceUpdatedAt: data.sourceUpdatedAt,
      data,
      diagnostics: { endpoint: "/api/eia/electricity", requestTimestamp: fetchedAt, responseStatus: 200, cache: "miss", sourceFreshness: data.sourceUpdatedAt, responses },
    };
    retainedResponse = successful;
    return successful;
  } catch (error) {
    return {
      status: "error",
      fetchedAt,
      sourceUpdatedAt: null,
      data: null,
      diagnostics: { endpoint: "/api/eia/electricity", requestTimestamp: fetchedAt, responseStatus: 502, cache: retainedResponse ? "hit" : "miss", sourceFreshness: retainedResponse?.sourceUpdatedAt ?? null, responses, error: error instanceof Error ? error.message : "Unknown EIA upstream error" },
    };
  }
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export async function handleEiaElectricityRequest(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { status: "error", diagnostics: { endpoint: "/api/eia/electricity", responseStatus: 405, error: "Method not allowed" } });
    return;
  }
  const result = await fetchEiaSnapshot();
  if (result.status === "live") {
    sendJson(res, 200, result);
  } else if (retainedResponse) {
    sendJson(res, 200, { ...retainedResponse, status: "cached", diagnostics: { ...retainedResponse.diagnostics, requestTimestamp: result.fetchedAt, responseStatus: 200, cache: "hit", error: result.diagnostics.error, failedResponses: result.diagnostics.responses } });
  } else if (result.status === "unavailable") {
    sendJson(res, 200, { ...result, diagnostics: { ...result.diagnostics, responseStatus: 200 } });
  } else {
    sendJson(res, 502, result);
  }
}

export { EIA_API_BASE, PRICE_DATASET, POWER_DATASET };