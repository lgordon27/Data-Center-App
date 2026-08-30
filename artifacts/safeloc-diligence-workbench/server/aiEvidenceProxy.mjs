const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const AI_EVIDENCE_MODEL = "gpt-4o-mini";
const AI_EVIDENCE_MAX_TOKENS = 300;
const REQUEST_TIMEOUT_MS = 10_000;
const AI_EVIDENCE_SYSTEM_PROMPT =
  "You are an infrastructure diligence analyst specializing in AI data center investments. You assess evidence quality for investment underwriting. Respond with exactly two fields in JSON format: classification (one of: Verified Evidence, Management Assertion, Model Inference, User Assumption, Missing Evidence) and reasoning (one sentence explaining why).";

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
  for (const field of ["name", "value", "source"]) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      throw new Error(`Evidence field "${field}" must be a non-empty string.`);
    }
  }
  return {
    name: body.name.trim(),
    value: body.value.trim(),
    source: body.source.trim(),
  };
}

function buildAIEvidencePrompt({ name, value, source }) {
  return `Assess the evidence quality of this data point for the Stargate Abilene data center project (OpenAI/Oracle, Taylor County, Texas): Variable: ${name}. Current value: ${value}. Cited source: ${source}. Based on the source type and what is publicly verifiable about this project, classify the evidence quality.`;
}

function responseMessage(body, apiKey) {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.message !== "string") return "";
  return body.error.message.trim().replaceAll(apiKey, "[redacted]");
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

export async function handleAnalyzeEvidenceRequest(
  req,
  res,
  { apiKey = process.env.OPENAI_API_KEY, fetchImpl = fetch } = {},
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
          { role: "system", content: AI_EVIDENCE_SYSTEM_PROMPT },
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
      const detail = responseMessage(body, apiKey);
      sendJson(res, response.status, {
        error: detail ? `AI analysis unavailable. ${detail}` : `AI analysis unavailable (upstream HTTP ${response.status}).`,
      });
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
  AI_EVIDENCE_MAX_TOKENS,
  AI_EVIDENCE_MODEL,
  AI_EVIDENCE_SYSTEM_PROMPT,
  OPENAI_CHAT_COMPLETIONS_URL,
  buildAIEvidencePrompt,
  parseEvidenceBody,
};