import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

export const RESEARCH_EXTRACTION_LIMITS = Object.freeze({
  maxInputBytes: 2_000_000,
  maxPassageChars: 4_000,
  maxIndexEntries: 40,
  maxIndexEntryChars: 240,
  maxCandidateLinks: 12,
  maxMarkupChars: 250_000,
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
    .replace(/<(?:div|section)\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:banner|cookie|consent|navigation|navbar|menu|breadcrumb)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)\s*>/gi, " ");
  const mainContainers = [...withoutBoilerplate.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/gi)].map((match) => match[1]);
  const articleContainers = [...withoutBoilerplate.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)].map((match) => match[1]);
  const sectionContainers = [...withoutBoilerplate.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section\s*>/gi)].map((match) => match[1]);
  const contentContainers = mainContainers.length ? mainContainers
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
  const text = cleanText(decodeEntities(textSource.replace(/<[^>]+>/g, " ")));
  return { text, index: makeIndex(headings, limits), candidates };
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
