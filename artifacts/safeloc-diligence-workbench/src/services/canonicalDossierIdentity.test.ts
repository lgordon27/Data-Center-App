import assert from "node:assert/strict";
import test from "node:test";
import type { CompanyProject } from "@/data/companyExposure";
import type { CanonicalDossierSummary } from "@/services/canonicalDossierService";
import {
  canonicalDisplayIdentityForSlug,
  orderedCanonicalDisplayIdentities,
  projectWithCanonicalDisplayIdentity,
} from "@/services/canonicalDossierIdentity";

const dossiers = [
  {
    slug: "project-kilby",
    name: "Project Kilby",
    version: "1",
    coverageState: "material-gaps",
    asOfDate: "2026-06-22",
    canonicalData: {
      identity: {
        location: "Reeves County, West Texas",
        operator: "Microsoft",
        scope: "Reviewed scope",
      },
      originatingCompany: "Microsoft",
      relationshipType: "Developer/Operator",
      relationships: [],
      evidence: [],
      materiality: { project: "Directional", issuer: "Unquantified", portfolio: "Not assessed" },
      questions: [],
      triggers: [],
    },
  },
] satisfies CanonicalDossierSummary[];

test("projects canonical name and location over stale curated display metadata", () => {
  const project = {
    id: "project-kilby",
    name: "Stale project name",
    operator: "Chevron / Microsoft",
    location: "Atlanta, Georgia",
    capacityMW: 2670,
    status: "Pre-FID",
    tier: null,
    tierLabel: "Reviewed",
    connectionType: "Developer/Operator",
    description: "Reviewed record",
    kind: "curated",
    relationshipBasis: "source-backed",
  } satisfies CompanyProject;

  assert.deepEqual(projectWithCanonicalDisplayIdentity(project, dossiers), {
    ...project,
    name: "Project Kilby",
    location: "Reeves County, West Texas",
  });
});

test("orders reviewed identities by the public canonical dossier sequence", () => {
  assert.equal(canonicalDisplayIdentityForSlug(dossiers, "project-kilby")?.location, "Reeves County, West Texas");
  assert.deepEqual(orderedCanonicalDisplayIdentities(dossiers).map((dossier) => dossier.slug), ["project-kilby"]);
});