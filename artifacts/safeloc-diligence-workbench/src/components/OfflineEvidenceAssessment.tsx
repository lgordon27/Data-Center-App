import { useMemo, useState } from "react";
import { useDiligence } from "@/context/DiligenceContext";
import {
  evaluateExpectedEvidence,
  type ExpectedEvidenceDimensionResult,
} from "@/model/expectedEvidence";
import {
  createExpectedEvidenceFixtureProjection,
  EXPECTED_EVIDENCE_FIXTURE_DATA,
} from "@/model/expectedEvidenceFixtureCases";
import type { EvidenceObservation, StoredProofLedgerEvent } from "@/model/safelocProofContract";
import type { SessionFinancialDecision } from "@/model/sessionFinancialTransmission";

function printable(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(printable).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null && item !== undefined)
      .map(([key, item]) => `${key}: ${printable(item)}`)
      .join(" · ");
  }
  return "Unknown";
}

function profileSignal(value: unknown): { value: string; provenance: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value: printable(value), provenance: "No provenance supplied." };
  }
  const signal = value as Record<string, unknown>;
  const provenance = signal.provenance && typeof signal.provenance === "object"
    ? signal.provenance as Record<string, unknown>
    : {};
  return {
    value: `${typeof signal.status === "string" ? signal.status : "unknown"} · ${printable(signal.value)}`,
    provenance: [
      typeof provenance.kind === "string" ? provenance.kind : null,
      typeof provenance.asOfDate === "string" ? `as of ${provenance.asOfDate}` : null,
      typeof provenance.rationale === "string" ? provenance.rationale : null,
    ].filter(Boolean).join(" · ") || "No provenance supplied.",
  };
}

function rowObservations(result: ExpectedEvidenceDimensionResult): Array<{
  observation: EvidenceObservation;
  state: string;
}> {
  return [
    ...result.evidence.map((observation) => ({ observation, state: "Current" })),
    ...result.conflictingEvidence.map((observation) => ({ observation, state: "Conflicting" })),
    ...result.unsupportedEvidence.map((observation) => ({ observation, state: "Unsupported" })),
    ...result.staleEvidence.map(({ observation }) => ({ observation, state: "Stale" })),
    ...result.futureEvidence.map(({ observation }) => ({ observation, state: "Future-dated" })),
    ...result.undatedEvidence.map(({ observation }) => ({ observation, state: "Undated" })),
    ...result.supersededEvidence.map(({ observation }) => ({ observation, state: "Superseded" })),
  ];
}

function eventLabel(event: StoredProofLedgerEvent): string {
  switch (event.eventType) {
    case "evidence-observation":
      return `Evidence observation · ${event.payload.evidence.dimension}`;
    case "search-assessment":
      return `Search assessment · ${event.payload.search.dimension} · ${event.payload.search.state}`;
    case "project-state-change":
      return `Project state · ${event.payload.state.stateKey}`;
    case "accepted-model-input":
      return "Accepted model input";
  }
  return event.eventType;
}

function metric(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(digits);
}

function SessionDecisionHistory() {
  const { financialSessionHistory, financialSessionScope } = useDiligence();
  const decisions = financialSessionHistory?.decisions ?? [];
  const latestByTarget = new Map<string, SessionFinancialDecision>();
  for (const decision of decisions) latestByTarget.set(decision.target, decision);

  return (
    <section
      data-testid="offline-user-scenario-decisions"
      aria-labelledby="offline-user-scenario-decisions-title"
      className="mt-5 overflow-hidden rounded-xl border border-[#cbd8d4] bg-white"
    >
      <header className="border-b border-[#d9e0e4] bg-[#f1f5f3] px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">
              User scenario history · this tab only
            </p>
            <h3 id="offline-user-scenario-decisions-title" className="mt-1 text-[14px] font-semibold text-[#122232]">
              Financial analysis decisions
            </h3>
          </div>
        </div>
        <p className="mt-2 max-w-4xl text-[10px] leading-4 text-[#52616b]">
          Accept, Reject, and Evidence Only decisions are local to your current scenario. They are never added to canonical
          SafeLoc history, and no account identity is collected. Each entry below is a saved decision snapshot, not a live
          research claim.
        </p>
        {financialSessionScope && (
          <p className="mt-2 text-[10px] text-[#60707d]">
            Current model scope: {financialSessionScope.facility} · {financialSessionScope.phase}
          </p>
        )}
      </header>

      {decisions.length === 0 ? (
        <p data-testid="offline-user-scenario-decisions-empty" className="px-4 py-4 text-[10px] leading-4 text-[#60707d] md:px-5">
          No financial decisions are stored in this tab’s scenario. The fixture assessment above has no active model inputs.
        </p>
      ) : (
        <ol className="divide-y divide-[#e5eae8]">
          {decisions.map((decision, index) => {
            const preview = decision.preview;
            const effect = decision.modelEffect;
            const isLatest = latestByTarget.get(decision.target)?.id === decision.id;
            const currentlyActive = isLatest && decision.action === "accept" && preview.eligible;
            const actionLabel = decision.action === "evidence-only" ? "Evidence only" : decision.action;
            return (
              <li
                key={decision.id}
                data-testid="offline-user-scenario-decision-entry"
                className="px-4 py-4 text-[10px] leading-4 md:px-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold capitalize text-[#243844]">
                      {preview.target.replaceAll("_", " ")} · {actionLabel}
                    </h4>
                    <p className="text-[#60707d]">
                      {isLatest
                        ? currentlyActive ? "Currently accepted in this session scenario." : "Not active in the current scenario."
                        : "Earlier snapshot; a later decision exists for this input."}
                    </p>
                  </div>
                  <time dateTime={decision.decidedAt} className="font-mono text-[9px] text-[#60707d]">
                    {decision.decidedAt}
                  </time>
                </div>
                <p className="mt-2 text-[#52616b]">
                  Source snapshot: {preview.sourceClassification} · {preview.sourceTimePeriod || "period unknown"} · {preview.sourceDate || "publication date unknown"}.
                  {" "}Scope: {preview.scope.facility} / {preview.scope.phase}; project {preview.projectName}.
                </p>
                <p className="mt-1 text-[#52616b]">
                  Model effect at decision time: {effect.hasModelChange
                  ? `IRR ${metric(effect.before.irr, 3)} → ${metric(effect.after.irr, 3)}; MOIC ${metric(effect.before.moic, 2)} → ${metric(effect.after.moic, 2)}; NPV ${metric(effect.before.npv, 1)} → ${metric(effect.after.npv, 1)} USD millions; payback ${metric(effect.before.payback, 1)} → ${metric(effect.after.payback, 1)} years.`
                    : `No model change${effect.noOpReason ? `: ${effect.noOpReason}` : "."}`}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold text-[#37505e] underline">
                    Inspect session snapshot
                  </summary>
                  <blockquote className="mt-2 border-l-2 border-[#cbd8d4] pl-3 text-[#52616b]">
                    {preview.sourcePassage || "No retained passage in this snapshot."}
                  </blockquote>
                  <p className="mt-2 break-all text-[#60707d]">
                    {preview.sourceUrl || "No source URL"} · {preview.normalizedValue ?? "unresolved"} {preview.normalizedUnit}
                    {" "}· model {preview.modelVersion}, policy {preview.policyVersion}.
                  </p>
                </details>
                {index === decisions.length - 1 && <span className="sr-only">Most recent session decision.</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function OfflineEvidenceAssessment() {
  const firstFixture = EXPECTED_EVIDENCE_FIXTURE_DATA.cases[0];
  const [selectedReference, setSelectedReference] = useState(firstFixture?.projectReference ?? "");
  const fixture = EXPECTED_EVIDENCE_FIXTURE_DATA.cases.find((item) => item.projectReference === selectedReference);
  const assessment = useMemo(() => {
    if (!fixture) return null;
    const { project, profile, projection } = createExpectedEvidenceFixtureProjection(fixture);
    return {
      project,
      profile,
      projection,
      result: evaluateExpectedEvidence(profile, projection),
    };
  }, [fixture]);

  if (!fixture || !assessment) {
    return (
      <section role="alert" data-testid="offline-expected-evidence-proof" className="rounded-xl border border-[#d99a81] bg-white p-4">
        The offline expected-evidence fixtures are unavailable; no assessment was generated.
      </section>
    );
  }

  const { project, profile, projection, result } = assessment;
  const profileRows = [
    ["Project type", profileSignal(profile.projectType)],
    ["Development stage", profileSignal(profile.stage)],
    ["Scale", profileSignal(profile.scale)],
    ["Jurisdiction", profileSignal(profile.jurisdiction)],
    ["Cooling design", profileSignal(profile.coolingDesign)],
  ] as const;
  const acceptedInputCount = Object.keys(projection.acceptedInputsById).length;

  return (
    <section
      data-testid="offline-expected-evidence-proof"
      aria-labelledby="offline-proof-title"
      className="mb-5 overflow-hidden rounded-xl border border-[#aabac2] bg-white"
    >
      <header className="border-b border-[#d9e0e4] bg-[#122232] px-4 py-4 text-white md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#d4e86b]">
              Fixture-backed · offline only
            </p>
            <h2 id="offline-proof-title" className="mt-1 text-[16px] font-semibold">
              Expected evidence to model proof
            </h2>
          </div>
          <span
            data-testid="offline-proof-fixture-label"
            className="rounded-full border border-[#87969e] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#e2ebef]"
          >
            {EXPECTED_EVIDENCE_FIXTURE_DATA.fixtureStatus}
          </span>
        </div>
        <p className="mt-2 max-w-4xl text-[10px] leading-4 text-[#d1dbe0]">
          These five synthetic examples exercise the expected-evidence evaluator. They are not the selected project’s
          research, sources, or canonical history; changing this selector makes no provider request and writes no
          project or decision record.
        </p>
        <div className="mt-4 max-w-xl">
          <label htmlFor="offline-proof-case-select" className="mb-1 block text-[10px] font-semibold text-white">
            Example proof case
          </label>
          <select
            id="offline-proof-case-select"
            data-testid="offline-proof-case-select"
            value={fixture.projectReference}
            onChange={(event) => setSelectedReference(event.target.value)}
            className="min-h-10 w-full rounded-md border border-[#aabac2] bg-white px-3 text-[11px] text-[#122232]"
          >
            {EXPECTED_EVIDENCE_FIXTURE_DATA.cases.map((item) => (
              <option key={item.projectReference} value={item.projectReference}>{item.name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="space-y-4 p-4 md:p-5">
        <section aria-labelledby="offline-proof-project-heading" className="rounded-lg border border-[#e5eae8] bg-[#f7faf8] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="offline-proof-project-heading" data-testid="offline-proof-project" className="text-[13px] font-semibold text-[#122232]">
                {project.name}
              </h3>
              <p className="mt-1 text-[10px] text-[#52616b]">
                Scope: {project.scope.kind} · {project.scope.label ?? project.scope.key}
              </p>
              <p className="mt-1 break-all font-mono text-[9px] text-[#60707d]">
                Scope-qualified fixture ID: {project.projectId}
              </p>
            </div>
            <div className="rounded-md border border-[#cbd8d4] bg-white px-3 py-2 text-[9px] text-[#52616b]">
              Policy {result.policyVersion} · profile {result.profileVersion}<br />
              Evaluated as of {projection.asOfRecordedAt}
            </div>
          </div>
          <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
            {profileRows.map(([label, signal]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#60707d]">{label}</dt>
                <dd className="mt-0.5 break-words text-[10px] text-[#243844]">{signal.value}</dd>
                <dd className="mt-0.5 text-[9px] leading-4 text-[#60707d]">{signal.provenance}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 grid gap-2 border-t border-[#e5eae8] pt-3 sm:grid-cols-2">
            <p data-testid="offline-proof-facility-maturity" className="text-[10px] text-[#243844]">
              <strong>Facility lifecycle maturity:</strong> {printable(result.maturity.facilityLifecycle)}
            </p>
            <p data-testid="offline-proof-power-maturity" className="text-[10px] text-[#243844]">
              <strong>Power delivery maturity:</strong> {printable(result.maturity.powerDelivery)}
            </p>
          </div>
        </section>

        <div className="rounded-lg border border-[#f1cb8b] bg-[#fff8e9] p-3 text-[10px] leading-4 text-[#6f460e]">
          Source proof and model activation are different states. This synthetic system-event projection contains
          {` ${acceptedInputCount}`} model-active inputs; eligibility or a search result alone does not activate a
          financial assumption. User decisions, if any, appear separately below in this tab’s scenario history.
        </div>

        <section aria-labelledby="offline-proof-matrix-heading">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="offline-proof-matrix-heading" className="text-[12px] font-semibold text-[#122232]">
              Expected versus observed by evidence dimension
            </h3>
            <span className="text-[9px] text-[#60707d]">
              {result.dimensions.length} dimensions · no live sources
            </span>
          </div>
          <ul className="space-y-2">
            {result.dimensions.map((dimension) => {
              const observations = rowObservations(dimension);
              const state = dimension.applicabilityState?.state;
              return (
                <li
                  key={dimension.dimension}
                  data-testid="offline-proof-dimension"
                  data-dimension={dimension.dimension}
                  className="rounded-lg border border-[#e5eae8] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-[11px] font-semibold capitalize text-[#243844]">
                        {dimension.dimension.replaceAll("-", " ")}
                      </h4>
                      <p className="mt-1 text-[9px] text-[#52616b]">
                        Expected: {dimension.expectation} · observed: {dimension.evidenceResolution}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[8px] font-semibold uppercase tracking-[0.06em]">
                      <span className="rounded bg-[#edf1f2] px-2 py-1 text-[#52616b]">Search {dimension.searchState}</span>
                      <span className="rounded bg-[#edf1f2] px-2 py-1 text-[#52616b]">Scope {dimension.ledgerApplicability}</span>
                      <span className="rounded bg-[#edf1f2] px-2 py-1 text-[#52616b]">{observations.length} observation{observations.length === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-[#60707d]">{dimension.decisionReason}</p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[9px] font-semibold text-[#37505e] underline">
                      Inspect search, scope, source provenance, and retained passage
                    </summary>
                    <div className="mt-2 space-y-2 text-[9px] leading-4 text-[#52616b]">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <p>
                          <strong>Recorded search assessment:</strong> {dimension.search
                            ? `${dimension.search.state} · ${dimension.search.resolution}`
                            : "Not run in this fixture."}
                        </p>
                        <p>
                          <strong>Project state:</strong> {state
                          ? `${state.status}${state.value ? ` · ${state.value}` : ""}${"reason" in state && state.reason ? ` · ${state.reason}` : ""}`
                            : "No explicit applicability state recorded; unknown is not treated as not-applicable."}
                        </p>
                      </div>
                      {dimension.search && (
                        <div className="rounded bg-[#f7faf8] p-2">
                          <p><strong>Recorded search reason:</strong> {dimension.search.reason || "None recorded."}</p>
                          <p><strong>Observed at:</strong> {dimension.search.observedAt}; research run: {dimension.search.researchRunId || "none in fixture"}.</p>
                          <p>
                            <strong>Fixture query IDs:</strong> {dimension.search.queryIds.length
                              ? dimension.search.queryIds.join(", ")
                              : "none"}
                            {" "}· IDs are fixture metadata, not provider-call evidence. Search state remains {dimension.search.state}.
                          </p>
                        </div>
                      )}
                      <div>
                        <strong>Expected claim guidance:</strong>
                        {dimension.expectedClaims.length === 0
                          ? <p>No claim text is expected for this dimension.</p>
                          : <ul className="mt-1 list-disc space-y-1 pl-5">{dimension.expectedClaims.map((claim) => <li key={claim}>{claim}</li>)}</ul>}
                      </div>
                      <div className="rounded bg-[#f7faf8] p-2">
                        <p><strong>Source posture:</strong> {dimension.likelyPublicConfidential}</p>
                        <p className="mt-1"><strong>Jurisdiction source guidance:</strong> {printable(dimension.jurisdictionSourceGuidance)}</p>
                      </div>
                      {observations.length === 0 ? (
                        <p className="rounded bg-[#f7faf8] p-2">
                          No observed evidence record in this dimension. This alone does not prove a completed search or a negative result.
                        </p>
                      ) : observations.map(({ observation, state: observationState }) => (
                        <article
                          key={`${observation.evidenceId}-${observationState}`}
                          data-testid="offline-proof-evidence"
                          className="rounded border border-[#d9e0e4] bg-[#f7faf8] p-2"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <strong>{observation.claim}</strong>
                            <span className="rounded bg-white px-2 py-0.5">{observationState}</span>
                          </div>
                          <p className="mt-1"><strong>Observed value:</strong> {printable(observation.value)} {observation.unit || ""} · {observation.valueStatus}</p>
                          <p><strong>Source quality label:</strong> {observation.sourceQualityClassification} · eligibility: {observation.eligibility.eligible ? "eligible observation" : "not eligible"} ({observation.eligibility.reason})</p>
                          <p>
                            <strong>Fixture provenance:</strong> synthetic source ID {observation.sourceIds.join(", ") || "none"} · retained passage ID {observation.retainedPassageId} · published {observation.publicationDate || "unknown"} · as of {observation.asOfDate || "unknown"}.
                          </p>
                          <p><strong>Project scope:</strong> {observation.project.name} · {observation.project.scope.kind} {observation.project.scope.label ?? observation.project.scope.key} · observed {observation.observedAt}.</p>
                          <blockquote className="mt-2 border-l-2 border-[#cbd8d4] pl-3">
                            {observation.retainedPassage}
                          </blockquote>
                        </article>
                      ))}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>

        <details data-testid="offline-system-fixture-events" className="rounded-lg border border-[#d9e0e4] p-3">
          <summary className="cursor-pointer text-[10px] font-semibold text-[#243844]">
            Synthetic system-observation timeline · {projection.events.length} fixture events
          </summary>
          <p className="mt-2 text-[9px] leading-4 text-[#60707d]">
            This is generated example data, not a read from canonical SafeLoc history. The assessment above is computed
            from this projection; it is not a persisted assessment version. User decisions are excluded from this event list.
          </p>
          <ol className="mt-2 space-y-1">
            {projection.events.map((event) => (
              <li key={event.eventId} className="flex flex-wrap justify-between gap-2 rounded bg-[#f7faf8] px-2 py-1.5 text-[9px] text-[#52616b]">
                <span>{eventLabel(event)} · {event.decisionRef ? "decision-linked" : "no user decision attached"}</span>
                <time dateTime={event.recordedAt}>{event.recordedAt}</time>
              </li>
            ))}
          </ol>
        </details>
      </div>
      <SessionDecisionHistory />
    </section>
  );
}