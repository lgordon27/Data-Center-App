import { useEffect, useMemo, useState } from "react";
import { useDiligence } from "@/context/DiligenceContext";
import type { SessionFinancialPreview } from "@/model/sessionFinancialTransmission";

const ALLOWED = ["electricity_cost", "water_consumption", "grid_interconnection"];
type Action = "accept" | "reject" | "evidence-only";
type Metrics = SessionFinancialPreview["before"];

const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? "n/a" : v.toFixed(d));
const metricRows = (m: Metrics) => [["IRR (%)", m.irr, 3], ["MOIC (×)", m.moic, 2], ["NPV (USD millions)", m.npv, 1], ["Payback (years)", m.payback, 1]] as const;

export function SessionFinancialReview() {
  const d = useDiligence();
  const { project, financialSessionScope, setFinancialSessionScope, financialSessionHistory, financialSessionIgnoredReasons, previewSessionFinancialFinding, reviewSessionFinancialFinding } = d;
  const [facility, setFacility] = useState<string>(financialSessionScope?.facility ?? "");
  const [phase, setPhase] = useState<string>(financialSessionScope?.phase ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<SessionFinancialPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setFacility(financialSessionScope?.facility ?? ""); setPhase(financialSessionScope?.phase ?? ""); }, [financialSessionScope?.facility, financialSessionScope?.phase]);

  const proposals = project.researchProposals;
  const fallback = d.researchEvidence;
  const candidates = useMemo(() => {
    const out: { id: string; rec: NonNullable<typeof fallback>[string] | NonNullable<typeof proposals>[string] }[] = [];
    for (const id of ALLOWED) {
      const rec = proposals?.[id] ?? (fallback?.[id]?.sourceUrl ? fallback[id] : undefined);
      if (rec) out.push({ id, rec });
    }
    return out;
  }, [proposals, fallback]);

  // Any change to source proposals, dispositions or scope invalidates a captured preview.
  useEffect(() => { setPreview(null); setSelected(null); }, [proposals, project?.researchProposalDispositions, financialSessionScope?.facility, financialSessionScope?.phase]);

  const scopeSet = Boolean(financialSessionScope?.facility?.trim() && financialSessionScope?.phase?.trim());
  const history = financialSessionHistory?.decisions ?? [];
  const input = "min-h-10 w-full rounded-md border border-[#cbd8d4] bg-white px-3 text-sm";
  const btn = "inline-flex min-h-10 items-center rounded-md border border-[#cbd8d4] px-3 text-xs font-semibold disabled:opacity-40";

  const open = (id: string) => {
    setError(null);
    try { setSelected(id); setPreview(previewSessionFinancialFinding(id)); }
    catch (e) { setPreview(null); setError(e instanceof Error ? e.message : "Preview could not be built."); }
  };
  const act = (action: Action) => {
    if (!preview) return;
    setError(null);
    let ok = false;
    try { ok = reviewSessionFinancialFinding(preview, action); } catch { ok = false; }
    if (!ok) { setError("The preview is no longer valid or the action was refused. Reopen the finding to build a fresh preview; nothing was applied."); return; }
    setPreview(null); setSelected(null);
  };
  const canAccept = Boolean(preview?.eligible && scopeSet && preview.hasModelChange !== undefined && preview.normalizedValue !== null && preview.blockedReasons.length === 0);
  const saveScope = () => {
    setError(null);
    try { setFinancialSessionScope({ facility: facility.trim(), phase: phase.trim() }); }
    catch (e) { setError(e instanceof Error ? e.message : "Scope could not be saved; nothing was changed."); }
  };

  return (
    <section
      data-testid="financial-session-review"
      data-project-id={d.activeProjectContext?.projectId ?? ""}
      data-research-run-id={d.activeProjectContext?.researchRunId ?? ""}
      aria-labelledby="fsr-h"
      className="rounded-xl border border-[#cbd8d4] bg-white p-5"
    >
      <h3 id="fsr-h" className="font-semibold">My session financial review</h3>
      <p className="mt-2 text-xs leading-5 text-[#60707d]">Open-use workbench: decisions here live in this tab only and survive reload, never written to canonical SafeLoc history. Choosing a finding is not source verification, and the retained source scope must match the facility and phase you model. Previews are preview-only and do not apply anything until you accept.</p>

      <fieldset className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <legend className="sr-only">Personal modeled scope</legend>
        <label className="text-xs font-semibold">Modeled facility label<input data-testid="financial-session-scope-facility" className={input} value={facility} onChange={(e) => setFacility(e.target.value)} /></label>
        <label className="text-xs font-semibold">Modeled phase label<input data-testid="financial-session-scope-phase" className={input} value={phase} onChange={(e) => setPhase(e.target.value)} /></label>
        <button type="button" data-testid="financial-session-set-scope" className={btn} onClick={saveScope}>Set scope</button>
      </fieldset>
      <p className="mt-2 text-xs text-[#805000]">{!scopeSet ? "Set both labels to enable acceptance. " : ""}Changing scope clears this history and resets my accepted inputs.</p>

      {error && <p role="alert" data-testid="financial-session-error" className="mt-4 rounded-md bg-[#fff1ee] p-3 text-xs leading-5 text-[#8a2f1d]">{error}</p>}

      <ul className="mt-4 space-y-2">
        {candidates.length === 0 && <li className="rounded-md bg-[#f4f7f6] p-3 text-xs text-[#52616b]">No electricity, water or interconnection proposals in the current research.</li>}
        {candidates.map(({ id, rec }) => {
          const reason = financialSessionIgnoredReasons?.[id];
          const evidenceOnly = Boolean(reason) || rec.eligibleForModel === false;
          return (
            <li key={id} className="rounded-md border border-[#e5eae8] p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><span className="font-semibold">{id.replace(/_/g, " ")}</span> <span className="text-[#60707d]">{String(rec.rawValue ?? rec.value ?? "")} {rec.rawUnit ?? rec.unit ?? ""}</span></span>
                <button type="button" className={btn} aria-expanded={selected === id} onClick={() => open(id)}>Preview</button>
              </div>
              {evidenceOnly && <p className="mt-1 text-[#805000]">Evidence only{reason ? `: ${reason}` : ": context-only or excluded"}. Not activated in the model.</p>}
              {selected === id && preview && (
                <div data-testid={`financial-session-preview-${id}`} className="mt-3 space-y-2 rounded-md bg-[#f4f7f6] p-3 leading-5">
                  <p className="font-semibold">Preview only: does not apply until accepted. Captured snapshot.</p>
                  <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    <dt className="text-[#60707d]">Target</dt><dd>{preview.target}</dd>
                    <dt className="text-[#60707d]">Raw</dt><dd>{String(preview.rawValue)} {preview.rawUnit}</dd>
                    <dt className="text-[#60707d]">Normalized</dt><dd>{preview.normalizedValue ?? "n/a"} {preview.normalizedUnit}</dd>
                    <dt className="text-[#60707d]">Source date</dt><dd>{preview.sourceDate || "n/a"}</dd>
                    <dt className="text-[#60707d]">Source class / claim period</dt><dd>{preview.sourceClassification || "unknown"} · {preview.sourceTimePeriod || "unknown"} ({preview.sourceTimeScope})</dd>
                    <dt className="text-[#60707d]">Source URL</dt><dd className="break-all">{preview.sourceUrl || "n/a"}</dd>
                    <dt className="text-[#60707d]">Project scope</dt><dd>{typeof preview.scope === "string" ? preview.scope : JSON.stringify(preview.scope)} ({preview.projectKey})</dd>
                    <dt className="text-[#60707d]">Policy / model</dt><dd>{preview.policyVersion} / {preview.modelVersion}</dd>
                  </dl>
                  <blockquote className="border-l-2 border-[#cbd8d4] pl-3 text-[#52616b]">{preview.sourcePassage}</blockquote>
                  <table className="w-full text-left"><caption className="sr-only">Before and after</caption>
                    <thead><tr><th>Metric</th><th>Before</th><th>After</th></tr></thead>
                    <tbody>{metricRows(preview.before).map(([n, b, dp], i) => <tr key={n}><td>{n}</td><td>{fmt(b, dp)}</td><td>{fmt(metricRows(preview.after)[i][1], dp)}</td></tr>)}</tbody>
                  </table>
                  {!preview.hasModelChange && <p className="font-semibold">No model change{preview.noOpReason ? `: ${preview.noOpReason}` : ""}</p>}
                  <div data-testid="financial-session-non-acceptance-effect" className="rounded-md border border-[#d9e0e4] p-2">
                    <p className="font-semibold">If rejected or kept evidence-only</p>
                    <p>Any earlier acceptance of this input returns to its original scenario baseline; other accepted inputs remain.</p>
                    {preview.nonAcceptanceEffect.hasModelChange
                      ? <p>IRR (%) {fmt(preview.nonAcceptanceEffect.before.irr, 3)} → {fmt(preview.nonAcceptanceEffect.after.irr, 3)}; MOIC {fmt(preview.nonAcceptanceEffect.before.moic)} → {fmt(preview.nonAcceptanceEffect.after.moic)}; NPV (USD millions) {fmt(preview.nonAcceptanceEffect.before.npv, 1)} → {fmt(preview.nonAcceptanceEffect.after.npv, 1)}.</p>
                      : <p>No model change.</p>}
                  </div>
                  {preview.blockedReasons.length > 0 && <ul className="list-disc pl-5 text-[#8a2f1d]">{preview.blockedReasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" data-testid="financial-session-accept" disabled={!canAccept} onClick={() => act("accept")} className={btn}>Accept into my scenario</button>
                    <button type="button" data-testid="financial-session-reject" onClick={() => act("reject")} className={btn}>Reject</button>
                    <button type="button" data-testid="financial-session-evidence-only" onClick={() => act("evidence-only")} className={btn}>Keep evidence-only</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div data-testid="financial-session-history" className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#60707d]">Session-only decisions (this tab)</h4>
        {history.length === 0 ? <p className="mt-2 text-xs text-[#60707d]">No decisions yet.</p> : (
          <ol className="mt-2 space-y-2 text-xs">
            {history.map((h) => {
              const p = h.preview;
              const effect = h.modelEffect;
              return (
                <li key={h.id} className="rounded-md border border-[#e5eae8] p-2 leading-5">
                  <span className="font-semibold">{h.action}</span> on {h.target} at {h.decidedAt}
                  <div className="text-[#52616b]">Source: {p.sourceUrl} ({p.sourceDate}). {effect.hasModelChange ? `IRR (%) ${fmt(effect.before.irr, 3)} to ${fmt(effect.after.irr, 3)}; MOIC ${fmt(effect.before.moic)} to ${fmt(effect.after.moic)}; NPV (USD millions) ${fmt(effect.before.npv, 1)} to ${fmt(effect.after.npv, 1)}.` : "No model change"}</div>
                  <details className="mt-1">
                    <summary className="cursor-pointer underline">Inspect saved decision snapshot</summary>
                    <p className="mt-2">{String(p.rawValue)} {p.rawUnit} → {p.normalizedValue ?? "unresolved"} {p.normalizedUnit}. {p.scope.facility} / {p.scope.phase}; {p.projectName}. Policy {p.policyVersion} / model {p.modelVersion}. Source class: {p.sourceClassification}; period: {p.sourceTimePeriod} ({p.sourceTimeScope}).</p>
                    <blockquote className="mt-2 border-l-2 border-[#cbd8d4] pl-3">{p.sourcePassage || "No supported passage."}</blockquote>
                    <p className="mt-2">Payback (years): {fmt(effect.before.payback, 1)} → {fmt(effect.after.payback, 1)}.</p>
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
