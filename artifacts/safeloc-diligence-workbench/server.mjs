import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { handleErcotQueueRequest } from "./server/ercotProxy.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "dist/public");
const port = Number(process.env.PORT || 25519);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function serveFile(res, path) {
  let candidate = normalize(join(publicDir, path));
  if (!candidate.startsWith(publicDir)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  try {
    if (!statSync(candidate).isFile()) candidate = join(publicDir, "index.html");
  } catch {
    candidate = join(publicDir, "index.html");
  }
  res.statusCode = 200;
  res.setHeader("content-type", contentTypes[extname(candidate)] || "application/octet-stream");
  createReadStream(candidate).on("error", () => {
    if (!res.headersSent) res.statusCode = 404;
    res.end();
  }).pipe(res);
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
  if (pathname === "/api/ercot-queue") {
    await handleErcotQueueRequest(req, res);
    return;
  }
  const assetPath = pathname === "/" || !extname(pathname) ? "/index.html" : pathname;
  serveFile(res, assetPath);
});

server.listen(port, "0.0.0.0");