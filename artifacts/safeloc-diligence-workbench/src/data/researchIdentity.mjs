import {
  corroborateRelatedFacilityAcrossPassages as corroborateRetainedFacilityIdentity,
  matchProject,
  traceProjectMatch,
  extractResearchEntityRoles,
} from "./researchClaimVerifier.mjs";

export { extractResearchEntityRoles };

/** Extraction admission only. Never use this as identity or quote proof. */
export function assessFindingsPassageAdmission(passage, identity = {}) {
  const text = typeof passage === "string" ? passage : "";
  const match = assessResearchFindingProjectMatch(text, identity);
  const examination = assessResearchPassageExaminationEligibility(text, identity);
  const words = ` ${normalize(text)} `;
  const contains = (value) => Boolean(normalize(value) && words.includes(` ${normalize(value)} `));
  const basis = [...examination.basis];
  const requestedStates = statesIn(String(identity.location ?? ""));
  const explicitState = stateIn(identity.state ?? identity.knownData?.state ?? "");
  if (explicitState) requestedStates.push(explicitState);
  if (statesIn(text).some((state) => requestedStates.includes(state))) basis.push("requested-state");
  const named = basis.includes("distinctive-project-name");
  const otherNamedProject = !named && /\bProject\s+(?!Name\b)[A-Z][A-Za-z0-9'-]+\b/.test(text)
    && ![identity.name, ...(identity.knownData?.aliases ?? [])].some(contains);
  if (match.conflict || otherNamedProject) {
    return { eligible: false, basis, reason: "explicit-conflict" };
  }
  const eligible = named || (basis.includes("requested-operator")
    && basis.some((item) => ["requested-state", "requested-city", "requested-county"].includes(item)));
  return { eligible, basis, reason: eligible ? "admitted" : "insufficient-project-operator-location-signals" };
}

const STATES = [
  ["Alabama", "AL"], ["Alaska", "AK"], ["Arizona", "AZ"], ["Arkansas", "AR"],
  ["California", "CA"], ["Colorado", "CO"], ["Connecticut", "CT"], ["Delaware", "DE"],
  ["Florida", "FL"], ["Georgia", "GA"], ["Hawaii", "HI"], ["Idaho", "ID"],
  ["Illinois", "IL"], ["Indiana", "IN"], ["Iowa", "IA"], ["Kansas", "KS"],
  ["Kentucky", "KY"], ["Louisiana", "LA"], ["Maine", "ME"], ["Maryland", "MD"],
  ["Massachusetts", "MA"], ["Michigan", "MI"], ["Minnesota", "MN"], ["Mississippi", "MS"],
  ["Missouri", "MO"], ["Montana", "MT"], ["Nebraska", "NE"], ["Nevada", "NV"],
  ["New Hampshire", "NH"], ["New Jersey", "NJ"], ["New Mexico", "NM"], ["New York", "NY"],
  ["North Carolina", "NC"], ["North Dakota", "ND"], ["Ohio", "OH"], ["Oklahoma", "OK"],
  ["Oregon", "OR"], ["Pennsylvania", "PA"], ["Rhode Island", "RI"], ["South Carolina", "SC"],
  ["South Dakota", "SD"], ["Tennessee", "TN"], ["Texas", "TX"], ["Utah", "UT"],
  ["Vermont", "VT"], ["Virginia", "VA"], ["Washington", "WA"], ["West Virginia", "WV"],
  ["Wisconsin", "WI"], ["Wyoming", "WY"],
];

const normalize = (value) => String(value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Co-occurrence permits examination, not identity proof or financial use.
 * Explicit conflicts from the shared resolver still veto admission.
 */
export function assessResearchPassageExaminationEligibility(passage, identity = {}) {
  const text = typeof passage === "string" ? passage : "";
  const resolver = matchProject(text, identity);
  if (resolver.verdict === "unrelated"
    && /conflict|not the requested location|distinguishes/i.test(resolver.reason)) {
    return { eligible: false, basis: [], reason: "scope-unconfirmed" };
  }
  const normalized = ` ${normalize(text)} `;
  const contains = (value) => Boolean(normalize(value)
    && normalized.includes(` ${normalize(value)} `));
  const city = identity.city ?? requestedCity(identity);
  const county = String(identity.county ?? requestedCounty(identity)).replace(/\bcounty\b/gi, "").trim();
  const locationWords = new Set(normalize(`${city} ${county}`).split(" "));
  const generic = new Set(["campus", "project", "data", "center", "centre", "datacenter",
    "facility", "building", "site", "hyperscale", "park", "the", "of", "and", "county"]);
  const distinctive = normalize(identity.name ?? identity.projectName).split(" ")
    .filter((word) => word && !generic.has(word) && !locationWords.has(word));
  const aliases = [
    ...(Array.isArray(identity.aliases) ? identity.aliases : []),
    ...(Array.isArray(identity.knownData?.aliases) ? identity.knownData.aliases : []),
  ];
  const basis = [];
  if (contains(identity.operator ?? identity.knownData?.operator)) basis.push("requested-operator");
  if (distinctive.length && distinctive.every((word) => contains(word))) basis.push("distinctive-project-name");
  if (aliases.some(contains)) basis.push("requested-alias");
  const nameSupported = basis.length > 0;
  if (contains(city)) basis.push("requested-city");
  if (contains(county)) basis.push("requested-county");
  return {
    eligible: nameSupported && basis.some((item) => item === "requested-city" || item === "requested-county"),
    basis,
    reason: resolver.verdict === "exact-project" ? "exact-project" : "scope-unconfirmed",
  };
}

function stateIn(value) {
  const normalized = normalize(value);
  return STATES.find(([name]) => normalize(name) === normalized)?.[0]
    ?? STATES.find(([, code]) => code.toLocaleLowerCase() === normalized)?.[0];
}

function statesIn(value) {
  const states = STATES.filter(([name]) => {
    const namePattern = new RegExp(`(?:^|[^a-z])${escaped(name.toLocaleLowerCase())}(?:$|[^a-z])`, "i");
    return namePattern.test(value);
  }).map(([name]) => name);
  const abbreviations = STATES
    .filter(([, code]) => new RegExp(`(?:,\\s*|\\(\\s*|\\s)${code}(?=$|[\\s.,;)])`).test(value))
    .map(([name]) => name);
  return [...new Set([...states, ...abbreviations])];
}

function requestedCity(identity) {
  const supplied = identity?.knownData?.city;
  if (typeof supplied === "string" && supplied.trim()) return supplied.trim();
  if (typeof identity?.location !== "string") return "";
  return identity.location.split(",").map((part) => part.trim()).find((part) =>
    part && !/county\b/i.test(part) && !stateIn(part) && !/^(?:us|united states)$/i.test(part)) ?? "";
}

function requestedCounty(identity) {
  if (typeof identity?.knownData?.county === "string" && identity.knownData.county.trim()) {
    return identity.knownData.county.trim();
  }
  return typeof identity?.location === "string"
    ? identity.location.match(/\b([\w .'-]+County)\b/i)?.[1] ?? ""
    : "";
}

function sentenceContainsIdentity(sentence, names) {
  const normalized = ` ${normalize(sentence)} `;
  return names.some((name) => normalized.includes(` ${name} `));
}

function removeAdministrativeLocations(sentence) {
  return sentence
    .replace(/\b(?:its|their|the operator'?s|operator'?s|the company'?s|company'?s|the owner'?s|owner'?s|the developer'?s|developer'?s|the sponsor'?s|sponsor'?s)\s+(?:headquarters?|HQ|home office)\b[^.;]*/gi, "")
    .replace(/\b(?:operator|company|owner|developer|sponsor)\b[^.;]{0,100}\b(?:headquartered|headquarters?|HQ|home office)\b[^.;]*/gi, "")
    .replace(/[,;]?\s*(?:which|who)\s+(?:is|was)?\s*headquartered\b[^.;]*/gi, "");
}

function projectSubjectFragments(sentences, names) {
  const comparisons = /\b(?:compared\s+(?:with|to)|versus|vs\.?|unlike|whereas|in contrast to|while|(?:and\s+)?(?:is|was)\s+unrelated\s+to)\b|,\s*(?:but|while|whereas)\b|\b(?:and|but)\s+(?:a|another|the|other|separate|different|competing)\s+(?:project|site|campus|facility)\b/gi;
  return sentences
    .filter((sentence) => sentenceContainsIdentity(sentence, names))
    .map((sentence) => removeAdministrativeLocations(sentence)
      .split(comparisons)
      .map((fragment) => fragment.trim())
      .find((fragment) => fragment && sentenceContainsIdentity(fragment, names)) ?? "")
    .filter(Boolean);
}

function locationAssertions(subjectText) {
  const statePattern = STATES
    .flatMap(([name, code]) => [name, code])
    .sort((left, right) => right.length - left.length)
    .map(escaped)
    .join("|");
  const pairPattern = new RegExp(
    `\\b(?:located\\s+in|based\\s+in|campus\\s+in|site\\s+in|facility\\s+in|in|at|near)\\s+(?:the\\s+city\\s+of\\s+)?([A-Z][A-Za-z.'-]*(?:\\s+[A-Z][A-Za-z.'-]*){0,1})\\s*,\\s*(${statePattern})\\b`,
    "gi",
  );
  const pairs = [...subjectText.matchAll(pairPattern)].map((match) => ({
    city: normalize(match[1]),
    state: stateIn(match[2]),
  })).filter((item) => item.city && !stateIn(item.city));

  const cityPattern = /\b(?:located\s+in|based\s+in|campus\s+in|site\s+in|facility\s+in|in|at|near)\s+(?:the\s+city\s+of\s+)?([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)?)\b/g;
  const cities = [...subjectText.matchAll(cityPattern)]
    .map((match) => normalize(match[1]))
    .filter((city) => city && !stateIn(city));
  return { pairs, cities };
}

function operatorAssertions(subjectText) {
  const pattern = /\b(?:operated|owned|developed|sponsored|managed)\s+by\s+([A-Z][A-Za-z0-9&.'’'-]*(?:\s+[A-Z][A-Za-z0-9&.'’'-]*){0,5})/g;
  return [...subjectText.matchAll(pattern)].map((match) => normalize(match[1]));
}

function operatorsConflict(expected, actuals) {
  const ignored = new Set(["the", "and", "company", "operator", "owner", "developer", "sponsor", "inc", "llc", "ltd", "corporation", "corp", "group"]);
  const expectedTokens = normalize(expected).split(" ").filter((token) => token && !ignored.has(token));
  if (!expectedTokens.length) return false;
  return actuals.some((actual) => {
    const actualTokens = actual.split(" ").filter((token) => token && !ignored.has(token));
    if (!actualTokens.length) return false;
    return !expectedTokens.some((token) => actualTokens.includes(token));
  });
}

/**
 * Classifies a retained passage using the same project, location, and operator
 * rules in the server and client. Provider identity flags are necessary signals,
 * not substitutes for identity text in the retained passage.
 */
export function assessResearchProjectIdentity(passage, candidate = {}, identity = {}, { onDecision } = {}) {
  void candidate;
  const decision = matchProject(passage, identity);
  if (typeof onDecision === "function") {
    onDecision({
      resolver: { ...decision },
      trace: traceProjectMatch(passage, identity),
    });
  }
  return decision.verdict;
}

export function corroborateRelatedFacilityAcrossPassages(passages, identity = {}) {
  return corroborateRetainedFacilityIdentity(passages, identity);
}

/** Findings attribution is independent of financial eligibility and model flags. */
export function assessResearchFindingProjectMatch(passage, identity = {}) {
  const text = typeof passage === "string" ? passage : "";
  // Operator attribution must not conflate a power developer with a tenant.
  const withoutOperator = { ...identity, operator: null,
    knownData: { ...identity.knownData, operator: null } };
  const decision = matchProject(text, withoutOperator);
  let conflict = decision.verdict === "unrelated"
    && /conflict|not the requested location|distinguishes|different project/i.test(decision.reason);
  const words = ` ${normalize(text)} `;
  const contains = (value) => Boolean(normalize(value) && words.includes(` ${normalize(value)} `));
  const county = identity.county ?? requestedCounty(identity);
  const city = identity.city ?? requestedCity(identity);
  const locationWords = new Set(normalize(`${county} ${city} ${identity.state ?? identity.knownData?.state ?? ""}`).split(" "));
  const generic = new Set(["project", "campus", "data", "center", "centre", "facility", "site", "the", "county", "texas"]);
  const distinctive = normalize(identity.name).split(" ")
    .filter((word) => word && !generic.has(word) && !locationWords.has(word));
  const aliases = [
    ...(Array.isArray(identity.aliases) ? identity.aliases : []),
    ...(Array.isArray(identity.knownData?.aliases) ? identity.knownData.aliases : []),
  ].filter((alias) => typeof alias === "string");
  const distinctiveAliases = aliases.filter((alias) => normalize(alias).split(" ")
    .some((word) => word && !generic.has(word) && !locationWords.has(word)));
  const named = (distinctive.length > 0 && distinctive.every(contains)) || distinctiveAliases.some(contains);
  conflict ||= [identity.name, ...distinctiveAliases].filter((name) => typeof name === "string" && name.trim())
    .some((name) => new RegExp(`\\b(?:not|unrelated to|different from|rather than)\\s+(?:the\\s+)?${escaped(name.trim())}\\b`, "i").test(text));
  const located = contains(county) || contains(city);
  return { matches: !conflict && decision.verdict === "exact-project" && named && located, conflict, reason: decision.reason };
}
