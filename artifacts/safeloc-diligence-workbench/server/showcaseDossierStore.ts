import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCanonicalProjectIdentity,
  assertSameProjectScope,
  type ProjectIdentity,
} from "../src/model/safelocProofContract.js";

export type ShowcaseOrigin = "reviewed-live-derived" | "reviewed-retained";

export type ShowcaseReviewProvenance = {
  kind: "human";
  reviewerRef: string;
  reviewedAt: string;
  rationale: string;
};

export type ShowcaseCatalogEntry = {
  slug: string;
  displayName: string;
  canonicalProjectId: string;
  project: ProjectIdentity;
  researchAsOfDate: string;
  reviewStatus: "reviewed";
  reviewProvenance: ShowcaseReviewProvenance;
  payloadReference: string;
  origin: ShowcaseOrigin;
  version: number;
  illustrative: false;
  presentationLabel: "cached example";
};

export type ShowcaseSourceProvenance = {
  sourceId: string;
  title: string;
  publisher: string;
  url: string;
  publicationDate: string | null;
  accessDate: string | null;
  retainedPassageId: string;
  retainedPassage: string;
};

export type ShowcaseSnapshot = {
  schemaVersion: 1;
  slug: string;
  displayName: string;
  canonicalProjectId: string;
  project: ProjectIdentity;
  researchAsOfDate: string;
  origin: ShowcaseOrigin;
  version: number;
  illustrative: false;
  fixtureStatus: "production-reviewed";
  sources: ShowcaseSourceProvenance[];
  payload: unknown;
};

export type ShowcaseDossierDetail = ShowcaseCatalogEntry & { snapshot: ShowcaseSnapshot };

export interface ShowcaseDossierRepository {
  list(): Promise<ShowcaseCatalogEntry[]>;
  get(slug: string): Promise<ShowcaseDossierDetail | null>;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    validDate(value.slice(0, 10));
}

function isSafePublicUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !/(?:^|\.)example(?:\.|$)|\.test$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function validReview(value: unknown): value is ShowcaseReviewProvenance {
  return isRecord(value) &&
    value.kind === "human" &&
    typeof value.reviewerRef === "string" && value.reviewerRef.trim().length > 0 &&
    validInstant(value.reviewedAt) &&
    typeof value.rationale === "string" && value.rationale.trim().length > 0;
}

function containsFixtureOrCacheMetadata(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsFixtureOrCacheMetadata);
  if (!isRecord(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (
      /(?:research.?cache|provider.?cache|cache.?(?:metadata|state|status|age|time)|cached.?at|provider.?available)/i.test(key) ||
      (key === "testOnly" && nested === true) ||
      (key === "synthetic" && nested === true) ||
      (key === "illustrative" && nested === true) ||
      (key === "fixtureStatus" && nested === "test-only")
    ) return true;
    if (containsFixtureOrCacheMetadata(nested)) return true;
  }
  return false;
}

function hasDefensibleSourceProvenance(snapshot: ShowcaseSnapshot): boolean {
  return !containsFixtureOrCacheMetadata(snapshot) &&
    snapshot.fixtureStatus === "production-reviewed" &&
    isRecord(snapshot.payload) &&
    Array.isArray(snapshot.sources) && snapshot.sources.length > 0 && snapshot.sources.every((source) =>
    typeof source.sourceId === "string" && source.sourceId.trim().length > 0 &&
    typeof source.title === "string" && source.title.trim().length > 0 &&
    typeof source.publisher === "string" && source.publisher.trim().length > 0 &&
    isSafePublicUrl(source.url) &&
    (source.publicationDate === null || validDate(source.publicationDate)) &&
    (source.accessDate === null || validDate(source.accessDate)) &&
    typeof source.retainedPassageId === "string" && source.retainedPassageId.trim().length > 0 &&
    typeof source.retainedPassage === "string" && source.retainedPassage.trim().length > 0,
  );
}

export function isPublicShowcaseEntry(value: unknown): value is ShowcaseCatalogEntry {
  if (!isRecord(value) || !isRecord(value.project)) return false;
  try {
    assertCanonicalProjectIdentity(value.project as ProjectIdentity);
  } catch {
    return false;
  }
  return typeof value.slug === "string" && SLUG_PATTERN.test(value.slug) &&
    typeof value.displayName === "string" && value.displayName.trim().length > 0 &&
    value.canonicalProjectId === value.project.projectId &&
    validDate(value.researchAsOfDate) &&
    value.reviewStatus === "reviewed" &&
    validReview(value.reviewProvenance) &&
    typeof value.payloadReference === "string" && value.payloadReference.trim().length > 0 &&
    (value.origin === "reviewed-live-derived" || value.origin === "reviewed-retained") &&
    Number.isInteger(value.version) && Number(value.version) > 0 &&
    value.illustrative === false &&
    value.presentationLabel === "cached example";
}

function validateSnapshot(entry: ShowcaseCatalogEntry, raw: unknown): ShowcaseSnapshot | null {
  if (!isRecord(raw)) return null;
  if (
    raw.schemaVersion !== 1 ||
    raw.slug !== entry.slug ||
    raw.displayName !== entry.displayName ||
    raw.canonicalProjectId !== entry.canonicalProjectId ||
    raw.researchAsOfDate !== entry.researchAsOfDate ||
    raw.origin !== entry.origin ||
    raw.version !== entry.version ||
    raw.illustrative !== false ||
    raw.fixtureStatus !== "production-reviewed" ||
    !isRecord(raw.project)
  ) return null;
  try {
    assertCanonicalProjectIdentity(raw.project as ProjectIdentity);
    assertSameProjectScope(entry.project, raw.project as ProjectIdentity, "Showcase snapshot");
  } catch {
    return null;
  }
  const snapshot = raw as unknown as ShowcaseSnapshot;
  return hasDefensibleSourceProvenance(snapshot) ? snapshot : null;
}

function safeReference(baseDir: string, reference: string): string | null {
  if (!reference || path.isAbsolute(reference)) return null;
  const resolved = path.resolve(baseDir, reference);
  return resolved.startsWith(`${path.resolve(baseDir)}${path.sep}`) ? resolved : null;
}

function parseRegistry(raw: unknown): unknown[] {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.entries)) {
    throw new Error("Showcase registry must be version 1 and contain an entries array.");
  }
  return raw.entries;
}

export class FileShowcaseDossierRepository implements ShowcaseDossierRepository {
  constructor(
    private readonly registryPath: string,
    private readonly snapshotDirectory: string,
  ) {}

  private async readCatalog(): Promise<Array<{ entry: ShowcaseCatalogEntry; snapshot: ShowcaseSnapshot }>> {
    const registry = JSON.parse(await readFile(this.registryPath, "utf8")) as unknown;
    const entries = parseRegistry(registry);
    const catalog: Array<{ entry: ShowcaseCatalogEntry; snapshot: ShowcaseSnapshot }> = [];
    for (const candidate of entries) {
      if (!isPublicShowcaseEntry(candidate)) continue;
      const snapshotPath = safeReference(this.snapshotDirectory, candidate.payloadReference);
      if (!snapshotPath) continue;
      try {
        const rawSnapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as unknown;
        const snapshot = validateSnapshot(candidate, rawSnapshot);
        if (snapshot) catalog.push({ entry: candidate, snapshot });
      } catch {
        // A missing or malformed snapshot is intentionally absent from the
        // public catalog; no research or fallback is attempted.
      }
    }
    return catalog.sort((left, right) => left.entry.slug.localeCompare(right.entry.slug));
  }

  async list(): Promise<ShowcaseCatalogEntry[]> {
    return (await this.readCatalog()).map(({ entry }) => entry);
  }

  async get(slug: string): Promise<ShowcaseDossierDetail | null> {
    if (!SLUG_PATTERN.test(slug)) return null;
    const item = (await this.readCatalog()).find(({ entry }) => entry.slug === slug);
    return item ? { ...item.entry, snapshot: item.snapshot } : null;
  }

  /**
   * Explicit publisher for a reviewed, non-illustrative snapshot. This is not
   * mounted as an HTTP route and is never called by list/get.
   */
  async replaceReviewedSnapshot(
    entry: Omit<ShowcaseCatalogEntry, "payloadReference" | "presentationLabel">,
    snapshot: ShowcaseSnapshot,
  ): Promise<void> {
    const payloadReference = `${entry.slug}-v${entry.version}.json`;
    const catalogEntry: ShowcaseCatalogEntry = {
      ...entry,
      payloadReference,
      presentationLabel: "cached example",
    };
    if (!isPublicShowcaseEntry(catalogEntry)) {
      throw new Error("Showcase replacement requires an explicitly reviewed, non-illustrative catalog entry.");
    }
    if (!validateSnapshot(catalogEntry, snapshot)) {
      throw new Error("Showcase replacement snapshot must match catalog metadata and retain defensible source passages.");
    }
    const currentRegistry = await readFile(this.registryPath, "utf8").then((raw) => parseRegistry(JSON.parse(raw)))
      .catch((error: unknown) => {
        if (isRecord(error) && error.code === "ENOENT") return [] as ShowcaseCatalogEntry[];
        throw error;
      });
    const existing = currentRegistry.find((candidate) =>
      isPublicShowcaseEntry(candidate) && candidate.slug === catalogEntry.slug,
    ) as ShowcaseCatalogEntry | undefined;
    if (existing && catalogEntry.version <= existing.version) {
      throw new Error("Showcase replacement version must be greater than the current version.");
    }

    await mkdir(this.snapshotDirectory, { recursive: true });
    await mkdir(path.dirname(this.registryPath), { recursive: true });
    const snapshotPath = safeReference(this.snapshotDirectory, payloadReference);
    if (!snapshotPath) throw new Error("Showcase snapshot reference must remain inside the snapshot directory.");
    const suffix = `${process.pid}-${Date.now()}`;
    const snapshotTemp = `${snapshotPath}.${suffix}.tmp`;
    const registryTemp = `${this.registryPath}.${suffix}.tmp`;
    const nextEntries = currentRegistry
      .filter((candidate) => !isRecord(candidate) || candidate.slug !== catalogEntry.slug)
      .concat(catalogEntry);
    try {
      await writeFile(snapshotTemp, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
      await rename(snapshotTemp, snapshotPath);
      await writeFile(registryTemp, `${JSON.stringify({ schemaVersion: 1, entries: nextEntries }, null, 2)}\n`, { flag: "wx" });
      await rename(registryTemp, this.registryPath);
    } catch (error) {
      await Promise.all([
        rm(snapshotTemp, { force: true }).catch(() => undefined),
        rm(registryTemp, { force: true }).catch(() => undefined),
      ]);
      throw error;
    }
  }
}

const defaultRegistryPath = fileURLToPath(new URL("./showcase-registry.json", import.meta.url));
const defaultSnapshotDirectory = fileURLToPath(new URL("./showcase-snapshots/", import.meta.url));

let defaultRepository: ShowcaseDossierRepository | null = null;
export function getDefaultShowcaseDossierRepository(): ShowcaseDossierRepository {
  return defaultRepository ??= new FileShowcaseDossierRepository(defaultRegistryPath, defaultSnapshotDirectory);
}

export function createMemoryShowcaseDossierRepository(
  entries: readonly unknown[] = [],
  snapshots: Readonly<Record<string, unknown>> = {},
): ShowcaseDossierRepository {
  const sortedEntries = entries.filter(isPublicShowcaseEntry).sort((left, right) => left.slug.localeCompare(right.slug));
  return {
    async list() {
      return sortedEntries.filter((entry) => validateSnapshot(entry, snapshots[entry.slug])).map((entry) => ({ ...entry }));
    },
    async get(slug) {
      const entry = sortedEntries.find((candidate) => candidate.slug === slug);
      const snapshot = entry ? validateSnapshot(entry, snapshots[entry.slug]) : null;
      return entry && snapshot ? { ...entry, snapshot } : null;
    },
  };
}
