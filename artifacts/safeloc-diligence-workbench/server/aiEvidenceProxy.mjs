const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const AI_EVIDENCE_MODEL = "gpt-4o-mini";
const AI_EVIDENCE_MAX_TOKENS = 300;
const REQUEST_TIMEOUT_MS = 10_000;
import {
  AI_EVIDENCE_CUTOFF_LABEL,
  AI_EVIDENCE_REPORTING_WINDOW,
  AI_EVIDENCE_VALID_REPORTING_YEARS_LABEL,
  buildAIEvidenceTemporalInstruction,
} from "../src/data/aiEvidenceTemporal.mjs";

// Server-side abuse guard: one client IP may start at most 30 provider-backed
// assessments in a rolling 60-second window. This is intentionally above the
// current sequential batch size while bounding duplicate/public requests.
const AI_EVIDENCE_REQUEST_LIMIT = 30;
const AI_EVIDENCE_REQUEST_WINDOW_MS = 60_000;
const AI_EVIDENCE_RATE_LIMIT_MESSAGE =
  "AI analysis request limit reached. Please wait before trying again and classify manually.";
const AI_EVIDENCE_CLASSIFICATION_POLICY =
  "Classify independent public records or reporting as Verified Evidence; dated company announcements, filings, or disclosures as Management Assertion when independent confirmation is limited; analyst-derived estimates from related facts as Model Inference; synthetic analyst-selected inputs as User Assumption; and a fact not established by the supplied citation as Missing Evidence. Do not treat statewide, regional, market-level, or similarly named-project context as facility-level proof.";
const AI_EVIDENCE_RESPONSE_INSTRUCTION =
  "Respond with exactly two JSON fields and no others: classification (one of exactly: Verified Evidence, Management Assertion, Model Inference, User Assumption, Missing Evidence) and reasoning (one sentence explaining why). Do not add markdown or extra commentary.";
const AI_EVIDENCE_SYSTEM_PROMPT =
  `You are an infrastructure diligence analyst specializing in AI data center investments. ${buildAIEvidenceTemporalInstruction()} Assess the curated Stargate Abilene data center project for investment underwriting. Use the curated publications and events only for the claims they support. ${AI_EVIDENCE_CLASSIFICATION_POLICY} ${AI_EVIDENCE_RESPONSE_INSTRUCTION}`;

function buildAIEvidenceSystemPrompt({ projectKind }) {
  if (projectKind === "curated") return AI_EVIDENCE_SYSTEM_PROMPT;
  return `You are an infrastructure diligence analyst specializing in AI data center investments. Today is ${AI_EVIDENCE_CUTOFF_LABEL}. The active reporting window is ${AI_EVIDENCE_REPORTING_WINDOW}; treat dated ${AI_EVIDENCE_VALID_REPORTING_YEARS_LABEL} reporting as potentially current as of the cutoff. This is a custom researched project: assess only the supplied evidence value and citation. Do not apply facts or events from the curated Stargate Abilene record, do not assume similarly named facilities are the same project, and do not claim to have performed new web research. ${AI_EVIDENCE_CLASSIFICATION_POLICY} ${AI_EVIDENCE_RESPONSE_INSTRUCTION}`;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseEvidenceBody(body) {
  if (!isRecord(body)) throw new Error("Evidence body must be a JSON object.");
  for (const field of ["name", "value", "source", "projectName", "projectLocation"]) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      throw new Error(`Evidence field "${field}" must be a non-empty string.`);
    }
  }
  if (!["curated", "custom"].includes(body.projectKind)) {
    throw new Error('Evidence field "projectKind" must be curated or custom.');
  }
  return {
    name: body.name.trim(),
    value: body.value.trim(),
    source: body.source.trim(),
    projectName: body.projectName.trim(),
    projectLocation: body.projectLocation.trim(),
    projectKind: body.projectKind,
  };
}

function buildAIEvidencePrompt({ name, value, source, projectName, projectLocation, projectKind }) {
  return `Assess the evidence quality of this supplied data point for the ${projectKind === "curated" ? "curated" : "custom researched"} project "${projectName}" in "${projectLocation}". Variable: ${name}. Current value: ${value}. Supplied citation: ${source}. Classify only whether this citation supports this value for this exact project. If it does not establish a facility-level claim for this project, return Missing Evidence.`;
}

async function readRequestBody(req) {
  if (req.body !== undefined) return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function requestClientKey(req) {
  if (typeof req?.ip === "string" && req.ip.trim()) return req.ip.trim();
  if (typeof req?.socket?.remoteAddress === "string" && req.socket.remoteAddress.trim()) {
    return req.socket.remoteAddress.trim();
  }
  return "unknown";
}

export function createAIEvidenceRateLimiter({
  limit = AI_EVIDENCE_REQUEST_LIMIT,
  windowMs = AI_EVIDENCE_REQUEST_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  const requestTimesByClient = new Map();

  return {
    allow(req) {
      const currentTime = now();
      const clientKey = requestClientKey(req);
      for (const [key, requestTimes] of requestTimesByClient) {
        if (requestTimes.every((requestTime) => currentTime - requestTime >= windowMs)) {
          requestTimesByClient.delete(key);
        }
      }
      const recentRequests = (requestTimesByClient.get(clientKey) ?? []).filter(
        (requestTime) => currentTime - requestTime < windowMs,
      );

      if (recentRequests.length >= limit) {
        requestTimesByClient.set(clientKey, recentRequests);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((recentRequests[0] + windowMs - currentTime) / 1000),
        );
        return { allowed: false, retryAfterSeconds };
      }

      recentRequests.push(currentTime);
      requestTimesByClient.set(clientKey, recentRequests);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

const defaultRateLimiter = createAIEvidenceRateLimiter();

export async function handleAnalyzeEvidenceRequest(
  req,
  res,
  {
    apiKey = process.env.OPENAI_API_KEY,
    fetchImpl = fetch,
    rateLimiter = defaultRateLimiter,
  } = {},
) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!apiKey) {
    sendJson(res, 503, { error: "AI analysis not configured. Set OPENAI_API_KEY in environment." });
    return;
  }

  let evidence;
  try {
    evidence = parseEvidenceBody(await readRequestBody(req));
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid evidence request." });
    return;
  }

  const rateLimit = rateLimiter.allow(req);
  if (!rateLimit.allowed) {
    res.setHeader("retry-after", String(rateLimit.retryAfterSeconds));
    sendJson(res, 429, { error: AI_EVIDENCE_RATE_LIMIT_MESSAGE });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_EVIDENCE_MODEL,
        max_tokens: AI_EVIDENCE_MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildAIEvidenceSystemPrompt(evidence) },
          { role: "user", content: buildAIEvidencePrompt(evidence) },
        ],
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let body;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = null;
    }

    if (!response.ok) {
      // Do not proxy upstream error text: providers may include sensitive
      // request metadata, credential hints, or implementation details.
      sendJson(res, response.status, { error: "AI analysis unavailable. Please classify manually." });
      return;
    }

    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      sendJson(res, 502, { error: "AI analysis returned an invalid structured response." });
      return;
    }

    let assessment;
    try {
      assessment = JSON.parse(content);
    } catch {
      sendJson(res, 502, { error: "AI analysis returned an invalid structured response." });
      return;
    }
    if (!isRecord(assessment)) {
      sendJson(res, 502, { error: "AI analysis returned an invalid structured response." });
      return;
    }
    sendJson(res, 200, assessment);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      sendJson(res, 504, { error: "AI analysis upstream request timed out." });
    } else {
      sendJson(res, 502, { error: "AI analysis upstream request failed." });
    }
  } finally {
    clearTimeout(timeout);
  }
}

export {
  AI_EVIDENCE_RATE_LIMIT_MESSAGE,
  AI_EVIDENCE_REQUEST_LIMIT,
  AI_EVIDENCE_REQUEST_WINDOW_MS,
  AI_EVIDENCE_MAX_TOKENS,
  AI_EVIDENCE_MODEL,
  AI_EVIDENCE_SYSTEM_PROMPT,
  buildAIEvidenceSystemPrompt,
  OPENAI_CHAT_COMPLETIONS_URL,
  buildAIEvidencePrompt,
  parseEvidenceBody,
};