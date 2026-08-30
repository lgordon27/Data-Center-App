import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import {
  ACTIVE_FEMA_NRI_PROFILE,
  FEMA_NRI_PROFILES,
  FEMA_NRI_SOURCE,
  formatFemaHazardSummary,
  getTopFemaHazards,
} from "./femaNRI";

test("contains the five tracked Texas FEMA county profiles and source metadata", () => {
  assert.deepEqual(Object.keys(FEMA_NRI_PROFILES).sort(), ["48029", "48389", "48439", "48441", "48451"]);
  assert.equal(FEMA_NRI_SOURCE.version, "v1.20");
  assert.equal(FEMA_NRI_SOURCE.releaseDate, "December 2025");
  assert.equal(FEMA_NRI_SOURCE.countyTable, "NRI_Table_Counties.zip");
  assert.equal(FEMA_NRI_SOURCE.fieldMapping.hazards.riverineFlooding, "IFLD_RISKR");
  assert.match(FEMA_NRI_SOURCE.sourceUrl, /^https:\/\/www\.fema\.gov\//);

  assert.equal(FEMA_NRI_PROFILES["48029"].county, "Bexar County");
  assert.equal(FEMA_NRI_PROFILES["48389"].county, "Reeves County");
  assert.equal(FEMA_NRI_PROFILES["48439"].county, "Tarrant County");
  assert.equal(FEMA_NRI_PROFILES["48441"].county, "Taylor County");
  assert.equal(FEMA_NRI_PROFILES["48451"].county, "Tom Green County");
  assert.equal(FEMA_NRI_PROFILES["48029"].overallRiskRating, "Relatively High");
  assert.equal(FEMA_NRI_PROFILES["48389"].socialVulnerabilityRating, "Relatively High");
  assert.equal(FEMA_NRI_PROFILES["48451"].overallRiskRating, "Relatively Low");
});

test("preserves the Taylor County FEMA values used by the brief and evidence room", () => {
  assert.equal(ACTIVE_FEMA_NRI_PROFILE.fips, "48441");
  assert.equal(ACTIVE_FEMA_NRI_PROFILE.overallRiskScore, 83.81043256997455);
  assert.equal(ACTIVE_FEMA_NRI_PROFILE.overallRiskRating, "Relatively Moderate");
  assert.equal(ACTIVE_FEMA_NRI_PROFILE.expectedAnnualLoss, 53651454.35904762);
  assert.equal(ACTIVE_FEMA_NRI_PROFILE.socialVulnerabilityScore, 34.4783715);
  assert.equal(ACTIVE_FEMA_NRI_PROFILE.socialVulnerabilityRating, "Relatively Low");
  assert.equal(ACTIVE_FEMA_NRI_PROFILE.communityResilienceScore, 76.49491094147582);
  assert.equal(ACTIVE_FEMA_NRI_PROFILE.communityResilienceRating, "Relatively High");
  assert.deepEqual(
    getTopFemaHazards(ACTIVE_FEMA_NRI_PROFILE).map(({ label, rating }) => [label, rating]),
    [
      ["Hail", "Very High"],
      ["Winter Weather", "Relatively High"],
      ["Drought", "Relatively Moderate"],
    ],
  );

  assert.equal(INITIAL_EVIDENCE.site_hazard_exposure.classification, "Verified Evidence");
  assert.equal(INITIAL_EVIDENCE.site_hazard_exposure.modelClassification, "Model Inference");
  assert.equal(INITIAL_EVIDENCE.site_hazard_exposure.value, formatFemaHazardSummary(ACTIVE_FEMA_NRI_PROFILE));
  assert.match(INITIAL_EVIDENCE.site_hazard_exposure.citation, /FIPS 48441/);
  assert.match(INITIAL_EVIDENCE.community_risk.description, /Social Vulnerability 34\.48, Relatively Low/);
  assert.match(INITIAL_EVIDENCE.community_risk.citation, /FIPS 48441/);
});