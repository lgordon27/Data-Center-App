const DATASET_URLS = {
  projects: "https://www.ercotqueue.com/data/projects.json",
  codHistory: "https://www.ercotqueue.com/data/cod_history.json",
  loadQueueSummary: "https://www.ercotqueue.com/data/load/load_queue_summary.json",
  siteFreshness: "https://www.ercotqueue.com/data/site_freshness.json",
};

const REQUEST_TIMEOUT_MS = 8000;
let retainedResponse = null;

function isJsonContentType(value) {
  return typeof value === "string" && (value.includes("application/json") || value.includes("+json"));
}

function responseMetadata(key, response, url, requestedAt) {
  return {
    key,
    url,
    requestedAt,
    status: response.status,
    contentType: response.headers.get("content-type"),
    ok: response.ok,
  };
}

function validatePayload(key, payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error(`${key} returned a non-object JSON payload`);
  }
  if (key === "projects" && !Array.isArray(payload.projects)) {
    throw new Error("projects payload does not contain a projects array");
  }
  if (key === "codHistory" && !Array.isArray(payload)) {
    throw new Error("COD history payload is not an array");
  }
  if (key === "loadQueueSummary" && (!payload.summary || !Array.isArray(payload.summary.buckets))) {
    throw new Error("load queue summary does not contain summary buckets");
  }
  if (
    key === "siteFreshness" &&
    (typeof payload.generated_at !== "string" || !Number.isFinite(Date.parse(payload.generated_at)))
  ) {
    throw new Error("site freshness payload does not contain a valid generated_at timestamp");
  }
}

async function fetchDataset(key, fetchImpl, requestedAt) {
  const url = DATASET_URLS[key];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const metadata = responseMetadata(key, response, url, requestedAt);
    if (!response.ok) throw new Error(`${key} upstream returned HTTP ${response.status}`);
    if (!isJsonContentType(metadata.contentType)) {
      throw new Error(`${key} upstream returned an unexpected content type`);
    }
    const payload = await response.json();
    validatePayload(key, payload);
    return { payload, metadata };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchErcotQueueSnapshot({
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
} = {}) {
  const fetchedAt = now();
  const responses = [];
  const data = {};
  try {
    for (const key of Object.keys(DATASET_URLS)) {
      const result = await fetchDataset(key, fetchImpl, fetchedAt);
      data[key] = result.payload;
      responses.push(result.metadata);
    }
    const sourceUpdatedAt =
      data.siteFreshness.generated_at ||
      data.loadQueueSummary.generated_at ||
      data.projects.generated_at ||
      fetchedAt;
    const successful = {
      status: "live",
      fetchedAt,
      sourceUpdatedAt,
      data,
      diagnostics: {
        endpoint: "/api/ercot-queue",
        requestTimestamp: fetchedAt,
        responseStatus: 200,
        cache: "miss",
        sourceFreshness: sourceUpdatedAt,
        responses,
      },
    };
    retainedResponse = successful;
    return successful;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upstream error";
    return {
      status: "error",
      fetchedAt,
      sourceUpdatedAt: null,
      data: null,
      diagnostics: {
        endpoint: "/api/ercot-queue",
        requestTimestamp: fetchedAt,
        responseStatus: 502,
        cache: retainedResponse ? "hit" : "miss",
        sourceFreshness: retainedResponse?.sourceUpdatedAt ?? null,
        responses,
        error: message,
      },
    };
  }
}

function sendJson(res, status, body) {
  const encoded = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(encoded);
}

export async function handleErcotQueueRequest(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      status: "error",
      diagnostics: { endpoint: "/api/ercot-queue", responseStatus: 405, error: "Method not allowed" },
    });
    return;
  }

  const result = await fetchErcotQueueSnapshot();
  if (result.status === "live") {
    sendJson(res, 200, result);
    return;
  }

  if (retainedResponse) {
    sendJson(res, 200, {
      ...retainedResponse,
      status: "cached",
      diagnostics: {
        ...retainedResponse.diagnostics,
        requestTimestamp: result.fetchedAt,
        responseStatus: 200,
        cache: "hit",
        error: result.diagnostics.error,
        failedResponses: result.diagnostics.responses,
      },
    });
    return;
  }

  sendJson(res, 502, result);
}

export { DATASET_URLS };