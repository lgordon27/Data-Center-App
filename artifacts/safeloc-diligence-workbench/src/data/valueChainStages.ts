import { Cpu, Factory, Landmark, Scale, Smartphone, Server, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ClaimId } from "@/data/claimSources";
export type ChainStage = { id: string; number: string; title: string; description: string; players: string; evidence: string; claimIds: ClaimId[]; accent: "blue" | "lime" | "coral" | "violet"; icon: LucideIcon; };


export const valueChainStages: ChainStage[] = [
  {
    id: "chip-fabrication",
    number: "01",
    title: "CHIP FABRICATION",
    description: "Where AI begins physically.",
    players: "TSMC · Samsung · Intel",
    evidence: "Supply concentrated in geopolitically sensitive regions.",
    claimIds: [],
    accent: "blue",
    icon: Factory,
  },
  {
    id: "chip-design",
    number: "02",
    title: "CHIP DESIGN",
    description: "The architectures that determine what AI can do.",
    players: "NVIDIA · AMD · Broadcom",
    evidence: "NVIDIA holds a top-tier sustainability rating and is the largest holding in major sustainable investment funds. Values-aligned investors were among the earliest to concentrate capital here.",
    claimIds: ["fund-usxf", "fund-kld400"],
    accent: "violet",
    icon: Cpu,
  },
  {
    id: "hyperscaler-procurement",
    number: "03",
    title: "HYPERSCALER PROCUREMENT",
    description: "$650 billion in committed AI infrastructure spending.",
    players: "Microsoft · Meta · Google · Amazon",
    evidence: "Capital commitments are announced. Whether the physical infrastructure can absorb them is unverified.",
    claimIds: ["stargate-initiative"],
    accent: "coral",
    icon: Landmark,
  },
  {
    id: "data-center-infrastructure",
    number: "04",
    title: "DATA CENTER INFRASTRUCTURE",
    description: "Where capital meets physical reality: power, water, land, grid, community.",
    players: "Stargate Abilene · Oracle · Crusoe Energy",
    evidence: "$130 billion in projects paused in Q1 2026. The evidence behind the assumptions is what this tool tests. This layer is bifurcating. Behind-the-meter projects like Chevron/Microsoft's Project Kilby bypass the grid and are proceeding. Grid-dependent projects like Stargate Abilene are subject to the dated aggregate ERCOT queue shown in the provider snapshot and the Abbott moratorium. Evidence quality determines which side a project lands on.",
    claimIds: ["stargate-cancellation", "abbott-data-center-audit", "ercot-market-pressure"],
    accent: "lime",
    icon: Server,
  },
  {
    id: "ai-model-deployment",
    number: "05",
    title: "AI MODEL DEPLOYMENT",
    description: "Training and inference running on the infrastructure above.",
    players: "OpenAI · Anthropic · Google DeepMind · Meta AI",
    evidence: "Model capability depends on uninterrupted power at extreme densities. Cooling failures halt training runs.",
    claimIds: ["stargate-cooling-damage"],
    accent: "blue",
    icon: Zap,
  },
  {
    id: "ai-governance-regulation",
    number: "06",
    title: "AI GOVERNANCE AND REGULATION",
    description: "The rules catching up to the technology.",
    players: "EU AI Act Article 14 (Aug 2, 2026) · FINRA Notice 26-02 · Texas Governor Abbott moratorium (Aug 3, 2026)",
    evidence: "Two regulatory frameworks arrived at the same conclusion in the same week: the buildout is moving faster than the evidence.",
    claimIds: ["abbott-data-center-audit"],
    accent: "violet",
    icon: Scale,
  },
  {
    id: "client-facing-ai-applications",
    number: "07",
    title: "CLIENT-FACING AI APPLICATIONS",
    description: "Where AI meets the people your clients interact with.",
    players: "financial planning tools · robo-advisors · portfolio screeners",
    evidence: "45% of Americans have no confidence in AI for financial guidance. 79% trust financial advisors. The advisor's role starts here but depends on everything upstream.",
    claimIds: ["advisor-trust-statistics"],
    accent: "coral",
    icon: Smartphone,
  },
];

export const chainAccentClasses: Record<ChainStage["accent"], { marker: string; label: string }> = {
  blue: { marker: "bg-[#8dc8e8] text-[#122232]", label: "text-[#8dc8e8]" },
  lime: { marker: "bg-[#d4e86b] text-[#122232]", label: "text-[#d4e86b]" },
  coral: { marker: "bg-[#f5ddd5] text-[#54221f]", label: "text-[#f5ddd5]" },
  violet: { marker: "bg-[#cbb7ec] text-[#2b174d]", label: "text-[#cbb7ec]" },
};

