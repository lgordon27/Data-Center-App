import type { Request, Response } from "express";
import { getDefaultDossierRepository, type DossierRepository } from "./dossierRepository.js";

function send(response: Response, status: number, body: unknown) {
  response.status(status).json(body);
}

export function createDossierHandlers(repository: DossierRepository = getDefaultDossierRepository()) {
  return {
    async list(request: Request, response: Response) {
      if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
      try {
        return send(response, 200, { dossiers: await repository.list() });
      } catch {
        return send(response, 503, { error: "Canonical dossier store is unavailable." });
      }
    },
    async get(request: Request, response: Response) {
      if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
      const slug = String(request.params.slug ?? "").trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return send(response, 400, { error: "Invalid dossier slug." });
      try {
        const dossier = await repository.get(slug);
        return dossier ? send(response, 200, { dossier }) : send(response, 404, { error: "Dossier not found." });
      } catch {
        return send(response, 503, { error: "Canonical dossier store is unavailable." });
      }
    },
  };
}

export async function handleDossiersRequest(request: Request, response: Response) {
  try {
    await createDossierHandlers().list(request, response);
  } catch {
    send(response, 503, { error: "Canonical dossier store is unavailable." });
  }
}

export async function handleDossierRequest(request: Request, response: Response) {
  try {
    await createDossierHandlers().get(request, response);
  } catch {
    send(response, 503, { error: "Canonical dossier store is unavailable." });
  }
}