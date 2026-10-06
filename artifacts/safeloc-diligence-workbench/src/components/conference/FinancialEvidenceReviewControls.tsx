import { useEffect, useState } from "react";
import { useDiligence } from "@/context/DiligenceContext";
import { getSessionReviewAvailability } from "@/model/researchResultPresentation";
import type { SessionFinancialPreview } from "@/model/sessionFinancialTransmission";

/** Preserve the existing session decision API; expose source/input changes, never precise returns. */
export function FinancialEvidenceReviewControls() {
  const d = useDiligence();
  const { project, financialSessionScope: scope } = d;
  const [facility, setFacility] = useState(scope.facility);
  const [phase, setPhase] = useState(scope.phase);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<SessionFinancialPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const availability = getSessionReviewAvailability(project, d.researchEvidence ?? {}, d.financialModeling);
  const scopeSet = Boolean(scope.facility.trim() && scope.phase.trim());
  useEffect(() => {
    setFacility(scope.facility); setPhase(scope.phase); setPreview(null); setSelected(null); setError(null);
  }, [scope.facility, scope.phase, project.researchProposals, project.researchProposalDispositions,
    d.researchEvidence, d.financialModeling.status]);
  const open = (id: string) => {
    setError(null);
    try { setSelected(id); setPreview(d.previewSessionFinancialFinding(id)); }
    catch (e) { setPreview(null); setError(e instanceof Error ? e.message : "Preview unavailable; nothing was applied."); }
  };
  const act = (action: "accept" | "reject" | "evidence-only") => {
    if (!preview) return;
    try {
      if (!d.reviewSessionFinancialFinding(preview, action)) throw new Error("The preview is no longer valid. Reopen the finding; nothing was applied.");
      setPreview(null); setSelected(null); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Decision refused; nothing was applied."); }
  };
  const saveScope = () => {
    try { d.setFinancialSessionScope({ facility: facility.trim(), phase: phase.trim() }); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Scope refused; nothing was changed."); }
  };
  const canAccept = Boolean(availability.modelAvailable && preview?.eligible && scopeSet
    && preview.hasModelChange !== undefined && preview.normalizedValue !== null && !preview.blockedReasons.length);
  const input = "min-h-10 w-full rounded-md border border-[#cbd8d4] px-3 text-sm";
  const button = "min-h-10 rounded-md border border-[#cbd8d4] px-3 text-xs font-semibold disabled:opacity-40";
  return <section data-testid="financial-session-review" aria-labelledby="financial-evidence-review-title" className="rounded-xl border border-[#cbd8d4] bg-white p-5">
    <h3 id="financial-evidence-review-title" className="font-semibold">My session financial review</h3>
    <p className="mt-2 text-xs leading-5 text-[#60707d]">Review source findings separately from your assumptions. Decisions live in this tab and survive reload, never in canonical SafeLoc history. Preview does not apply anything until you accept. Source verification and modeled treatment remain separate.</p>
    {availability.canPreview && <fieldset className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <legend className="sr-only">Personal modeled scope</legend>
      <label className="text-xs font-semibold">Modeled facility label<input data-testid="financial-session-scope-facility" className={input} value={facility} onChange={e => setFacility(e.target.value)} /></label>
      <label className="text-xs font-semibold">Modeled phase label<input data-testid="financial-session-scope-phase" className={input} value={phase} onChange={e => setPhase(e.target.value)} /></label>
      <button data-testid="financial-session-set-scope" type="button" className={button} onClick={saveScope}>Set scope</button>
      <p className="text-xs text-[#805000] sm:col-span-3">{!scopeSet ? "Set both labels before previewing or accepting. " : ""}Changing scope clears this history and resets accepted inputs.</p>
    </fieldset>}
    {!availability.modelAvailable && <p className="mt-3 text-xs text-[#805000]">Model unavailable. Candidates and earlier decisions remain reviewable; no acceptance controls are offered.</p>}
    {error && <p role="alert" data-testid="financial-session-error" className="mt-3 text-xs text-[#8a2f1d]">{error}</p>}
    <ul className="mt-4 space-y-3">
      {!availability.candidates.length && <li className="text-xs text-[#52616b]">No electricity, water or interconnection proposals in the current research.</li>}
      {availability.candidates.map(({ id, rec, mismatch }) => <li key={id} className="rounded-md border border-[#e5eae8] p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{mismatch ? "Capacity assertion · field mismatch" : id.replace(/_/g, " ")}</span>
          {availability.modelAvailable && !mismatch && <button data-testid={`financial-session-preview-button-${id}`} type="button" disabled={!scopeSet} className={button} aria-expanded={selected === id} onClick={() => open(id)}>Preview</button>}
        </div>
        {rec.sourceUrl && <a href={rec.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all underline">Review candidate source</a>}
        {(d.financialSessionIgnoredReasons[id] || rec.eligibleForModel === false) && <p className="mt-2 text-[#805000]">Evidence only: {d.financialSessionIgnoredReasons[id] ?? "context-only or excluded"}. Not activated in the model.</p>}
        {mismatch && <p className="mt-2 text-[#805000]">MW/GW is capacity, not interconnection duration. No conversion or model preview is offered.</p>}
        {selected === id && preview && <div data-testid={`financial-session-preview-${id}`} className="mt-3 space-y-2 rounded-md bg-[#f4f7f6] p-3 leading-5">
          <p className="font-semibold">Preview only: does not apply until accepted. Captured snapshot.</p>
          <p>Input: {preview.target.replace(/_/g, " ")}. Raw {String(preview.rawValue)} {preview.rawUnit}; normalized {preview.normalizedValue ?? "unavailable"} {preview.normalizedUnit}.</p>
          <p>Scope: {preview.scope.facility} / {preview.scope.phase}; {preview.projectName}.</p>
          <p>Source date: {preview.sourceDate ?? "unknown"}. Source class: {preview.sourceClassification}; claim period: {preview.sourceTimePeriod} ({preview.sourceTimeScope}).</p>
          <p className="break-all">Source: {preview.sourceUrl || "unavailable"}. Policy {preview.policyVersion}; model {preview.modelVersion}.</p>
          <blockquote className="border-l-2 border-[#cbd8d4] pl-3">{preview.sourcePassage || "No supported passage."}</blockquote>
          <p>{preview.hasModelChange ? "Acceptance changes this input in your personal scenario." : "No model change."} {preview.noOpReason}</p>
          <p>Any estimated range depends separately on the complete sourced input set; accepting a finding does not guarantee an estimate or verify an investment return.</p>
          <div data-testid="financial-session-non-acceptance-effect" className="rounded-md border border-[#d9e0e4] p-2">
            <p className="font-semibold">If rejected or kept evidence-only</p>
            <p>Any earlier acceptance of this input returns to its original scenario baseline; other accepted inputs remain.</p>
            <p>{preview.nonAcceptanceEffect.hasModelChange ? "This choice changes the personal input overlay." : "No model change."}</p>
          </div>
          {!!preview.blockedReasons.length && <ul className="list-disc pl-5 text-[#8a2f1d]">{preview.blockedReasons.map(r => <li key={r}>{r}</li>)}</ul>}
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="financial-session-accept" disabled={!canAccept} onClick={() => act("accept")} className={button}>Accept into my scenario</button>
            <button type="button" data-testid="financial-session-reject" onClick={() => act("reject")} className={button}>Reject</button>
            <button type="button" data-testid="financial-session-evidence-only" onClick={() => act("evidence-only")} className={button}>Keep evidence-only</button>
          </div>
        </div>}
      </li>)}
    </ul>
    <div data-testid="financial-session-history" className="mt-4">
      <h4 className="text-xs font-semibold">Session-only decisions (this tab)</h4>
      {!d.financialSessionHistory.decisions.length ? <p className="mt-2 text-xs text-[#60707d]">No decisions yet.</p> : <ol className="mt-2 space-y-2">
        {d.financialSessionHistory.decisions.map(h => <li key={h.id} className="rounded-md border border-[#e5eae8] p-2 text-xs">
          <p>{h.action} on {h.target.replace(/_/g, " ")} at {h.decidedAt}</p>
          <p className="break-all">Source: {h.preview.sourceUrl} ({h.preview.sourceDate ?? "date unknown"}). {h.modelEffect.hasModelChange ? "Personal input overlay changed." : "No model change."}</p>
          <details><summary className="cursor-pointer underline">Inspect saved decision snapshot</summary>
            <p>{String(h.preview.rawValue)} {h.preview.rawUnit} → {h.preview.normalizedValue ?? "unavailable"} {h.preview.normalizedUnit}. {h.preview.scope.facility} / {h.preview.scope.phase}. Source class: {h.preview.sourceClassification}; period: {h.preview.sourceTimePeriod}.</p>
            <blockquote className="mt-2 border-l-2 border-[#cbd8d4] pl-3">{h.preview.sourcePassage || "No supported passage."}</blockquote>
          </details>
        </li>)}
      </ol>}
    </div>
  </section>;
}
