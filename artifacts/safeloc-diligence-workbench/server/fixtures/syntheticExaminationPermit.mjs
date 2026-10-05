// Synthetic provider-free controls, never a reconstructed historical capture.
export const project = {
  name: "Red Oak Campus",
  location: "Red Oak, Ellis County, Texas",
  knownData: { operator: "DataBank", city: "Red Oak", county: "Ellis County", state: "Texas" },
};
export const permitUrl = "https://records.example.gov/synthetic-permit-dfw13";
export const permitPassage = [
  "Project Name: Databank Red Oak - DFW13",
  "Facility Name: DFW13",
  "City: Red Oak",
  "County: Ellis",
  "State: Texas",
  "Type of Work: New Construction",
  "Estimated Cost: $130,000,000",
  "Estimated Start Date: 03/01/2026",
  "Owner Name: DB Data Center Red Oak, LLC",
  "Owner Contact: DataBank",
  "The application describes a new building and its construction schedule. This record covers the specifically named building, not the aggregate campus. Estimated dates describe the submitted schedule and do not confirm completed work or operation. The construction description is limited to this application; no conclusions about other buildings or campus phases are stated.",
].join("\n");
export const permitSource = {
  url: permitUrl, title: "Synthetic DFW13 construction application",
  categoryIds: [], searchDomain: "project-identity", categoryRoutingUnknown: true,
  sourceChannel: "google-grounded-search",
  accessOutcome: { state: "accessible", reason: "retrieved", passage: permitPassage },
};