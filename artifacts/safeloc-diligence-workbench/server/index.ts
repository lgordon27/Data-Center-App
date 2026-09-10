import express, { type Express, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleErcotQueueRequest } from "./ercotProxy.mjs";
import { handleEiaElectricityRequest } from "./eiaProxy.mjs";
import { handleAnalyzeEvidenceRequest } from "./aiEvidenceProxy.mjs";
import { handleResearchProjectRequest } from "./researchProjectProxy.mjs";
import { handleDirectoryRequest, handleDirectoryStatsRequest } from "./computeAtlasProxy.mjs";
import { handleReleaseDocumentRequest, handleVersionRequest } from "./version.mjs";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(serverDir, "..");

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

export async function createApp(): Promise<Express> {
  readRuntimeConfig();
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.get("/api/version", handleVersionRequest);
  app.get("/release.json", handleReleaseDocumentRequest);
  app.all("/api/analyze-evidence", async (request: Request, response: Response) => {
    await handleAnalyzeEvidenceRequest(request, response);
  });
  app.all("/api/research-project", async (request: Request, response: Response) => {
    await handleResearchProjectRequest(request, response);
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

async function start() {
  const { port } = readRuntimeConfig();
  const app = await createApp();
  const server = app.listen(port, "0.0.0.0");
  const shutdown = () => server.close();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void start();
}