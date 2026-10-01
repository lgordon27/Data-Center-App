import {
  corroborateRelatedFacilityAcrossPassages as corroborateRetainedFacilityIdentity,
  matchProject,
} from "./researchClaimVerifier.mjs";

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
export function assessResearchProjectIdentity(passage, candidate = {}, identity = {}) {
  void candidate;
  return matchProject(passage, identity).verdict;
}

export function corroborateRelatedFacilityAcrossPassages(passages, identity = {}) {
  return corroborateRetainedFacilityIdentity(passages, identity);
}