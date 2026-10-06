import { createHash } from "node:crypto";
import { assessResearchProjectIdentity } from "../src/data/researchIdentity.mjs";
import { hasUsableResearchPassage } from "../src/data/researchContentQuality.mjs";
import { canonicalizeSourceUrl, sourceUrlAliases } from "../src/data/sourceValidationPolicy.mjs";

const text = (value) => typeof value === "string" ? value.trim() : "";
const normalizedQuote = (value) => text(value).replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, " ").toLocaleLowerCase();
const placeholder = (value) => !String(value ?? "").trim()
  || /^(?:not (?:disclosed|reported|established|available|known)|unknown|unavailable|missing evidence|no (?:support|evidence|passage)(?: returned)?|n\/?a|null|none)[.!]?$/i.test(String(value).trim());

/** Compatibility projection only; never a financial-input proposal. */
export function reportedFindingsFromVerifiedFindings(findings = []) {
  return findings.map((finding) => ({
    id: finding.findingId, status: "reported", categoryId: finding.topic, evidenceId: null,
    label: finding.topic, statement: finding.statement, exactQuotation: finding.exactQuotation,
    quotationVerified: finding.quotationVerified, sourceUrl: finding.source.url,
    sourceTitle: finding.source.title ?? finding.source.url, publisher: finding.source.publisher,
    publicationDate: finding.source.publishedAt, retrievedAt: finding.source.retrievedAt,
    facilityScope: finding.scope.facility, phaseScope: finding.scope.phase,
    identityScope: finding.projectMatch === "matches-requested-project" ? "exact-project" : "scope-unconfirmed",
    financialEligibility: "not-established",
  }));
}

function statedScope(source, passage, kind) {
  const label = kind === "facility" ? "(?:facility|building)(?: name)?" : "phase(?: name)?";
  const line = passage.match(new RegExp(`(?:^|\\n)[ \\t]*${label}[ \\t]*:[ \\t]*([^\\r\\n]+)`, "i"));
  if (line) return line[1].trim();
  const fields = source.accessOutcome?.structuredFields ?? [];
  const field = fields.find((item) => new RegExp(`^${label}$`, "i").test(item?.label ?? "")
    && text(item?.value) && passage.includes(item.value));
  if (field) return field.value;
  const names = [...new Set(kind === "facility"
    ? passage.match(/\bDFW\d+\b/gi) ?? []
    : passage.match(/\bphase[ \t]+(?:\d+|one|two|three|four|five|[IVX]+)\b/gi) ?? [])];
  return names.length === 1 ? names[0] : null;
}

/**
 * Attribution-only tier built from provider-original claims and retrieved
 * category passages. It never creates evidence or a financial proposal.
 */
export function buildReportedResearchFindings(project, categoryResults = [], eligibleEvidence = []) {
  const eligibleIds = new Set(eligibleEvidence.filter((item) => item?.eligibleForModel === true).map((item) => item.id));
  const findings = [];
  const seen = new Set();
  for (const result of categoryResults) {
    const evidence = result.rawResearch?.evidence;
    const claims = Array.isArray(evidence) ? evidence : evidence && typeof evidence === "object"
      ? Object.entries(evidence).map(([id, claim]) => ({ ...claim, id })) : [];
    for (const claim of claims) {
      const quote = text(claim.claimPassage);
      const normalized = normalizedQuote(quote);
      if (!claim.classification || claim.classification === "Missing Evidence"
        || placeholder(claim.value) || placeholder(quote)
        || (quote.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu)?.length ?? 0) < 3) continue;
      const citedUrls = new Set([claim.sourceUrl, ...(Array.isArray(claim.sourceUrls) ? claim.sourceUrls : [])]
        .map(canonicalizeSourceUrl).filter(Boolean));
      const source = (result.sources ?? []).find((candidate) =>
        candidate?.accessOutcome?.state === "accessible"
        && hasUsableResearchPassage(candidate.accessOutcome.passage)
        && (!citedUrls.size || sourceUrlAliases(candidate).some((url) => citedUrls.has(url)))
        && normalizedQuote(candidate.accessOutcome.passage).includes(normalized));
      if (!source) continue;
      const sourceUrl = canonicalizeSourceUrl(source.accessOutcome.canonicalUrl ?? source.canonicalUrl ?? source.url);
      if (!sourceUrl) continue;
      const id = `reported-${createHash("sha256").update(JSON.stringify([sourceUrl, normalized, claim.id])).digest("hex").slice(0, 24)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const passage = source.accessOutcome.passage;
      findings.push({
        id, status: "reported", categoryId: result.categoryId, evidenceId: claim.id,
        label: text(claim.label) || claim.id,
        statement: `${text(claim.label) || claim.id}: ${claim.value}${!placeholder(claim.unit) && !/^(?:project context|context)$/i.test(claim.unit ?? "") ? ` ${claim.unit}` : ""}`,
        exactQuotation: quote, quotationVerified: true, sourceUrl,
        sourceTitle: text(source.title ?? source.accessOutcome.title) || sourceUrl,
        publisher: text(source.publisher) || null,
        publicationDate: source.accessOutcome.publicationDate ?? source.publicationDate ?? source.publishedAt ?? source.date ?? null,
        retrievedAt: source.accessOutcome.retrievalTime ?? source.accessedAt ?? null,
        facilityScope: statedScope(source, passage, "facility"),
        phaseScope: statedScope(source, passage, "phase"),
        identityScope: assessResearchProjectIdentity(passage, source, project) === "exact-project"
          ? "exact-project" : "scope-unconfirmed",
        financialEligibility: eligibleIds.has(claim.id) ? "eligible-evidence-separately-established" : "not-established",
      });
      if (findings.length === 40) return findings;
    }
  }
  return findings;
}