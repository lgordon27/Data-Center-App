import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { researchContentRejectionReason } from "../src/data/researchContentQuality.mjs";

export const RESEARCH_EXTRACTION_LIMITS = Object.freeze({
  maxInputBytes: 2_000_000,
  maxPassageChars: 4_000,
  maxIndexEntries: 40,
  maxIndexEntryChars: 240,
  maxCandidateLinks: 12,
  maxMarkupChars: 250_000,
  minHtmlProseChars: 300,
  maxJsonNodes: 2_000,
  maxPdfStreams: 80,
  maxPdfInflatedBytes: 500_000,
  maxOcrInputBytes: 2_000_000,
  maxOcrPages: 10,
  maxOcrOutputChars: 20_000,
  ocrTimeoutMs: 5_000,
});

const DOCUMENT_EXTENSIONS = /\.(?:pdf|xml|json|geojson|txt|csv)(?:[?#]|$)/i;

function cleanText(value) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Math.min(Number(code), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Math.min(Number.parseInt(code, 16), 0x10ffff)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;|&#39;/gi, "'");
}

const PUBLICATION_DATE_BASES = Object.freeze({
  SEMANTIC: "semantic-metadata",
  JSON_LD: "json-ld-date-published",
  VISIBLE: "visible-publication-line",
});

function validCalendarDate(year, month, day) {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function normalizePublicationDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = decodeEntities(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$/i);
  if (iso) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = iso;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (!validCalendarDate(year, month, day)) return null;
    if (hourText !== undefined) {
      if (Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText ?? "0") > 59) return null;
      if (zone && !/^z$/i.test(zone)) {
        const [offsetHours, offsetMinutes] = zone.slice(1).split(":").map(Number);
        if (offsetHours > 23 || offsetMinutes > 59) return null;
      }
    }
    return `${yearText}-${monthText}-${dayText}`;
  }

  const monthNames = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const monthFirst = text.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  const dayFirst = text.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  const match = monthFirst
    ? [monthFirst[3], monthNames[monthFirst[1].toLowerCase()], monthFirst[2]]
    : dayFirst
      ? [dayFirst[3], monthNames[dayFirst[2].toLowerCase()], dayFirst[1]]
      : null;
  if (!match) return null;
  const [yearText, month, dayText] = match;
  const year = Number(yearText);
  const day = Number(dayText);
  if (!Number.isInteger(month) || !validCalendarDate(year, month, day)) return null;
  return `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function htmlAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function publicationTier(values, basis) {
  const dates = [...new Set(values.map(normalizePublicationDate).filter(Boolean))];
  if (dates.length > 1) {
    return { publicationDate: null, publicationDateBasis: null, publicationDateStatus: "ambiguous" };
  }
  if (dates.length === 1) {
    return { publicationDate: dates[0], publicationDateBasis: basis, publicationDateStatus: "resolved" };
  }
  return { publicationDate: null, publicationDateBasis: null, publicationDateStatus: "absent" };
}

function removeVisiblePublicationDateText(value) {
  return String(value).replace(
    /\b(?:published(?:\s+on)?|date\s+published|publication\s+date)\s*[:\-]?\s*((?:[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})|(?:\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4})|(?:\d{4}-\d{2}-\d{2}))\b/gi,
    (match, date) => normalizePublicationDate(date) ? " " : match,
  ).replace(/\s+/g, " ").trim();
}

function jsonLdPublicationDates(markup, limits) {
  const dates = [];
  let visited = 0;
  let scriptCount = 0;
  const visit = (value, depth = 0) => {
    if (visited >= limits.maxJsonNodes || depth > 12 || value === null || typeof value !== "object") return;
    visited += 1;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (visited >= limits.maxJsonNodes) break;
        visit(child, depth + 1);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (visited >= limits.maxJsonNodes) break;
      if (key.toLowerCase() === "datepublished" && typeof child === "string") dates.push(child);
      else if (child && typeof child === "object") visit(child, depth + 1);
    }
  };
  for (const match of markup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (scriptCount >= 8 || visited >= limits.maxJsonNodes) break;
    if (!/^application\/ld\+json(?:\s*;|$)/i.test(htmlAttribute(match[1], "type"))) continue;
    scriptCount += 1;
    try {
      visit(JSON.parse(match[2]));
    } catch {
      // Invalid or non-JSON-LD script content is not publication metadata.
    }
  }
  return dates;
}

function visiblePublicationDates(markup) {
  const lines = String(markup)
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|main|li|tr|td|time|h[1-6])\s*>/gi, "\n")
    .split(/\n+/)
    .map(blockText)
    .filter(Boolean);
  const dates = [];
  for (const line of lines) {
    const labeled = line.match(/^(?:published(?:\s+on)?|date\s+published|publication\s+date)\s*[:\-]?\s*(.+)$/i);
    if (!labeled) continue;
    const date = normalizePublicationDate(labeled[1]);
    if (date) dates.push(date);
  }
  return dates;
}

function extractHtmlPublicationMetadata(markup, visibleMarkup, limits) {
  const semanticValues = [];
  const semanticNames = new Set([
    "article:published_time",
    "og:article:published_time",
    "datepublished",
    "publication_date",
    "date_published",
    "dc.date.issued",
    "dcterms.issued",
    "citation_publication_date",
    "citation_date",
  ]);
  for (const match of markup.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const keys = ["property", "name", "itemprop"].map((attribute) => htmlAttribute(tag, attribute).toLowerCase());
    if (keys.some((key) => semanticNames.has(key))) semanticValues.push(htmlAttribute(tag, "content"));
  }
  for (const match of markup.matchAll(/<time\b[^>]*>/gi)) {
    const tag = match[0];
    if (htmlAttribute(tag, "itemprop").toLowerCase() === "datepublished") {
      semanticValues.push(htmlAttribute(tag, "datetime"));
    }
  }

  const semantic = publicationTier(semanticValues, PUBLICATION_DATE_BASES.SEMANTIC);
  if (semantic.publicationDateStatus !== "absent") return semantic;
  const jsonLd = publicationTier(jsonLdPublicationDates(markup, limits), PUBLICATION_DATE_BASES.JSON_LD);
  if (jsonLd.publicationDateStatus !== "absent") return jsonLd;
  return publicationTier(visiblePublicationDates(visibleMarkup), PUBLICATION_DATE_BASES.VISIBLE);
}

function makeIndex(values, limits) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = cleanText(value).slice(0, limits.maxIndexEntryChars);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= limits.maxIndexEntries) break;
  }
  return output;
}

function safeDocumentUrl(value, sourceUrl) {
  try {
    const parsed = new URL(decodeEntities(value), sourceUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (hostname === "localhost" || hostname.endsWith(".localhost")
      || /^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname)
      || /^169\.254\./.test(hostname) || /^0\./.test(hostname)
      || hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:")) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

const NON_PROSE_HTML_BLOCKS = /^(?:share|share this|share this article|share this story|share on social media|print|email|copy|copy link|read more|subscribe|sign in|log in|login|advertisement|related articles|follow us|privacy policy|terms of service|cookie settings|accept cookies|manage preferences)$/i;

function blockText(value) {
  return cleanText(decodeEntities(String(value).replace(/<[^>]*>/g, " ")));
}

function matchingElementContent(markup, tagName, contentStart) {
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tags.lastIndex = contentStart;
  let depth = 1;
  let match;
  while ((match = tags.exec(markup))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) return markup.slice(contentStart, match.index);
    } else if (!/\/>$/.test(match[0])) {
      depth += 1;
    }
  }
  return null;
}

function preferredArticleBodies(markup) {
  const found = [];
  const elements = /<(div|section|article)\b[^>]*>/gi;
  let match;
  while ((match = elements.exec(markup))) {
    const openingTag = match[0];
    const tagName = match[1];
    const itemProp = openingTag.match(/\bitemprop\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    const classOrId = openingTag.match(/\b(?:class|id)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    const articleBody = /\barticlebody\b/i.test(itemProp)
      || /(?:article|story|entry|post)[\s_-]*(?:body|content|text)|(?:entry|post)[\s_-]*content|field--name-body|node__content/i.test(classOrId);
    if (!articleBody || /\/>$/.test(openingTag)) continue;
    const contentStart = elements.lastIndex;
    const content = matchingElementContent(markup, tagName, contentStart);
    if (content) found.push(content);
  }
  return found.sort((left, right) => right.length - left.length).slice(0, 1);
}

function proseTextFromHtml(source) {
  const lines = String(source)
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|h[1-6]|li|tr)\s*>/gi, "\n")
    .split(/\n+/)
    .map(blockText)
    .filter((line) => line && !NON_PROSE_HTML_BLOCKS.test(line))
    .filter((line) => !/^(?:share|print|email|copy link|read more|subscribe|sign in|log in|follow us)[.!?]?$/i.test(line));
  const uniqueLines = [];
  const seen = new Set();
  for (const line of lines) {
    const key = line.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueLines.push(line);
  }
  return cleanText(uniqueLines.join(" ")
    .replace(/\b([\p{L}\p{N}][\p{L}\p{N}'’\-]*)(?:\s+\1\b){2,}/giu, "$1"));
}

function genuineProseChars(text) {
  const tokens = String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) ?? [];
  const charCount = (String(text).match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (!tokens.length) return 0;
  const uniqueRatio = new Set(tokens.map((token) => token.toLowerCase())).size / tokens.length;
  // Repeated status text and token spam should not pass merely by being long.
  return Math.floor(uniqueRatio < 0.2 ? charCount * uniqueRatio / 0.2 : charCount);
}

function htmlShellReason(text, sourceUrl) {
  const normalized = String(text ?? "").toLowerCase();
  if (/\ban error has occurred in this application\b/.test(normalized)) {
    return "application-error-page";
  }
  if (/\b(?:verify you are human|verify that you are human|human verification|checking your browser|checking if the site connection is secure|unusual traffic from your (?:computer )?network|are you a robot|complete the security check|captcha)\b/.test(normalized)) {
    return "bot-verification-page";
  }
  if (/\b(?:enable|turn on) javascript(?: and cookies)? to (?:continue|proceed|access|view|use)\b|\bjavascript is (?:required|disabled|not enabled)\b|\bthis (?:site|page|application) requires javascript\b/.test(normalized)) {
    return "javascript-required-shell";
  }
  if (/\b(?:sign in|log in|register) to (?:continue|read|view|access)\b|\bsubscribe to (?:continue|read|view)\b|\bsubscription required\b|\bmembers[- ]only content\b|\bthis content is for subscribers\b|\bplease subscribe to read\b/.test(normalized)) {
    return "login-or-paywall-shell";
  }
  try {
    if (/\/(?:login|log-in|signin|sign-in|subscribe|subscription)(?:\/|$)/i.test(new URL(sourceUrl).pathname)
      && genuineProseChars(text) < 600) return "login-or-paywall-shell";
  } catch {
    // URL validation is handled by the document access boundary.
  }
  return null;
}

function htmlAdapter(raw, sourceUrl, limits) {
  const markup = raw.slice(0, limits.maxMarkupChars);
  const withoutExecutable = markup
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const candidates = [];
  const addCandidate = (url) => {
    const safe = safeDocumentUrl(url, sourceUrl);
    if (safe && !candidates.includes(safe) && candidates.length < limits.maxCandidateLinks) candidates.push(safe);
  };
  for (const match of withoutExecutable.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const property = tag.match(/\b(?:name|property|http-equiv)\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const value = content?.[1] ?? content?.[2] ?? content?.[3];
    if (value && ["refresh", "citation_pdf_url", "document_url", "og:document", "dc.identifier"].includes(property)) {
      addCandidate(property === "refresh" ? value.replace(/^.*?\burl\s*=\s*/i, "") : value);
    }
  }
  for (const match of withoutExecutable.matchAll(/<(?:a|link|iframe|embed)\b[^>]*>/gi)) {
    const tag = match[0];
    const url = tag.match(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const value = url?.[1] ?? url?.[2] ?? url?.[3];
    const explicit = /\brel\s*=\s*["'][^"']*(?:alternate|document)[^"']*["']/i.test(tag)
      || /\btype\s*=\s*["'](?:application\/pdf|application\/json|application\/xml|text\/plain)["']/i.test(tag)
      || DOCUMENT_EXTENSIONS.test(value ?? "");
    if (value && explicit) addCandidate(value);
  }
  for (const match of withoutExecutable.matchAll(/\bdata-(?:document|download)-url\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    addCandidate(match[1] ?? match[2]);
  }
  const withoutBoilerplate = withoutExecutable
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(?:div|section)\b[^>]*(?:id|class|role)\s*=\s*["'][^"']*(?:banner|cookie|consent|navigation|navbar|menu|breadcrumb|share|social|related|recommend|sidebar|toolbar|top-bar|primary-nav|advert)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)\s*>/gi, " ");
  const articleBodyContainers = preferredArticleBodies(withoutBoilerplate);
  const mainContainers = [...withoutBoilerplate.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/gi)].map((match) => match[1]);
  const articleContainers = [...withoutBoilerplate.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)].map((match) => match[1]);
  const sectionContainers = [...withoutBoilerplate.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section\s*>/gi)].map((match) => match[1]);
  const contentContainers = articleBodyContainers.length ? articleBodyContainers
    : mainContainers.length ? mainContainers
    : articleContainers.length ? articleContainers
      : sectionContainers;
  const titleText = [...withoutBoilerplate.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)]
    .map((match) => decodeEntities(match[1].replace(/<[^>]*>/g, " ")));
  const preferredHeadings = contentContainers.flatMap((container) =>
    [...container.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi)]
      .map((match) => decodeEntities(match[1].replace(/<[^>]*>/g, " "))));
  const fallbackHeadings = [...withoutBoilerplate.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi)]
    .map((match) => decodeEntities(match[1].replace(/<[^>]*>/g, " ")));
  const headings = contentContainers.length ? [...titleText, ...preferredHeadings] : [...titleText, ...fallbackHeadings];
  const textSource = contentContainers.length
    ? `${titleText.join(" ")} ${contentContainers.join(" ")}`
    : withoutBoilerplate;
  const text = removeVisiblePublicationDateText(proseTextFromHtml(textSource));
  const shellScanText = proseTextFromHtml(withoutBoilerplate);
  const publicationMetadata = extractHtmlPublicationMetadata(
    markup,
    contentContainers.length ? contentContainers.join(" ") : withoutBoilerplate,
    limits,
  );
  return {
    text,
    shellReason: htmlShellReason(text || shellScanText, sourceUrl),
    genuineProseChars: genuineProseChars(text),
    index: makeIndex(headings, limits),
    candidates,
    ...publicationMetadata,
  };
}

function jsonAdapter(raw, limits) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { malformed: true, text: "", index: [] };
  }
  const values = [];
  const index = [];
  let visited = 0;
  const walk = (value, path, depth) => {
    if (visited >= limits.maxJsonNodes || depth > 12) return;
    visited += 1;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      values.push(`${path}: ${String(value)}`);
      if (path) index.push(path);
      return;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length && visited < limits.maxJsonNodes; i += 1) walk(value[i], `${path}[${i}]`, depth + 1);
    } else if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key, depth + 1);
    }
  };
  if (Array.isArray(parsed?.features)) {
    const features = parsed.features.slice(0, limits.maxIndexEntries);
    for (let i = 0; i < features.length; i += 1) {
      const fields = features[i]?.attributes ?? features[i]?.properties;
      if (fields && typeof fields === "object") walk(fields, `feature[${i}]`, 0);
    }
    if (parsed.exceededTransferLimit === true) values.push("exceededTransferLimit: true");
    return { text: cleanText(values.join(" | ")), index: makeIndex(index, limits), arcgis: true };
  }
  walk(parsed, "", 0);
  return { text: cleanText(values.join(" | ")), index: makeIndex(index, limits), truncated: visited >= limits.maxJsonNodes };
}

function xmlAdapter(raw, limits) {
  const source = raw.slice(0, limits.maxMarkupChars);
  const stack = [];
  let malformed = false;
  for (const match of source.matchAll(/<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/g)) {
    const token = match[0];
    if (/^<\//.test(token)) {
      if (stack.pop() !== match[1]) { malformed = true; break; }
    } else if (!/\/>$/.test(token) && !/^<\?/.test(token) && !/^<!/.test(token)) stack.push(match[1]);
  }
  if (stack.length) malformed = true;
  const names = [...source.matchAll(/<([A-Za-z_][\w:.-]*)\b[^>]*>/g)].map((match) => match[1]);
  const text = cleanText(decodeEntities(source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1")
    .replace(/<[^>]+>/g, " ")));
  return { malformed, text: malformed ? "" : text, index: makeIndex(names, limits) };
}

function decodePdfLiteral(value) {
  return value.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, escaped) => {
    if (/^[0-7]/.test(escaped)) return String.fromCharCode(Number.parseInt(escaped, 8));
    return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[escaped];
  });
}

function extractPdfOperators(source) {
  const text = [];
  for (const match of source.matchAll(/\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g)) text.push(decodePdfLiteral(match[1]));
  for (const array of source.matchAll(/\[((?:[^\]]|\](?!\s*TJ))*)\]\s*TJ/g)) {
    for (const literal of array[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)) text.push(decodePdfLiteral(literal[1]));
  }
  for (const match of source.matchAll(/<([0-9a-fA-F]{4,})>\s*Tj/g)) {
    try { text.push(Buffer.from(match[1], "hex").toString("utf8")); } catch { /* malformed hex is ignored */ }
  }
  return text;
}

function pdfAdapter(bytes, limits) {
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) return { malformed: true, text: "", index: [] };
  const binary = bytes.toString("latin1");
  const values = extractPdfOperators(binary);
  let streamCount = 0;
  for (const match of binary.matchAll(/(<<[\s\S]{0,2000}?>>)\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    if (streamCount >= limits.maxPdfStreams) break;
    streamCount += 1;
    let stream = Buffer.from(match[2], "latin1");
    if (/\/FlateDecode\b/.test(match[1])) {
      try {
        stream = inflateSync(stream, { maxOutputLength: limits.maxPdfInflatedBytes });
      } catch {
        continue;
      }
    }
    values.push(...extractPdfOperators(stream.toString("latin1")));
  }
  return { text: cleanText(values.join(" ")), index: [], streamCount };
}

function resolveKind(contentType, sourceUrl, bytes) {
  const type = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type === "application/pdf" || bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) || /\.pdf(?:[?#]|$)/i.test(sourceUrl ?? "")) return "pdf";
  if (type === "application/json" || type.endsWith("+json") || /\.(?:json|geojson)(?:[?#]|$)/i.test(sourceUrl ?? "")) return "json";
  if (type === "application/xml" || type === "text/xml" || type.endsWith("+xml") || /\.xml(?:[?#]|$)/i.test(sourceUrl ?? "")) return "xml";
  if (type === "text/html" || type === "application/xhtml+xml") return "html";
  if (type.startsWith("text/") || !type) return "text";
  return null;
}

function baseResult(bytes, method, outcome, limitations = []) {
  return {
    extractionMethod: method,
    outcome,
    passage: "",
    index: [],
    candidateLinks: [],
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    limitations,
    underlyingDocumentUrl: null,
    publicationDate: null,
    publicationDateBasis: null,
    publicationDateStatus: "absent",
  };
}

export async function extractResearchDocument(input, options = {}) {
  const limits = { ...RESEARCH_EXTRACTION_LIMITS, ...(options.limits ?? {}) };
  const bytes = Buffer.isBuffer(input?.bytes) ? input.bytes : Buffer.from(input?.bytes ?? "");
  const kind = options.format ?? input?.format ?? resolveKind(input?.contentType, input?.sourceUrl, bytes);
  if (bytes.length > limits.maxInputBytes) {
    return baseResult(bytes, kind ?? "unsupported", "size-limit", [`Input exceeds the ${limits.maxInputBytes}-byte extraction limit.`]);
  }
  if (!kind) return baseResult(bytes, "unsupported", "unsupported", ["The document type has no bounded extraction adapter."]);

  const raw = bytes.toString("utf8");
  let adapted;
  if (kind === "html") adapted = htmlAdapter(raw, input?.sourceUrl, limits);
  else if (kind === "json") adapted = jsonAdapter(raw, limits);
  else if (kind === "xml") adapted = xmlAdapter(raw, limits);
  else if (kind === "pdf") adapted = pdfAdapter(bytes, limits);
  else adapted = { text: cleanText(raw), index: [] };

  const result = baseResult(bytes, kind === "pdf" ? "pdf-text" : kind, "extracted");
  if (kind === "html") {
    result.publicationDate = adapted.publicationDate ?? null;
    result.publicationDateBasis = adapted.publicationDateBasis ?? null;
    result.publicationDateStatus = adapted.publicationDateStatus ?? "absent";
  }
  result.index = (adapted.index ?? []).slice(0, limits.maxIndexEntries);
  result.candidateLinks = (adapted.candidates ?? []).slice(0, limits.maxCandidateLinks);
  if (adapted.malformed) {
    result.outcome = "malformed";
    result.limitations.push(`Malformed ${kind.toUpperCase()} input was not interpreted.`);
    return result;
  }
  if (adapted.truncated) result.limitations.push("Structured input exceeded the bounded node index.");
  if (adapted.arcgis) result.limitations.push("ArcGIS feature attributes were extracted without geometry.");
  const text = cleanText(adapted.text);
  const contentRejectionReason = researchContentRejectionReason(text);
  if (contentRejectionReason) {
    result.outcome = [
      "application-error-page",
      "bot-verification-page",
      "javascript-required-shell",
      "login-or-paywall-shell",
    ].includes(contentRejectionReason)
      ? "blocked-or-shell"
      : "low-content";
    result.reason = contentRejectionReason;
    result.limitations.push(`Document content was not retained because it matched ${contentRejectionReason}.`);
    return result;
  }
  if (kind === "html") {
    const shellReason = adapted.shellReason
      ?? htmlShellReason(text, input?.sourceUrl);
    if (shellReason && !(shellReason === "javascript-required-shell" && result.candidateLinks.length && !text)) {
      result.outcome = "blocked-or-shell";
      result.reason = shellReason;
      result.limitations.push(`HTML was not retained because it is a ${shellReason.replaceAll("-", " ")}.`);
      return result;
    }
    if (adapted.genuineProseChars < limits.minHtmlProseChars && !(result.candidateLinks.length && !text)) {
      result.outcome = "low-content";
      result.reason = `genuine-prose-below-${limits.minHtmlProseChars}-characters`;
      result.limitations.push(`HTML contains only ${adapted.genuineProseChars} genuine prose characters after removing page chrome; at least ${limits.minHtmlProseChars} are required.`);
      return result;
    }
  }
  if (text.length > limits.maxPassageChars) result.limitations.push(`Passage truncated to ${limits.maxPassageChars} characters.`);
  result.passage = text.slice(0, limits.maxPassageChars);

  if (!result.passage && kind === "pdf" && typeof options.ocrImpl === "function") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.ocrTimeoutMs);
    try {
      const ocr = await Promise.race([
        Promise.resolve(options.ocrImpl(bytes.subarray(0, limits.maxOcrInputBytes), {
          maxPages: limits.maxOcrPages,
          maxOutputChars: limits.maxOcrOutputChars,
          signal: controller.signal,
        })),
        new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("ocr-timeout")), { once: true })),
      ]);
      const ocrText = cleanText(typeof ocr === "string" ? ocr : ocr?.text);
      result.extractionMethod = "pdf-ocr";
      const ocrLimit = Math.min(limits.maxPassageChars, limits.maxOcrOutputChars);
      result.passage = ocrText.slice(0, ocrLimit);
      if (ocrText.length > ocrLimit) result.limitations.push(`OCR passage truncated to ${ocrLimit} characters.`);
    } catch (error) {
      result.limitations.push(error?.message === "ocr-timeout" ? "OCR exceeded its bounded time limit." : "Injected OCR extraction failed.");
    } finally {
      clearTimeout(timer);
    }
  }
  if (!result.passage && kind === "html" && result.candidateLinks.length) {
    result.outcome = "underlying-document";
    result.underlyingDocumentUrl = result.candidateLinks[0];
    result.limitations.push("JavaScript shell was not executed; the explicit underlying document URL requires separately controlled retrieval.");
  } else if (!result.passage) {
    result.outcome = "empty";
    result.limitations.push(kind === "pdf"
      ? "PDF contains no bounded extractable text; no OCR was run unless explicitly injected."
      : "Document contains no bounded text passage.");
  }
  return result;
}
