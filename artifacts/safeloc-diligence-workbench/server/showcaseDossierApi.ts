import type { Request, Response } from "express";
import {
  getDefaultShowcaseDossierRepository,
  type ShowcaseDossierRepository,
} from "./showcaseDossierStore.js";

function send(response: Response, status: number, body: unknown) {
  response.status(status).json(body);
}

export function createShowcaseDossierHandlers(
  repository: ShowcaseDossierRepository = getDefaultShowcaseDossierRepository(),
) {
  return {
    async list(request: Request, response: Response) {
      if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
      try {
        return send(response, 200, { dossiers: await repository.list() });
      } catch {
        return send(response, 503, { error: "Reviewed showcase catalog is unavailable." });
      }
    },
    async get(request: Request, response: Response) {
      if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
      const slug = String(request.params.slug ?? "").trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return send(response, 400, { error: "Invalid showcase slug." });
      }
      try {
        const dossier = await repository.get(slug);
        return dossier
          ? send(response, 200, { dossier })
          : send(response, 404, { error: "Reviewed showcase dossier not found." });
      } catch {
        return send(response, 503, { error: "Reviewed showcase dossier is unavailable." });
      }
    },
  };
}

export async function handleShowcaseDossiersRequest(request: Request, response: Response) {
  try {
    await createShowcaseDossierHandlers().list(request, response);
  } catch {
    send(response, 503, { error: "Reviewed showcase catalog is unavailable." });
  }
}

export async function handleShowcaseDossierRequest(request: Request, response: Response) {
  try {
    await createShowcaseDossierHandlers().get(request, response);
  } catch {
    send(response, 503, { error: "Reviewed showcase dossier is unavailable." });
  }
}
