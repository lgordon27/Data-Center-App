import { normalizeEvidenceRecord } from "@/data/evidenceSemanticPolicy.mjs";

export type AffirmativeFinancialPointTarget =
  | "electricity_cost"
  | "water_consumption"
  | "grid_interconnection";

type QuantityPattern = {
  unit: string;
  pattern: RegExp;
  dollarPrefix?: boolean;
};

const UNIT_PATTERNS: Record<AffirmativeFinancialPointTarget, QuantityPattern[]> = {
  electricity_cost: [
    { unit: "cents/kWh", pattern: /^\s*cents?\s*(?:\/|per)\s*kwh\b/i },
    { unit: "cents/kWh", pattern: /^\s*[¢c]\s*\/\s*kwh\b/i },
    { unit: "USD/MWh", pattern: /^\s*usd\s*\/\s*mwh\b/i },
    { unit: "USD/MWh", pattern: /^\s*\/\s*mwh\b/i, dollarPrefix: true },
    { unit: "USD/kWh", pattern: /^\s*usd\s*\/\s*kwh\b/i },
    { unit: "USD/GWh", pattern: /^\s*usd\s*\/\s*gwh\b/i },
  ],
  water_consumption: [
    { unit: "Mgal/year", pattern: /^\s*mgal(?:lons?)?\s*(?:\/|per)\s*(?:year|yr)\b/i },
    { unit: "million gallons/year", pattern: /^\s*million gallons?\s*(?:\/|per)\s*year\b/i },
    { unit: "gallons/year", pattern: /^\s*gallons?\s*(?:\/|per)\s*(?:year|yr)\b/i },
    { unit: "gal/year", pattern: /^\s*gal\s*\/\s*(?:year|yr)\b/i },
    { unit: "m3/year", pattern: /^\s*m3\s*(?:\/|per)\s*(?:year|yr)\b/i },
    { unit: "m³/year", pattern: /^\s*m³\s*(?:\/|per)\s*(?:year|yr)\b/i },
    { unit: "m3/year", pattern: /^\s*cubic meters?\s*(?:\/|per)\s*year\b/i },
  ],
  grid_interconnection: [
    { unit: "months", pattern: /^\s*months?\b/i },
    { unit: "months", pattern: /^\s*mos?\b/i },
    { unit: "days", pattern: /^\s*days?\b/i },
    { unit: "weeks", pattern: /^\s*weeks?\b/i },
    { unit: "weeks", pattern: /^\s*wks?\b/i },
    { unit: "years", pattern: /^\s*years?\b/i },
    { unit: "years", pattern: /^\s*yrs?\b/i },
  ],
};

type PointQuantity = {
  start: number;
  end: number;
  unitEnd: number;
  normalizedValue: number;
};

const NUMBER_PATTERN = /[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
const NEGATED_OR_UNCERTAIN = /\b(?:not|no|never|without|denied|denies|denial|unknown|unclear|uncertain|unconfirmed|unverified|pending|missing|absent|unavailable|disputed|contested|cannot|could\s+not|may|might|could|alleged|reportedly)\b|n't\b/i;
const NON_POINT_QUALIFIER = /\b(?:at\s+least|at\s+most|up\s+to|no\s+more\s+than|no\s+less\s+than|less\s+than|more\s+than|over|under|approximately|approx\.?|about|around|roughly|minimum\s+of|maximum\s+of|between|from)\b|(?:<=|>=|≤|≥|<|>)/i;
const COMPARATIVE_CONTEXT = /\b(?:compared|versus|vs\.?|benchmark|market|industry\s+average|regional\s+average|general\s+(?:market\s+)?rate|other\s+(?:facility|project|site|hall)|than|whereas|however|but|while|unlike|against|higher|lower|greater|less|relative\s+to|in\s+contrast|rather\s+than|if|unless|assuming|provided\s+that|subject\s+to)\b/i;
const SUBJECT_SCOPE_TAIL = /\b(?:hall|phase|facility|building|campus|site|unit|center|centre|plant)\b/i;

function canonicalText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseOccurrences(text: string, phrase: string): Array<{ start: number; end: number }> {
  const tokens = canonicalText(phrase).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const expression = new RegExp(
    `(?<![\\p{L}\\p{N}])${tokens.map(escapeRegExp).join("[^\\p{L}\\p{N}]+")}(?![\\p{L}\\p{N}])`,
    "giu",
  );
  return [...text.matchAll(expression)].map((match) => {
    const start = match.index ?? 0;
    return { start, end: start + match[0].length };
  });
}

function splitAssertions(passage: string): string[] {
  return passage
    .split(/(?<=[.!?])\s+|[;\n]+/u)
    .map((assertion) => assertion.trim())
    .filter(Boolean);
}

function measureMatches(
  target: AffirmativeFinancialPointTarget,
  text: string,
): Array<{ start: number; end: number }> {
  const patterns: Record<AffirmativeFinancialPointTarget, RegExp> = {
    electricity_cost: /\b(?:(?:electricity|power)\b[\p{L}\p{N}\s-]{0,28}\b(?:tariff|rate|price|cost)\b|(?:tariff|rate|price|cost)\b[\p{L}\p{N}\s-]{0,28}\b(?:electricity|power)\b)/giu,
    water_consumption: /\bwater\b[\p{L}\p{N}\s-]{0,28}\b(?:consum(?:e|ed|ption)|use|withdraw(?:al|n)?)\b/giu,
    grid_interconnection: /\b(?:grid|interconnection|utility connection)\b[\p{L}\p{N}\s-]{0,28}\b(?:timeline|delay|interconnection|connection)\b/giu,
  };
  return [...text.matchAll(patterns[target])].map((match) => {
    const start = match.index ?? 0;
    return { start, end: start + match[0].length };
  });
}

function pointQuantities(
  target: AffirmativeFinancialPointTarget,
  assertion: string,
): PointQuantity[] {
  const patterns = UNIT_PATTERNS[target];
  const found = new Map<string, PointQuantity>();
  for (const match of assertion.matchAll(NUMBER_PATTERN)) {
    const rawNumber = Number(match[0].replaceAll(",", ""));
    if (!Number.isFinite(rawNumber)) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const preceding = assertion.slice(Math.max(0, start - 8), start);
    const dollarPrefix = /\$\s*$/.test(preceding);
    const suffix = assertion.slice(end);
    for (const { unit, pattern, dollarPrefix: requiresDollarPrefix } of patterns) {
      if (requiresDollarPrefix && !dollarPrefix) continue;
      const matchedUnit = suffix.match(pattern);
      if (!matchedUnit) continue;
      const normalized = normalizeEvidenceRecord({
        id: target,
        value: rawNumber,
        numericValue: rawNumber,
        unit,
        description: "target-specific source measurement",
        sourceContext: assertion,
        explicitZero: true,
      });
      if (normalized.validationStatus !== "valid" || typeof normalized.normalizedValue !== "number") continue;
      const key = `${start}:${end}`;
      const prior = found.get(key);
      if (prior && prior.normalizedValue !== normalized.normalizedValue) {
        found.set(key, { ...prior, normalizedValue: Number.NaN });
      } else if (!prior) {
        found.set(key, { start, end, unitEnd: end + matchedUnit[0].length, normalizedValue: normalized.normalizedValue });
      }
    }
  }
  return [...found.values()];
}

function isRange(assertion: string): boolean {
  const numericMatches = [...assertion.matchAll(NUMBER_PATTERN)];
  for (let index = 0; index < numericMatches.length - 1; index += 1) {
    const first = numericMatches[index];
    const second = numericMatches[index + 1];
    const firstEnd = (first.index ?? 0) + first[0].length;
    const between = assertion.slice(firstEnd, second.index ?? firstEnd).replaceAll("$", "");
    if (/^\s*(?:to|through|[-–—]|and)\s*$/i.test(between)) return true;
  }
  return false;
}

function affirmativeSubjectAndQuantity(
  target: AffirmativeFinancialPointTarget,
  assertion: string,
  projectName: string,
  facility: string,
  phase: string,
  expectedNormalizedValue: number,
): boolean {
  const text = canonicalText(assertion);
  if (
    !text ||
    NEGATED_OR_UNCERTAIN.test(text) ||
    NON_POINT_QUALIFIER.test(text) ||
    COMPARATIVE_CONTEXT.test(text) ||
    isRange(text)
  ) return false;

  const quantities = pointQuantities(target, text);
  if (quantities.length !== 1 || !Number.isFinite(quantities[0].normalizedValue)) return false;
  const quantity = quantities[0];
  if (
    Math.abs(quantity.normalizedValue - expectedNormalizedValue) >
    Math.max(1, Math.abs(expectedNormalizedValue)) * 1e-9
  ) return false;

  const measures = measureMatches(target, text);
  if (measures.length !== 1) return false;
  const measure = measures[0];
  if (quantity.start < measure.end) return false;

  const [project, scopedFacility, scopedPhase] = [projectName, facility, phase].map((label) =>
    phraseOccurrences(text, label),
  );
  const subjectModifiers = text.slice(scopedPhase[0]?.end ?? 0, measure.start).trim();
  if (
    project.length !== 1 ||
    scopedFacility.length !== 1 ||
    scopedPhase.length !== 1 ||
    project[0].start >= scopedFacility[0].start ||
    scopedFacility[0].start >= scopedPhase[0].start ||
    scopedPhase[0].end > measure.start ||
    !/^\s*$/.test(text.slice(project[0].end, scopedFacility[0].start)) ||
    !/^\s*$/.test(text.slice(scopedFacility[0].end, scopedPhase[0].start)) ||
    !/^[\p{L}\p{N}\s-]*$/u.test(subjectModifiers) ||
    subjectModifiers.split(/\s+/).filter(Boolean).length > 4 ||
    /\b(?:for|in|at|with|but|and|to|of|has|had|is|was|were|reports?|says|claims?|according)\b/i.test(subjectModifiers)
  ) return false;

  // Do not let a second facility/phase/project recipient appear after the
  // scoped subject. The exact project/facility/phase must be the subject.
  if (SUBJECT_SCOPE_TAIL.test(text.slice(measure.end))) return false;

  const betweenMeasureAndQuantity = text.slice(measure.end, quantity.start);
   // Validate the whole bridge, not merely a copula somewhere in it. Otherwise
   // "tariff is a hypothetical figure of $78/MWh" falsely asserts that tariff.
   const affirmativeRelation =
     /^\s*(?:(?:is|are|was|were|will\s+be|stands?\s+at|stood\s+at|equals?|set\s+at|listed\s+at|priced\s+at|costs?|measures?|of|at|increased?\s+to|decreased?\s+to|rose\s+to|fell\s+to|dropped\s+to|climbed\s+to)|(?:is|are)\s+(?:forecast|projected|expected|planned|scheduled)\s+(?:to\s+be|at)|[:=])\s*(?:USD\s*|US\s*\$\s*|\$\s*)?$/i;
   if (!affirmativeRelation.test(betweenMeasureAndQuantity)) return false;
   // A trailing recipient, condition, omitted second endpoint, or competing
   // explanation cannot silently qualify the scoped point. Retain such text
   // as evidence-only until an independently clear assertion is available.
   return /^[\s.!?]*$/.test(text.slice(quantity.unitEnd));
}

export function hasAffirmativeScopedFinancialPoint(input: {
  passage: string;
  target: AffirmativeFinancialPointTarget;
  projectName: string;
  facility: string;
  phase: string;
  normalizedValue: number;
}): boolean {
  if (!Number.isFinite(input.normalizedValue)) return false;
  const assertions = splitAssertions(input.passage);
  const scopedAssertions = assertions.filter((assertion) => {
    const text = canonicalText(assertion);
    return [input.projectName, input.facility, input.phase].every((label) =>
      phraseOccurrences(text, label).length > 0,
    ) && measureMatches(input.target, text).length > 0;
  });
  // A neighboring contextual sentence may coexist with a clear assertion, but
  // another assertion about this same scoped measure must agree. Never select
  // one supported-looking sentence out of a contradictory retained quotation.
  return scopedAssertions.length > 0 && scopedAssertions.every((assertion) =>
    affirmativeSubjectAndQuantity(
      input.target,
      assertion,
      input.projectName,
      input.facility,
      input.phase,
      input.normalizedValue,
    ),
  );
}