const COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_BASE_URL = "https://data.sec.gov/submissions";
const ARCHIVES_BASE_URL = "https://www.sec.gov/Archives/edgar/data";
const MIN_REQUEST_INTERVAL_MS = 500;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_CANDIDATES = 20;
const DEFAULT_LOOKBACK_DAYS = 5 * 366;
const DEFAULT_FORMS = new Set([
  "8-K", "8-K/A", "10-K", "10-K/A", "10-Q", "10-Q/A",
  "20-F", "20-F/A", "40-F", "6-K", "S-1", "S-1/A", "S-3", "S-3/A",
]);

function clockMilliseconds(clock) {
  const value = clock();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value);
  return Number(value);
}

function isoTime(milliseconds) {
  return new Date(milliseconds).toISOString();
}

export function normalizeCik(value) {
  const digits = String(value ?? "").trim().replace(/^CIK\s*/i, "");
  if (!/^\d{1,10}$/.test(digits)) throw new TypeError("CIK must contain between 1 and 10 digits.");
  return digits.padStart(10, "0");
}

export function isAllowedSecUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && (hostname === "sec.gov" || hostname.endsWith(".sec.gov"));
  } catch {
    return false;
  }
}

export function buildSecArchiveUrl(cik, accessionNumber, primaryDocument) {
  const normalizedCik = normalizeCik(cik);
  const accession = String(accessionNumber ?? "").trim();
  const document = String(primaryDocument ?? "").trim();
  if (!/^\d{10}-\d{2}-\d{6}$/.test(accession)) {
    throw new TypeError("SEC accession number is malformed.");
  }
  if (!document || document.includes("/") || document.includes("\\") || document === "." || document === "..") {
    throw new TypeError("SEC primary document is malformed.");
  }
  const url = `${ARCHIVES_BASE_URL}/${Number(normalizedCik)}/${accession.replaceAll("-", "")}/${encodeURIComponent(document)}`;
  if (!isAllowedSecUrl(url)) throw new TypeError("SEC archive URL is not allowed.");
  return url;
}

function normalizedIdentity(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|llc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tickerRows(payload) {
  const rows = Array.isArray(payload) ? payload : Object.values(payload ?? {});
  if (!rows.length || rows.some((row) => !row || typeof row !== "object")) {
    throw new TypeError("SEC company ticker response is malformed.");
  }
  return rows;
}

export function resolveSecCompany(payload, { ticker, symbol, company, companyName, name } = {}) {
  const wantedTicker = String(ticker ?? symbol ?? "").trim().toUpperCase();
  const wantedCompany = normalizedIdentity(companyName ?? company ?? name);
  if (!wantedTicker && !wantedCompany) throw new TypeError("A ticker or company name is required.");
  const rows = tickerRows(payload);
  let row = wantedTicker
    ? rows.find((item) => String(item.ticker ?? "").trim().toUpperCase() === wantedTicker)
    : null;
  if (!row && wantedCompany) {
    row = rows.find((item) => normalizedIdentity(item.title) === wantedCompany)
      ?? rows.find((item) => {
        const title = normalizedIdentity(item.title);
        return title.length >= 4 && (title.includes(wantedCompany) || wantedCompany.includes(title));
      });
  }
  if (!row || row.cik_str === undefined || !row.title || !row.ticker) {
    throw new Error("No SEC company matched the supplied ticker or company name.");
  }
  return {
    cik: normalizeCik(row.cik_str),
    ticker: String(row.ticker).trim().toUpperCase().slice(0, 20),
    companyName: String(row.title).replace(/\s+/g, " ").trim().slice(0, 240),
  };
}

export function parseRetryAfter(value, nowMs) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(1_000, Math.ceil(Number(text) * 1_000));
  const target = Date.parse(text);
  if (!Number.isFinite(target)) return null;
  return Math.max(1_000, Math.ceil(target - nowMs));
}

function cacheLifetime(headers) {
  const control = headers.get("cache-control") ?? "";
  if (/(?:^|,)\s*no-store\b/i.test(control)) return null;
  const maxAge = control.match(/(?:^|,)\s*max-age\s*=\s*(\d+)/i);
  return maxAge ? Number(maxAge[1]) * 1_000 : DEFAULT_CACHE_TTL_MS;
}

function validateOptions(options) {
  const forbidden = Object.keys(options).find((key) => /(?:api.?key|token|account)/i.test(key));
  if (forbidden) throw new TypeError("SEC public data does not accept token, account, or API-key options.");
  const userAgent = String(options.userAgent ?? process.env.SEC_USER_AGENT ?? "").trim();
  if (!userAgent) throw new Error("SEC_USER_AGENT is required for SEC public-data requests.");
  if (/^(?:node|undici|mozilla)\b/i.test(userAgent)) {
    throw new Error("SEC_USER_AGENT must declare the requesting organization and contact.");
  }
  return userAgent.slice(0, 500);
}

function recentColumns(payload) {
  const recent = payload?.filings?.recent;
  const required = ["accessionNumber", "filingDate", "form", "primaryDocument"];
  if (!recent || typeof recent !== "object" || required.some((key) => !Array.isArray(recent[key]))) {
    throw new TypeError("SEC submissions response is malformed.");
  }
  const length = recent.accessionNumber.length;
  if (required.some((key) => recent[key].length !== length)) {
    throw new TypeError("SEC submissions response has inconsistent recent filing columns.");
  }
  return recent;
}

function filingCandidates(payload, companyIdentity, query, retrievedAt) {
  const recent = recentColumns(payload);
  const maximum = Math.max(1, Math.min(100, Number(query.maxCandidates) || DEFAULT_MAX_CANDIDATES));
  const forms = new Set((query.forms ?? [...DEFAULT_FORMS]).map((form) => String(form).trim().toUpperCase()));
  const endMs = Number.isFinite(Date.parse(query.endDate ?? "")) ? Date.parse(query.endDate) : Date.parse(retrievedAt);
  const startMs = Number.isFinite(Date.parse(query.startDate ?? query.since ?? ""))
    ? Date.parse(query.startDate ?? query.since)
    : endMs - DEFAULT_LOOKBACK_DAYS * 86_400_000;
  const relevantTerms = [...new Set([
    ...(Array.isArray(query.terms) ? query.terms : []),
    ...(Array.isArray(query.relevantTerms) ? query.relevantTerms : []),
    query.projectName,
  ].map(normalizedIdentity).filter((term) => term.length >= 3))];
  const candidates = [];
  for (let index = 0; index < Math.min(recent.accessionNumber.length, 500) && candidates.length < maximum; index += 1) {
    const filingDate = String(recent.filingDate[index] ?? "");
    const filingMs = Date.parse(`${filingDate}T00:00:00Z`);
    const form = String(recent.form[index] ?? "").trim().toUpperCase();
    if (!Number.isFinite(filingMs) || filingMs < startMs || filingMs > endMs || !forms.has(form)) continue;
    const metadata = normalizedIdentity([
      recent.primaryDocument[index],
      recent.primaryDocDescription?.[index],
      recent.items?.[index],
    ].filter(Boolean).join(" "));
    if (relevantTerms.length && !relevantTerms.some((term) => metadata.includes(term))) continue;
    const accessionNumber = String(recent.accessionNumber[index] ?? "").trim();
    const primaryDocument = String(recent.primaryDocument[index] ?? "").trim();
    try {
      const archiveUrl = buildSecArchiveUrl(companyIdentity.cik, accessionNumber, primaryDocument);
      candidates.push({
        cik: companyIdentity.cik,
        accession: accessionNumber,
        accessionNumber,
        form,
        filingDate,
        primaryDocument,
        archiveUrl,
        url: archiveUrl,
        retrievedAt,
      });
    } catch {
      // A malformed filing row is omitted rather than emitting a non-SEC URL.
    }
  }
  return candidates;
}

function attempt(url, values) {
  const parsed = new URL(url);
  return {
    sourceOrigin: parsed.origin,
    sourcePathname: parsed.pathname.slice(0, 500),
    ...values,
  };
}

export function createSecConnector(options = {}) {
  const userAgent = validateOptions(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const clock = options.clock ?? (() => Date.now());
  const cache = options.cache ?? new Map();
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  let queue = Promise.resolve();

  const schedule = (operation) => {
    const scheduled = queue.then(async () => {
      const current = clockMilliseconds(clock);
      if (!Number.isFinite(current)) throw new TypeError("SEC connector clock returned an invalid time.");
      const wait = Math.max(0, MIN_REQUEST_INTERVAL_MS - (current - lastRequestAt));
      if (wait > 0) await sleep(wait);
      const afterWait = clockMilliseconds(clock);
      lastRequestAt = Number.isFinite(afterWait) ? Math.max(afterWait, lastRequestAt + wait) : current + wait;
      return operation();
    });
    queue = scheduled.catch(() => {});
    return scheduled;
  };

  async function requestJson(url, attempts) {
    if (!isAllowedSecUrl(url)) throw new TypeError("Only HTTPS SEC.gov URLs are allowed.");
    const cached = cache.get(url);
    const current = clockMilliseconds(clock);
    if (cached && cached.expiresAt > current) {
      attempts.push(attempt(url, { requestedAt: isoTime(current), status: 200, outcome: "cache-hit" }));
      return { payload: cached.payload, retrievedAt: cached.retrievedAt };
    }
    for (let retry = 0; retry < 2; retry += 1) {
      const headers = { accept: "application/json", "user-agent": userAgent };
      if (cached?.etag) headers["if-none-match"] = cached.etag;
      if (cached?.lastModified) headers["if-modified-since"] = cached.lastModified;
      const requestedAtMs = clockMilliseconds(clock);
      let response;
      try {
        response = await schedule(() => fetchImpl(url, { method: "GET", headers, redirect: "error" }));
      } catch (error) {
        attempts.push(attempt(url, {
          requestedAt: isoTime(requestedAtMs),
          status: null,
          outcome: "network-error",
          error: String(error?.message ?? "SEC request failed").replace(/\s+/g, " ").slice(0, 160),
        }));
        throw error;
      }
      if (response.status === 304) {
        if (!cached) throw new Error("SEC returned 304 without a cached representation.");
        const ttl = cacheLifetime(response.headers) ?? DEFAULT_CACHE_TTL_MS;
        cached.expiresAt = clockMilliseconds(clock) + ttl;
        attempts.push(attempt(url, { requestedAt: isoTime(requestedAtMs), status: 304, outcome: "not-modified" }));
        return { payload: cached.payload, retrievedAt: cached.retrievedAt };
      }
      const retryDelay = [429, 503].includes(response.status)
        ? parseRetryAfter(response.headers.get("retry-after"), clockMilliseconds(clock))
        : null;
      if (retryDelay !== null && retry === 0) {
        attempts.push(attempt(url, { requestedAt: isoTime(requestedAtMs), status: response.status, outcome: "retry-after", retryAfterMs: retryDelay }));
        await sleep(retryDelay);
        continue;
      }
      if (!response.ok) {
        attempts.push(attempt(url, { requestedAt: isoTime(requestedAtMs), status: response.status, outcome: "http-error" }));
        throw new Error(`SEC upstream returned HTTP ${response.status}.`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!/(?:application\/json|\+json)\b/i.test(contentType)) {
        attempts.push(attempt(url, { requestedAt: isoTime(requestedAtMs), status: response.status, outcome: "malformed-content-type" }));
        throw new TypeError("SEC upstream returned a non-JSON response.");
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        attempts.push(attempt(url, { requestedAt: isoTime(requestedAtMs), status: response.status, outcome: "malformed-json" }));
        throw new TypeError("SEC upstream returned malformed JSON.");
      }
      if (!payload || typeof payload !== "object") throw new TypeError("SEC upstream returned malformed JSON.");
      const retrievedAt = isoTime(clockMilliseconds(clock));
      const ttl = cacheLifetime(response.headers);
      if (ttl !== null) {
        cache.set(url, {
          payload,
          retrievedAt,
          expiresAt: clockMilliseconds(clock) + ttl,
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
        });
      }
      attempts.push(attempt(url, { requestedAt: isoTime(requestedAtMs), status: response.status, outcome: "retrieved" }));
      return { payload, retrievedAt };
    }
    throw new Error("SEC request retry limit reached.");
  }

  async function search(query = {}) {
    const forbidden = Object.keys(query).find((key) => /(?:api.?key|token|account)/i.test(key));
    if (forbidden) throw new TypeError("SEC public data queries cannot contain token, account, or API-key concepts.");
    const attempts = [];
    const directory = await requestJson(COMPANY_TICKERS_URL, attempts);
    const companyIdentity = resolveSecCompany(directory.payload, query);
    const submissionsUrl = `${SUBMISSIONS_BASE_URL}/CIK${companyIdentity.cik}.json`;
    const submissions = await requestJson(submissionsUrl, attempts);
    return {
      candidates: filingCandidates(submissions.payload, companyIdentity, query, submissions.retrievedAt),
      attempts,
    };
  }

  return { search, cache };
}

export async function fetchSecFilings(query = {}, options = {}) {
  return createSecConnector(options).search(query);
}

export const SEC_URLS = Object.freeze({
  companyTickers: COMPANY_TICKERS_URL,
  submissionsBase: SUBMISSIONS_BASE_URL,
  archivesBase: ARCHIVES_BASE_URL,
});