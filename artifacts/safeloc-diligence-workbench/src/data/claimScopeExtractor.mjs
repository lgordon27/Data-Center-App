const UNKNOWN_SCOPE = Object.freeze({
  facilityScope: "unknown",
  phaseScope: "unknown",
  claimTimePeriod: null,
  phaseIdentity: null,
});

const NUMBER_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
});

function splitSentences(value) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return [];
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/).map((part) => part.trim()).filter(Boolean);
}

function parseExpectedNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^[^\d-]*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function sentenceContainsValue(sentence, expectedNumber, claimValue) {
  if (expectedNumber !== null) {
    const numbers = sentence.matchAll(/(?<![\d.])(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?![\d.])/g);
    return [...numbers].some((match) => Number(match[1].replaceAll(",", "")) === expectedNumber);
  }
  if (typeof claimValue !== "string" || !claimValue.trim()) return false;
  return sentence.toLowerCase().includes(claimValue.trim().replace(/\s+/g, " ").toLowerCase());
}

function unitOccursNearValue(sentence, unit, expectedNumber) {
  if (typeof unit !== "string" || !unit.trim()) return false;
  const escapedUnit = unit.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const unitPattern = new RegExp(`\\b${escapedUnit}(?![a-z])`, "i");
  if (expectedNumber === null) return unitPattern.test(sentence);
  const numbers = sentence.matchAll(/(?<![\d.])(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?![\d.])/g);
  return [...numbers].some((match) => {
    if (Number(match[1].replaceAll(",", "")) !== expectedNumber) return false;
    const start = Math.max(0, match.index - 12);
    const end = Math.min(sentence.length, match.index + match[0].length + 24);
    return unitPattern.test(sentence.slice(start, end));
  });
}

function claimClause(sentence, expectedNumber, claimValue) {
  const clauses = sentence.split(/\s*(?:;|:\s*|\b(?:whereas|while|but)\b)\s*/i).filter(Boolean);
  if (clauses.length < 2) return sentence;
  const matching = clauses.filter((clause) => sentenceContainsValue(clause, expectedNumber, claimValue));
  return matching.length === 1 ? matching[0] : sentence;
}

function phaseNameIn(text) {
  const named = text.match(/\b(?:phase\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|last|final|initial|[a-z]|\d+|[ivx]+)|(?:first|second|third|fourth|fifth|last|final|initial)\s+phase|(?:(?:20\d{2}|FY\s?20\d{2})\s+)?(?:construction|development|operating|expansion|buildout|commissioning)\s+phase)\b/i);
  if (!named) return null;
  const original = named[0].trim();
  if (/^(?:first|second|third|fourth|fifth|last|final|initial)\s+phase$/i.test(original)) {
    return `${original.replace(/\s+phase$/i, "")} phase`;
  }
  return original.replace(/\s+/g, " ");
}

function buildingIdentifiers(text) {
  const matches = [...text.matchAll(/\b[A-Z]{2,}\d{1,}[A-Z]?\b/g)].map((match) => match[0]);
  return [...new Set(matches)];
}

function buildingCount(text) {
  const match = text.match(/\b(?:(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[ -]building|building(?:s)?\s+(?:number\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve))s?\b/i);
  if (!match) return null;
  const rawCount = match[1] ?? match[2];
  const count = /^\d+$/.test(rawCount) ? Number(rawCount) : NUMBER_WORDS[rawCount.toLowerCase()];
  return Number.isInteger(count) && count > 0 ? `${count} ${count === 1 ? "building" : "buildings"}` : null;
}

function extractPeriod(text) {
  const normalized = text.replace(/\s+/g, " ");
  const explicit = normalized.match(/\b(?:as of|during)\s+((?:FY\s*)?20\d{2}(?:[-/]\d{1,2}(?:[-/]\d{1,2})?)?)\b/i)
    ?? normalized.match(/\bfor\s+(?:the\s+)?(?:calendar|fiscal)\s+year\s+((?:FY\s*)?20\d{2})\b/i)
    ?? normalized.match(/\b(FY\s*20\d{2}|Q[1-4]\s+20\d{2})\b/i);
  return explicit?.[1]?.replace(/\s+/g, " ").trim().toUpperCase().replace(/^FY\s*/, "FY") ?? null;
}

function deriveScope(text) {
  const result = { ...UNKNOWN_SCOPE };
  const normalized = text.toLowerCase();
  const phaseName = phaseNameIn(text);
  const buildingIds = buildingIdentifiers(text);
  const count = buildingCount(text);
  const isExactPhase = Boolean(phaseName);
  const explicitProject = /\b(?:project|campus|site)\b/.test(normalized);
  const projectTotal = /\b(?:all phases|across (?:all )?\w+ phases|(?:entire|whole|full|complete) campus|campus[- ]wide|project[- ]wide|campus total|total campus|total project|project(?:'s)? total capacity|project capacity)\b/i.test(text);
  const explicitFacility = /\b(?:facility|building|data center|data centre)\b/i.test(text);

  if (isExactPhase) {
    result.facilityScope = "project";
    result.phaseScope = "exact-phase";
    result.phaseIdentity = [
      phaseName,
      buildingIds.length ? buildingIds.join("/") : null,
      count,
    ].filter(Boolean).join("; ") || phaseName;
  } else if (explicitProject) {
    result.facilityScope = "project";
    if (projectTotal || /\bcampus\b/i.test(text) && /\b(?:capacity|load|power|MW|megawatt|total)\b/i.test(text)) {
      result.phaseScope = "all-phases";
    }
  } else if (explicitFacility) {
    result.facilityScope = "facility";
    if (buildingIds.length || count) {
      result.phaseIdentity = [
        buildingIds.length ? buildingIds.join("/") : null,
        count,
      ].filter(Boolean).join("; ") || null;
    }
  }

  result.claimTimePeriod = extractPeriod(text);
  return result;
}

function adjacentSentenceRefersToClaim(primary, adjacent) {
  const text = adjacent.toLowerCase();
  const primaryPhase = phaseNameIn(primary);
  const phaseReference = /\b(?:this|that|the same)\s+phase\b|\b(?:these|those)\s+buildings\b/i.test(adjacent);
  if (primaryPhase && phaseReference) return true;

  const primaryBuildings = buildingIdentifiers(primary);
  if (primaryBuildings.some((building) => adjacent.includes(building))) return true;

  const claimReference = /\b(?:this|that|the same)\s+(?:capacity|figure|amount|value|total|claim|load|output|interconnection)\b/i.test(adjacent);
  if (claimReference) return true;
  return false;
}

function mergeAdjacentContext(primarySentence, sentences, primaryIndex, primaryScope) {
  const adjacentIndices = [primaryIndex - 1, primaryIndex + 1]
    .filter((index) => index >= 0 && index < sentences.length);
  const candidates = adjacentIndices
    .filter((index) => adjacentSentenceRefersToClaim(primarySentence, sentences[index]))
    .map((index) => deriveScope(sentences[index]));
  const merged = { ...primaryScope };

  for (const field of ["facilityScope", "phaseScope"]) {
    if (merged[field] !== "unknown") continue;
    const known = [...new Set(candidates.map((candidate) => candidate[field]).filter((value) => value !== "unknown"))];
    if (known.length === 1) merged[field] = known[0];
  }
  if (!merged.claimTimePeriod) {
    const knownPeriods = [...new Set(candidates.map((candidate) => candidate.claimTimePeriod).filter(Boolean))];
    if (knownPeriods.length === 1) merged.claimTimePeriod = knownPeriods[0];
  }
  if (!merged.phaseIdentity) {
    const knownIdentities = [...new Set(candidates.map((candidate) => candidate.phaseIdentity).filter(Boolean))];
    if (knownIdentities.length === 1) merged.phaseIdentity = knownIdentities[0];
  }
  return merged;
}

/**
 * Extract only scope and claim-period details tied to the sentence containing
 * the claimed value. Adjacent context is used only when it explicitly refers
 * back to that value or phase.
 */
export function extractClaimScopeFromPassage({
  claimPassage,
  claimValue,
  numericValue,
  unit,
} = {}) {
  const sentences = splitSentences(claimPassage);
  const expectedNumber = parseExpectedNumber(numericValue ?? claimValue);
  const valueSentences = sentences
    .map((sentence, index) => ({ sentence, index }))
    .filter(({ sentence }) => sentenceContainsValue(sentence, expectedNumber, claimValue));
  if (!valueSentences.length) return { ...UNKNOWN_SCOPE };

  const unitMatches = valueSentences.filter(({ sentence }) => unitOccursNearValue(sentence, unit, expectedNumber));
  const candidates = unitMatches.length ? unitMatches : valueSentences;
  if (candidates.length !== 1) return { ...UNKNOWN_SCOPE };

  const { sentence, index } = candidates[0];
  const relevantClause = claimClause(sentence, expectedNumber, claimValue);
  const primaryScope = deriveScope(relevantClause);
  return mergeAdjacentContext(sentence, sentences, index, primaryScope);
}