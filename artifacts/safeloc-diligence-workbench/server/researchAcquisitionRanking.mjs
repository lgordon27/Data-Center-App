const GENERIC_PATH_PATTERN =
  /^(?:\/)?$|(?:^|\/)(?:sitemap(?:[-_0-9.]|$)|feeds?(?:\/|$)|rss(?:\/|$)|index(?:\.|\/|$)|home(?:\.|\/|$))/i;
const ROOT_POLICY_PATTERN =
  /\b(?:homepage|home page|site map|sitemap|feed|rss|index|general policy|county policy|state policy|municipal policy|privacy policy|terms of use)\b/i;
const PROJECT_RECORD_PATTERN =
  /\b(?:project|campus|facility|data center|datacenter|permit|filing|record|application|construction|interconnection|substation|power service)\b/i;
const VIDEO_PATTERN =
  /\b(?:youtube|youtu\.be|video|watch|streaming)\b/i;
const FACILITY_ID_PATTERN = /\b[A-Z]{2,5}\d{1,4}[A-Z]?\b/g;

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWords(value) {
  return asText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&(?:amp|quot|apos|#39);/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function phrasePresent(haystack, phrase) {
  const normalizedHaystack = ` ${normalizeWords(haystack)} `;
  const normalizedPhrase = normalizeWords(phrase);
  return normalizedPhrase.length >= 3
    && normalizedHaystack.includes(` ${normalizedPhrase} `);
}

function safeUrlParts(source = {}) {
  const value = asText(source.url ?? source.canonicalUrl ?? source.resolvedUrl);
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return {
      hostname: url.hostname.toLowerCase().replace(/^www\./, ""),
      pathname: url.pathname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

function normalizedEndpoint(value) {
  try {
    const url = new URL(asText(value));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|gclid|fbclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch {
    return null;
  }
}

function valuesAt(objects, keys) {
  return objects.flatMap((object) => keys.flatMap((key) => {
    const value = object?.[key];
    return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  }));
}

function projectIdentityValues(project = {}) {
  const knownData = project?.knownData ?? {};
  const aliases = [
    project?.name,
    project?.requestedName,
    ...valuesAt([project, knownData], ["aliases", "projectAliases"]),
  ].map(asText).filter((value) => normalizeWords(value).length >= 3);
  const operators = [
    knownData.operator,
    knownData.companyName,
    project.operator,
    project.companyName,
  ].map(asText).filter((value) => normalizeWords(value).length >= 3);
  const facilityIds = valuesAt(
    [project, knownData],
    ["facilityIdentifiers", "facilityIds", "buildingIdentifiers", "buildingIds", "campusIdentifiers"],
  ).map((value) => asText(value).toUpperCase()).filter(Boolean);
  const locationTerms = valuesAt([project, knownData], ["location", "city", "county", "state"])
    .map(asText)
    .filter((value) => normalizeWords(value).length >= 3);
  const companyDomains = valuesAt([project, knownData], ["companyDomains"])
    .map((value) => asText(value).toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, ""))
    .filter(Boolean);
  const officialDomains = valuesAt(
    [project, knownData],
    ["authorityDomains", "cityDomains", "countyDomains", "utilityDomains", "knownOfficialDomains"],
  )
    .map((value) => asText(value).toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, ""))
    .filter(Boolean);
  const officialEndpoints = valuesAt([project, knownData], ["knownOfficialEndpoints"])
    .map(normalizedEndpoint)
    .filter(Boolean);
  for (const endpoint of officialEndpoints) {
    try {
      officialDomains.push(new URL(endpoint).hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      // Invalid declared endpoints never contribute a host signal.
    }
  }
  return {
    aliases: [...new Set(aliases)],
    operators: [...new Set(operators)],
    facilityIds: [...new Set(facilityIds)],
    locationTerms: [...new Set(locationTerms)],
    companyDomains: [...new Set(companyDomains)],
    officialDomains: [...new Set(officialDomains)],
    officialEndpoints: [...new Set(officialEndpoints)],
  };
}

function matchesDomain(hostname, domains) {
  return Boolean(hostname && domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)));
}

function rankCandidate(source, project, discoveryRank) {
  const identity = projectIdentityValues(project);
  const parts = safeUrlParts(source);
  const urlText = [source.url, source.canonicalUrl].filter((value) => typeof value === "string").join(" ");
  const titleText = [source.title, source.publisher].filter((value) => typeof value === "string").join(" ");
  const snippetText = [source.snippet, source.excerpt, source.discoveryContext, source.description]
    .filter((value) => typeof value === "string")
    .join(" ");
  const discoveryText = [titleText, urlText, snippetText].join(" ");
  const attributedQuery = source.discoveryQueryAttributionStatus === "provider-attributed"
    && typeof source.discoveryOriginatingQuery === "string"
    ? source.discoveryOriginatingQuery
    : "";
  const trustedBridgeText = [titleText, urlText, attributedQuery].join(" ");
  const aliasInTitle = identity.aliases.some((alias) => phrasePresent(titleText, alias));
  const aliasInUrl = identity.aliases.some((alias) => phrasePresent(urlText, alias));
  const aliasInSnippet = identity.aliases.some((alias) => phrasePresent(snippetText, alias));
  const exactProjectSignal = aliasInTitle || aliasInUrl || aliasInSnippet;
  const operatorMatch = identity.operators.some((operator) =>
    phrasePresent(discoveryText, operator)
    || (parts?.hostname && normalizeWords(parts.hostname).includes(normalizeWords(operator).replaceAll(" ", ""))));
  const facilityIds = [...new Set([
    ...identity.facilityIds,
    ...(discoveryText.match(FACILITY_ID_PATTERN) ?? []),
  ])];
  const mentionedFacilityIds = facilityIds.filter((facilityId) =>
    new RegExp(`(?:^|[^A-Z0-9])${facilityId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Z0-9])`, "i")
      .test(discoveryText));
  const namedFacilitySignal = mentionedFacilityIds.length > 0
    && (exactProjectSignal || operatorMatch || identity.facilityIds.some((facilityId) =>
      mentionedFacilityIds.some((mentioned) => mentioned.toLowerCase() === facilityId.toLowerCase())));
  const bridgeFacilitySignal = identity.facilityIds.some((facilityId) =>
    /^DFW\s*[- ]?\s*\d{1,2}$/i.test(facilityId)
    && phrasePresent(trustedBridgeText, facilityId));
  const bridgeProjectSignal =
    identity.aliases.some((alias) => phrasePresent(trustedBridgeText, alias))
    || identity.operators.some((operator) => phrasePresent(trustedBridgeText, operator))
    || identity.locationTerms.some((location) => phrasePresent(trustedBridgeText, location));
  const facilityProjectBridgeSignal = bridgeFacilitySignal && bridgeProjectSignal;
  const sourceChannel = asText(source.sourceChannel ?? source.origin).toLowerCase();
  const sourceType = asText(source.sourceType ?? source.sourceClass ?? source.documentType).toLowerCase();
  const official =
    Boolean(parts?.hostname && /(?:^|\.)(?:gov|mil)$/.test(parts.hostname))
    || Boolean(parts?.hostname && /(?:^|\.)tx\.us$/.test(parts.hostname))
    || matchesDomain(parts?.hostname, identity.officialDomains)
    || /(?:official|government|regulator|declared-authority|verified-state-domain)/.test(sourceChannel)
    || /(?:primary-government|primary-utility|government|regulator|official)/.test(sourceType);
  const operatorDomain = matchesDomain(parts?.hostname, identity.companyDomains)
    || (parts?.hostname && identity.operators.some((operator) =>
      normalizeWords(parts.hostname).includes(normalizeWords(operator).replaceAll(" ", ""))))
    || /(?:declared-company|company-developer)/.test(sourceChannel);
  const declaredEndpoint = identity.officialEndpoints.includes(normalizedEndpoint(
    source.url ?? source.canonicalUrl ?? source.resolvedUrl,
  ));
  const projectRecord = PROJECT_RECORD_PATTERN.test(`${titleText} ${urlText} ${sourceType}`);
  const video = VIDEO_PATTERN.test(`${parts?.hostname ?? ""} ${titleText} ${urlText} ${sourceType}`)
    || /video/i.test(asText(source.contentType));
  const genericIndex = GENERIC_PATH_PATTERN.test(parts?.pathname ?? "")
    || ROOT_POLICY_PATTERN.test(`${titleText} ${urlText} ${sourceType}`);
  const unrelatedPolicy =
    /\b(?:policy|ordinance|regulation|general plan|comprehensive plan)\b/i
      .test(`${titleText} ${urlText} ${sourceType}`)
    && !exactProjectSignal
    && !namedFacilitySignal;
  const sourceFamily = declaredEndpoint
    ? "declared-project-endpoint"
    : /(?:^|\.)(?:gov|mil)$/.test(parts?.hostname ?? "") || /(?:^|\.)tx\.us$/.test(parts?.hostname ?? "")
      ? projectRecord ? "government-project-record" : "government-agency"
      : /(?:utility|regulator|ercot|puc|grid-operator|commission)/.test(`${sourceChannel} ${sourceType} ${titleText}`)
        ? "utility-regulator"
        : operatorDomain ? "project-operator"
          : /(?:aggregator|newswire|press-release-distribution)/.test(`${sourceChannel} ${sourceType} ${parts?.hostname ?? ""}`)
            ? "news-aggregator"
            : /(?:report|news|journal|article|independent)/.test(`${sourceChannel} ${sourceType} ${titleText}`)
              ? "independent-reporting"
              : "other";
  const sourceFamilyPriority = {
    "declared-project-endpoint": 7,
    "government-project-record": 6,
    "utility-regulator": 5,
    "project-operator": 5,
    "independent-reporting": 3,
    "government-agency": 2,
    "news-aggregator": 1,
    other: 0,
  }[sourceFamily];

  let acquisitionPriority = 100;
  const acquisitionReasons = [];
  if (declaredEndpoint) acquisitionReasons.push("submitted-official-project-endpoint");
  if (aliasInTitle) acquisitionReasons.push("exact-project-title");
  if (aliasInUrl) acquisitionReasons.push("exact-project-url");
  if (aliasInSnippet) acquisitionReasons.push("exact-project-discovery-metadata");
  if (operatorMatch) acquisitionReasons.push("operator-match");
  if (namedFacilitySignal) acquisitionReasons.push("named-facility-identifier");
  if (facilityProjectBridgeSignal) acquisitionReasons.push("facility-project-bridge-discovery-metadata");
  if (official) acquisitionReasons.push("official-source-type");
  if (operatorDomain) acquisitionReasons.push("operator-source-domain");
  if (projectRecord) acquisitionReasons.push("project-record-source-type");

  if (exactProjectSignal || namedFacilitySignal) {
    if (official && projectRecord) {
      acquisitionPriority = 500;
      acquisitionReasons.push("exact-project-official-project-record");
    } else if (operatorDomain && projectRecord) {
      acquisitionPriority = 480;
      acquisitionReasons.push("exact-project-operator-project-page");
    } else if (official) {
      acquisitionPriority = 460;
      acquisitionReasons.push("exact-project-official-page");
    } else if (operatorDomain) {
      acquisitionPriority = 440;
      acquisitionReasons.push("exact-project-operator-source");
    } else if (projectRecord) {
      acquisitionPriority = 420;
      acquisitionReasons.push("exact-project-reporting");
    } else {
      acquisitionPriority = 400;
      acquisitionReasons.push("exact-project-source");
    }
  } else if (official && projectRecord) {
    acquisitionPriority = 220;
    acquisitionReasons.push("specific-official-record");
  } else if (official) {
    acquisitionPriority = 150;
    acquisitionReasons.push("generic-official-source");
  } else if (operatorDomain) {
    acquisitionPriority = 140;
    acquisitionReasons.push("generic-operator-source");
  }

  if (facilityProjectBridgeSignal) acquisitionPriority += 100;
  if (declaredEndpoint) acquisitionPriority = Math.max(acquisitionPriority, 560);

  if (genericIndex && !declaredEndpoint) {
    acquisitionPriority = Math.min(acquisitionPriority, 10);
    acquisitionReasons.push("generic-root-index-feed-or-sitemap");
  }
  if (unrelatedPolicy && !declaredEndpoint) {
    acquisitionPriority = Math.min(acquisitionPriority, 20);
    acquisitionReasons.push("unrelated-policy-or-authority-page");
  }
  if (video) {
    acquisitionPriority = Math.max(0, acquisitionPriority - 80);
    acquisitionReasons.push("video-source-deprioritized");
  } else {
    acquisitionReasons.push("text-source");
  }
  if (!exactProjectSignal && !namedFacilitySignal) {
    acquisitionReasons.push("no-exact-project-identity-signal");
  }

  return {
    ...source,
    discoveryCandidateRank: Number.isInteger(source.discoveryCandidateRank)
      ? source.discoveryCandidateRank
      : discoveryRank,
    acquisitionPriority,
    sourceFamily,
    sourceFamilyPriority,
    acquisitionReasons: [...new Set(acquisitionReasons)],
  };
}

/**
 * Adds a deterministic, pre-open acquisition preference. This is deliberately
 * independent from project identity and evidence eligibility assessments.
 */
export function rankAcquisitionCandidates(candidates = [], project = {}) {
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => rankCandidate(candidate ?? {}, project, index + 1));
  const ordered = ranked.sort((left, right) =>
    right.acquisitionPriority - left.acquisitionPriority
    || right.sourceFamilyPriority - left.sourceFamilyPriority
    || left.discoveryCandidateRank - right.discoveryCandidateRank
    || String(left.url ?? "").localeCompare(String(right.url ?? "")));
  const diversified = [];
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].acquisitionPriority === ordered[start].acquisitionPriority) end += 1;
    const familyQueues = new Map();
    for (const candidate of ordered.slice(start, end)) {
      const queue = familyQueues.get(candidate.sourceFamily) ?? [];
      queue.push(candidate);
      familyQueues.set(candidate.sourceFamily, queue);
    }
    while ([...familyQueues.values()].some((queue) => queue.length)) {
      for (const queue of familyQueues.values()) {
        const candidate = queue.shift();
        if (candidate) diversified.push(candidate);
      }
    }
    start = end;
  }
  return diversified.map((candidate, index) => ({ ...candidate, acquisitionRank: index + 1 }));
}