export const IMPACT_ROLES = [
  "Financial Driver",
  "Decision Gate",
  "Context Indicator",
] as const;

export type ImpactRole = (typeof IMPACT_ROLES)[number];

export type EvidenceImpactRoleDefinition = {
  id: string;
  role: ImpactRole;
  description: string;
};

export const EVIDENCE_IMPACT_ROLE_DEFINITIONS: readonly EvidenceImpactRoleDefinition[] = [
  { id: "electricity_cost", role: "Financial Driver", description: "Changes modeled power operating cost." },
  { id: "water_consumption", role: "Financial Driver", description: "Changes modeled cooling-water operating cost." },
  { id: "grid_interconnection", role: "Financial Driver", description: "Changes modeled revenue timing." },
  { id: "water_escalation", role: "Financial Driver", description: "Changes modeled water-cost growth." },
  { id: "community_risk", role: "Context Indicator", description: "Provides community and infrastructure diligence context." },
  { id: "renewable_percentage", role: "Context Indicator", description: "Provides power-sourcing context without changing the stress case." },
  { id: "cooling_capex", role: "Financial Driver", description: "Changes modeled cooling infrastructure CAPEX." },
  { id: "electricity_escalation", role: "Financial Driver", description: "Changes modeled power-cost growth." },
  { id: "carbon_compliance", role: "Financial Driver", description: "Changes modeled carbon-compliance operating cost." },
  { id: "permitting_timeline", role: "Financial Driver", description: "Changes modeled revenue timing." },
  { id: "customer_concentration", role: "Decision Gate", description: "Gates review of customer and utilization exposure." },
  { id: "water_rights", role: "Decision Gate", description: "Gates review of water access and allocation." },
  { id: "site_hazard_exposure", role: "Financial Driver", description: "Changes modeled climate-disruption cost." },
  { id: "backup_power_capacity", role: "Decision Gate", description: "Gates review of resilience capacity." },
  { id: "water_source_resilience", role: "Decision Gate", description: "Gates review of water-supply resilience." },
  { id: "downtime_cost", role: "Financial Driver", description: "Changes modeled loss from service disruption." },
];

const VALID_IMPACT_ROLES = new Set<ImpactRole>(IMPACT_ROLES);

function validateDefinitions(definitions: readonly EvidenceImpactRoleDefinition[]) {
  const ids = definitions.map((definition) => definition.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    throw new Error(`Evidence impact-role taxonomy contains duplicate IDs: ${duplicateIds.join(", ")}`);
  }
  if (definitions.some((definition) => !definition.id.trim())) {
    throw new Error("Evidence impact-role taxonomy contains an empty ID.");
  }
  if (definitions.some((definition) => !VALID_IMPACT_ROLES.has(definition.role))) {
    throw new Error("Evidence impact-role taxonomy contains an unknown role.");
  }
}

validateDefinitions(EVIDENCE_IMPACT_ROLE_DEFINITIONS);

export const EVIDENCE_IMPACT_ROLES: Readonly<Record<string, ImpactRole>> = Object.freeze(
  Object.fromEntries(EVIDENCE_IMPACT_ROLE_DEFINITIONS.map(({ id, role }) => [id, role])),
);

export function assertEvidenceImpactRoleCoverage(ids: readonly string[]) {
  const expectedIds = EVIDENCE_IMPACT_ROLE_DEFINITIONS.map((definition) => definition.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missingIds = expectedIds.filter((id) => !ids.includes(id));
  const unknownIds = ids.filter((id) => !expectedIds.includes(id));

  if (duplicateIds.length > 0 || missingIds.length > 0 || unknownIds.length > 0 || ids.length !== expectedIds.length) {
    throw new Error(
      `Evidence impact-role coverage mismatch. Missing: ${missingIds.join(", ") || "none"}; ` +
      `duplicates: ${duplicateIds.join(", ") || "none"}; unknown: ${unknownIds.join(", ") || "none"}.`,
    );
  }
}

export function getEvidenceImpactRole(id: string): ImpactRole {
  const role = EVIDENCE_IMPACT_ROLES[id];
  if (!role) {
    throw new Error(`No evidence impact role is defined for "${id}".`);
  }
  return role;
}

export function getEvidenceImpactRoleDefinition(id: string) {
  const definition = EVIDENCE_IMPACT_ROLE_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!definition) {
    throw new Error(`No evidence impact role is defined for "${id}".`);
  }
  return definition;
}