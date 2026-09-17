const DEFAULT_MAX_ATTEMPTS = 12;
const HARD_MAX_ATTEMPTS = 24;
const MAX_DOCUMENT_BYTES = 256 * 1024;
const MAX_URLS = 128;
const MAX_URL_LENGTH = 2_048;

const STATE_DOMAIN_REGISTRY = Object.freeze({
  Texas: Object.freeze([
    { name: "Texas Commission on Environmental Quality", domain: "tceq.texas.gov", categories: ["water", "permitting-community", "climate-operational-hazard"] },
    { name: "Texas Water Development Board", domain: "twdb.texas.gov", categories: ["water", "climate-operational-hazard"] },
    { name: "Public Utility Commission of Texas", domain: "puc.texas.gov", categories: ["grid", "electricity"] },
    { name: "Electric Reliability Council of Texas", domain: "ercot.com", categories: ["grid", "electricity"] },
  ]),
  Arizona: Object.freeze([
    { name: "Arizona Department of Environmental Quality", domain: "azdeq.gov", categories: ["water", "permitting-community", "climate-operational-hazard"] },
    { name: "Arizona Department of Water Resources", domain: "azwater.gov", categories: ["water", "climate-operational-hazard"] },
    { name: "Arizona Corporation Commission", domain: "azcc.gov", categories: ["grid", "electricity"] },
  ]),
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPrivateHostname(hostname) {
  const host = String(hostname ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || host === "metadata.google.internal") return true;
  const ipv4 = host.match(/^\d{1,3}(?:\.\d{1,3}){3}$/)?.[0];
  if (ipv4) {
    const parts = ipv4.split(".").map(Number);
    return parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
      || parts[0] === 0 || parts[0] === 10 || parts[0] === 127
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && (parts[1] === 0 || parts[1] === 2 || parts[1] === 168))
      || (parts[0] === 198 && parts[1] === 51 && parts[2] === 100)
      || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113)
      || parts[0] >= 224;
  }
  // Literal IPv6 destinations are not needed for official-domain discovery.
  return host.includes(":");
}

function safeUrl(value, base) {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_URL_LENGTH) return null;
  try {
    const url = base ? new URL(value.trim(), base) : new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || isPrivateHostname(url.hostname)) return null;
    url.hash = "";
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    return url.href;
  } catch {
    return null;
  }
}

function sanitizeDomain(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const url = safeUrl(raw.includes("://") ? raw : `https://${raw}`);
  return url ? new URL(url).hostname.toLowerCase() : null;
}

function cleanText(value, max = 200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function inferState(identity, knownData) {
  const raw = [
    identity?.state,
    identity?.location,
    knownData?.state,
    knownData?.location,
  ].filter((value) => typeof value === "string").join(" ");
  if (/\btexas\b|\bTX\b/i.test(raw)) return "Texas";
  if (/\barizona\b|\bAZ\b/i.test(raw)) return "Arizona";
  return null;
}

function buildAliases(identity, knownData) {
  const values = [
    identity?.name,
    identity?.requestedName,
    ...(Array.isArray(identity?.aliases) ? identity.aliases : []),
    ...(Array.isArray(knownData?.aliases) ? knownData.aliases : []),
    ...(Array.isArray(knownData?.projectAliases) ? knownData.projectAliases : []),
  ];
  return [...new Set(values.map((value) => cleanText(value)).filter((value) => value.length >= 3))].slice(0, 16);
}

function normalizedWords(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&(?:amp|quot|apos|#39);/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mentionsExactAlias(value, aliases) {
  const haystack = ` ${normalizedWords(value)} `;
  return aliases.some((alias) => haystack.includes(` ${normalizedWords(alias)} `));
}

function safelyDecoded(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hostAllowed(url, domains) {
  const host = new URL(url).hostname.toLowerCase();
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function sourceChannelForHost(url, domainFamilies) {
  const host = new URL(url).hostname.toLowerCase();
  const inDomains = (domains) => domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  for (const family of domainFamilies) {
    if (inDomains(family.domains)) return family.sourceChannel;
  }
  return "declared-source-url";
}

async function readBoundedBody(response) {
  const reader = response?.body?.getReader?.();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { text: new TextDecoder().decode(bytes.slice(0, MAX_DOCUMENT_BYTES)), bytes: Math.min(bytes.length, MAX_DOCUMENT_BYTES), truncated: bytes.length > MAX_DOCUMENT_BYTES };
  }
  const chunks = [];
  let length = 0;
  let truncated = false;
  while (length <= MAX_DOCUMENT_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = MAX_DOCUMENT_BYTES - length;
    if (value.byteLength > remaining) {
      if (remaining > 0) chunks.push(value.slice(0, remaining));
      length += remaining;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    length += value.byteLength;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), bytes: length, truncated };
}

function extractUrlContexts(text, contentType) {
  const contexts = [];
  const add = (url, context) => {
    if (typeof url === "string" && contexts.length < MAX_URLS * 2) contexts.push({ url, context: cleanText(context, 500) });
  };
  if (/json/i.test(contentType)) {
    try {
      const visit = (value, depth = 0) => {
        if (depth > 5 || contexts.length >= MAX_URLS * 2) return;
        if (Array.isArray(value)) value.slice(0, 100).forEach((item) => visit(item, depth + 1));
        else if (isRecord(value)) {
          const context = JSON.stringify(value).slice(0, 1_000);
          for (const item of Object.values(value)) {
            if (typeof item === "string" && /^(?:https?:\/\/|\/)/i.test(item)) add(item, context);
            else visit(item, depth + 1);
          }
        }
      };
      visit(JSON.parse(text));
    } catch {
      // Malformed JSON is not promoted to a discovered candidate.
    }
    return contexts;
  }
  for (const match of text.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,500}?)<\/a>/gi)) {
    add(match[1], `${match[1]} ${match[2].replace(/<[^>]+>/g, " ")}`);
  }
  for (const match of text.matchAll(/<loc\b[^>]*>([^<]+)<\/loc>/gi)) add(match[1].trim(), match[1]);
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) add(match[0].replace(/[),.;]+$/, ""), match[0]);
  return contexts;
}

function authorityRecords(knownData, state, category, discoveredAt, declaredFamilies) {
  const declaredDomains = (Array.isArray(knownData?.authorityDomains) ? knownData.authorityDomains : [])
    .map(sanitizeDomain);
  const names = [
    knownData?.permittingAuthority,
    knownData?.waterAuthority,
    ...(Array.isArray(knownData?.authorityNames) ? knownData.authorityNames : []),
  ].map((name) => cleanText(name)).filter(Boolean);
  const records = names.map((name, index) => ({
    name,
    domain: declaredDomains[index] ?? null,
    status: declaredDomains[index] ? "established" : "identified-no-domain",
    sourceChannel: "declared-known-data",
    jurisdiction: cleanText(knownData?.county || knownData?.city || knownData?.state || state || "unknown", 160),
    establishmentMethod: declaredDomains[index] ? "declared-known-data-domain" : "declared-name-only",
    discoveredAt,
    urlsAttempted: [],
    accessOutcomes: [],
    provenance: { kind: "knownData", field: "authorityNames", discoveryOnly: true },
  }));
  for (const family of declaredFamilies) {
    if (!family.authorityKind) continue;
    for (const domain of family.domains) {
      if (records.some((record) => record.domain === domain)) continue;
      records.push({
        name: `${family.authorityKind} (${domain})`,
        domain,
        status: "established",
        sourceChannel: family.sourceChannel,
        jurisdiction: family.jurisdiction,
        establishmentMethod: "declared-known-data-domain",
        discoveredAt,
        urlsAttempted: [],
        accessOutcomes: [],
        provenance: { kind: "knownData", field: family.field, discoveryOnly: true },
      });
    }
  }
  for (const item of STATE_DOMAIN_REGISTRY[state] ?? []) {
    if (category && !item.categories.includes(category)) continue;
    if (records.some((record) => record.domain === item.domain)) continue;
    records.push({
      name: item.name,
      domain: item.domain,
      status: "established",
      sourceChannel: "verified-state-domain-registry",
      jurisdiction: state,
      establishmentMethod: "bounded-state-domain-registry",
      discoveredAt,
      urlsAttempted: [],
      accessOutcomes: [],
      provenance: { kind: "bounded-state-registry", state, discoveryOnly: true },
    });
  }
  return records.slice(0, 24);
}

/**
 * Discovers possible exact-project pages only within explicitly declared official
 * domains and the bounded Texas/Arizona registry. Results are routing metadata,
 * never evidence for a project claim.
 */
export async function discoverOfficialSources({
  projectIdentity,
  project,
  knownData: suppliedKnownData,
  category = "project-identity",
  fetchImpl = globalThis.fetch,
  signal,
  now = () => Date.now(),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  authorizeAttempt,
} = {}) {
  const identity = isRecord(projectIdentity) ? projectIdentity : isRecord(project) ? project : {};
  const knownData = isRecord(suppliedKnownData)
    ? suppliedKnownData
    : isRecord(identity.knownData) ? identity.knownData : {};
  const limit = Math.max(0, Math.min(HARD_MAX_ATTEMPTS, Number.isFinite(maxAttempts) ? Math.floor(maxAttempts) : DEFAULT_MAX_ATTEMPTS));
  const aliases = buildAliases(identity, knownData);
  const state = inferState(identity, knownData);
  const discoveredAt = new Date(now()).toISOString();
  const declaredSourceUrl = safeUrl(knownData.sourceUrl);
  const family = (field, sourceChannel, authorityKind = null, jurisdiction = null) => ({
    field,
    sourceChannel,
    authorityKind,
    jurisdiction: cleanText(jurisdiction || knownData?.state || state || "unknown", 160),
    domains: [...new Set((Array.isArray(knownData[field]) ? knownData[field] : []).map(sanitizeDomain).filter(Boolean))],
  });
  const declaredFamilies = [
    family("cityDomains", "declared-city-domain", "City authority", knownData.city),
    family("countyDomains", "declared-county-domain", "County authority", knownData.county),
    family("utilityDomains", "declared-utility-domain", "Utility authority"),
    family("economicDevelopmentDomains", "declared-economic-development-domain", "Economic development authority"),
    family("authorityDomains", "declared-authority-domain", "Declared authority"),
    family("companyDomains", "declared-company-domain"),
  ];
  if (declaredSourceUrl) declaredFamilies.at(-1).domains.unshift(new URL(declaredSourceUrl).hostname.toLowerCase());
  declaredFamilies.at(-1).domains = [...new Set(declaredFamilies.at(-1).domains)];
  const authorities = authorityRecords(knownData, state, category, discoveredAt, declaredFamilies);
  const stateDomains = authorities
    .filter((item) => item.sourceChannel === "verified-state-domain-registry")
    .map((item) => item.domain);
  const stateFamily = { field: "stateRegistry", sourceChannel: "verified-state-domain-registry", domains: stateDomains };
  const rootDomainFamilies = [...declaredFamilies, stateFamily];
  const domainFamilies = [...rootDomainFamilies];
  const allowedDomains = [...new Set(rootDomainFamilies.flatMap((item) => item.domains))];
  const declaredEndpoints = [...new Set(
    (Array.isArray(knownData.knownOfficialEndpoints) ? knownData.knownOfficialEndpoints : [])
      .map((value) => safeUrl(value))
      .filter(Boolean),
  )].slice(0, 16);
  for (const endpoint of declaredEndpoints) {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    if (!allowedDomains.includes(hostname)) {
      allowedDomains.push(hostname);
      domainFamilies.unshift({ field: "knownOfficialEndpoints", sourceChannel: "declared-official-endpoint", domains: [hostname] });
    }
  }
  const queue = [];
  const queued = new Set();
  const enqueue = (value, provenance, sourceChannel = null) => {
    const url = safeUrl(value);
    if (!url || !hostAllowed(url, allowedDomains) || queued.has(url) || queued.size >= MAX_URLS) return;
    queued.add(url);
    queue.push({ url, provenance, sourceChannel });
  };
  if (declaredSourceUrl) enqueue(declaredSourceUrl, { kind: "knownData", field: "sourceUrl" }, "declared-source-url");
  for (const endpoint of declaredEndpoints) {
    enqueue(endpoint, { kind: "knownData", field: "knownOfficialEndpoints" }, "declared-official-endpoint");
  }
  for (const familyRecord of rootDomainFamilies) {
    for (const domain of familyRecord.domains) {
    const root = `https://${domain}/`;
    const channel = familyRecord.sourceChannel;
    enqueue(root, { kind: channel === "verified-state-domain-registry" ? "bounded-state-registry" : "knownData", field: channel });
    enqueue(`${root}sitemap.xml`, { kind: "safe-known-endpoint", endpoint: "sitemap.xml", parent: root });
    enqueue(`${root}feed/`, { kind: "safe-known-endpoint", endpoint: "feed", parent: root });
    }
  }

  const candidateUrls = [];
  const candidateSet = new Set();
  const addCandidate = (url, sourceChannel, provenance, alias = null) => {
    if (candidateSet.has(url) || candidateUrls.length >= MAX_URLS) return;
    candidateSet.add(url);
    candidateUrls.push({
      url,
      sourceChannel,
      provenance: { ...provenance, discoveryOnly: true },
      matchedAlias: alias,
      discoveryOnly: true,
    });
  };
  if (declaredSourceUrl) {
    addCandidate(
      declaredSourceUrl,
      "declared-source-url",
      { kind: "knownData", field: "sourceUrl" },
      aliases.find((alias) => mentionsExactAlias(declaredSourceUrl, [alias])) ?? null,
    );
  }

  const attempts = [];
  if (typeof fetchImpl !== "function") {
    return { authorities, attempts, candidateUrls, limits: { maxAttempts: limit, maxDocumentBytes: MAX_DOCUMENT_BYTES }, discoveryIsEvidence: false };
  }
  while (queue.length && attempts.length < limit && !signal?.aborted) {
    const target = queue.shift();
    const sourceChannel = target.sourceChannel ?? sourceChannelForHost(target.url, domainFamilies);
    const authorization = typeof authorizeAttempt === "function"
      ? authorizeAttempt(target.url)
      : { allowed: true, physicalOpenIndex: null };
    if (authorization === false || authorization?.allowed === false) {
      attempts.push({
        url: target.url,
        sourceChannel,
        provenance: { ...target.provenance, discoveryOnly: true },
        startedAt: new Date(now()).toISOString(),
        status: "budget-denied",
        httpStatus: null,
        contentType: null,
        bytes: 0,
        truncated: false,
        physicalOpenIndex: null,
      });
      break;
    }
    const attempt = {
      url: target.url,
      sourceChannel,
      provenance: { ...target.provenance, discoveryOnly: true },
      startedAt: new Date(now()).toISOString(),
      status: "failed",
      httpStatus: null,
      contentType: null,
      bytes: 0,
      truncated: false,
      physicalOpenIndex: Number.isInteger(authorization?.physicalOpenIndex)
        ? authorization.physicalOpenIndex
        : null,
    };
    attempts.push(attempt);
    try {
      const response = await fetchImpl(target.url, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: { accept: "text/html, application/xml, text/xml, application/json;q=0.9, */*;q=0.1" },
      });
      attempt.httpStatus = Number.isInteger(response?.status) ? response.status : null;
      attempt.contentType = cleanText(response?.headers?.get?.("content-type"), 120).toLowerCase();
      if (attempt.httpStatus >= 300 && attempt.httpStatus < 400) {
        const redirected = safeUrl(response?.headers?.get?.("location"), target.url);
        if (redirected && hostAllowed(redirected, allowedDomains)) enqueue(redirected, { kind: "same-domain-redirect", parent: target.url });
        attempt.status = redirected ? "redirect-enqueued" : "redirect-rejected";
        continue;
      }
      if (!response?.ok) {
        attempt.status = `http-${attempt.httpStatus ?? "error"}`;
        continue;
      }
      if (attempt.contentType && !/(?:html|xhtml|xml|json)/i.test(attempt.contentType)) {
        attempt.status = "unsupported-content-type";
        continue;
      }
      const body = await readBoundedBody(response);
      attempt.bytes = body.bytes;
      attempt.truncated = body.truncated;
      attempt.status = "parsed";
      const contexts = extractUrlContexts(body.text, attempt.contentType);
      for (const context of contexts) {
        const candidate = safeUrl(context.url, target.url);
        if (!candidate || !hostAllowed(candidate, allowedDomains)) continue;
        const matchedAlias = aliases.find((alias) => mentionsExactAlias(`${context.context} ${safelyDecoded(candidate)}`, [alias]));
        if (!matchedAlias) continue;
        addCandidate(candidate, sourceChannel, { kind: "exact-alias-index-match", parent: target.url }, matchedAlias);
      }
    } catch (error) {
      attempt.status = signal?.aborted ? "aborted" : "fetch-error";
      attempt.error = cleanText(error instanceof Error ? error.message : String(error), 160);
    }
  }
  for (const authority of authorities) {
    if (!authority.domain) continue;
    const matching = attempts.filter((attempt) => {
      try {
        const host = new URL(attempt.url).hostname.toLowerCase();
        return host === authority.domain || host.endsWith(`.${authority.domain}`);
      } catch {
        return false;
      }
    }).slice(0, 12);
    authority.urlsAttempted = matching.map((attempt) => attempt.url);
    authority.accessOutcomes = matching.map((attempt) => ({
      url: attempt.url,
      status: attempt.status,
      httpStatus: attempt.httpStatus,
      physicalOpenIndex: attempt.physicalOpenIndex,
    }));
  }
  return {
    authorities,
    attempts,
    candidateUrls,
    limits: { maxAttempts: limit, maxDocumentBytes: MAX_DOCUMENT_BYTES, maxCandidateUrls: MAX_URLS },
    discoveryIsEvidence: false,
  };
}

export const OFFICIAL_SOURCE_DISCOVERY_LIMITS = Object.freeze({
  defaultMaxAttempts: DEFAULT_MAX_ATTEMPTS,
  hardMaxAttempts: HARD_MAX_ATTEMPTS,
  maxDocumentBytes: MAX_DOCUMENT_BYTES,
  maxCandidateUrls: MAX_URLS,
});