const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const RESEARCH_PROJECT_MODEL = "gpt-4o";
const RESEARCH_PROJECT_MAX_TOKENS = 8_192;
const RESEARCH_PROJECT_TIMEOUT_MS = 60_000;
const DEFAULT_RESEARCH_CAPACITY_MW = 1_200;
const MAX_RESEARCH_CAPACITY_MW = 10_000;
const RESEARCH_PROJECT_REQUEST_LIMIT = 10;
const RESEARCH_PROJECT_REQUEST_WINDOW_MS = 60_000;
const RESEARCH_SEARCH_TIMEOUT_MS = 20_000;
const TARGETED_FOLLOW_UP_START_BUDGET_MS = 45_000;
const RESEARCH_PROJECT_RATE_LIMIT_MESSAGE =
  "Custom research request limit reached. Please wait before trying again or use the curated case.";
const MAX_RETRIEVED_SOURCES = 40;
const RESEARCH_SEARCH_DOMAINS = [
  { id: "project-general", label: "General project identity", query: ({ name, location }) => `"${name}" "${location}"` },
  { id: "industry-context", label: "Data-center industry context", query: ({ name }) => `"${name}" data center` },
  { id: "operator-location", label: "Operator-specific project records", query: ({ name, location, operator }) => `"${operator ?? name}" data center "${location}"` },
  { id: "sec-filings", label: "SEC filings and investor disclosures", query: ({ name }) => `"${name}" SEC filing` },
  { id: "press-releases", label: "Project and company press releases", query: ({ name }) => `"${name}" press release announcement` },
  { id: "operator-infrastructure", label: "Operator power and water infrastructure", query: ({ name, location, operator }) => `"${operator ?? name}" power water infrastructure "${location}"` },
  { id: "community-zoning", label: "Community and zoning records", query: ({ name }) => `"${name}" community opposition zoning` },
  { id: "grid-interconnection", label: "Grid and interconnection records", query: ({ name, location }) => `"${location}" data center ERCOT interconnection "${name}"` },
  { id: "environmental-water", label: "Environmental and water records", query: ({ name }) => `"${name}" environmental water` },
  { id: "technical-capacity", label: "Technical specifications and capacity", query: ({ name, location, operator }) => `"${operator ?? name}" "${location}" MW capacity "${name}"` },
];
const TARGETED_EVIDENCE_TERMS = {
  electricity_cost: "electricity rate tariff power cost",
  water_consumption: "water consumption cooling gallons",
  grid_interconnection: "grid interconnection ERCOT behind the meter",
  water_escalation: "water rate escalation utility",
  community_risk: "community opposition infrastructure zoning noise",
  renewable_percentage: "renewable energy procurement percentage",
  cooling_capex: "cooling infrastructure capital cost",
  electricity_escalation: "electricity price escalation forecast",
  carbon_compliance: "carbon emissions compliance cost",
  permitting_timeline: "permit construction timeline zoning",
  customer_concentration: "customer lease offtake agreement",
  water_rights: "water rights allocation permit",
  site_hazard_exposure: "site flood wildfire severe weather hazard",
  backup_power_capacity: "backup power generation capacity",
  water_source_resilience: "water source resilience backup supply",
  downtime_cost: "outage downtime operating cost",
};

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

const RESEARCH_EVIDENCE_RECORD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string", minLength: 1 },
    value: { anyOf: [{ type: "number" }, { type: "string", minLength: 1 }] },
    unit: { type: "string", minLength: 1 },
    classification: { type: "string", enum: VALID_CLASSIFICATIONS },
    citation: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    sourceRole: { type: "string", minLength: 1 },
    sourceUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    sourceUrls: { type: "array", items: { type: "string" }, maxItems: 4 },
    conflictSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
    coverageStatus: { type: "string", enum: ["supported", "searched-no-support", "partial", "conflicting"] },
    numericValue: { anyOf: [{ type: "number" }, { type: "null" }] },
    qualitativeValue: {
      anyOf: [
        { type: "string", enum: ["low", "moderate", "high", "single-source", "diversified"] },
        { type: "null" },
      ],
    },
  },
  required: [
    "label",
    "value",
    "unit",
    "classification",
    "citation",
    "description",
    "sourceRole",
    "sourceUrl",
    "sourceUrls",
    "conflictSummary",
    "coverageStatus",
    "numericValue",
    "qualitativeValue",
  ],
};

const RESEARCH_PROJECT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectSummary: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1 },
        location: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
        capacityMW: { anyOf: [{ type: "number" }, { type: "null" }] },
        capacityProvenance: { type: "string", enum: ["ai-reported", "directory-reported", "standardized-default"] },
      },
      required: ["name", "location", "description", "capacityMW", "capacityProvenance"],
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        RESEARCH_EVIDENCE_IDS.map((id) => [id, RESEARCH_EVIDENCE_RECORD_SCHEMA]),
      ),
      required: RESEARCH_EVIDENCE_IDS,
    },
  },
  required: ["projectSummary", "evidence"],
};

const RESEARCH_PROJECT_SYSTEM_PROMPT = `You are a careful infrastructure diligence researcher. Research the named data-center project and location using current, attributable public sources. Separate facility-level evidence from market, regional, or industry context. If you find public reporting confirming a data point, classify it as Management Assertion when it comes from company sources, or Verified Evidence when it comes from independent regulatory filings, government data, or independent reporting. Only classify as Missing Evidence if you genuinely cannot find any public information about that variable. Do not default to Missing Evidence as a conservative choice. Independent public records or reporting are Verified Evidence; dated company announcements, filings, or disclosures with limited independent confirmation are Management Assertion; analyst-derived estimates from related facts are Model Inference; synthetic analyst-selected values are User Assumption; and a fact not established in the searched public record is Missing Evidence.

SafeLoc models exactly 16 evidence variables: electricity_cost, water_consumption, grid_interconnection, water_escalation, community_risk, renewable_percentage, cooling_capex, electricity_escalation, carbon_compliance, permitting_timeline, customer_concentration, water_rights, site_hazard_exposure, backup_power_capacity, water_source_resilience, and downtime_cost. The evidence object is keyed by those exact identifiers. Complete every key exactly once.

The projectSummary.description must explicitly report relevant findings, when available, about electrical-equipment procurement and lead times, jurisdictional bans or moratoriums, noise ordinances and operational impacts, local electricity-rate concerns, and semiconductor and memory supply-chain constraints. It must also identify speculative or phantom grid-load requests when that context is relevant. These are contextual research areas, not additional modeled evidence inputs: do not add them to the evidence array, assign them evidence classifications, or imply that market-wide statistics prove facility-level facts.

Respond with one JSON object matching the supplied schema. projectSummary must contain name, location, description, and capacityMW. Every evidence record must contain label, value, unit, classification, citation, description, sourceRole, sourceUrl, sourceUrls, conflictSummary, coverageStatus, numericValue, and qualitativeValue. sourceUrl is the strongest direct source, and sourceUrls contains up to four direct supporting, corroborating, or conflicting packet URLs. Use null for sourceUrl, conflictSummary, numericValue, or qualitativeValue and [] for sourceUrls when unavailable. Identify conflicting sources explicitly rather than silently choosing one. When a cited source in the retrieved packet directly supports the finding, return that source's exact URL; never invent or return a URL that is not in the packet. The server will attach validated source metadata. A source URL is a research aid only and never facility-level proof by itself. Do not infer numeric zero or categorical none from silence: zero/none is valid only when an exact-project source explicitly establishes it under the variable definition. For grid_interconnection, numericValue is months of delay; for renewable_percentage it is the facility's delivered or contractually procured renewable share. qualitativeValue may only be low, moderate, high, single-source, or diversified. Use concise plain language. Do not include markdown or commentary.`;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

const RETRIEVED_SOURCE_BOUNDARY_PROMPT = `
Use the retrieved source packet supplied in the user message as the strongest validation boundary. Never invent a source, URL, date, excerpt, or facility-level fact. An exact URL match in the packet supports the returned classification. If an AI-cited URL is not in the packet, do not present it as independently verified: preserve Management Assertion, Model Inference, User Assumption, or Missing Evidence when appropriate, and downgrade an unmatched Verified Evidence claim to Management Assertion with an explicit citation note. You may use well-established training knowledge only at a Management Assertion ceiling and must say that no retrieved source independently confirmed it. Apply this consistently: if projectSummary states an exact-project fact such as a named customer or offtaker, a behind-the-meter power arrangement, disclosed capacity, or a stated water source, map that same fact into the relevant evidence variable as Management Assertion or lower rather than calling the variable Missing Evidence. Do not classify contextual market or industry reporting as facility-level Verified Evidence.`;

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

function stringOrFallback(value, fallback, maxLength = 4_000) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, maxLength);
}

function isExplicitUnknownValue(value) {
  if (typeof value !== "string") return false;
  return /^(unknown|not disclosed|not publicly available|not available|unavailable|undisclosed|no data|no public data|not established|n\/a|na)$/i.test(
    value.trim().replace(/[.!]+$/, ""),
  );
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
  let knownData;
  if (body.knownData !== undefined) {
    if (!isRecord(body.knownData)) throw new Error('Research field "knownData" must be an object.');
    const capacity = normalizeReportedCapacityMW(body.knownData.capacity);
    const operator = typeof body.knownData.operator === "string" && body.knownData.operator.trim()
      ? body.knownData.operator.trim().slice(0, 160)
      : null;
    const status = typeof body.knownData.status === "string" && body.knownData.status.trim()
      ? body.knownData.status.trim().slice(0, 80)
      : null;
    const sourceUrl = safePublicSourceUrl(body.knownData.sourceUrl);
    const normalized = {
      ...(capacity === null ? {} : { capacity }),
      ...(operator ? { operator } : {}),
      ...(status ? { status } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    };
    if (Object.keys(normalized).length) knownData = normalized;
  }
  let focusIds;
  if (body.focusIds !== undefined) {
    if (!Array.isArray(body.focusIds) || body.focusIds.length > RESEARCH_EVIDENCE_IDS.length) {
      throw new Error('Research field "focusIds" must be an array of modeled evidence identifiers.');
    }
    focusIds = [...new Set(body.focusIds.map((id) => nonEmptyString(id, "focusIds", 80)))];
    if (focusIds.some((id) => !RESEARCH_EVIDENCE_IDS.includes(id))) {
      throw new Error('Research field "focusIds" contains an unknown evidence identifier.');
    }
  }
  let currentEvidence;
  if (body.currentEvidence !== undefined) {
    if (!Array.isArray(body.currentEvidence) || body.currentEvidence.length > RESEARCH_EVIDENCE_IDS.length) {
      throw new Error('Research field "currentEvidence" must be an evidence record array.');
    }
    currentEvidence = body.currentEvidence
      .filter(isRecord)
      .map((item) => ({
        id: typeof item.id === "string" ? item.id.trim() : "",
        label: typeof item.label === "string" ? item.label.trim().slice(0, 160) : "",
        value: typeof item.value === "string" || typeof item.value === "number" ? String(item.value).slice(0, 500) : "",
        classification: typeof item.classification === "string" ? item.classification.trim().slice(0, 60) : "",
        citation: typeof item.citation === "string" ? item.citation.trim().slice(0, 1_000) : "",
      }))
      .filter((item) => RESEARCH_EVIDENCE_IDS.includes(item.id) && item.label && item.value);
  }
  return {
    name: nonEmptyString(name, "name", 160),
    location: nonEmptyString(body.location, "location", 160),
    ...(knownData ? { knownData } : {}),
    ...(focusIds ? { focusIds } : {}),
    ...(currentEvidence ? { currentEvidence } : {}),
  };
}

function normalizeReportedCapacityMW(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_RESEARCH_CAPACITY_MW
    ? value
    : null;
}

function normalizeCapacityMW(value) {
  return normalizeReportedCapacityMW(value) ?? DEFAULT_RESEARCH_CAPACITY_MW;
}

function parseResearchResponse(body, retrievedSources = [], accessedAt = new Date().toISOString().slice(0, 10), coverage = null, knownData = null) {
  if (!isRecord(body) || !isRecord(body.projectSummary) || (!Array.isArray(body.evidence) && !isRecord(body.evidence))) {
    throw new Error("Research response must include projectSummary and evidence.");
  }

  const summary = body.projectSummary;
  const reportedCapacityMW = normalizeReportedCapacityMW(summary.capacityMW);
  const summaryFields = {
    name: nonEmptyString(summary.name, "projectSummary.name", 160),
    location: nonEmptyString(summary.location, "projectSummary.location", 160),
    description: nonEmptyString(summary.description, "projectSummary.description", 8_000),
    capacityMW: normalizeReportedCapacityMW(knownData?.capacity) ?? reportedCapacityMW ?? DEFAULT_RESEARCH_CAPACITY_MW,
    capacityProvenance: normalizeReportedCapacityMW(knownData?.capacity) !== null
      ? "directory-reported"
      : reportedCapacityMW === null ? "standardized-default" : "ai-reported",
  };

  const evidenceCandidates = Array.isArray(body.evidence)
    ? body.evidence
    : RESEARCH_EVIDENCE_IDS.map((id) => ({ id, ...body.evidence[id] }));
  if (
    evidenceCandidates.length !== RESEARCH_EVIDENCE_IDS.length ||
    (!Array.isArray(body.evidence) && Object.keys(body.evidence).some((id) => !RESEARCH_EVIDENCE_IDS.includes(id)))
  ) {
    throw new Error("Research response must contain exactly 16 evidence records.");
  }

  const expectedIds = new Set(RESEARCH_EVIDENCE_IDS);
  const sourceByUrl = new Map(
    retrievedSources
      .map((source) => [safePublicSourceUrl(source.url), source])
      .filter(([url]) => Boolean(url)),
  );
  const seenIds = new Set();
  const evidence = evidenceCandidates.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Research evidence record ${index + 1} is invalid.`);
    const id = nonEmptyString(item.id, `evidence[${index}].id`, 80);
    if (!expectedIds.has(id) || seenIds.has(id)) {
      throw new Error("Research response must contain each modeled evidence identifier exactly once.");
    }
    seenIds.add(id);
    const citation = stringOrFallback(
      item.citation,
      "No supporting retrieved source was returned for this evidence item.",
      2_000,
    );
    const citedUrl = safePublicSourceUrl(
      citation.match(/https?:\/\/[^\s)]+/)?.[0]?.replace(/[.,;]+$/, ""),
    );
    const returnedSourceUrl = safePublicSourceUrl(item.sourceUrl);
    const returnedSourceUrls = Array.isArray(item.sourceUrls)
      ? item.sourceUrls.map(safePublicSourceUrl).filter(Boolean)
      : [];
    const validatedUrls = [...new Set([returnedSourceUrl, citedUrl, ...returnedSourceUrls])]
      .filter((url) => url && sourceByUrl.has(url))
      .sort((a, b) => sourcePriority(sourceByUrl.get(a)?.sourceClass) - sourcePriority(sourceByUrl.get(b)?.sourceClass))
      .slice(0, 4);
    const sourceUrl = validatedUrls[0] ?? null;
    const supportingSources = validatedUrls.map((url) => {
      const metadata = sourceByUrl.get(url);
      return {
        url,
        title: typeof metadata?.title === "string" && metadata.title.trim() ? metadata.title.trim().slice(0, 500) : "not provided",
        publisher: new URL(url).hostname.replace(/^www\./, ""),
        publishedAt: normalizePublicDate(metadata?.date),
        accessedAt: normalizePublicDate(accessedAt),
        accessStatus: ["open", "paywall", "registration"].includes(metadata?.accessStatus) ? metadata.accessStatus : "not provided",
        excerpt: stringOrFallback(metadata?.excerpt, "No excerpt returned.", 1_000),
        sourceClass: metadata?.sourceClass ?? classifySource(url, metadata?.title),
        searchDomain: metadata?.searchDomain ?? "project-identity",
        relationship: url === sourceUrl ? "primary" : item.coverageStatus === "conflicting" ? "conflicting" : "corroborating",
      };
    });
    const supportedByRetrievedSource = supportingSources.length > 0;
    const rawClassification = nonEmptyString(item.classification, `evidence[${index}].classification`, 60);
    if (!VALID_CLASSIFICATIONS.includes(rawClassification)) {
      throw new Error(`Research evidence record ${id} has an invalid classification.`);
    }
    const explicitUnknownValue = isExplicitUnknownValue(item.value);
    const classification = supportedByRetrievedSource
      ? rawClassification
      : rawClassification === "Verified Evidence"
        ? "Management Assertion"
        : rawClassification;
    const sourceMismatchNote = !supportedByRetrievedSource && rawClassification === "Verified Evidence"
      ? " AI classification downgraded: cited source not in retrieved search results. Original classification: Verified Evidence."
      : !supportedByRetrievedSource && rawClassification !== "Missing Evidence"
        ? ` Based on AI training knowledge. No retrieved source independently confirmed this claim. Verify before relying on this ${rawClassification} classification.`
        : "";
    const record = {
      id,
      label: stringOrFallback(item.label, id.replaceAll("_", " "), 160),
      value: typeof item.value === "number" && Number.isFinite(item.value)
        ? item.value
        : stringOrFallback(item.value, "Not established", 1_000),
      unit: stringOrFallback(item.unit, "Not disclosed", 100),
      classification,
      citation: supportedByRetrievedSource ? citation : `No validated source match for this claim.${sourceMismatchNote} ${citation}`,
      description: stringOrFallback(item.description, "The searched public record did not establish a facility-level value.", 2_000),
      sourceRole: stringOrFallback(item.sourceRole, "AI-researched public-source review", 200),
      coverageStatus: supportedByRetrievedSource && ["supported", "partial", "conflicting"].includes(item.coverageStatus)
        ? item.coverageStatus
        : supportedByRetrievedSource
          ? "supported"
          : classification === "Missing Evidence" || explicitUnknownValue
            ? "searched-no-support"
            : "partial",
      searchCoverage: Array.isArray(coverage?.searchedByEvidence?.[id])
        ? coverage.searchedByEvidence[id]
        : Array.isArray(coverage?.searchedDomains) ? coverage.searchedDomains : [],
      failedSearchDomains: Array.isArray(coverage?.failedByEvidence?.[id])
        ? coverage.failedByEvidence[id]
        : Array.isArray(coverage?.failedDomains) ? coverage.failedDomains : [],
    };
    if (sourceUrl) {
      const metadata = supportingSources[0];
      record.sourceUrl = sourceUrl;
      record.sourceTitle = metadata.title;
      record.sourcePublisher = metadata.publisher;
      record.sourcePublishedAt = metadata.publishedAt;
      record.sourceAccessedAt = metadata.accessedAt;
      record.sourceAccessStatus = metadata.accessStatus;
      record.sources = supportingSources;
      const conflictSummary = stringOrFallback(item.conflictSummary, "", 1_000);
      if (record.coverageStatus === "conflicting" && conflictSummary) record.conflictSummary = conflictSummary;
    }
    if (supportedByRetrievedSource && item.numericValue !== undefined && item.numericValue !== null) {
      if (typeof item.numericValue !== "number" || !Number.isFinite(item.numericValue)) {
        throw new Error(`Research evidence record ${id} has an invalid numericValue.`);
      }
      record.numericValue = item.numericValue;
    }
    if (supportedByRetrievedSource && item.qualitativeValue !== undefined && item.qualitativeValue !== null) {
      if (!["low", "moderate", "high", "single-source", "diversified"].includes(item.qualitativeValue)) {
        throw new Error(`Research evidence record ${id} has an invalid qualitativeValue.`);
      }
      record.qualitativeValue = item.qualitativeValue;
    }
    if (explicitUnknownValue) {
      record.value = "Not established";
      record.classification = "Missing Evidence";
      record.citation = `The AI returned an explicitly unavailable value. ${record.citation}`;
      record.description = "The returned value indicates that the public record did not disclose this item.";
      delete record.numericValue;
    } else if (!supportsExplicitZero(id, item, supportingSources)) {
      record.value = "Not established";
      record.classification = "Missing Evidence";
      record.citation = `The supplied sources did not explicitly establish a zero value. ${record.citation}`;
      record.description = "Zero cannot be inferred from a source being silent; an exact-project source must explicitly establish it.";
      delete record.numericValue;
    }
    return record;
  });

  return {
    projectSummary: summaryFields,
    researchCoverage: {
      searchedDomains: Array.isArray(coverage?.searchedDomains) ? coverage.searchedDomains : [],
      failedDomains: Array.isArray(coverage?.failedDomains) ? coverage.failedDomains : [],
      retrievedSourceCount: retrievedSources.length,
    },
    evidence,
  };
}

function normalizePublicDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
  if (!match || !Number.isFinite(Date.parse(`${match[0]}T00:00:00.000Z`))) return null;
  return match[0];
}

function classifySource(url, title = "") {
  const hostname = new URL(url).hostname.toLowerCase();
  const text = `${hostname} ${title}`.toLowerCase();
  if (hostname.endsWith(".gov") || /\b(dnr|ferc|ercot|commission|department|county|city of|borough)\b/.test(text)) {
    return "primary-government";
  }
  if (/\b(utility|utilities|electric|energy authority|water authority|power)\b/.test(text)) {
    return "primary-utility";
  }
  if (/\b(10-k|10-q|8-k|filing|investor|company announcement|press release)\b/.test(text)) {
    return "primary-company";
  }
  return "secondary-reporting";
}

function sourcePriority(sourceClass) {
  return {
    "primary-government": 0,
    "primary-utility": 1,
    "primary-company": 2,
    "secondary-reporting": 3,
  }[sourceClass] ?? 4;
}

function supportsExplicitZero(id, item, sources) {
  if (item.numericValue !== 0 && item.value !== 0 && !/^(0|zero|none)$/i.test(String(item.value).trim())) return true;
  const text = [item.citation, item.description, ...sources.map((source) => source.excerpt)].join(" ").toLowerCase();
  if (id === "renewable_percentage") {
    return /\b(0\s*%|zero percent|no renewable (energy|electricity) (is|was) (delivered|procured|contracted))\b/.test(text);
  }
  if (id === "grid_interconnection") {
    return /\b(0|zero)\s*(month|months|day|days)\b|\balready interconnected\b|\bno interconnection delay\b|\bbehind[- ]the[- ]meter\b|\bno (new )?grid interconnection (is|was) required\b|\bnot dependent on (a )?new (ercot )?interconnection\b/.test(text);
  }
  return /\b(0|zero|none)\b/.test(text);
}

function buildResearchProjectPrompt({ name, location, knownData, focusIds, currentEvidence }, retrievedSources = []) {
  const sourcePacket = retrievedSources.map(({ url, title, date, excerpt, sourceClass, searchDomain }) => ({
    url,
    title,
    date,
    excerpt,
    sourceClass,
    searchDomain,
  }));
  const knownDataPrompt = knownData
    ? `\n\nThe following facts are already confirmed from the Compute Atlas public database: ${JSON.stringify(knownData)}. Use them as directory discovery context for project identity and summary fields, not as SafeLoc evidence or verified project economics. Focus your research on the 16 evidence variables, not on rediscovering basic project facts.`
    : "";
  return `Analyze this data-center project using the retrieved sources below as the strongest validation boundary: ${name}. Location: ${location}. Preserve exact source URLs in citations, distinguish facility-level findings from regional context, and return the exact JSON contract from the system instruction. If the packet does not support a variable but you have well-established training knowledge about the exact project, you may return it only as Management Assertion or lower, with no source URL and an explicit statement that no retrieved source independently confirmed it and that it must be verified before reliance. Do not replace genuine public information with Missing Evidence merely because the packet lacks a matching URL.${focusIds?.length ? ` This is a focused source refresh for these unresolved variables only: ${focusIds.join(", ")}. Use the existing records below as context, improve a focused record when a retrieved source supports it, and preserve the existing value/classification for unrelated records unless the new packet directly contradicts it.` : ""}${currentEvidence?.length ? `\n\nExisting evidence context:\n${JSON.stringify(currentEvidence)}` : ""}${knownDataPrompt}

Retrieved source packet:
${JSON.stringify(sourcePacket)}`;
}

function normalizeRetrievedSources(body, searchDomain = "project-identity") {
  const candidates = [];
  for (const output of Array.isArray(body?.output) ? body.output : []) {
    if (output?.type === "web_search_call" && Array.isArray(output.action?.sources)) {
      candidates.push(...output.action.sources);
    }
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        if (annotation?.type === "url_citation") {
          candidates.push({
            ...annotation,
            excerpt: typeof content.text === "string" ? content.text : annotation.excerpt,
          });
        }
      }
    }
  }
  const seen = new Set();
  return candidates
    .map((source) => {
      const url = safePublicSourceUrl(source.url) ?? "";
      const title = typeof source.title === "string" ? source.title.trim() : "Retrieved public source";
      return {
        url,
        title,
        date: typeof source.published_date === "string" ? source.published_date : typeof source.date === "string" ? source.date : null,
        excerpt: typeof source.snippet === "string" ? source.snippet.trim() : typeof source.excerpt === "string" ? source.excerpt.trim() : "",
        accessStatus: ["open", "paywall", "registration"].includes(source.access_status) ? source.access_status : "not provided",
        sourceClass: url ? classifySource(url, title) : "secondary-reporting",
        searchDomain,
      };
    })
    .filter((source) => {
      if (!/^https?:\/\//i.test(source.url) || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .slice(0, 10);
}

async function retrievePublicSourcesForDomain(project, domain, apiKey, fetchImpl, signal) {
  const searchSignal = typeof AbortSignal.any === "function" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.any([signal, AbortSignal.timeout(RESEARCH_SEARCH_TIMEOUT_MS)])
    : signal;
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
      input: `Find current public sources for the exact data-center project "${project.name}" in "${project.location}"${project.knownData?.operator ? ` operated by "${project.knownData.operator}"` : ""}. Search focus: ${domain.query}. Verify project/operator/location identity and do not mix similarly named facilities. Prefer direct government, regulator, utility, land, permit, environmental, and filed company records over summaries. Return source URLs, dates, titles, and claim-specific excerpts.`,
      max_output_tokens: 1_800,
      include: ["web_search_call.action.sources"],
    }),
    signal: searchSignal,
  });
  if (!response.ok) throw new Error("Source retrieval failed.");
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw new Error("Source retrieval returned invalid data.");
  }
  const sources = normalizeRetrievedSources(body, domain.id);
  if (sources.length === 0) throw new Error("Source retrieval returned no usable sources.");
  return sources;
}

async function retrievePublicSources(project, apiKey, fetchImpl, signal) {
  const queryContext = {
    ...project,
    operator: project.knownData?.operator,
  };
  const domains = RESEARCH_SEARCH_DOMAINS.map((domain) => ({
    ...domain,
    query: domain.query(queryContext),
  }));
  const results = await Promise.allSettled(
    domains.map((domain) => retrievePublicSourcesForDomain(project, domain, apiKey, fetchImpl, signal)),
  );
  const searchedDomains = [];
  const failedDomains = [];
  const candidates = [];
  results.forEach((result, index) => {
    const domain = domains[index];
    if (result.status === "fulfilled") {
      searchedDomains.push(domain.id);
      candidates.push(...result.value);
    } else {
      failedDomains.push(domain.id);
    }
  });
  const seen = new Set();
  const sources = candidates
    .sort((a, b) => sourcePriority(a.sourceClass) - sourcePriority(b.sourceClass))
    .filter((source) => {
      if (seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .slice(0, MAX_RETRIEVED_SOURCES);
  if (sources.length === 0) {
    const aborted = results.find((result) => result.status === "rejected" && result.reason instanceof Error && result.reason.name === "AbortError");
    if (aborted?.status === "rejected") throw aborted.reason;
    throw new Error("Source retrieval returned no usable sources.");
  }
  return { sources, searchedDomains, failedDomains };
}

async function retrieveTargetedSources(project, evidenceIds, apiKey, fetchImpl, signal) {
  const identityTerms = [
    `"${project.name}"`,
    `"${project.location}"`,
    project.knownData?.operator ? `"${project.knownData.operator}"` : null,
  ].filter(Boolean).join(" ");
  const domains = evidenceIds.map((id) => ({
    id: `targeted-${id}`,
    label: `Targeted ${id.replaceAll("_", " ")} follow-up`,
    query: `${identityTerms} ${TARGETED_EVIDENCE_TERMS[id]}`,
  }));
  const results = await Promise.allSettled(
    domains.map((domain) => retrievePublicSourcesForDomain(project, domain, apiKey, fetchImpl, signal)),
  );
  const sources = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const searchedByEvidence = {};
  const failedByEvidence = {};
  evidenceIds.forEach((id, index) => {
    searchedByEvidence[id] = results[index].status === "fulfilled" ? [domains[index].id] : [];
    failedByEvidence[id] = results[index].status === "rejected" ? [domains[index].id] : [];
  });
  return {
    sources,
    searchedDomains: domains.filter((_, index) => results[index].status === "fulfilled").map((domain) => domain.id),
    failedDomains: domains.filter((_, index) => results[index].status === "rejected").map((domain) => domain.id),
    searchedByEvidence,
    failedByEvidence,
  };
}

function mergeRetrievedSources(initialSources, targetedSources) {
  const seen = new Set();
  const rankAndDeduplicate = (sources) => sources
    .sort((a, b) => sourcePriority(a.sourceClass) - sourcePriority(b.sourceClass))
    .filter((source) => !seen.has(source.url) && seen.add(source.url));
  return [
    ...rankAndDeduplicate([...targetedSources]),
    ...rankAndDeduplicate([...initialSources]),
  ].slice(0, MAX_RETRIEVED_SOURCES);
}

async function synthesizeResearch(project, retrievedSources, apiKey, fetchImpl, signal) {
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
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "safeloc_research_project",
          strict: true,
          schema: RESEARCH_PROJECT_RESPONSE_SCHEMA,
        },
      },
      messages: [
        { role: "system", content: `${RESEARCH_PROJECT_SYSTEM_PROMPT}${RETRIEVED_SOURCE_BOUNDARY_PROMPT}` },
        { role: "user", content: buildResearchProjectPrompt(project, retrievedSources) },
      ],
    }),
    signal,
  });
  const rawText = await response.text();
  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    body = null;
  }
  if (!response.ok) throw new Error("Research synthesis failed.");
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Research synthesis returned invalid data.");
  console.info("[research-project] Raw synthesis response before parsing:", content);
  return JSON.parse(content);
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
  const startedAt = Date.now();
  try {
    let sourcePacket = project.focusIds?.length
      ? await retrieveTargetedSources(project, project.focusIds, apiKey, fetchImpl, controller.signal)
      : await retrievePublicSources(project, apiKey, fetchImpl, controller.signal);
    if (sourcePacket.sources.length === 0) throw new Error("Source retrieval returned no usable sources.");
    let retrievedSources = sourcePacket.sources;
    let synthesis = await synthesizeResearch(project, retrievedSources, apiKey, fetchImpl, controller.signal);
    let parsed;
    try {
      parsed = parseResearchResponse(synthesis, retrievedSources, new Date().toISOString().slice(0, 10), sourcePacket, project.knownData);
      const unsupportedIds = parsed.evidence
        .filter((item) => item.classification === "Missing Evidence")
        .map((item) => item.id);
      if (!project.focusIds?.length && unsupportedIds.length > 0 && Date.now() - startedAt < TARGETED_FOLLOW_UP_START_BUDGET_MS) {
        try {
          const targeted = await retrieveTargetedSources(project, unsupportedIds, apiKey, fetchImpl, controller.signal);
          if (targeted.sources.length > 0) {
            retrievedSources = mergeRetrievedSources(retrievedSources, targeted.sources);
            sourcePacket = {
              sources: retrievedSources,
              searchedDomains: [...sourcePacket.searchedDomains, ...targeted.searchedDomains],
              failedDomains: [...sourcePacket.failedDomains, ...targeted.failedDomains],
            };
            synthesis = await synthesizeResearch(project, retrievedSources, apiKey, fetchImpl, controller.signal);
            parsed = parseResearchResponse(synthesis, retrievedSources, new Date().toISOString().slice(0, 10), sourcePacket, project.knownData);
          }
        } catch (error) {
          if (!(error instanceof Error && error.name === "AbortError")) throw error;
          console.warn("[research-project] Targeted follow-up exceeded the request budget; returning the validated first synthesis.");
        }
      }
    } catch (error) {
      console.warn(
        "[research-project] Rejected structured research response:",
        error instanceof Error ? error.message : "unknown validation error",
      );
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
  MAX_RESEARCH_CAPACITY_MW,
  OPENAI_CHAT_COMPLETIONS_URL,
  OPENAI_RESPONSES_URL,
  RESEARCH_EVIDENCE_IDS,
  RESEARCH_SEARCH_DOMAINS,
  RESEARCH_PROJECT_MAX_TOKENS,
  RESEARCH_PROJECT_MODEL,
  RESEARCH_PROJECT_TIMEOUT_MS,
  RESEARCH_PROJECT_RESPONSE_SCHEMA,
  RESEARCH_PROJECT_SYSTEM_PROMPT,
  buildResearchProjectPrompt,
  retrieveTargetedSources,
  normalizeCapacityMW,
  normalizeReportedCapacityMW,
  parseResearchProjectBody,
  parseResearchResponse,
  normalizeRetrievedSources,
  normalizePublicDate,
  classifySource,
  supportsExplicitZero,
  safePublicSourceUrl,
  retrievePublicSources,
  mergeRetrievedSources,
  createResearchProjectRateLimiter,
};