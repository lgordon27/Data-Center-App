const AI_EVIDENCE_TEMPORAL_CONFIG = Object.freeze({
  cutoffDate: "2026-08-30",
  reviewWindowDays: 30,
  validReportingYears: Object.freeze([2025, 2026]),
  temporalRecord: Object.freeze([
    "2026 Epoch AI, WinBuzzer, and SiliconReport reporting that the planned Stargate Abilene expansion was cancelled after grid-interconnection delays exceeded 12 months",
    "2026 SiliconReport reporting that winter storms damaged cooling equipment and forced buildings offline",
    "the August 3, 2026 Texas moratorium ordered by Governor Greg Abbott on new data-center grid connections pending ERCOT energy and water-use audits",
    "ERCOT BATCH ZERO UPDATE (August 2026): ERCOT's Batch Zero large-load interconnection studies, covering 200 GW across 300 applicants, have been delayed from the original September 2026 start to January 2027 at earliest. The study was expected to complete by April 2027; the revised completion date is unclear. ERCOT staff testified this delay may cause some applicants to drop out due to financing constraints. Separately, 17 facilities totaling 6.6 GW that already completed studies are stuck in Governor Abbott's verification audit and cannot energize. Any Texas data center project requiring ERCOT grid interconnection is affected. Only behind-the-meter projects exempt from the ERCOT queue are unaffected. When classifying Grid Interconnection for any Texas project, a grid-dependent project should not receive Verified Evidence for interconnection timeline because no grid-dependent project currently has a confirmed interconnection date.",
  ]),
});

function formatCutoffDate(cutoffDate) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${cutoffDate}T00:00:00.000Z`));
}

function formatReportingWindow(validReportingYears) {
  const firstYear = validReportingYears[0];
  const lastYear = validReportingYears.at(-1);
  return firstYear === lastYear ? `${firstYear}` : `${firstYear}–${lastYear}`;
}

const AI_EVIDENCE_CUTOFF_LABEL = formatCutoffDate(AI_EVIDENCE_TEMPORAL_CONFIG.cutoffDate);
const AI_EVIDENCE_REPORTING_WINDOW = formatReportingWindow(AI_EVIDENCE_TEMPORAL_CONFIG.validReportingYears);
const AI_EVIDENCE_VALID_REPORTING_YEARS_LABEL = AI_EVIDENCE_TEMPORAL_CONFIG.validReportingYears.join(" and ");

function buildAIEvidenceTemporalInstruction() {
  const [firstYear, lastYear] = AI_EVIDENCE_TEMPORAL_CONFIG.validReportingYears;
  return [
    `Today is ${AI_EVIDENCE_CUTOFF_LABEL}.`,
    `The active reporting window is ${AI_EVIDENCE_REPORTING_WINDOW}. Treat dated ${AI_EVIDENCE_VALID_REPORTING_YEARS_LABEL} reporting as valid and potentially current as of today; do not call a ${firstYear} or ${lastYear} source future-dated merely because it is recent.`,
    `The temporal record includes ${AI_EVIDENCE_TEMPORAL_CONFIG.temporalRecord.join("; and ")}.`,
  ].join(" ");
}

export {
  AI_EVIDENCE_CUTOFF_LABEL,
  AI_EVIDENCE_REPORTING_WINDOW,
  AI_EVIDENCE_TEMPORAL_CONFIG,
  AI_EVIDENCE_VALID_REPORTING_YEARS_LABEL,
  buildAIEvidenceTemporalInstruction,
  formatCutoffDate,
  formatReportingWindow,
};