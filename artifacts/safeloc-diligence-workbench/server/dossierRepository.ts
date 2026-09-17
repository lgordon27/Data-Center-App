import type { DossierRow } from "./dossierSchema";

export type Dossier = Omit<DossierRow, "createdAt" | "updatedAt"> & {
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export interface DossierRepository {
  list(): Promise<unknown[]>;
  get(slug: string): Promise<unknown | null>;
}

export function createMemoryDossierRepository(records: readonly Record<string, unknown>[] = []): DossierRepository {
  const bySlug = new Map(records.map((record) => [String(record.slug), record]));
  return {
    async list() { return [...bySlug.values()]; },
    async get(slug) { return bySlug.get(slug) ?? null; },
  };
}

export function createDossierRepository(db: {
  select: () => { from: (table: unknown) => Promise<DossierRow[]> };
} | any): DossierRepository {
  // Keeping the query boundary here makes API tests independent of PostgreSQL.
  return {
    async list() { return db.select().from((await import("./dossierSchema.js")).dossiers); },
    async get(slug) {
      const records: DossierRow[] = await db.select().from((await import("./dossierSchema.js")).dossiers);
      return records.find((record: DossierRow) => record.slug === slug) ?? null;
    },
  };
}

let defaultRepository: DossierRepository | null = null;
export function getDefaultDossierRepository(): DossierRepository {
  if (defaultRepository) return defaultRepository;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for canonical dossier persistence.");
  }
  // Importing the client lazily keeps Vite development and isolated API tests usable
  // without opening a connection until the canonical database is configured.
  defaultRepository = {
    async list() {
      const { db } = await import("./db.js");
      return createDossierRepository(db).list();
    },
    async get(slug) {
      const { db } = await import("./db.js");
      return createDossierRepository(db).get(slug);
    },
  };
  return defaultRepository;
}

export function setDefaultDossierRepository(repository: DossierRepository | null) {
  defaultRepository = repository;
}