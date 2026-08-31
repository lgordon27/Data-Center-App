import test from "node:test";
import assert from "node:assert/strict";
import { COMPANY_PROFILES, companyProjects, projectSummary } from "./companyExposure";
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
  assert.match(COMPANY_PROFILES.find((profile) => profile.key === "Oracle")?.headline ?? "", /15-year Stargate lease/);
  assert.match(COMPANY_PROFILES.find((profile) => profile.key === "Google")?.detail ?? "", /Abbott/);
});

test("company projects combine reviewed context with operator-matched directory metadata", () => {
  const projects = companyProjects("Microsoft", [facility()]);
  assert.equal(projects.length, 2);
  assert.equal(projects[0].tier, 1);
  assert.equal(projects[1].tier, 2);
  assert.equal(projects[1].capacityMW, 315);
});

test("project summary keeps undisclosed capacity out of disclosed totals", () => {
  const summary = projectSummary(companyProjects("Microsoft", [facility()]));
  assert.equal(summary.count, 2);
  assert.equal(summary.capacityMW, 315);
  assert.equal(summary.tier1, 1);
  assert.equal(summary.tier2, 1);
  assert.equal(summary.undisclosedCapacity, 1);
});