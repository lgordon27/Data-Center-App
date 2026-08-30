import { DataSources } from "@/components/DataSources";

const workbenchRoutes = new Set(["brief", "evidence", "materiality", "decision", "advisor"]);

export function Footer() {
  const route = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  return (
    <>
      {workbenchRoutes.has(route) && <DataSources />}
      <footer className="mt-8 border-t border-[#d9e0e4] bg-[#eef2f1] px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-col justify-between gap-3 text-[9px] uppercase tracking-[0.12em] text-[#52616b] sm:flex-row sm:items-center">
          <span>SafeLoc Diligence Workbench</span>
          <span>Proof of Concept | Transaction assumptions are synthetic | Environmental and infrastructure data from public sources</span>
          <span className="font-mono">2024 / 24-017</span>
        </div>
      </footer>
    </>
  );
}
