import express, { type Express, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleErcotQueueRequest } from "./ercotProxy.mjs";
import { handleEiaElectricityRequest } from "./eiaProxy.mjs";
import { GridTrackerMcpClient, validateNaturalLanguageQuery } from "./mcp/gridtracker";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(serverDir, "..");

export async function createApp(client = new GridTrackerMcpClient()): Promise<Express> {
  const app = express();
  app.disable("x-powered-by");
  app.all("/api/ercot-queue", async (request: Request, response: Response) => {
    await handleErcotQueueRequest(request, response);
  });
  app.all("/api/eia/electricity", async (request: Request, response: Response) => {
    await handleEiaElectricityRequest(request, response);
  });
  app.get("/api/gridtracker/status", (_request: Request, response: Response) => {
    response.json(client.status());
  });
  app.get("/api/gridtracker/diagnostics", (_request: Request, response: Response) => {
    response.json(client.diagnostics());
  });
  app.get("/api/gridtracker/query", async (request: Request, response: Response) => {
    try {
      const query = validateNaturalLanguageQuery(request.query.q);
      response.json(await client.query(query));
    } catch (error) {
      response.status(400).json({
        ok: false,
        error: {
          code: "INVALID_QUERY",
          message: error instanceof Error ? error.message : "Invalid query.",
        },
      });
    }
  });

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
  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port <= 0) throw new Error("PORT environment variable is required.");
  const app = await createApp();
  const server = app.listen(port, "0.0.0.0");
  const shutdown = () => server.close();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void start();
}