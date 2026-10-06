import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleErcotQueueRequest } from "./ercotProxy.mjs";
import { handleEiaElectricityRequest } from "./eiaProxy.mjs";
import { handleAnalyzeEvidenceRequest } from "./aiEvidenceProxy.mjs";
import { handleResearchProjectRequest, RESEARCH_PROJECT_TIMEOUT_MS } from "./researchProjectProxy.mjs";
import { installDatabaseSafetyNet, isDatabaseConnectionError, logDatabaseConnectionError } from "./databaseResilience.mjs";
import { handleDirectoryRequest, handleDirectoryStatsRequest } from "./computeAtlasProxy.mjs";
import { handleReleaseDocumentRequest, handleVersionRequest } from "./version.mjs";
import { handleProjectResearchRegistryRequest } from "./projectResearchRegistry.mjs";
import { handleDossiersRequest, handleDossierRequest } from "./dossierApi.js";
import { handleResearchAuditDownload } from "./researchAuditApi.js";
import { getResearchAuditRepository } from "./researchAuditRepository.js";
import type { ResearchRunAudit } from "./researchAuditRepository.js";
import {
  createPublicRateLimiter,
  createDailySpendGuard,
  createExclusiveResearchAdmission,
  evidenceSpendConfig,
} from "./publicLimits.js";
import { handleShowcaseDossiersRequest, handleShowcaseDossierRequest } from "./showcaseDossierApi.js";
import { runStartupMigrations, type MigrationReport } from "./migrationRunner.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(serverDir, "..");

export type ServerReadiness = { ready: boolean; schemaWarning?: boolean; migrationWarning?: boolean };

const STARTUP_RETRY_AFTER_SECONDS = 2;
const STARTING_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SafeLoc is starting</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f7fa; color: #182230; font: 16px system-ui, sans-serif; }
    main { max-width: 28rem; margin: 1.5rem; padding: 1.5rem; border: 1px solid #d8e0ea; border-radius: 0.75rem; background: #fff; }
    h1 { margin: 0 0 0.5rem; font-size: 1.25rem; }
    p { margin: 0; color: #526173; line-height: 1.5; }
  </style>
</head>
<body><main><h1>SafeLoc is starting</h1><p>Starting up. Retry shortly.</p></main></body>
</html>`;

function sendStartupUnavailable(response: ServerResponse, pathname: string) {
  response.statusCode = 503;
  response.setHeader("Retry-After", String(STARTUP_RETRY_AFTER_SECONDS));
  response.setHeader("Cache-Control", "no-store");
  if (pathname === "/api/health" || pathname.startsWith("/api/") || pathname === "/release.json") {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ status: "not-ready", message: "Starting up. Retry shortly." }));
    return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(STARTING_HTML);
}

export function createReadinessMiddleware(readiness: ServerReadiness) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (request.path === "/api/health") {
      response.setHeader("Cache-Control", "no-store");
      if (!readiness.ready) {
        response.setHeader("Retry-After", String(STARTUP_RETRY_AFTER_SECONDS));
      }
      response.status(readiness.ready ? 200 : 503).json({
        status: readiness.ready ? "ready" : "not-ready",
        ...(readiness.schemaWarning === undefined ? {} : {
          schemaWarning: readiness.schemaWarning,
          migrationWarning: readiness.migrationWarning ?? false,
        }),
      });
      return;
    }
    if (!readiness.ready) {
      response.status(503);
      response.setHeader("Retry-After", String(STARTUP_RETRY_AFTER_SECONDS));
      response.setHeader("Cache-Control", "no-store");
      if (request.path.startsWith("/api/") || request.path === "/release.json") {
        response.json({ status: "not-ready", message: "Starting up. Retry shortly." });
      } else {
        response.type("html").send(STARTING_HTML);
      }
      return;
    }
    next();
  };
}

export function createInitializationGateServer(
  port: number,
  initializeApp: (readiness: ServerReadiness) => Promise<Express>,
  host = "0.0.0.0",
) {
  const readiness: ServerReadiness = { ready: false };
  const server = createServer((request, response) => {
    let pathname = "/";
    try {
      pathname = new URL(request.url ?? "/", "http://safeloc.local").pathname;
    } catch {
      // Keep malformed paths on the temporary not-ready response.
    }
    sendStartupUnavailable(response, pathname);
  });
  const listening = new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
  const initialized = listening.then(async () => {
    const app = await initializeApp(readiness);
    server.removeAllListeners("request");
    server.on("request", app);
    readiness.ready = true;
  });
  return { server, readiness, listening, initialized };
}

const researchAuditRepositoryAdapter = {
  connectionRetryManaged: true,
  startRun: async (record: ResearchRunAudit) =>
    (await getResearchAuditRepository()).startRun(record),
  finishRun: async (record: ResearchRunAudit) =>
    (await getResearchAuditRepository()).finishRun(record),
  markFinalizationFailed: async (record: ResearchRunAudit) =>
    (await getResearchAuditRepository()).markFinalizationFailed(record),
  save: async (record: ResearchRunAudit) =>
    (await getResearchAuditRepository()).save(record),
  progressRun: async (record: ResearchRunAudit) =>
    (await getResearchAuditRepository()).progressRun(record),
  updateDelivery: async (record: ResearchRunAudit) =>
    (await getResearchAuditRepository()).updateDelivery(record),
};
let publicControls: Promise<{
  rateLimiter: ReturnType<typeof createPublicRateLimiter>;
  spendGuard: ReturnType<typeof createDailySpendGuard>;
}> | undefined;
let researchAdmission: Promise<ReturnType<typeof createExclusiveResearchAdmission>> | undefined;
function getPublicControls() {
  return publicControls ??= (async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for public safety controls.");
    const { pool } = await import("./db.js");
    return {
      rateLimiter: createPublicRateLimiter(pool),
      spendGuard: createDailySpendGuard(pool, evidenceSpendConfig()),
    };
  })().catch(error => {
    publicControls = undefined;
    throw error;
  });
}

function getResearchAdmission() {
  return researchAdmission ??= (async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for public research admission.");
    const { pool } = await import("./db.js");
    return createExclusiveResearchAdmission(pool);
  })().catch(error => {
    researchAdmission = undefined;
    throw error;
  });
}

const MAX_RESEARCH_ADMISSION_LEASE_MS = 110_000;
type ResearchAdmission = ReturnType<typeof createExclusiveResearchAdmission>;

export function createResearchAdmissionHandler(
  admission: ResearchAdmission | (() => Promise<ResearchAdmission>),
  handler: (request: Request, response: Response) => Promise<void>,
) {
  return async (request: Request, response: Response) => {
    if (request.method !== "POST") {
      await handler(request, response);
      return;
    }
    let lease: Awaited<ReturnType<ResearchAdmission["acquire"]>>;
    try {
      const controls = typeof admission === "function" ? await admission() : admission;
      lease = await controls.acquire();
    } catch {
      response.status(503).json({
        error: "Research capacity is temporarily unavailable. Try again later.",
        errorType: "research-admission-unavailable",
      });
      return;
    }
    if (!lease.admitted) {
      response.status(503).json({
        error: "Research is busy. Try again later; capacity is not guaranteed.",
        errorType: "research-capacity-busy",
      });
      return;
    }
    if (request.aborted || response.destroyed) {
      try { await lease.release(); } catch { console.error("SafeLoc research admission lock release failed."); }
      return;
    }

    let backgroundRefresh = false;
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      try {
        await lease.release();
      } catch {
        console.error("SafeLoc research admission lock release failed.");
      }
    };
    const releaseTimer = setTimeout(() => { void release(); }, MAX_RESEARCH_ADMISSION_LEASE_MS);
    releaseTimer.unref?.();
    const observeResponseBody = (body: unknown) => {
      if (
        body
        && typeof body === "object"
        && "researchCache" in body
        && (body as { researchCache?: { refreshStatus?: unknown } }).researchCache?.refreshStatus === "running"
      ) backgroundRefresh = true;
    };
    const originalJson = response.json;
    const originalEnd = response.end;
    response.json = ((body: unknown) => {
      observeResponseBody(body);
      return originalJson.call(response, body);
    }) as typeof response.json;
    // The research handler writes JSON directly through end(), not Express json().
    // Observe before forwarding so cached background work retains admission even
    // if writing the response fails. Preserve every native end() argument.
    if (typeof originalEnd === "function") {
      response.end = ((...args: unknown[]) => {
        const chunk = args[0];
        if (typeof chunk === "string" || Buffer.isBuffer(chunk)) {
          try {
            observeResponseBody(JSON.parse(typeof chunk === "string" ? chunk : chunk.toString("utf8")));
          } catch {
            // Non-JSON output is not a research-cache status signal.
          }
        }
        return Reflect.apply(originalEnd, response, args);
      }) as typeof response.end;
    }
    try {
      await handler(request, response);
    } catch {
      if (!response.headersSent) {
        response.status(503).json({
          error: "Research could not be completed. Previously retained evidence remains available.",
          errorType: "research-failed-safely",
        });
      }
    } finally {
      response.json = originalJson;
      if (typeof originalEnd === "function") response.end = originalEnd;
      if (!backgroundRefresh) {
        clearTimeout(releaseTimer);
        await release();
      }
    }
  };
}

function readRuntimeConfig() {
  const rawPort = process.env.PORT;
  if (!rawPort) {
    throw new Error("PORT environment variable is required. Set it to the artifact service port.");
  }
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT value "${rawPort}". Set PORT to an integer between 1 and 65535.`);
  }

  const basePath = process.env.BASE_PATH;
  if (!basePath) {
    throw new Error("BASE_PATH environment variable is required. Set it to / for the SafeLoc root artifact.");
  }
  if (basePath !== "/") {
    throw new Error(
      `Invalid BASE_PATH value "${basePath}". SafeLoc is registered at the root path, so set BASE_PATH=/`,
    );
  }

  return { port, basePath };
}

function rejectUnknownApiRoute(request: Request, response: Response, next: () => void) {
  if (!request.path.startsWith("/api/")) {
    next();
    return;
  }
  response.status(404).json({ status: "error", message: "API route not found" });
}

export type ScopedApiAccessLog = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  researchRunId: string | null;
};

export function createScopedApiRequestLogger(
  write: (entry: ScopedApiAccessLog) => void = (entry) => console.info("SafeLoc API access", entry),
) {
  return (request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    let logged = false;
    const logRequest = () => {
      if (logged) return;
      logged = true;
      const runId = response.getHeader("X-SafeLoc-Research-Run-Id");
      write({
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
        researchRunId: typeof runId === "string" ? runId : null,
      });
    };
    response.once("finish", logRequest);
    response.once("close", logRequest);
    next();
  };
}

export async function createApp(readiness: ServerReadiness = { ready: true }): Promise<Express> {
  readRuntimeConfig();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(createReadinessMiddleware(readiness));
  app.use(express.json());
  const logScopedApiRequest = createScopedApiRequestLogger();
  app.get("/api/version", handleVersionRequest);
  app.get("/api/dossiers", handleDossiersRequest);
  app.get("/api/dossiers/:slug", handleDossierRequest);
  app.get("/api/showcase", handleShowcaseDossiersRequest);
  app.get("/api/showcase/:slug", handleShowcaseDossierRequest);
  app.get("/api/research-audits/:runId", async (request: Request, response: Response) => {
    await handleResearchAuditDownload(request, response);
  });
  app.get("/api/project-research", async (request: Request, response: Response) => {
    await handleProjectResearchRegistryRequest(request, response);
  });
  app.get("/api/project-research/:id", async (request: Request, response: Response) => {
    await handleProjectResearchRegistryRequest(request, response);
  });
  app.get("/release.json", handleReleaseDocumentRequest);
  app.all("/api/analyze-evidence", logScopedApiRequest, async (request: Request, response: Response) => {
    try {
      await handleAnalyzeEvidenceRequest(request, response, await getPublicControls());
    } catch {
      response.status(503).json({ error: "AI analysis unavailable. Please classify manually." });
    }
  });
  app.all("/api/research-project", logScopedApiRequest, async (request: Request, response: Response) => {
    try {
      const admissionAwareHandler = createResearchAdmissionHandler(
        getResearchAdmission,
        async (researchRequest, researchResponse) => {
          await handleResearchProjectRequest(researchRequest, researchResponse, {
            auditRepository: researchAuditRepositoryAdapter,
          });
        },
      );
      await admissionAwareHandler(request, response);
    } catch {
      if (!response.headersSent) {
        response.status(503).json({
          error: "Research capacity is temporarily unavailable. Try again later.",
          errorType: "research-admission-unavailable",
        });
      }
    }
  });
  app.all("/api/ercot-queue", async (request: Request, response: Response) => {
    await handleErcotQueueRequest(request, response);
  });
  app.all("/api/eia/electricity", async (request: Request, response: Response) => {
    await handleEiaElectricityRequest(request, response);
  });
  app.all("/api/directory", async (request: Request, response: Response) => {
    await handleDirectoryRequest(request, response);
  });
  app.all("/api/directory/stats", async (request: Request, response: Response) => {
    await handleDirectoryStatsRequest(request, response);
  });
  app.use(rejectUnknownApiRoute);
  if (process.env.NODE_ENV === "production") {
    const publicDir = path.join(artifactDir, "dist/public");
    app.use(express.static(publicDir, { index: false }));
    app.use((request, response, next) => {
      if (request.method !== "GET" || request.path.startsWith("/api/")) return next();
      response.sendFile(path.join(publicDir, "index.html"));
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      configFile: path.join(artifactDir, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  return app;
}

async function waitForDatabaseAvailability(signal: AbortSignal): Promise<boolean> {
  const { pool } = await import("./db.js");
  while (!signal.aborted) {
    try {
      await pool.query("SELECT 1");
      return !signal.aborted;
    } catch (error) {
      if (!isDatabaseConnectionError(error)) throw error;
      logDatabaseConnectionError(error, "startup-readiness");
      if (signal.aborted) return false;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(finish, 2_000);
        if (signal.aborted) {
          finish();
          return;
        }
        signal.addEventListener("abort", finish, { once: true });
      });
    }
  }
  return false;
}

type StartupOperations = {
  wait: (signal: AbortSignal) => Promise<boolean>;
  migrate: (signal: AbortSignal) => Promise<MigrationReport>;
  diagnose: () => Promise<boolean>;
  sweep: () => Promise<number>;
  app: (readiness: ServerReadiness) => Promise<Express>;
};
const startupOperations: StartupOperations = {
  wait: waitForDatabaseAvailability,
  migrate: async signal => runStartupMigrations((await import("./db.js")).pool, { signal }),
  diagnose: async () => (await import("./db.js")).logDatabaseStartupDiagnostics(),
  sweep: async () => (await getResearchAuditRepository()).interruptStaleRuns(RESEARCH_PROJECT_TIMEOUT_MS),
  app: createApp,
};

export async function initializeServerApp(
  readiness: ServerReadiness,
  signal: AbortSignal,
  operations: StartupOperations = startupOperations,
): Promise<Express> {
  if (!(await operations.wait(signal))) {
    throw new Error("Server startup stopped before readiness.");
  }
  if (signal.aborted) throw new Error("Server startup stopped before readiness.");
  // Migration warnings never replace the ordinary database-availability gate.
  // Clear stale warnings only after this startup verifies both migration state
  // and required schema; diagnostics cannot clear a checksum refusal.
  readiness.migrationWarning = (await operations.migrate(signal)).warning;
  if (signal.aborted) throw new Error("Server startup stopped before readiness.");
  readiness.schemaWarning = !(await operations.diagnose()) || readiness.migrationWarning;
  try {
    const count = await operations.sweep();
    if (count) console.info("SafeLoc interrupted stale research audits.", { count });
  } catch {
    console.warn("SafeLoc interrupted research audit sweep unavailable; retry on next startup.");
  }
  if (signal.aborted) throw new Error("Server startup stopped before readiness.");
  return operations.app(readiness);
}

function start() {
  installDatabaseSafetyNet();
  const { port } = readRuntimeConfig();
  const shutdownController = new AbortController();
  const startup = createInitializationGateServer(
    port,
    (readiness) => initializeServerApp(readiness, shutdownController.signal),
  );
  void startup.initialized.catch((error) => {
    if (shutdownController.signal.aborted) return;
    if (isDatabaseConnectionError(error)) {
      logDatabaseConnectionError(error, "startup-initialization");
      return;
    }
    console.error("SafeLoc server initialization failed before readiness.", error);
  });
  const server = startup.server;
  const shutdown = () => {
    shutdownController.abort();
    server.close();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void start();
}
