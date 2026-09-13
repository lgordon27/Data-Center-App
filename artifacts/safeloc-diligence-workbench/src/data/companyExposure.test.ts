import test from "node:test";
import assert from "node:assert/strict";
import { COMPANY_CONNECTION_TYPES, COMPANY_PROFILES, companyProjects, connectionTypeForCompanyProject, projectSummary, toProjectSelectionContext } from "./companyExposure";
import type { DirectoryFacility } from "@/services/directoryService";

const facility = (overrides: Partial<DirectoryFacility> = {}): DirectoryFacility => ({
  id: "microsoft-rainier",
  name: "Project Rainier",
  operator: "Microsoft",
  city: "Mount Pleasant",
  county: "Racine",
  state: "WI",
  capacityMW: 315,
  availableCapacityMW: 315,
  status: "construction",
  confidence: "reported",
  aiClassification: "ai_training",
  sourceUrl: null,
  connectedCompanies: ["Microsoft"],
  connectedFunds: ["QQQ", "XLK"],
  lastUpdated: null,
  ...overrides,
});

test("company profiles preserve the six supplied stock lenses", () => {
  assert.deepEqual(COMPANY_PROFILES.map((profile) => profile.key), ["NVIDIA", "Microsoft", "Meta", "Google", "Oracle", "Amazon"]);
  assert.match(COMPANY_PROFILES.find((profile) => profile.key === "Oracle")?.headline ?? "", /Public reporting links/);
  assert.match(COMPANY_PROFILES.find((profile) => profile.key === "Google")?.detail ?? "", /Abbott/);
});

test("company projects combine reviewed context with operator-matched directory metadata", () => {
  const projects = companyProjects("Microsoft", [facility()]);
  assert.equal(projects.length, 2);
  assert.equal(projects[0].tier, null);
  assert.equal(projects[0].relationshipBasis, "unresolved");
  assert.equal(projects[0].connectionType, "Developer/Operator");
  assert.equal(projects[1].tier, null);
  assert.equal(projects[1].relationshipBasis, "operator-derived");
  assert.equal(projects[1].connectionType, "Customer Dependency");
  assert.equal(projects[1].capacityMW, 315);
});

test("connection types cover every company lens and preserve reviewed exceptions", () => {
  assert.deepEqual(COMPANY_CONNECTION_TYPES, [
    "Supplier Relationship",
    "Thematic Exposure",
    "Developer/Operator",
    "Customer Dependency",
    "Direct Contractual",
    "Sourced Indirect Role",
  ]);

  assert.equal(connectionTypeForCompanyProject("NVIDIA", "Stargate Abilene"), "Supplier Relationship");
  assert.equal(connectionTypeForCompanyProject("NVIDIA", "Project Rainier"), "Thematic Exposure");
  assert.equal(connectionTypeForCompanyProject("Microsoft", "Project Kilby"), "Developer/Operator");
  assert.equal(connectionTypeForCompanyProject("Microsoft", "Project Rainier"), "Customer Dependency");
  assert.equal(connectionTypeForCompanyProject("Oracle", "Stargate Abilene"), "Sourced Indirect Role");
  assert.equal(connectionTypeForCompanyProject("Meta", "Project Volcano"), "Developer/Operator");
  assert.equal(connectionTypeForCompanyProject("Google", "Google New Albany Campus"), "Developer/Operator");
  assert.equal(connectionTypeForCompanyProject("Amazon", "Amazon Central Ohio Campus"), "Developer/Operator");
});

test("directory projects always receive a connection type through the shared mapping", () => {
  const projects = companyProjects("Meta", [
    facility({
      id: "meta-volcano",
      name: "Project Volcano",
      operator: "Meta",
      connectedCompanies: ["Meta"],
    }),
  ]);
  assert.equal(projects.length, 2);
  const directoryProject = projects.find((project) => project.id === "meta-volcano");
  assert.equal(directoryProject?.kind, "directory");
  assert.equal(directoryProject?.connectionType, "Developer/Operator");
});

test("project summary keeps undisclosed capacity out of disclosed totals", () => {
  const summary = projectSummary(companyProjects("Microsoft", [facility()]));
  assert.equal(summary.count, 2);
  assert.equal(summary.capacityMW, 315);
  assert.equal(summary.tier1, 0);
  assert.equal(summary.tier2, 0);
  assert.equal(summary.undisclosedCapacity, 1);
});

test("registered provider facilities are not repeated under alternate display names", () => {
  const projects = companyProjects("Meta", [
    facility({
      id: "meta-el-paso-tx",
      name: "Meta El Paso Data Center",
      operator: "Meta",
      connectedCompanies: ["Meta"],
    }),
  ]);

  assert.equal(projects.filter((project) => project.id === "meta-el-paso-tx").length, 1);
});

test("preserves exact Amazon campus identity without supplying a generic campus", () => {
  const retainedNewAlbany = companyProjects("Amazon", [])[0];
  assert.equal(retainedNewAlbany.id, "amazon-data-center-ohio-oh");
  assert.equal(retainedNewAlbany.name, "AWS New Albany / Beech-Miller Road Campus");
  assert.equal(retainedNewAlbany.relationshipBasis, "operator-derived");
  const exactFacility = facility({
    id: "amazon-exact-phoenix-az",
    name: "AWS Exact Phoenix Facility",
    operator: "Amazon Web Services",
    city: "Phoenix",
    county: "Maricopa",
    state: "AZ",
    connectedCompanies: ["Amazon"],
    sourceUrl: "https://compute-atlas.com/facilities/amazon-exact-phoenix-az",
  });
  const project = companyProjects("Amazon", [exactFacility]).find((candidate) => candidate.id === exactFacility.id);
  assert.ok(project);
  const selection = toProjectSelectionContext("Amazon", project);
  assert.equal(selection.projectId, exactFacility.id);
  assert.equal(selection.providerId, exactFacility.id);
  assert.equal(selection.projectName, exactFacility.name);
  assert.equal(selection.company, "Amazon");
  assert.match(selection.location, /Phoenix.*Maricopa County.*AZ/);
});