import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { getResearchAuditRepository } from "./researchAuditRepository.js";

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
  } = {},
): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Vary", "Authorization");
  if (!hasOwnerToken(request.get("authorization"), options.ownerToken ?? process.env.RESEARCH_AUDIT_OWNER_TOKEN)) {
    response.status(401).json({ error: "Owner authorization required." });
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