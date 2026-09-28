import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { getResearchAuditRepository } from "./researchAuditRepository.js";

const OWNER_AUDIT_DOWNLOAD_LIMIT = 10;
const OWNER_AUDIT_DOWNLOAD_WINDOW_MS = 60_000;

export function createOwnerAuditDownloadRateLimiter({
  limit = OWNER_AUDIT_DOWNLOAD_LIMIT,
  windowMs = OWNER_AUDIT_DOWNLOAD_WINDOW_MS,
  now = () => Date.now(),
}: {
  limit?: number;
  windowMs?: number;
  now?: () => number;
} = {}) {
  const requestTimesByClient = new Map<string, number[]>();
  return {
    allow(clientKey: string) {
      const currentTime = now();
      const recent = (requestTimesByClient.get(clientKey) ?? [])
        .filter((requestTime) => currentTime - requestTime < windowMs);
      if (recent.length >= limit) {
        requestTimesByClient.set(clientKey, recent);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - currentTime) / 1000)),
        };
      }
      recent.push(currentTime);
      requestTimesByClient.set(clientKey, recent);
      for (const [key, times] of requestTimesByClient) {
        if (times.every((time) => currentTime - time >= windowMs)) requestTimesByClient.delete(key);
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

const defaultDownloadRateLimiter = createOwnerAuditDownloadRateLimiter();

function hasOwnerToken(authorization: string | undefined, ownerToken: string | undefined): boolean {
  if (!ownerToken || ownerToken.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(ownerToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function handleResearchAuditDownload(
  request: Request,
  response: Response,
  options: {
    ownerToken?: string;
    repository?: { get(runId: string): Promise<unknown> };
    rateLimiter?: ReturnType<typeof createOwnerAuditDownloadRateLimiter>;
  } = {},
): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Vary", "Authorization");
  if (!hasOwnerToken(request.get("authorization"), options.ownerToken ?? process.env.RESEARCH_AUDIT_OWNER_TOKEN)) {
    response.status(401).json({ error: "Owner authorization required." });
    return;
  }
  const clientKey = request.ip ?? request.socket?.remoteAddress ?? "unknown-client";
  const rateLimit = (options.rateLimiter ?? defaultDownloadRateLimiter).allow(clientKey);
  if (!rateLimit.allowed) {
    response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    response.status(429).json({ error: "Audit download rate limit exceeded." });
    return;
  }
  const runId = request.params.runId;
  if (typeof runId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    response.status(400).json({ error: "Invalid run ID." });
    return;
  }
  try {
    const repository = options.repository ?? await getResearchAuditRepository();
    const audit = await repository.get(runId);
    if (!audit) {
      response.status(404).json({ error: "Audit not found." });
      return;
    }
    response.setHeader("Content-Disposition", `attachment; filename="research-audit-${runId}.json"`);
    response.json(audit);
  } catch {
    response.status(503).json({ error: "Audit storage unavailable." });
  }
}