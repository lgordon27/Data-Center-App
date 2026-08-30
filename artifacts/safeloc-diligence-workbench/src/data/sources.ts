import type { Classification } from "@/context/DiligenceContext";
export const evidenceTiers: Array<{
  name: Classification;
  color: string;
  background: string;
  border: string;
  definition: string;
  analogy: string;
}> = [
  {
    name: "Verified Evidence",
    color: "#0b7a63",
    background: "#e0f4ed",
    border: "#9bd8c5",
    definition: "A public record or dependable source directly supports the input.",
    analogy: "Like a bank statement, not someone's word.",
  },
  {
    name: "Management Assertion",
    color: "#8a6400",
    background: "#fff6c7",
    border: "#e6cf70",
    definition: "The project or its representatives say it is true, but independent proof is limited.",
    analogy: "Like a resume, not a background check.",
  },
  {
    name: "Model Inference",
    color: "#255bb7",
    background: "#e5efff",
    border: "#aac6f4",
    definition: "The tool derives a reasonable estimate from related public facts.",
    analogy: "Like estimating tomorrow's weather from today's barometric pressure.",
  },
  {
    name: "User Assumption",
    color: "#a65a00",
    background: "#fff0d6",
    border: "#f1cb8b",
    definition: "An analyst-selected value is used because the project-specific fact is not established.",
    analogy: "Like a doctor's estimate before running tests.",
  },
  {
    name: "Missing Evidence",
    color: "#ba2f45",
    background: "#fde8eb",
    border: "#efabb8",
    definition: "The information needed to support an input has not been found or disclosed.",
    analogy: "Like a blank on a loan application.",
  },
];
export const sourceGroups = [
  {
    title: "Infrastructure & Energy",
    sources: ["ERCOT", "Utility filings", "Bloomberg", "U.S. Energy Information Administration (EIA)"],
  },
  {
    title: "Water & Climate",
    sources: ["Ceres", "FEMA National Risk Index", "NOAA climate records", "Texas Water Development Board"],
  },
  {
    title: "Community & Social",
    sources: ["U.S. Census Bureau", "NAACP", "Data Center Watch"],
  },
  {
    title: "Regulatory",
    sources: ["EU AI Act", "FINRA", "Governor Abbott directive"],
  },
  {
    title: "Market & Investment",
    sources: ["Formative / FactSet", "Morningstar", "MSCI", "Gallup / Edward Jones"],
  },
] as const;
