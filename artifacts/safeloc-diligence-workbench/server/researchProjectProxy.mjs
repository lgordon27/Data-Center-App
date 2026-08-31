const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const RESEARCH_PROJECT_MODEL = "gpt-4o";
const RESEARCH_PROJECT_MAX_TOKENS = 5_000;
const RESEARCH_PROJECT_TIMEOUT_MS = 45_000;
const DEFAULT_RESEARCH_CAPACITY_MW = 1_200;
const RESEARCH_PROJECT_REQUEST_LIMIT = 10;
const RESEARCH_PROJECT_REQUEST_WINDOW_MS = 60_000;
const RESEARCH_PROJECT_RATE_LIMIT_MESSAGE =
  "Custom research request limit reached. Please wait before trying again or use the curated case.";

const RESEARCH_EVIDENCE_IDS = [
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
];

const VALID_CLASSIFICATIONS = [
  "Verified Evidence",
  "Management Assertion",
  "Model Inference",
  "User Assumption",
  "Missing Evidence",
];

const RESEARCH_PROJECT_SYSTEM_PROMPT = `You are a careful infrastructure diligence researcher. Research the named data-center project and location using current, attributable public sources. Separate facility-level evidence from market, regional, or industry context. Independent public records or reporting are Verified Evidence; dated company announcements, filings, or disclosures with limited independent confirmation are Management Assertion; analyst-derived estimates from related facts are Model Inference; synthetic analyst-selected values are User Assumption; and a fact not established in the searched public record is Missing Evidence.

SafeLoc models exactly 16 evidence variables: electricity_cost, water_consumption, grid_interconnection, water_escalation, community_risk, renewable_percentage, cooling_capex, electricity_escalation, carbon_compliance, permitting_timeline, customer_concentration, water_rights, site_hazard_exposure, backup_power_capacity, water_source_resilience, and downtime_cost. Return exactly one record for each identifier, no additional records, and preserve those identifiers exactly.

The projectSummary.description must explicitly report relevant findings, when available, about electrical-equipment procurement and lead times, jurisdictional bans or moratoriums, noise ordinances and operational impacts, local electricity-rate concerns, and semiconductor and memory supply-chain constraints. It must also identify speculative or phantom grid-load requests when that context is relevant. These are contextual research areas, not additional modeled evidence inputs: do not add them to the evidence array, assign them evidence classifications, or imply that market-wide statistics prove facility-level facts.

Respond with one JSON object with exactly two top-level fields: projectSummary and evidence. projectSummary must contain name, location, description, and capacityMW. evidence must contain exactly 16 records with id, label, value, unit, classification, citation, description, and sourceRole. sourceUrl is optional: when a cited source in the retrieved packet directly supports the finding, return that source's exact URL; never invent or return a URL that is not in the packet. The server will attach the validated source title, publisher, publication date, access date, and access constraint from the retrieved packet. A source URL is a research aid only and never facility-level proof by itself. numericValue is optional for numeric model inputs; qualitativeValue is optional and may only be low, moderate, high, single-source, or diversified. Use concise plain language. Do not include markdown, commentary, or any other top-level fields.`;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

const RETRIEVED_SOURCE_BOUNDARY_PROMPT = `
Use only the retrieved source packet supplied in the user message. Never invent a source, URL, date, excerpt, or facility-level fact. For every non-Missing Evidence record, citation must contain the exact URL of a source in that packet. If a fact has no supporting packet source, classify it as Missing Evidence. Do not classify contextual market or industry reporting as facility-level Verified Evidence.`;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value, field, maxLength = 4_000) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Research field "${field}" must be a non-empty string.`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new Error(`Research field "${field}" is too long.`);
  }
  return result;
}

function safePublicSourceUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function parseResearchProjectBody(body) {
  if (!isRecord(body)) throw new Error("Research project body must be a JSON object.");
  const name = body.name ?? body.projectName;
  return {
    name: nonEmptyString(name, "name", 160),
    location: nonEmptyString(body.location, "location", 160),
  };
}

function normalizeCapacityMW(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(value, 100_000)
    : DEFAULT_RESEARCH_CAPACITY_MW;
}

function parseResearchResponse(body, retrievedSources = [], accessedAt = new Date().toISOString().slice(0, 10)) {
  if (!isRecord(body) || !isRecord(body.projectSummary) || !Array.isArray(body.evidence)) {
    throw new Error("Research response must include projectSummary and evidence.");
  }

  const summary = body.projectSummary;
  const summaryFields = {
    name: nonEmptyString(summary.name, "projectSummary.name", 160),
    location: nonEmptyString(summary.location, "projectSummary.location", 160),
    description: nonEmptyString(summary.description, "projectSummary.description", 8_000),
    capacityMW: DEFAULT_RESEARCH_CAPACITY_MW,
  };

  if (body.evidence.length !== RESEARCH_EVIDENCE_IDS.length) {
    throw new Error("Research response must contain exactly 16 evidence records.");
  }

  const expectedIds = new Set(RESEARCH_EVIDENCE_IDS);
  const sourceByUrl = new Map(
    retrievedSources
      .map((source) => [safePublicSourceUrl(source.url), source])
      .filter(([url]) => Boolean(url)),
  );
  const seenIds = new Set();
  const evidence = body.evidence.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Research evidence record ${index + 1} is invalid.`);
    const id = nonEmptyString(item.id, `evidence[${index}].id`, 80);
    if (!expectedIds.has(id) || seenIds.has(id)) {
      throw new Error("Research response must contain each modeled evidence identifier exactly once.");
    }
    seenIds.add(id);
    const citation = nonEmptyString(item.citation, `evidence[${index}].citation`, 2_000);
    const citedUrl = safePublicSourceUrl(
      citation.match(/https?:\/\/[^\s)]+/)?.[0]?.replace(/[.,;]+$/, ""),
    );
    const returnedSourceUrl = safePublicSourceUrl(item.sourceUrl);
    const sourceUrl = [returnedSourceUrl, citedUrl].find((url) => url && sourceByUrl.has(url)) ?? null;
    const supportedByRetrievedSource = Boolean(sourceUrl);
    const record = {
      id,
      label: nonEmptyString(item.label, `evidence[${index}].label`, 160),
      value: typeof item.value === "number" && Number.isFinite(item.value)
        ? item.value
        : nonEmptyString(item.value, `evidence[${index}].value`, 1_000),
      unit: nonEmptyString(item.unit, `evidence[${index}].unit`, 100),
      classification: supportedByRetrievedSource ? nonEmptyString(item.classification, `evidence[${index}].classification`, 60) : "Missing Evidence",
      citation: supportedByRetrievedSource ? citation : `No supporting retrieved source for this claim. ${citation}`,
      description: nonEmptyString(item.description, `evidence[${index}].description`, 2_000),
      sourceRole: nonEmptyString(item.sourceRole, `evidence[${index}].sourceRole`, 200),
    };
    if (sourceUrl) {
      const metadata = sourceByUrl.get(sourceUrl);
      const publishedAt = normalizePublicDate(metadata?.date);
      record.sourceUrl = sourceUrl;
      record.sourceTitle = typeof metadata?.title === "string" && metadata.title.trim()
        ? metadata.title.trim().slice(0, 500)
        : "not provided";
      record.sourcePublisher = new URL(sourceUrl).hostname.replace(/^www\./, "");
      record.sourcePublishedAt = publishedAt;
      record.sourceAccessedAt = normalizePublicDate(accessedAt);
      record.sourceAccessStatus = metadata?.accessStatus === "open" || metadata?.accessStatus === "paywall" || metadata?.accessStatus === "registration"
        ? metadata.accessStatus
        : "not provided";
    }
    if (!VALID_CLASSIFICATIONS.includes(record.classification)) {
      throw new Error(`Research evidence record ${id} has an invalid classification.`);
    }
    if (supportedByRetrievedSource && item.numericValue !== undefined) {
      if (typeof item.numericValue !== "number" || !Number.isFinite(item.numericValue)) {
        throw new Error(`Research evidence record ${id} has an invalid numericValue.`);
      }
      record.numericValue = item.numericValue;
    }
    if (supportedByRetrievedSource && item.qualitativeValue !== undefined) {
      if (!["low", "moderate", "high", "single-source", "diversified"].includes(item.qualitativeValue)) {
        throw new Error(`Research evidence record ${id} has an invalid qualitativeValue.`);
      }
      record.qualitativeValue = item.qualitativeValue;
    }
    return record;
  });

  return { projectSummary: summaryFields, evidence };
}

function normalizePublicDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
  if (!match || !Number.isFinite(Date.parse(`${match[0]}T00:00:00.000Z`))) return null;
  return match[0];
}

function buildResearchProjectPrompt({ name, location }, retrievedSources = []) {
  const sourcePacket = retrievedSources.map(({ url, title, date, excerpt }) => ({ url, title, date, excerpt }));
  return `Analyze this data-center project using only the retrieved sources below: ${name}. Location: ${location}. Preserve exact source URLs in citations, distinguish facility-level findings from regional context, and return the exact JSON contract from the system instruction.

Retrieved source packet:
${JSON.stringify(sourcePacket)}`;
}

function normalizeRetrievedSources(body) {
  const candidates = [];
  for (const output of Array.isArray(body?.output) ? body.output : []) {
    if (output?.type === "web_search_call" && Array.isArray(output.action?.sources)) {
      candidates.push(...output.action.sources);
    }
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        if (annotation?.type === "url_citation") candidates.push(annotation);
      }
    }
  }
  const seen = new Set();
  return candidates
    .map((source) => ({
      url: safePublicSourceUrl(source.url) ?? "",
      title: typeof source.title === "string" ? source.title.trim() : "Retrieved public source",
      date: typeof source.published_date === "string" ? source.published_date : typeof source.date === "string" ? source.date : null,
      excerpt: typeof source.snippet === "string" ? source.snippet.trim() : typeof source.excerpt === "string" ? source.excerpt.trim() : "",
      accessStatus: ["open", "paywall", "registration"].includes(source.access_status) ? source.access_status : "not provided",
    }))
    .filter((source) => {
      if (!/^https?:\/\//i.test(source.url) || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .slice(0, 8);
}

async function retrievePublicSources(project, apiKey, fetchImpl, signal) {
  const response = await fetchImpl(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: RESEARCH_PROJECT_MODEL,
      tools: [{ type: "web_search_preview" }],
      input: `Find current public sources about the data-center project ${project.name} in ${project.location}. Prioritize project-specific permits, utility filings, company disclosures, local ordinances, and reputable reporting. Return source URLs, dates, titles, and short excerpts for the next research step.`,
      max_output_tokens: 1_800,
      include: ["web_search_call.action.sources"],
    }),
    signal,
  });
  if (!response.ok) throw new Error("Source retrieval failed.");
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw new Error("Source retrieval returned invalid data.");
  }
  const sources = normalizeRetrievedSources(body);
  if (sources.length === 0) throw new Error("Source retrieval returned no usable sources.");
  return sources;
}

async function readRequestBody(req) {
  if (req.body !== undefined) return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function requestClientKey(req) {
  if (typeof req?.ip === "string" && req.ip.trim()) return req.ip.trim();
  if (typeof req?.socket?.remoteAddress === "string" && req.socket.remoteAddress.trim()) {
    return req.socket.remoteAddress.trim();
  }
  return "unknown";
}

function createResearchProjectRateLimiter({
  limit = RESEARCH_PROJECT_REQUEST_LIMIT,
  windowMs = RESEARCH_PROJECT_REQUEST_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  const requestTimesByClient = new Map();
  return {
    allow(req) {
      const currentTime = now();
      const clientKey = requestClientKey(req);
      for (const [key, requestTimes] of requestTimesByClient) {
        if (requestTimes.every((requestTime) => currentTime - requestTime >= windowMs)) {
          requestTimesByClient.delete(key);
        }
      }
      const recentRequests = (requestTimesByClient.get(clientKey) ?? []).filter(
        (requestTime) => currentTime - requestTime < windowMs,
      );
      if (recentRequests.length >= limit) {
        requestTimesByClient.set(clientKey, recentRequests);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((recentRequests[0] + windowMs - currentTime) / 1000)),
        };
      }
      recentRequests.push(currentTime);
      requestTimesByClient.set(clientKey, recentRequests);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

const defaultRateLimiter = createResearchProjectRateLimiter();

export async function handleResearchProjectRequest(
  req,
  res,
  {
    apiKey = process.env.OPENAI_API_KEY,
    fetchImpl = fetch,
    rateLimiter = defaultRateLimiter,
  } = {},
) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let project;
  try {
    project = parseResearchProjectBody(await readRequestBody(req));
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid research project request." });
    return;
  }

  if (!apiKey) {
    sendJson(res, 503, { error: "Project research not configured. Set OPENAI_API_KEY in environment." });
    return;
  }

  const rateLimit = rateLimiter.allow(req);
  if (!rateLimit.allowed) {
    res.setHeader("retry-after", String(rateLimit.retryAfterSeconds));
    sendJson(res, 429, { error: RESEARCH_PROJECT_RATE_LIMIT_MESSAGE });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_PROJECT_TIMEOUT_MS);
  try {
    const retrievedSources = await retrievePublicSources(project, apiKey, fetchImpl, controller.signal);
    const response = await fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: RESEARCH_PROJECT_MODEL,
        max_tokens: RESEARCH_PROJECT_MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${RESEARCH_PROJECT_SYSTEM_PROMPT}${RETRIEVED_SOURCE_BOUNDARY_PROMPT}` },
          { role: "user", content: buildResearchProjectPrompt(project, retrievedSources) },
        ],
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let body;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = null;
    }
    if (!response.ok) {
      sendJson(res, 502, { error: "Project research unavailable. Please try again or use the curated case." });
      return;
    }

    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      sendJson(res, 502, { error: "Project research returned an invalid structured response." });
      return;
    }
    let parsed;
    try {
      parsed = parseResearchResponse(JSON.parse(content), retrievedSources);
    } catch {
      sendJson(res, 502, { error: "Project research returned an invalid 16-item response." });
      return;
    }
    sendJson(res, 200, parsed);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      sendJson(res, 504, { error: "Project research upstream request timed out." });
    } else {
      sendJson(res, 502, { error: "Project research upstream request failed." });
    }
  } finally {
    clearTimeout(timeout);
  }
}

export {
  DEFAULT_RESEARCH_CAPACITY_MW,
  OPENAI_CHAT_COMPLETIONS_URL,
  OPENAI_RESPONSES_URL,
  RESEARCH_EVIDENCE_IDS,
  RESEARCH_PROJECT_MAX_TOKENS,
  RESEARCH_PROJECT_MODEL,
  RESEARCH_PROJECT_SYSTEM_PROMPT,
  RESEARCH_PROJECT_TIMEOUT_MS,
  buildResearchProjectPrompt,
  normalizeCapacityMW,
  parseResearchProjectBody,
  parseResearchResponse,
  normalizeRetrievedSources,
  normalizePublicDate,
  safePublicSourceUrl,
  retrievePublicSources,
  createResearchProjectRateLimiter,
};