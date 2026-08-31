import type { ClaimId } from "@/data/claimSources";

export const milestones = [
  {
    date: "2025 / FULL YEAR",
    signal: "$156B",
    title: "AI projects blocked or delayed",
    detail: "Across the United States, the capital at risk made infrastructure constraints an investment question—not just a permitting footnote.",
    tone: "border-[#255bb7] bg-[#e5efff]",
    claimIds: ["stargate-cancellation"] as ClaimId[],
  },
  {
    date: "Q1 2026",
    signal: "$130B",
    title: "Blocked or delayed in one quarter",
    detail: "The pace of disruption accelerated just as demand for AI compute was scaling, widening the gap between announced capacity and delivered capacity.",
    tone: "border-[#ba2f45] bg-[#fde8eb]",
    claimIds: ["stargate-cancellation"] as ClaimId[],
  },
  {
    date: "MAY 2025",
    signal: "SANDERS–AOC",
    title: "Moratorium bill introduced",
    detail: "A federal proposal showed how quickly data-center growth had moved into the public-policy and community debate.",
    tone: "border-[#8a6400] bg-[#fff6c7]",
    claimIds: ["abbott-data-center-audit"] as ClaimId[],
  },
  {
    date: "JULY 2026",
    signal: "142 / 42",
    title: "Protests across states",
    detail: "Reported protests in 42 states made local consent, water, power, and neighborhood impact part of the operating risk picture.",
    tone: "border-[#a65a00] bg-[#fff0d6]",
    claimIds: ["abbott-data-center-audit"] as ClaimId[],
  },
  {
    date: "AUGUST 3, 2026",
    signal: "ABBOTT",
    title: "Texas orders a moratorium",
    detail: "Governor Greg Abbott ordered a moratorium on new data-center grid connections until ERCOT completes an energy and water-use audit.",
    tone: "border-[#ba2f45] bg-[#fde8eb]",
    claimIds: ["abbott-data-center-audit"] as ClaimId[],
  },
  {
    date: "ERCOT / 2026",
    signal: "474 GW",
    title: "Interconnection queue",
    detail: "The request queue is more than five times Texas record peak demand, with 90% of requests attributed to data centers.",
    tone: "border-[#0b7a63] bg-[#e0f4ed]",
    claimIds: ["ercot-market-pressure"] as ClaimId[],
  },
] as const;
