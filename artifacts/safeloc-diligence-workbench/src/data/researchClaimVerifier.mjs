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

const STATE_BY_CODE = new Map(STATES.map(([name, code]) => [code, name]));
const STATE_BY_NORMALIZED_NAME = new Map(STATES.map(([name]) => [normalizeWords(name), name]));
const GENERIC_PROJECT_TOKENS = new Set([
  "project", "the", "data", "center", "centre", "campus", "facility", "site",
]);
const GENERIC_DISTINCTIVENESS_TOKENS = new Set([
  "project", "campus", "facility", "site", "data", "center", "datacenter",
  "hyperscale", "park",
]);

function normalizeWords(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/['’]s\b/g, "")
    .replace(/s'\b/g, "s")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeQuote(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks whether the exact quotation occurs in the captured document text.
 * Only whitespace, straight/curly quote marks, and common dash variants vary.
 */
export function verifyQuote(documentText, quote) {
  const normalizedDocument = normalizeQuote(documentText);
  const normalizedQuote = normalizeQuote(quote);
  const wordCount = normalizedQuote.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu)?.length ?? 0;
  return wordCount >= 8 && normalizedQuote.length >= 40 && normalizedDocument.includes(normalizedQuote);
}

function canonicalState(value) {
  const normalized = normalizeWords(value);
  if (normalized === "district of columbia" || normalized === "dc" || normalized === "d c") {
    return "District of Columbia";
  }
  return STATE_BY_NORMALIZED_NAME.get(normalized)
    ?? STATE_BY_CODE.get(normalized.toUpperCase())
    ?? null;
}

function statePatternValues() {
  return [
    ...STATES.flatMap(([name, code]) => [name, code]),
    "District of Columbia",
    "D.C.",
  ].sort((left, right) => right.length - left.length);
}

const CAPITALIZED_WORD = "[A-Z][\\p{L}\\p{M}.'’\\-]*";
const PLACE_NAME = `${CAPITALIZED_WORD}(?:\\s+${CAPITALIZED_WORD}){0,3}`;
const STATE_VALUE_PATTERN = statePatternValues().map(escapeRegExp).join("|");

function isWashingtonException(text, start, end) {
  const before = text.slice(Math.max(0, start - 30), start);
  const after = text.slice(end, Math.min(text.length, end + 45));
  return /\bWashington\s*$/i.test(before) && /^\s*,?\s*(?:D\s*\.?\s*C\.?|District\s+of\s+Columbia)\b/i.test(after)
    || /^\s*County\b/i.test(after);
}

function detailedLocations(text) {
  const input = typeof text === "string" ? text : "";
  const found = [];
  const occupiedStateRanges = [];

  const dcPattern = new RegExp(
    `\\b(?<city>Washington)\\s*,?\\s*(?<state>D\\s*\\.?\\s*C\\.?|District\\s+of\\s+Columbia)\\b`,
    "gi",
  );
  for (const match of input.matchAll(dcPattern)) {
    const start = match.index;
    const end = start + match[0].length;
    found.push({
      location: { city: match.groups.city, state: "District of Columbia" },
      start,
      end,
      stateStart: start + match[0].indexOf(match.groups.state),
      stateEnd: end,
    });
    occupiedStateRanges.push([start, end]);
  }

  const pairPattern = new RegExp(
    `\\b(?<place>${PLACE_NAME})\\s*,\\s*(?<state>${STATE_VALUE_PATTERN})\\b`,
    "gu",
  );
  for (const match of input.matchAll(pairPattern)) {
    const state = canonicalState(match.groups.state);
    if (!state) continue;
    const start = match.index;
    const end = start + match[0].length;
    const place = match.groups.place.trim();
    const county = /\bCounty$/i.test(place) ? place : null;
    const location = county ? { county, state } : { city: place, state };

    if (county) {
      const before = input.slice(Math.max(0, start - 80), start);
      const cityMatch = before.match(new RegExp(`(?<city>${PLACE_NAME})\\s*,\\s*$`, "u"));
      if (cityMatch && !/\b(?:County|Project|Campus|Facility|Center|Site)$/i.test(cityMatch.groups.city)) {
        location.city = cityMatch.groups.city.trim();
      }
    }

    found.push({
      location,
      start: location.city && county
        ? start - input.slice(Math.max(0, start - 80), start).length + input.slice(Math.max(0, start - 80), start).lastIndexOf(location.city)
        : start,
      end,
      stateStart: start + match[0].lastIndexOf(match.groups.state),
      stateEnd: end,
    });
    occupiedStateRanges.push([start + match[0].lastIndexOf(match.groups.state), end]);
  }

  const abbreviationPairPattern = new RegExp(
    `\\b(?<place>${PLACE_NAME})\\s+(?<state>${STATES.map(([, code]) => code).join("|")})(?=$|[\\s.,;)])`,
    "gu",
  );
  for (const match of input.matchAll(abbreviationPairPattern)) {
    const start = match.index;
    const end = start + match[0].length;
    const stateStart = start + match[0].lastIndexOf(match.groups.state);
    if (occupiedStateRanges.some(([rangeStart, rangeEnd]) => stateStart < rangeEnd && end > rangeStart)) continue;
    const place = match.groups.place.trim();
    const county = /\bCounty$/i.test(place) ? place : null;
    found.push({
      location: county
        ? { county, state: canonicalState(match.groups.state) }
        : { city: place, state: canonicalState(match.groups.state) },
      start,
      end,
      stateStart,
      stateEnd: end,
    });
    occupiedStateRanges.push([stateStart, end]);
  }

  const countyPattern = new RegExp(`\\b(?<county>${PLACE_NAME}\\s+County)\\b`, "gu");
  for (const match of input.matchAll(countyPattern)) {
    const alreadyFound = found.some((item) =>
      item.location.county
      && item.location.county.toLocaleLowerCase() === match.groups.county.toLocaleLowerCase()
      && item.start <= match.index
      && item.end >= match.index + match[0].length);
    if (!alreadyFound) {
      found.push({
        location: { county: match.groups.county.trim() },
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  const fullStateNames = STATES.map(([name]) => name)
    .concat("District of Columbia")
    .sort((left, right) => right.length - left.length);
  for (const name of fullStateNames) {
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi");
    for (const match of input.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (occupiedStateRanges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)) continue;
      if (name === "Washington" && isWashingtonException(input, start, end)) continue;
      found.push({ location: { state: canonicalState(name) }, start, end });
      occupiedStateRanges.push([start, end]);
    }
  }

  // A city before a county is part of the same location phrase, for example
  // "Irving, Dallas County, Texas".
  const cityBeforeCountyPattern = new RegExp(
    `\\b(?:located\\s+in|based\\s+in|situated\\s+in|campus\\s+in|site\\s+in|facility\\s+in|in|at|near)\\s+(?<city>${PLACE_NAME})\\s*,\\s*(?=${PLACE_NAME}\\s+County\\b)`,
    "gu",
  );
  for (const match of input.matchAll(cityBeforeCountyPattern)) {
    const city = match.groups.city.trim();
    const end = match.index + match[0].length;
    if (found.some((item) =>
      item.location.county
      && item.location.city?.toLocaleLowerCase() === city.toLocaleLowerCase()
      && Math.abs(item.start - match.index) < 100)) continue;
    found.push({
      location: { city },
      start: match.index + match[0].indexOf(city),
      end,
    });
  }

  // Uppercase state abbreviations are recognized by themselves only when
  // introduced as a location, avoiding accidental matches of words like "in".
  const abbreviationPattern = new RegExp(
    `\\b(?:in|at|near|within|of)\\s+(?<state>${STATES.map(([, code]) => code).join("|")})\\b`,
    "g",
  );
  for (const match of input.matchAll(abbreviationPattern)) {
    const code = match.groups.state;
    const state = STATE_BY_CODE.get(code);
    const start = match.index + match[0].lastIndexOf(code);
    const end = start + code.length;
    if (occupiedStateRanges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)) continue;
    found.push({ location: { state }, start, end });
  }

  const unique = new Map();
  for (const item of found) {
    const key = `${item.location.city ?? ""}|${item.location.county ?? ""}|${item.location.state ?? ""}`;
    const previous = unique.get(key);
    if (!previous || item.start < previous.start) unique.set(key, item);
  }
  return [...unique.values()].sort((left, right) => left.start - right.start);
}

/**
 * Extracts simple U.S. city/state, county/state, and standalone state mentions.
 * State names are canonicalized; Washington County and Washington, D.C. are
 * not misreported as the state of Washington.
 */
export function parseLocations(text) {
  return detailedLocations(text).map(({ location }) => ({ ...location }));
}

function collectStrings(value) {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  return [];
}

function identityVariants(project) {
  const knownData = project?.knownData ?? {};
  const values = [
    ...collectStrings(project?.name ?? project?.projectName).map((value) => ({ value, kind: "name" })),
    ...collectStrings(project?.aliases).map((value) => ({ value, kind: "alias" })),
    ...collectStrings(knownData.aliases).map((value) => ({ value, kind: "alias" })),
    ...collectStrings(project?.operator ?? knownData.operator).map((value) => ({ value, kind: "operator" })),
  ];
  const unique = new Map();
  for (const { value, kind } of values) {
    const tokens = normalizeWords(value).split(" ").filter(Boolean);
    if (!tokens.length) continue;
    const matchingTokens = tokens.filter((token) => !GENERIC_PROJECT_TOKENS.has(token));
    const anchors = matchingTokens.length ? matchingTokens : tokens;
    const key = `${kind}|${anchors.slice().sort().join(" ")}`;
    if (!unique.has(key)) unique.set(key, { label: value, kind, tokens, matchingTokens: anchors });
  }
  return [...unique.values()];
}

function distinctiveProjectNameTokens(project, location) {
  const name = collectStrings(project?.name ?? project?.projectName)[0] ?? "";
  const locationTokens = [
    location.city,
    location.county,
    location.state,
  ].flatMap((value) => normalizeWords(value).split(" ").filter(Boolean));
  const excluded = new Set([...GENERIC_DISTINCTIVENESS_TOKENS, ...locationTokens]);
  return normalizeWords(name).split(" ").filter((token) => token && !excluded.has(token));
}

function tokenSpans(text) {
  const spans = [];
  const pattern = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu;
  for (const match of text.matchAll(pattern)) {
    const value = normalizeWords(match[0]);
    if (value) spans.push({ value, start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function findVariantMatches(text, variants) {
  const words = tokenSpans(text);
  const matches = [];
  for (const variant of variants) {
    const variantTokens = variant.matchingTokens ?? variant.tokens;
    const required = new Map();
    for (const token of variantTokens) required.set(token, (required.get(token) ?? 0) + 1);
    const requiredTokens = new Set(required.keys());
    for (let startIndex = 0; startIndex < words.length; startIndex += 1) {
      if (!requiredTokens.has(words[startIndex].value)) continue;
      const counts = new Map();
      const limit = Math.min(words.length, startIndex + Math.max(variantTokens.length * 5, 12));
      for (let endIndex = startIndex; endIndex < limit; endIndex += 1) {
        const token = words[endIndex].value;
        counts.set(token, (counts.get(token) ?? 0) + 1);
        if ([...required].every(([key, count]) => (counts.get(key) ?? 0) >= count)) {
          const requiredSpans = words
            .slice(startIndex, endIndex + 1)
            .map((word, offset) => requiredTokens.has(word.value) ? startIndex + offset : -1)
            .filter((index) => index >= 0);
          matches.push({
            variant,
            start: words[requiredSpans[0]].start,
            end: words[requiredSpans.at(-1)].end,
            tokenSpan: requiredSpans.at(-1) - requiredSpans[0] + 1,
            matchedTokenCount: requiredTokens.size,
            requiredTokenCount: requiredTokens.size,
          });
          break;
        }
      }
    }
  }
  return matches.sort((left, right) => left.start - right.start || left.tokenSpan - right.tokenSpan);
}

function findNameMatches(text, variants) {
  const nameVariants = variants.filter((variant) => variant.kind !== "operator");
  const words = tokenSpans(text);
  const matches = findVariantMatches(text, nameVariants);
  for (const variant of nameVariants) {
    const requiredTokens = [...new Set(variant.matchingTokens ?? variant.tokens)];
    if (!requiredTokens.length) continue;
    const minimumMatches = Math.min(2, requiredTokens.length);
    const windowSize = Math.min(words.length, Math.max(requiredTokens.length * 5, 12));
    for (let startIndex = 0; startIndex < words.length; startIndex += 1) {
      const endLimit = Math.min(words.length, startIndex + windowSize);
      const matchedIndexes = [];
      const seenTokens = new Set();
      for (let index = startIndex; index < endLimit; index += 1) {
        if (requiredTokens.includes(words[index].value) && !seenTokens.has(words[index].value)) {
          seenTokens.add(words[index].value);
          matchedIndexes.push(index);
        }
      }
      if (matchedIndexes.length < minimumMatches) continue;
      matches.push({
        variant,
        start: words[matchedIndexes[0]].start,
        end: words[matchedIndexes.at(-1)].end,
        tokenSpan: matchedIndexes.at(-1) - matchedIndexes[0] + 1,
        matchedTokenCount: matchedIndexes.length,
        requiredTokenCount: requiredTokens.length,
      });
      break;
    }
  }
  return matches.sort((left, right) => left.start - right.start || left.tokenSpan - right.tokenSpan);
}

function nameMatchContainsTokens(text, matches, requiredTokens) {
  if (!requiredTokens.length) return false;
  const words = tokenSpans(text);
  return matches.some((match) => {
    const matchedTokens = new Set(words
      .filter((word) => word.start >= match.start && word.end <= match.end)
      .map((word) => word.value));
    return requiredTokens.every((token) => matchedTokens.has(token));
  });
}

function assertedOperators(text, identityMatches = [], expectedOperator = "") {
  const companyName = "[A-Z][\\p{L}\\p{N}&.'’'-]*(?:\\s+[A-Z][\\p{L}\\p{N}&.'’'-]*){0,4}";
  const directCompanyName = "[A-Z][\\p{L}\\p{N}&.\\-]*(?:['’][A-Z][\\p{L}\\p{N}&.\\-]*)*(?:\\s+[A-Z][\\p{L}\\p{N}&.\\-]*(?:['’][A-Z][\\p{L}\\p{N}&.\\-]*)*){0,4}";
  const patterns = [
    new RegExp(
      `\\b(?:(?:is|was|has\\s+been|will\\s+be|is\\s+being|was\\s+being)\\s+)?(?:operated|owned|developed|sponsored|managed|run|built|constructed)\\s+by\\s+(${companyName})`,
      "gu",
    ),
    new RegExp(
      `\\b(${companyName})\\s+(?:(?:operates|owns|develops|sponsors|manages|runs|builds|built|constructs|constructed)|(?:(?:has|had)\\s+)?(?:operated|owned|developed|sponsored|managed|run|built|constructed))\\b`,
      "gu",
    ),
    new RegExp(
      `\\b(${companyName})\\s+(?:(?:(?:will|would|may|might|can|could)\\s+)|(?:(?:plans?|intends?)\\s+to\\s+))?(?:operate|own|develop|sponsor|manage|run|build|construct)\\b`,
      "gu",
    ),
    new RegExp(
      `\\b(${companyName})\\s+(?:(?:is|was|will\\s+be|has\\s+been|is\\s+currently)\\s+)?(?:operating|owning|developing|sponsoring|managing|running|building|constructing)\\b`,
      "gu",
    ),
    new RegExp(
      `\\b(?:[Oo]perator|[Oo]wner|[Dd]eveloper|[Bb]uilder|[Cc]onstructor|[Cc]onstruction\\s+(?:[Cc]ompany|[Cc]ontractor|[Mm]anager))\\s*(?:[Ii]s|:|[-–—])\\s*(${companyName})`,
      "gu",
    ),
    new RegExp(
      `\\b(${companyName})\\s+(?:[Ii]s\\s+)?(?:[Tt]he\\s+)?(?:[Oo]perator|[Oo]wner|[Dd]eveloper|[Bb]uilder|[Cc]onstructor|[Cc]onstruction\\s+(?:[Cc]ompany|[Cc]ontractor|[Mm]anager))\\b`,
      "gu",
    ),
  ];
  const actors = patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => normalizeWords(match[1])));

  const sentenceSubjectForProject = (position) => {
    const priorSentences = [...text.slice(0, position).matchAll(/[.!?]\s+/gu)];
    const sentenceStart = priorSentences.length
      ? priorSentences.at(-1).index + priorSentences.at(-1)[0].length
      : 0;
    let prefix = text.slice(sentenceStart, position);
    if (!/\b(?:its|their|the\s+company['’]s)\s+(?:[\p{L}\p{N}-]+\s+){0,5}$/iu.test(prefix)) {
      return null;
    }

    // A reporting clause can introduce a different company subject. Prefer
    // that local subject to the source or publisher named in the main clause.
    const reportingClause = /\b(?:says?|said|reports?|reported|states?|stated|indicates?|indicated|notes?|noted|claims?|claimed|writes?|wrote)\s+(?:that\s+)?/giu;
    let reportingMatch;
    let localClauseStart = -1;
    while ((reportingMatch = reportingClause.exec(prefix))) {
      localClauseStart = reportingMatch.index + reportingMatch[0].length;
    }
    if (localClauseStart >= 0) prefix = prefix.slice(localClauseStart);
    prefix = prefix
      .replace(/^\s*(?:according\s+to|per)\b[^,]{1,120},\s*/iu, "")
      .replace(/^\s*(?:on|in|at|after|before|following)\s+[^,]{1,60},\s*/iu, "");

    const subjectPattern = new RegExp(
      `(?:^|,\\s*)(?:[Tt]he\\s+|[Aa]n?\\s+)?(${directCompanyName})(?:,\\s+[^,]{1,80},)?\\s+(?=(?:is|was|are|were|has|have|had|will|would|may|might|can|could|does|did)\\b|[a-z][a-z'’-]*(?:s|ed)\\b)`,
      "u",
    );
    const subject = prefix.match(subjectPattern);
    return subject ? normalizeWords(subject[1]) : null;
  };

  // A company possessive is attribution only when it directly modifies a
  // matched project name or alias. A possessive elsewhere in a passage (for
  // example, a report publisher's filing) is not operator evidence.
  const possessivePattern = new RegExp(`(?:^|\\s)(${companyName})['’]s\\s*$`, "u");
  for (const identityMatch of identityMatches) {
    const variantTokens = identityMatch.variant.matchingTokens ?? identityMatch.variant.tokens;
    const previousWord = tokenSpans(text)
      .filter((word) => word.end <= identityMatch.start)
      .at(-1);
    const startsAtName = !previousWord || !variantTokens.includes(previousWord.value);
    const prefix = text.slice(0, identityMatch.start);
    const possessive = prefix.match(possessivePattern);
    if (possessive) actors.push(normalizeWords(possessive[1]));

    // A sentence-subject company can own the project referred to as "its",
    // "their", or "the company's" without being repeated beside the name.
    if (identityMatch.variant.kind !== "operator") {
      const sentenceSubject = sentenceSubjectForProject(identityMatch.start);
      if (sentenceSubject) actors.push(sentenceSubject);
    }

    // Some source passages put the operator directly before the project or
    // facility name without a possessive or an attribution verb.
    const directAttribution = startsAtName && prefix.match(
      new RegExp(
        `(?:^|\\s)(${directCompanyName})(?:['’]s)?\\s+(?:(?:[Tt]he|[Aa]|[Aa]n)\\s+)?(?:[Pp]roject|[Ff]acility|[Ss]ite|[Cc]ampus|[Dd]ata\\s+[Cc]enter|[Dd]atacenter|[Hh]yperscale|[Pp]ark)?\\s*$`,
        "u",
      ),
    );
    if (directAttribution) {
      const candidateTokens = normalizeWords(directAttribution[1]).split(" ").filter(Boolean);
      while (candidateTokens.length && GENERIC_PROJECT_TOKENS.has(candidateTokens.at(-1))) {
        candidateTokens.pop();
      }
      if (candidateTokens.length) actors.push(candidateTokens.join(" "));
    }

    // A matched requested full name that includes its operator establishes
    // both parts of the identity, even if the passage uses no attribution verb.
    const operatorTokensInName = operatorTokens(expectedOperator);
    if (startsAtName
      && identityMatch.variant.kind === "name"
      && operatorTokensInName.length
      && operatorTokensInName.every((token) => identityMatch.variant.tokens.includes(token))
      && nameMatchContainsTokens(text, [identityMatch], operatorTokensInName)) {
      actors.push(expectedOperator);
    }
  }
  return [...new Set(actors.filter((actor) => operatorTokens(actor).length > 0))];
}

function operatorTokens(value) {
  const ignored = new Set([
    "the", "company", "inc", "llc", "ltd", "limited", "corporation", "corp", "co",
  ]);
  return normalizeWords(value).split(" ").filter((token) => token && !ignored.has(token));
}

function operatorsMatch(expected, actual) {
  const expectedTokens = operatorTokens(expected);
  const actualTokens = operatorTokens(actual);
  return expectedTokens.length > 0
    && expectedTokens.length === actualTokens.length
    && expectedTokens.every((token, index) => token === actualTokens[index]);
}

function operatorConflicts(expected, actuals) {
  return operatorTokens(expected).length > 0
    && actuals.some((actual) => !operatorsMatch(expected, actual));
}

function isProjectOperatorAttributionFragment(text) {
  return /\b(?:the|this|its|that)\s+(?:project|facility|site|campus|data\s+center|plant|phase)\b|\b(?:operator|owner|developer|builder|constructor|construction\s+(?:company|contractor|manager))\b/i
    .test(text);
}

function isNegatedProjectReference(text, match) {
  const prefix = text.slice(Math.max(0, match.start - 60), match.start);
  return /\b(?:no|not|without)\s+(?:any\s+)?(?:connection|relationship|relation|association|affiliation)\s+to\s+(?:the\s+)?(?:project\s+)?$/i.test(prefix);
}

function splitSubjectFragments(text) {
  const sentenceParts = String(text ?? "")
    .replace(/\bD\.C\./gi, "DC")
    .replace(
      /;\s*(?=(?:operator|owner|developer|builder|constructor|construction\s+(?:company|contractor|manager))\s*(?:is|:|[-–—])|[A-Z][\p{L}\p{N}&.'’'-]*(?:\s+[A-Z][\p{L}\p{N}&.'’'-]*){0,4}\s+(?:[Ii]s\s+)?(?:[Tt]he\s+)?(?:[Oo]perator|[Oo]wner|[Dd]eveloper|[Bb]uilder|[Cc]onstructor|[Cc]onstruction\s+(?:[Cc]ompany|[Cc]ontractor|[Mm]anager)))/gu,
      ", ",
    )
    .split(/(?<=[.!?])\s+|\n+/)
    .filter(Boolean);
  const comparisonPattern = /\b(?:compared\s+(?:with|to)|versus|vs\.?|unlike|whereas|while|in\s+contrast\s+to|as\s+opposed\s+to|rather\s+than|alongside)\b|\bbut\b/gi;
  const fragments = [];
  for (const [sentenceIndex, sentence] of sentenceParts.entries()) {
    for (const clause of sentence.split(/[;]+/)) {
      let start = 0;
      for (const match of clause.matchAll(comparisonPattern)) {
        if (match.index > start) {
          fragments.push({ text: clause.slice(start, match.index).trim(), sentenceIndex });
        }
        start = match.index + match[0].length;
      }
      if (start < clause.length) {
        fragments.push({ text: clause.slice(start).trim(), sentenceIndex });
      }
    }
  }

  return fragments.flatMap(({ text: fragment, sentenceIndex }) => fragment.split(
    /\band\s+(?:(?:a|an|another|the\s+other|separate|different|unrelated)\s+)(?:(?:[a-z-]+\s+){0,3})(?:project|facility|campus|site|data\s+center|cryptocurrency|crypto(?:currency)?(?:\s+mining)?\s+facility)\b/gi,
  ).map((text) => ({ text: text.trim(), sentenceIndex })))
    .filter(Boolean);
}

function removeAdministrativeLocations(text) {
  return text
    .replace(
      /\b(?:(?:its|their|the)\s+)?(?:operator|company|owner|developer|sponsor)(?:['’]s)?\s+(?:headquarters?|HQ|home office)\b[^.;]*/gi,
      "",
    )
    .replace(/\b(?:headquartered|headquarters?)\s+(?:is|are|was|were)?\s*(?:located\s+)?in\b[^.;]*/gi, "");
}

function hasLocationConnector(text, location) {
  const prefix = text.slice(Math.max(0, location.start - 110), location.start);
  return /\b(?:located|based|situated|sited)\s+(?:in|at|near|within)\s*$/i.test(prefix)
    || /\bplanned\s+for\s*$/i.test(prefix)
    || /\b(?:campus|site|facility|project|data\s+center|data\s+centre|center|headquarters?)\s+(?:is|was|will\s+be|are|were)?\s*(?:located\s+|based\s+|situated\s+)?(?:in|at|near|within)\s*$/i.test(prefix)
    || /\b(?:in|at|near|within)\s*$/i.test(prefix);
}

function requestedLocation(project) {
  const knownData = project?.knownData ?? {};
  const parsed = detailedLocations(project?.location ?? "").map((item) => item.location);
  const firstParsed = parsed.find((item) => item.city || item.county || item.state) ?? {};
  const city = project?.city ?? knownData.city ?? firstParsed.city ?? null;
  let county = project?.county ?? knownData.county ?? firstParsed.county ?? null;
  if (county && !/\bCounty\b/i.test(county)) county = `${county.trim()} County`;
  const state = canonicalState(project?.state ?? knownData.state ?? firstParsed.state ?? "");
  return {
    city: typeof city === "string" && city.trim() ? city.trim() : null,
    county: typeof county === "string" && county.trim() ? county.trim() : null,
    state,
  };
}

function compareLocation(expected, actual) {
  const conflicts = [];
  const matches = [];
  if (expected.city && actual.city) {
    if (normalizeWords(expected.city) === normalizeWords(actual.city)) matches.push("city");
    else conflicts.push(`city ${actual.city} differs from ${expected.city}`);
  }
  if (expected.county && actual.county) {
    if (normalizeWords(expected.county) === normalizeWords(actual.county)) matches.push("county");
    else conflicts.push(`county ${actual.county} differs from ${expected.county}`);
  }
  if (expected.state && actual.state) {
    if (expected.state === actual.state) matches.push("state");
    else conflicts.push(`state ${actual.state} differs from ${expected.state}`);
  }
  return { conflicts, matches };
}

function formatExpectedLocation(location) {
  return [location.city, location.county, location.state].filter(Boolean).join(", ");
}

/**
 * Classifies whether a passage refers to the requested project.
 *
 * @returns {{ verdict: "exact-project" | "ambiguous" | "unrelated", reason: string }}
 */
export function matchProject(passage, project = {}) {
  const text = typeof passage === "string" ? passage : "";
  const variants = identityVariants(project);
  const expectedLocation = requestedLocation(project);
  const expectedLocationText = formatExpectedLocation(expectedLocation);
  const expectedOperator = project?.operator ?? project?.knownData?.operator ?? "";
  const distinctiveNameTokens = distinctiveProjectNameTokens(project, expectedLocation);
  if (!text.trim() || !variants.length) {
    return {
      verdict: "ambiguous",
      reason: "The passage or requested project identity is missing, so the project cannot be assessed.",
    };
  }

  const fragments = splitSubjectFragments(text);
  const identified = [];
  const allAttachedLocations = [];
  for (const [fragmentIndex, { text: fragment, sentenceIndex }] of fragments.entries()) {
    const identityMatches = findNameMatches(fragment, variants)
      .filter((match) => !isNegatedProjectReference(fragment, match));
    const cleaned = removeAdministrativeLocations(fragment);
    const attached = detailedLocations(cleaned).filter((location) => hasLocationConnector(cleaned, location));
    allAttachedLocations.push(...attached.map((item) => item.location));
    if (identityMatches.length) {
      identified.push({ fragment: cleaned, identityMatches, attached, fragmentIndex, sentenceIndex });
    }
  }

  for (const subject of identified) {
    const nameMatch = subject.identityMatches.some((match) => match.variant.kind !== "operator");
    const strongNameMatch = subject.identityMatches.some((match) =>
      match.variant.kind !== "operator" && match.matchedTokenCount >= 2);
    const subjectLocations = subject.attached
      .filter((location) => subject.identityMatches.some((match) =>
        location.start >= match.start - 18 || match.start - location.start <= 28))
      .map((item) => item.location);

    const comparisons = subjectLocations.map((location) => compareLocation(expectedLocation, location));
    const conflict = comparisons.find((comparison) => comparison.conflicts.length);
    if (conflict) {
      return {
        verdict: "unrelated",
        reason: `The named project is associated with ${conflict.conflicts.join(" and ")}, not the requested location${expectedLocationText ? ` (${expectedLocationText})` : ""}.`,
      };
    }

    const confirmedDimensions = [...new Set(comparisons.flatMap((comparison) => comparison.matches))];
    const hasRequestedLocation = Boolean(expectedLocation.city || expectedLocation.county || expectedLocation.state);
    const localOperatorEvidence = assertedOperators(
      subject.fragment,
      subject.identityMatches,
      expectedOperator,
    );
    const adjacentFragment = fragments[subject.fragmentIndex + 1];
    const adjacentOperatorEvidence = adjacentFragment
      && adjacentFragment.sentenceIndex === subject.sentenceIndex
      && isProjectOperatorAttributionFragment(adjacentFragment.text)
      ? assertedOperators(adjacentFragment.text, [], expectedOperator)
      : [];
    const operatorEvidence = [...localOperatorEvidence, ...adjacentOperatorEvidence];
    if (expectedOperator && operatorConflicts(expectedOperator, operatorEvidence)) {
      return {
        verdict: "unrelated",
        reason: `The named project has an operator or developer that conflicts with the requested operator (${expectedOperator}).`,
      };
    }
    const operatorMatches = Boolean(expectedOperator
      && operatorEvidence.some((actual) => operatorsMatch(expectedOperator, actual)));
    const distinctiveNameMatch = nameMatchContainsTokens(
      subject.fragment,
      subject.identityMatches.filter((match) => match.variant.kind === "name"),
      distinctiveNameTokens,
    );
    const identityContextMatches = hasRequestedLocation
      ? confirmedDimensions.length > 0 && (operatorMatches || distinctiveNameMatch)
      : expectedOperator ? operatorMatches : strongNameMatch;
    if (nameMatch && identityContextMatches) {
      const basis = "project name or alias";
      const locationNote = confirmedDimensions.length
        ? `; ${confirmedDimensions.join(" and ")} match${confirmedDimensions.length === 1 ? "es" : ""} the requested location`
        : "";
      return {
        verdict: "exact-project",
        reason: `The passage identifies the requested project by its ${basis}${locationNote}.`,
      };
    }
  }

  const requestedTokens = [
    expectedLocation.city,
    expectedLocation.county,
    expectedLocation.state,
  ].filter(Boolean);
  if (identified.length) {
    const hasOperatorAttribution = identified.some((subject) => {
      const localEvidence = assertedOperators(
        subject.fragment,
        subject.identityMatches,
        expectedOperator,
      );
      const adjacentFragment = fragments[subject.fragmentIndex + 1];
      const adjacentEvidence = adjacentFragment
        && adjacentFragment.sentenceIndex === subject.sentenceIndex
        && isProjectOperatorAttributionFragment(adjacentFragment.text)
        ? assertedOperators(adjacentFragment.text, [], expectedOperator)
        : [];
      const evidence = [...localEvidence, ...adjacentEvidence];
      return expectedOperator && evidence.some((actual) => operatorsMatch(expectedOperator, actual));
    });
    return {
      verdict: "ambiguous",
      reason: expectedOperator && !hasOperatorAttribution
        ? `The passage mentions the requested project, but does not establish attribution to the requested operator (${expectedOperator}).`
        : `The passage mentions the requested project, but does not establish its requested location${expectedLocationText ? ` (${expectedLocationText})` : ""}.`,
    };
  }

  const locationConflict = allAttachedLocations
    .map((location) => compareLocation(expectedLocation, location))
    .find((comparison) => comparison.conflicts.length);
  if (locationConflict && requestedTokens.length) {
    return {
      verdict: "unrelated",
      reason: `The passage's project location conflicts with the requested location${expectedLocationText ? ` (${expectedLocationText})` : ""}: ${locationConflict.conflicts.join(" and ")}.`,
    };
  }

  const passageHasProjectSubject = /\b(?:project|facility|campus|site|data\s+center|data\s+centre|crypto(?:currency)?|mining)\b/i.test(text);
  if (passageHasProjectSubject) {
    return {
      verdict: "unrelated",
      reason: "The passage describes a project or facility but does not identify it by the requested name, alias, or operator.",
    };
  }
  return {
    verdict: "ambiguous",
    reason: "The passage does not provide enough project-specific context to determine whether it refers to the requested project.",
  };
}