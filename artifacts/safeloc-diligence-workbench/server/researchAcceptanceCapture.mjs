import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const ACCEPTANCE_CAPTURE_OPT_IN_PATH = path.join(
  WORKSPACE_ROOT,
  ".local",
  "safeloc-acceptance-capture-opt-in.json",
);
export const ACCEPTANCE_CAPTURE_DIRECTORY = path.join(
  WORKSPACE_ROOT,
  "diagnostics",
  "safeloc-acceptance-capture",
);

export const ACCEPTANCE_CAPTURE_LIMITS = Object.freeze({
  maxTextBytes: 512 * 1024,
  maxRecordBytes: 2 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
});

const SECRET_QUERY_KEY = /(?:^|[_-])(?:api[_-]?key|key|token|secret|signature|sig|auth|credential|password|session|jwt|access[_-]?token)(?:$|[_-])/i;
const SECRET_ASSIGNMENT = /\b(api[_ -]?key|access[_ -]?token|authorization|proxy-authorization|token|secret|password|credential|session(?:[_ -]?id)?|jwt|cookie)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi;
const JSON_SECRET_PROPERTY = /(["']?)(api[_ -]?key|access[_ -]?token|authorization|proxy-authorization|token|secret|password|credential|session(?:[_ -]?id)?|jwt|cookie)\1\s*:\s*("[^"]*"|'[^']*'|[^\s,;}\]]+)/gi;
const PROVIDER_KEY = /\b(?:sk|AIza|ghp|gho|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g;
const HEADER_SECRET = /^(\s*(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-goog-api-key)\s*:\s*)[^\r\n]*/gim;
const URL_TOKEN = /https?:\/\/[^\s"'<>]+/gi;
const SENSITIVE_METADATA_KEY = /^(?:authorization|proxyauthorization|cookie|setcookie|xapikey|xgoogleapikey|apikey|accesstoken|token|secret|password|credential|session(?:id)?|jwt|headers?|requestheaders|responseheaders|transport(?:metadata)?|http(?:request|response)?(?:headers?|metadata|options|config|context|trace|diagnostic|debug|details)|request(?:metadata|options|config|context|headers?|url|id|trace|diagnostic|debug|details)|response(?:metadata|options|config|context|headers?|url|id|trace|diagnostic|debug|details)|raw(?:request|response|headers|body)|socket|tls|traceparent|tracestate|connection|useragent|host|remoteaddress|localaddress)$/i;

function sensitiveMetadataKey(key) {
  return SENSITIVE_METADATA_KEY.test(String(key).replace(/[^a-z0-9]/gi, "").toLowerCase());
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function privateIpv4(value) {
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => octet < 0 || octet > 255)) return false;
  return octets[0] === 0
    || octets[0] === 10
    || octets[0] === 127
    || octets[0] === 169 && octets[1] === 254
    || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
    || octets[0] === 192 && octets[1] === 168;
}

function sanitizedUrlToken(token, reasons) {
  let suffix = "";
  let candidate = token;
  while (/[),.;}\]]$/.test(candidate)) {
    suffix = candidate.slice(-1) + suffix;
    candidate = candidate.slice(0, -1);
  }
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      reasons.add("url-credentials-or-nonpublic-scheme");
      return `[redacted-url]${suffix}`;
    }
    let changed = false;
    if (url.hash) {
      url.hash = "";
      changed = true;
      reasons.add("url-fragment");
    }
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_KEY.test(key)) {
        url.searchParams.delete(key);
        changed = true;
        reasons.add("sensitive-url-query");
      }
    }
    if (url.hostname.toLowerCase() === "vertexaisearch.cloud.google.com") {
      const pathDigest = sha256(url.pathname).slice(0, 16);
      url.pathname = `/grounding-api-redirect/redacted-${pathDigest}`;
      url.search = "";
      changed = true;
      reasons.add("opaque-provider-redirect");
    } else if (/\/(?:redirect|redirection|out|click|link|url)\/[^/]{16,}$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/[^/]+$/, (segment) => `redacted-${sha256(segment).slice(0, 16)}`);
      url.search = "";
      changed = true;
      reasons.add("opaque-provider-redirect");
    }
    return `${changed ? url.href : candidate}${suffix}`;
  } catch {
    reasons.add("unparseable-url");
    return `[redacted-url]${suffix}`;
  }
}

function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) return value;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = maxBytes;
  while (length > Math.max(0, maxBytes - 4)) {
    try {
      return decoder.decode(bytes.subarray(0, length));
    } catch {
      length -= 1;
    }
  }
  return "";
}

export function sanitizeAcceptanceCaptureText(value, { maxBytes = ACCEPTANCE_CAPTURE_LIMITS.maxTextBytes } = {}) {
  const original = typeof value === "string" ? value : "";
  const reasons = new Set();
  let sanitized = original
    .replace(URL_TOKEN, (token) => sanitizedUrlToken(token, reasons))
    .replace(JSON_SECRET_PROPERTY, (_match, quote, key, value) => {
      reasons.add("credential-property");
      return `${quote}${key}${quote}:"[redacted]"`;
    })
    .replace(HEADER_SECRET, (_match, header) => {
      reasons.add("sensitive-header-value");
      return `${header}[redacted]`;
    })
    .replace(/Bearer\s+\S+/gi, () => {
      reasons.add("bearer-credential");
      return "Bearer [redacted]";
    })
    .replace(PROVIDER_KEY, () => {
      reasons.add("provider-key");
      return "[redacted-key]";
    })
    .replace(SECRET_ASSIGNMENT, (match, label) => {
      if (/\[redacted\]/i.test(match)) return match;
      reasons.add("credential-assignment");
      return `${label}=[redacted]`;
    })
    .replace(/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g, (address) => {
      if (!privateIpv4(address)) return address;
      reasons.add("private-network-address");
      return "[redacted-private-address]";
    });
  const sanitizedBeforeTruncation = sanitized;
  const truncated = Buffer.byteLength(sanitized, "utf8") > maxBytes;
  if (truncated) {
    sanitized = truncateUtf8(sanitized, maxBytes);
    reasons.add("capture-size-limit");
  }
  const originalBytes = Buffer.byteLength(original, "utf8");
  const capturedBytes = Buffer.byteLength(sanitized, "utf8");
  const originalSha256 = sha256(original);
  const capturedSha256 = sha256(sanitized);
  return {
    text: sanitized,
    originalBytes,
    originalSha256,
    capturedBytes,
    capturedSha256,
    exactOriginal: sanitized === original && !truncated,
    altered: sanitized !== original || truncated,
    truncated,
    alterationReasons: [...reasons],
    sanitizedBeforeTruncationBytes: Buffer.byteLength(sanitizedBeforeTruncation, "utf8"),
  };
}

function sanitizeMetadata(value, depth = 0, alterationState = { altered: false }) {
  if (typeof value === "string") {
    const cleaned = sanitizeAcceptanceCaptureText(value, { maxBytes: 2_000 });
    if (!cleaned.exactOriginal) {
      alterationState.altered = true;
      alterationState.reasons ??= new Set();
      for (const reason of cleaned.alterationReasons) alterationState.reasons.add(reason);
      alterationState.truncated ||= cleaned.truncated;
    }
    return cleaned.text;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (depth >= 5) {
    alterationState.altered = true;
    alterationState.truncated = true;
    alterationState.reasons ??= new Set();
    alterationState.reasons.add("metadata-depth-limit");
    return "[metadata-depth-limit]";
  }
  if (Array.isArray(value)) {
    if (value.length > 64) {
      alterationState.altered = true;
      alterationState.truncated = true;
      alterationState.reasons ??= new Set();
      alterationState.reasons.add("metadata-array-item-limit");
    }
    return value.slice(0, 64).map((item) => sanitizeMetadata(item, depth + 1, alterationState));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > 64) {
      alterationState.altered = true;
      alterationState.truncated = true;
      alterationState.reasons ??= new Set();
      alterationState.reasons.add("metadata-object-entry-limit");
    }
    const safeEntries = entries.slice(0, 64).flatMap(([key, item]) => {
      if (sensitiveMetadataKey(key)) {
        alterationState.altered = true;
        alterationState.reasons ??= new Set();
        alterationState.reasons.add("sensitive-structured-field-excluded");
        return [];
      }
      const safeKey = sanitizeAcceptanceCaptureText(key, { maxBytes: 120 });
      if (!safeKey.exactOriginal) {
        alterationState.altered = true;
        alterationState.reasons ??= new Set();
        for (const reason of safeKey.alterationReasons) alterationState.reasons.add(reason);
      }
      return [[safeKey.text, sanitizeMetadata(item, depth + 1, alterationState)]];
    });
    return Object.fromEntries(safeEntries);
  }
  return String(value);
}

function validProjectOptIn(project, permit) {
  const name = String(project?.name ?? "").trim();
  const location = String(project?.location ?? "").trim();
  const knownData = project?.knownData ?? {};
  const identity = project?.projectIdentity ?? {};
  const operator = String(identity.operator ?? knownData.operator ?? project?.operator ?? "").trim();
  const allowedKnownDataFields = new Set(["operator", "city", "county", "state"]);
  return name === permit.projectName
    && location === permit.location
    && operator === permit.operator
    && identity.projectId == null
    && identity.providerId == null
    && Object.keys(knownData).every((key) => allowedKnownDataFields.has(key))
    && !knownData.aliases?.length;
}

export function createLocalAcceptanceCapture({
  runId,
  project = {},
  rootDirectory = ACCEPTANCE_CAPTURE_DIRECTORY,
  limits = ACCEPTANCE_CAPTURE_LIMITS,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof runId !== "string" || !/^[a-f0-9-]{36}$/i.test(runId)) {
    throw new Error("Acceptance capture requires a UUID run ID.");
  }
  const boundedLimits = {
    maxTextBytes: Math.max(0, Math.min(ACCEPTANCE_CAPTURE_LIMITS.maxTextBytes, limits.maxTextBytes ?? ACCEPTANCE_CAPTURE_LIMITS.maxTextBytes)),
    maxRecordBytes: Math.max(4_096, Math.min(ACCEPTANCE_CAPTURE_LIMITS.maxRecordBytes, limits.maxRecordBytes ?? ACCEPTANCE_CAPTURE_LIMITS.maxRecordBytes)),
    maxTotalBytes: Math.max(4_096, Math.min(ACCEPTANCE_CAPTURE_LIMITS.maxTotalBytes, limits.maxTotalBytes ?? ACCEPTANCE_CAPTURE_LIMITS.maxTotalBytes)),
  };
  const runDirectory = path.join(path.resolve(rootDirectory), runId);
  mkdirSync(path.dirname(runDirectory), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(runDirectory), 0o700);
  mkdirSync(runDirectory, { mode: 0o700 });
  chmodSync(runDirectory, 0o700);
  const filePath = path.join(runDirectory, "trace.jsonl");
  const fileDescriptor = openSync(filePath, "wx", 0o600);
  chmodSync(filePath, 0o600);
  let bytesWritten = 0;
  let recordsWritten = 0;
  let recordsDropped = 0;
  let overflowWritten = false;
  let writeError = null;
  let closed = false;
  let recordId = 0;
  const recordCounts = {};
  const projectSnapshotRaw = {
    projectId: project?.projectId ?? project?.id ?? null,
    name: project?.name ?? null,
    location: project?.location ?? null,
    operator: project?.projectIdentity?.operator ?? project?.knownData?.operator ?? project?.operator ?? null,
  };
  const projectMetadataState = { altered: false };
  const projectSnapshot = sanitizeMetadata(projectSnapshotRaw, 0, projectMetadataState);

  const writeLine = (record, { reserveSummary = true } = {}) => {
    if (closed || writeError) return false;
    const line = `${JSON.stringify(record)}\n`;
    const lineBytes = Buffer.byteLength(line, "utf8");
    const reserve = reserveSummary ? 2_048 : 0;
    if (lineBytes > boundedLimits.maxRecordBytes || bytesWritten + lineBytes > boundedLimits.maxTotalBytes - reserve) {
      recordsDropped += 1;
      if (!overflowWritten && bytesWritten + 512 <= boundedLimits.maxTotalBytes) {
        overflowWritten = true;
        const overflowLine = `${JSON.stringify({
          recordId: ++recordId,
          recordedAt: now(),
          type: "capture-overflow",
          runId,
          reason: lineBytes > boundedLimits.maxRecordBytes ? "record-size-limit" : "run-size-limit",
          droppedRecordCountAtNotice: recordsDropped,
          maxRecordBytes: boundedLimits.maxRecordBytes,
          maxTotalBytes: boundedLimits.maxTotalBytes,
        })}\n`;
        try {
          writeSync(fileDescriptor, overflowLine, null, "utf8");
          bytesWritten += Buffer.byteLength(overflowLine, "utf8");
          recordsWritten += 1;
        } catch (error) {
          writeError = error instanceof Error ? error.name : "unknown";
        }
      }
      return false;
    }
    try {
      writeSync(fileDescriptor, line, null, "utf8");
      bytesWritten += lineBytes;
      recordsWritten += 1;
      recordCounts[record.stage ?? record.type] = (recordCounts[record.stage ?? record.type] ?? 0) + 1;
      return true;
    } catch (error) {
      writeError = error instanceof Error ? error.name : "unknown";
      return false;
    }
  };

  const baseRecord = (type, stage, lineage, content) => {
    const metadataState = { altered: false };
    const safeLineage = sanitizeMetadata(lineage ?? {}, 0, metadataState);
    return {
      recordId: ++recordId,
      recordedAt: now(),
      type,
      stage,
      runId,
      project: projectSnapshot,
      projectAltered: projectMetadataState.altered,
      projectAlterationReasons: [...(projectMetadataState.reasons ?? [])],
      lineage: safeLineage,
      lineageAltered: metadataState.altered,
      lineageAlterationReasons: [...(metadataState.reasons ?? [])],
      ...(content ? { content } : {}),
    };
  };

  const writeText = ({
    stage,
    text,
    captureText = text,
    lineage = {},
    structuredAlterationReasons = [],
    structuredTruncated = false,
  } = {}) => {
    if (typeof stage !== "string" || !stage.trim() || typeof text !== "string" || typeof captureText !== "string") {
      return false;
    }
    const content = sanitizeAcceptanceCaptureText(captureText, { maxBytes: boundedLimits.maxTextBytes });
    const alterationReasons = [...new Set([
      ...content.alterationReasons,
      ...structuredAlterationReasons,
      ...(captureText !== text && structuredAlterationReasons.length === 0 ? ["capture-representation-changed"] : []),
    ])];
    const representationAltered = captureText !== text;
    const structurallyAltered = structuredAlterationReasons.length > 0 || representationAltered;
    return writeLine(baseRecord("text", stage, lineage, {
      originalSha256: sha256(text),
      originalBytes: Buffer.byteLength(text, "utf8"),
      capturedSha256: content.capturedSha256,
      capturedBytes: content.capturedBytes,
      exactOriginal: content.exactOriginal && !structurallyAltered,
      altered: content.altered || structurallyAltered,
      truncated: content.truncated || structuredTruncated,
      alterationReasons,
      text: content.text,
    }));
  };

  const writer = {
    filePath,
    runDirectory,
    limits: boundedLimits,
    writeText,
    writeStructured({ stage, value, lineage = {} } = {}) {
      let originalText;
      try {
        originalText = JSON.stringify(value);
      } catch {
        return false;
      }
      if (typeof originalText !== "string") return false;
      const alterationState = { altered: false };
      const safeValue = sanitizeMetadata(value, 0, alterationState);
      let safeText;
      try {
        safeText = JSON.stringify(safeValue);
      } catch {
        return false;
      }
      const structuredAlterationReasons = [...(alterationState.reasons ?? [])];
      if (safeText !== originalText && structuredAlterationReasons.length === 0) {
        structuredAlterationReasons.push("structured-value-representation-changed");
      }
      return writeText({
        stage,
        text: originalText,
        captureText: safeText,
        lineage: { ...lineage, representation: "json-serialized-structured-value" },
        structuredAlterationReasons,
        structuredTruncated: alterationState.truncated === true,
      });
    },
    readBack() {
      if (!closed) throw new Error("Acceptance capture must be finalized before read-back.");
      const metadata = statSync(filePath);
      if (!metadata.isFile() || metadata.size > boundedLimits.maxTotalBytes) {
        throw new Error("Acceptance capture read-back exceeded its configured size limit.");
      }
      const serialized = readFileSync(filePath, "utf8");
      if (Buffer.byteLength(serialized, "utf8") !== metadata.size || !serialized.endsWith("\n")) {
        throw new Error("Acceptance capture read-back is incomplete.");
      }
      const lines = serialized.trimEnd().split("\n");
      if (lines.some((line) => Buffer.byteLength(line, "utf8") + 1 > boundedLimits.maxRecordBytes)) {
        throw new Error("Acceptance capture read-back contains an oversized record.");
      }
      const records = lines.map((line) => JSON.parse(line));
      if (records.some((record) => record?.runId !== runId)) {
        throw new Error("Acceptance capture read-back contains a mismatched run ID.");
      }
      for (const record of records) {
        const content = record?.content;
        if (!content || typeof content.text !== "string") continue;
        const actualBytes = Buffer.byteLength(content.text, "utf8");
        const actualSha256 = sha256(content.text);
        if (content.capturedBytes !== actualBytes || content.capturedSha256 !== actualSha256) {
          throw new Error("Acceptance capture read-back content hash does not match its captured text.");
        }
        if (content.exactOriginal === true
          && (content.altered === true
            || content.truncated === true
            || content.originalBytes !== actualBytes
            || content.originalSha256 !== actualSha256)) {
          throw new Error("Acceptance capture labels altered content as unchanged.");
        }
        if (content.exactOriginal !== true && content.altered !== true) {
          throw new Error("Acceptance capture has altered content without an explicit alteration state.");
        }
      }
      return {
        runId,
        bytes: metadata.size,
        sha256: sha256(serialized),
        contentIntegrityVerified: true,
        records,
      };
    },
    finalize({ status = "unknown" } = {}) {
      if (closed) return this.status();
      writeLine({
        recordId: ++recordId,
        recordedAt: now(),
        type: "capture-summary",
        runId,
        status: String(status).slice(0, 120),
        recordsWritten,
        recordsDropped,
        overflowWritten,
        writeError,
        bytesBeforeSummary: bytesWritten,
        maxTotalBytes: boundedLimits.maxTotalBytes,
        maxRecordBytes: boundedLimits.maxRecordBytes,
        maxTextBytes: boundedLimits.maxTextBytes,
        recordCounts,
      }, { reserveSummary: false });
      try {
        fsyncSync(fileDescriptor);
      } catch (error) {
        writeError ??= error instanceof Error ? error.name : "unknown";
      }
      try {
        closeSync(fileDescriptor);
      } catch (error) {
        writeError ??= error instanceof Error ? error.name : "unknown";
      }
      closed = true;
      return this.status();
    },
    status() {
      return {
        enabled: true,
        filePath,
        runDirectory,
        bytesWritten,
        recordsWritten,
        recordsDropped,
        overflowWritten,
        writeError,
        closed,
        limits: boundedLimits,
      };
    },
  };

  writer.writeStructured({
    stage: "capture-start",
    value: {
      formatVersion: 1,
      runId,
      project: projectSnapshot,
      limits: boundedLimits,
      contentPolicy: "original hashes precede redaction or truncation; altered content is not exact",
    },
  });
  return writer;
}

export function consumeAcceptanceCaptureOptIn({
  project,
  runId,
  markerPath = ACCEPTANCE_CAPTURE_OPT_IN_PATH,
  rootDirectory = ACCEPTANCE_CAPTURE_DIRECTORY,
} = {}) {
  let permit;
  try {
    const metadata = statSync(markerPath);
    if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) return null;
    permit = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    return null;
  }
  if (
    permit?.version !== 1
    || permit?.enabled !== true
    || typeof permit?.expiresAt !== "string"
    || Date.parse(permit.expiresAt) <= Date.now()
    || !["Red Oak Campus", "Red Oak, Ellis County, Texas", "DataBank"].every((value, index) =>
      value === [permit.projectName, permit.location, permit.operator][index])
    || !validProjectOptIn(project, permit)
  ) return null;

  const capture = createLocalAcceptanceCapture({ runId, project, rootDirectory });
  try {
    unlinkSync(markerPath);
  } catch (error) {
    capture.finalize({ status: "opt-in-marker-consumption-failed" });
    throw new Error(`Acceptance capture opt-in could not be consumed: ${error instanceof Error ? error.name : "unknown"}`);
  }
  return capture;
}