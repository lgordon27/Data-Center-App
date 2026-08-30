export const FEMA_NRI_SOURCE = {
  name: "FEMA National Risk Index",
  version: "v1.20",
  releaseDate: "December 2025",
  sourceUrl: "https://www.fema.gov/about/openfema/data-sets/national-risk-index-data",
  countyTable: "NRI_Table_Counties.zip",
  fieldMapping: {
    overallRiskScore: "RISK_SCORE",
    overallRiskRating: "RISK_RATNG",
    expectedAnnualLoss: "EAL_VALT",
    socialVulnerabilityScore: "SOVI_SCORE",
    socialVulnerabilityRating: "SOVI_RATNG",
    communityResilienceScore: "RESL_SCORE",
    communityResilienceRating: "RESL_RATNG",
    hazards: {
      drought: "DRGT_RISKR",
      heatWave: "HWAV_RISKR",
      riverineFlooding: "IFLD_RISKR",
      wildfire: "WFIR_RISKR",
      winterWeather: "WNTW_RISKR",
      strongWind: "SWND_RISKR",
      tornado: "TRND_RISKR",
      hail: "HAIL_RISKR",
    },
  },
} as const;

export const FEMA_NRI_RATINGS = [
  "Very Low",
  "Relatively Low",
  "Relatively Moderate",
  "Relatively High",
  "Very High",
] as const;

export type FemaNriRating = (typeof FEMA_NRI_RATINGS)[number];
export type FemaNriFips = "48029" | "48389" | "48439" | "48441" | "48451";
export type FemaHazardKey =
  | "drought"
  | "heatWave"
  | "riverineFlooding"
  | "wildfire"
  | "winterWeather"
  | "strongWind"
  | "tornado"
  | "hail";

export type FemaNriCountyProfile = {
  project: string;
  county: string;
  state: "Texas";
  fips: FemaNriFips;
  overallRiskScore: number;
  overallRiskRating: FemaNriRating;
  expectedAnnualLoss: number;
  socialVulnerabilityScore: number;
  socialVulnerabilityRating: FemaNriRating;
  communityResilienceScore: number;
  communityResilienceRating: FemaNriRating;
  hazards: Record<FemaHazardKey, FemaNriRating>;
};

export const FEMA_HAZARD_LABELS: Record<FemaHazardKey, string> = {
  drought: "Drought",
  heatWave: "Heat Wave",
  riverineFlooding: "Riverine Flooding",
  wildfire: "Wildfire",
  winterWeather: "Winter Weather",
  strongWind: "Strong Wind",
  tornado: "Tornado",
  hail: "Hail",
};

// Severity follows FEMA's exact five-label vocabulary. Object insertion order is
// the stable tie-breaker, so equally rated hazards always render consistently.
export const FEMA_RATING_SEVERITY: Record<FemaNriRating, number> = {
  "Very Low": 0,
  "Relatively Low": 1,
  "Relatively Moderate": 2,
  "Relatively High": 3,
  "Very High": 4,
};

export const FEMA_NRI_PROFILES: Record<FemaNriFips, FemaNriCountyProfile> = {
  "48029": {
    project: "Bexar County tracked project",
    county: "Bexar County",
    state: "Texas",
    fips: "48029",
    overallRiskScore: 99.42748091603053,
    overallRiskRating: "Relatively High",
    expectedAnnualLoss: 619365285.3899428,
    socialVulnerabilityScore: 57.22010178,
    socialVulnerabilityRating: "Relatively Moderate",
    communityResilienceScore: 21.692111959287534,
    communityResilienceRating: "Relatively Low",
    hazards: {
      drought: "Relatively Moderate",
      heatWave: "Relatively High",
      riverineFlooding: "Very High",
      wildfire: "Relatively Moderate",
      winterWeather: "Relatively High",
      strongWind: "Relatively High",
      tornado: "Very High",
      hail: "Very High",
    },
  },
  "48389": {
    project: "Reeves County tracked project",
    county: "Reeves County",
    state: "Texas",
    fips: "48389",
    overallRiskScore: 19.147582697201017,
    overallRiskRating: "Very Low",
    expectedAnnualLoss: 5468976.985339374,
    socialVulnerabilityScore: 66.03053435,
    socialVulnerabilityRating: "Relatively High",
    communityResilienceScore: 2.1946564885496183,
    communityResilienceRating: "Very Low",
    hazards: {
      drought: "Relatively Moderate",
      heatWave: "Very Low",
      riverineFlooding: "Very Low",
      wildfire: "Very Low",
      winterWeather: "Relatively Moderate",
      strongWind: "Relatively Moderate",
      tornado: "Very Low",
      hail: "Relatively Low",
    },
  },
  "48439": {
    project: "Tarrant County tracked project",
    county: "Tarrant County",
    state: "Texas",
    fips: "48439",
    overallRiskScore: 99.14122137404581,
    overallRiskRating: "Relatively High",
    expectedAnnualLoss: 608073828.0969709,
    socialVulnerabilityScore: 36.76844784,
    socialVulnerabilityRating: "Relatively Low",
    communityResilienceScore: 31.202290076335874,
    communityResilienceRating: "Relatively Low",
    hazards: {
      drought: "Relatively Low",
      heatWave: "Relatively High",
      riverineFlooding: "Relatively High",
      wildfire: "Relatively Moderate",
      winterWeather: "Very High",
      strongWind: "Relatively Moderate",
      tornado: "Very High",
      hail: "Very High",
    },
  },
  "48441": {
    project: "Stargate Abilene",
    county: "Taylor County",
    state: "Texas",
    fips: "48441",
    overallRiskScore: 83.81043256997455,
    overallRiskRating: "Relatively Moderate",
    expectedAnnualLoss: 53651454.35904762,
    socialVulnerabilityScore: 34.4783715,
    socialVulnerabilityRating: "Relatively Low",
    communityResilienceScore: 76.49491094147582,
    communityResilienceRating: "Relatively High",
    hazards: {
      drought: "Relatively Moderate",
      heatWave: "Relatively Moderate",
      riverineFlooding: "Relatively Moderate",
      wildfire: "Relatively Moderate",
      winterWeather: "Relatively High",
      strongWind: "Relatively Moderate",
      tornado: "Relatively Moderate",
      hail: "Very High",
    },
  },
  "48451": {
    project: "Tom Green County tracked project",
    county: "Tom Green County",
    state: "Texas",
    fips: "48451",
    overallRiskScore: 77.32188295165395,
    overallRiskRating: "Relatively Low",
    expectedAnnualLoss: 30903796.24042742,
    socialVulnerabilityScore: 66.82569975,
    socialVulnerabilityRating: "Relatively High",
    communityResilienceScore: 77.16284987277355,
    communityResilienceRating: "Relatively High",
    hazards: {
      drought: "Relatively High",
      heatWave: "Relatively Moderate",
      riverineFlooding: "Relatively Moderate",
      wildfire: "Relatively Moderate",
      winterWeather: "Relatively High",
      strongWind: "Relatively Low",
      tornado: "Relatively Moderate",
      hail: "Relatively High",
    },
  },
};

export const ACTIVE_FEMA_NRI_PROFILE = FEMA_NRI_PROFILES["48441"];

export function getTopFemaHazards(profile: FemaNriCountyProfile, count = 3) {
  return (Object.entries(profile.hazards) as [FemaHazardKey, FemaNriRating][])
    .map(([key, rating], order) => ({
      key,
      label: FEMA_HAZARD_LABELS[key],
      rating,
      order,
    }))
    .sort((left, right) =>
      FEMA_RATING_SEVERITY[right.rating] - FEMA_RATING_SEVERITY[left.rating] ||
      left.order - right.order
    )
    .slice(0, count);
}

export function formatFemaHazardSummary(profile: FemaNriCountyProfile) {
  return (Object.entries(profile.hazards) as [FemaHazardKey, FemaNriRating][])
    .map(([key, rating]) => `${FEMA_HAZARD_LABELS[key]}: ${rating}`)
    .join(" · ");
}

export const FEMA_NRI_ATTRIBUTION =
  `Source: ${FEMA_NRI_SOURCE.name} ${FEMA_NRI_SOURCE.version}, ${FEMA_NRI_SOURCE.releaseDate}`;