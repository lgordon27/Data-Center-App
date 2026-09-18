import type { CompanyProject } from "@/data/companyExposure";
import type { CanonicalDossierSummary } from "@/services/canonicalDossierService";

const CANONICAL_DOSSIER_ORDER = [
  "stargate-abilene",
  "project-kilby",
  "microsoft-el-mirage",
] as const;

export type CanonicalDisplayIdentity = {
  slug: string;
  name: string;
  location: string;
  asOfDate: string | null;
  coverageState: string;
};

export function canonicalSlugForProject(
  project: Pick<CompanyProject, "id" | "kind" | "name">,
) {
  if (project.id === "project-kilby" || project.id === "microsoft-el-mirage") return project.id;
  return project.kind === "curated" && project.name.trim().toLowerCase() === "stargate abilene"
    ? "stargate-abilene"
    : null;
}

export function canonicalDisplayIdentity(
  dossier: CanonicalDossierSummary,
): CanonicalDisplayIdentity {
  return {
    slug: dossier.slug,
    name: dossier.name,
    location: dossier.canonicalData.identity.location,
    asOfDate: dossier.asOfDate,
    coverageState: dossier.coverageState,
  };
}

export function canonicalDisplayIdentityForSlug(
  dossiers: CanonicalDossierSummary[],
  slug: string | null | undefined,
) {
  if (!slug) return null;
  const dossier = dossiers.find((candidate) => candidate.slug === slug);
  return dossier ? canonicalDisplayIdentity(dossier) : null;
}

export function orderedCanonicalDisplayIdentities(
  dossiers: CanonicalDossierSummary[],
) {
  return CANONICAL_DOSSIER_ORDER
    .map((slug) => canonicalDisplayIdentityForSlug(dossiers, slug))
    .filter((identity): identity is CanonicalDisplayIdentity => identity !== null);
}

export function projectWithCanonicalDisplayIdentity(
  project: CompanyProject,
  dossiers: CanonicalDossierSummary[],
): CompanyProject {
  const identity = canonicalDisplayIdentityForSlug(
    dossiers,
    canonicalSlugForProject(project),
  );
  return identity
    ? { ...project, name: identity.name, location: identity.location }
    : project;
}