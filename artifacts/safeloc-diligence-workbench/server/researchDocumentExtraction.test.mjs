import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deflateSync } from "node:zlib";
import {
  extractResearchDocument,
  normalizePublicationDate,
} from "./researchDocumentExtraction.mjs";

const redOakQualityFixtures = JSON.parse(readFileSync(
  new URL("./fixtures/red-oak-quality.json", import.meta.url),
  "utf8",
));

function textPdf(text) {
  const stream = deflateSync(Buffer.from(`BT (${text}) Tj ET`));
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Length "),
    Buffer.from(String(stream.length)),
    Buffer.from(" /Filter /FlateDecode >>\nstream\n"),
    stream,
    Buffer.from("\nendstream\nendobj\n%%EOF"),
  ]);
}

const substantialArticle = [
  "The utility filing describes a new data center campus planned for the county.",
  "Project documents identify the interconnection request and the facilities expected to serve the site.",
  "County staff reviewed the application, public comments, construction schedule, and related infrastructure plans.",
  "The report also summarizes the applicant's development timeline, expected capacity, and the agencies responsible for review.",
].join(" ");
const publicationFixtures = JSON.parse(readFileSync(
  new URL("./fixtures/research-partial-receipts.json", import.meta.url),
  "utf8",
)).publicationDateFixtures;

test("extracts publication dates by deterministic metadata precedence", async () => {
  const semantic = await extractResearchDocument({
    bytes: `${publicationFixtures.semantic.markup}${publicationFixtures.jsonLd.markup}<main><article><h1>Project Atlas record</h1><p>${publicationFixtures.visiblePublicationLine.line.replace("Apr 23", "Apr 25")}</p><p>${substantialArticle}</p></article></main>`,
    contentType: "text/html",
  });
  assert.equal(semantic.publicationDate, publicationFixtures.semantic.date);
  assert.equal(semantic.publicationDateBasis, publicationFixtures.semantic.basis);
  assert.equal(semantic.publicationDateStatus, "resolved");

  const jsonLd = await extractResearchDocument({
    bytes: `${publicationFixtures.jsonLd.markup}<main><article><p>${publicationFixtures.visiblePublicationLine.line.replace("Apr 23", "Apr 26")}</p><p>${substantialArticle}</p></article></main>`,
    contentType: "text/html",
  });
  assert.equal(jsonLd.publicationDate, publicationFixtures.jsonLd.date);
  assert.equal(jsonLd.publicationDateBasis, publicationFixtures.jsonLd.basis);
});

test("extracts only clearly labeled visible article publication lines", async () => {
  const visible = await extractResearchDocument({
    bytes: `<nav><p>${publicationFixtures.visiblePublicationLine.line.replace("Apr 23", "Apr 20")}</p><p>Events: May 2, 2026</p></nav><main><article><h1>Project Atlas record</h1><p>${publicationFixtures.visiblePublicationLine.line}</p><p>${substantialArticle}</p><p>Copyright © 2026. The public hearing is scheduled for May 8, 2026.</p></article></main>`,
    contentType: "text/html",
  });
  assert.equal(visible.publicationDate, publicationFixtures.visiblePublicationLine.date);
  assert.equal(visible.publicationDateBasis, publicationFixtures.visiblePublicationLine.basis);
  assert.doesNotMatch(visible.passage, /Published On Apr/);
});

test("fails closed on conflicting publication candidates and rejects unrelated or invalid dates", async () => {
  const conflict = await extractResearchDocument({
    bytes: `${publicationFixtures.conflictingSemantic.markup}${publicationFixtures.jsonLd.markup}<main><article><p>${substantialArticle}</p></article></main>`,
    contentType: "text/html",
  });
  assert.equal(conflict.publicationDate, publicationFixtures.conflictingSemantic.date);
  assert.equal(conflict.publicationDateStatus, publicationFixtures.conflictingSemantic.status);

  const visibleConflict = await extractResearchDocument({
    bytes: `<main><article><p>Published: Apr 23, 2026</p><p>Publication Date: Apr 24, 2026</p><p>${substantialArticle}</p></article></main>`,
    contentType: "text/html",
  });
  assert.equal(visibleConflict.publicationDate, null);
  assert.equal(visibleConflict.publicationDateStatus, "ambiguous");

  const unrelatedDates = await extractResearchDocument({
    bytes: `<nav><p>${publicationFixtures.visiblePublicationLine.line}</p></nav><main><article><p>${publicationFixtures.noPublicationDate.unrelatedLines}</p><p>${substantialArticle}</p></article></main>`,
    contentType: "text/html",
  });
  assert.equal(unrelatedDates.publicationDate, publicationFixtures.noPublicationDate.date);
  assert.equal(unrelatedDates.publicationDateStatus, publicationFixtures.noPublicationDate.status);
  assert.equal(normalizePublicationDate("2026-02-30"), null);
  assert.equal(normalizePublicationDate("2026-04-23T25:00:00Z"), null);
});

test("extracts bounded HTML without executing script", async () => {
  globalThis.__extractionScriptRan = false;
  const result = await extractResearchDocument({
    bytes: `<title>Atlas</title><script>globalThis.__extractionScriptRan=true</script><main><h1>Permit</h1><p>${substantialArticle}</p></main>`,
    contentType: "text/html",
  });
  assert.equal(result.outcome, "extracted");
  assert.match(result.passage, /^Atlas Permit The utility filing describes/);
  assert.deepEqual(result.index, ["Atlas", "Permit"]);
  assert.equal(globalThis.__extractionScriptRan, false);
  assert.match(result.contentHash, /^[a-f0-9]{64}$/);
});

test("prioritizes article facts over long navigation and boilerplate text", async () => {
  const navigation = `<nav><h2>${"Navigation links and cookie settings. ".repeat(180)}</h2>${"Footer links. ".repeat(180)}</nav>`;
  const result = await extractResearchDocument({
    bytes: `<header>${navigation}</header><main><h1>Project Atlas</h1><p>The Texas facility received a 240 MW interconnection approval. ${substantialArticle}</p></main><footer>${"Footer links. ".repeat(400)}</footer>`,
    contentType: "text/html",
  });
  assert.ok(result.passage.length <= 4_000);
  assert.match(result.passage, /240 MW interconnection approval/);
  assert.doesNotMatch(result.passage, /Navigation links|Footer links|cookie settings/);
});

test("removes news navigation and ETDatacenters-style share chrome while keeping article prose", async () => {
  const news = await extractResearchDocument({
    bytes: `<nav>Home News Analysis Contact</nav><header>Market News</header><main><article><h1>County approves infrastructure plan</h1><p>${substantialArticle}</p></article></main><footer>About us Privacy Terms</footer>`,
    contentType: "text/html",
  });
  assert.equal(news.outcome, "extracted");
  assert.match(news.passage, /County approves infrastructure plan/);
  assert.match(news.passage, /public comments/);
  assert.doesNotMatch(news.passage, /Home News Analysis|Market News|About us/);

  const etDatacenters = await extractResearchDocument({
    bytes: `<div class="site-header"><nav>Home Data Centers News</nav></div><div class="entry-content"><h1>New campus receives approval</h1><div class="article-body"><p>${substantialArticle}</p><p>Officials said the approved work will proceed under the published schedule.</p></div><div class="share-buttons">Share this article Print Email</div></div><div class="site-footer">Contact Privacy</div>`,
    contentType: "text/html",
    sourceUrl: "https://etdatacenters.example/news/campus",
  });
  assert.equal(etDatacenters.outcome, "extracted");
  assert.match(etDatacenters.passage, /utility filing describes a new data center campus/);
  assert.doesNotMatch(etDatacenters.passage, /Home Data Centers|Share this article|Print Email|Contact Privacy/);
});

test("classifies verification, JavaScript, login, and paywall shells before retaining text", async () => {
  const cases = [
    ["<main><h1>Verify you are human</h1><p>Complete the security check before continuing.</p></main>", "bot-verification-page"],
    ["<main><p>Enable JavaScript and cookies to continue.</p></main>", "javascript-required-shell"],
    ["<main><h1>Sign in to continue reading</h1><form><button>Sign in</button></form></main>", "login-or-paywall-shell"],
    ["<main><h1>Subscribe to continue reading</h1><p>This article is for subscribers.</p></main>", "login-or-paywall-shell"],
  ];
  for (const [html, reason] of cases) {
    const result = await extractResearchDocument({ bytes: html, contentType: "text/html" });
    assert.equal(result.outcome, "blocked-or-shell");
    assert.equal(result.reason, reason);
    assert.equal(result.passage, "");
  }
});

test("rejects the retained CivicEngage application-error page despite its page chrome", async () => {
  const result = await extractResearchDocument({
    bytes: `<html><body><main><h1>Ellis County Archive</h1><p>${redOakQualityFixtures.civicEngagePassage}</p></main></body></html>`,
    contentType: "text/html",
    sourceUrl: "http://www.elliscountytx.gov/ArchiveCenter/ViewFile/Item/4224",
  });
  assert.equal(result.outcome, "blocked-or-shell");
  assert.equal(result.reason, "application-error-page");
  assert.equal(result.passage, "");
});

test("rejects the retained control-heavy PDF text without retaining or normalizing its receipt passage", async () => {
  const escaped = redOakQualityFixtures.corruptedPdfPassage
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
  const result = await extractResearchDocument({
    bytes: Buffer.from(`%PDF-1.4\nBT (${escaped}) Tj ET`),
    contentType: "application/pdf",
  });
  assert.equal(result.outcome, "low-content");
  assert.equal(result.reason, "control-heavy-content");
  assert.equal(result.passage, "");
});

test("rejects low-prose pages and repeated status tokens", async () => {
  const navigationHeavy = await extractResearchDocument({
    bytes: `<nav>${"Home Projects News Contact ".repeat(100)}</nav><main><h1>Project Atlas</h1><p>Permit details are not available.</p></main>`,
    contentType: "text/html",
  });
  assert.equal(navigationHeavy.outcome, "low-content");
  assert.equal(navigationHeavy.reason, "genuine-prose-below-300-characters");
  assert.equal(navigationHeavy.passage, "");

  const repeatedTokens = await extractResearchDocument({
    bytes: `<main><p>${"Loading ".repeat(120)}</p></main>`,
    contentType: "text/html",
  });
  assert.equal(repeatedTokens.outcome, "low-content");
  assert.equal(repeatedTokens.passage, "");
});

test("rejects pure navigation and status chrome without rejecting short legitimate prose", async () => {
  const navigation = await extractResearchDocument({
    bytes: "<main><p>Home Projects News Contact Privacy Terms About Us</p></main>",
    contentType: "text/html",
  });
  assert.equal(navigation.outcome, "low-content");
  assert.equal(navigation.reason, "navigation-only-content");
  assert.equal(navigation.passage, "");

  const status = await extractResearchDocument({
    bytes: "Loading... Please wait.",
    contentType: "text/plain",
  });
  assert.equal(status.outcome, "low-content");
  assert.equal(status.reason, "status-only-content");
  assert.equal(status.passage, "");

  const legitimate = await extractResearchDocument({
    bytes: "Project Atlas proposes a new water plan.",
    contentType: "text/plain",
  });
  assert.equal(legitimate.outcome, "extracted");
  assert.match(legitimate.passage, /proposes a new water plan/);
});

test("extracts plain text, generic JSON, and bounded indexes", async () => {
  const text = await extractResearchDocument({ bytes: " Atlas \n permit ", contentType: "text/plain" });
  assert.equal(text.passage, "Atlas permit");
  const json = await extractResearchDocument({
    bytes: JSON.stringify({ project: "Atlas", permit: { status: "active" } }),
    contentType: "application/json",
  });
  assert.match(json.passage, /project: Atlas/);
  assert.ok(json.index.length <= 40);
});

test("extracts ArcGIS feature attributes but not geometry", async () => {
  const result = await extractResearchDocument({
    bytes: JSON.stringify({ features: [{ attributes: { NAME: "Atlas", MW: 250 }, geometry: { x: 1 } }], exceededTransferLimit: true }),
    contentType: "application/geo+json",
  });
  assert.match(result.passage, /Atlas/);
  assert.doesNotMatch(result.passage, /geometry/);
  assert.match(result.limitations.join(" "), /without geometry/);
});

test("extracts XML text and element index", async () => {
  const result = await extractResearchDocument({
    bytes: "<?xml version='1.0'?><permit><name>Atlas &amp; Co</name><status>active</status></permit>",
    contentType: "application/xml",
  });
  assert.equal(result.passage, "Atlas & Co active");
  assert.deepEqual(result.index.slice(0, 3), ["permit", "name", "status"]);
});

test("extracts text-bearing compressed PDFs in process", async () => {
  const result = await extractResearchDocument({ bytes: textPdf("Atlas permit record"), contentType: "application/pdf" });
  assert.equal(result.extractionMethod, "pdf-text");
  assert.match(result.passage, /Atlas permit record/);
});

test("reports scanned PDFs without OCR and bounds explicitly injected OCR", async () => {
  const scanned = Buffer.from("%PDF-1.4\n% image only\n%%EOF");
  const without = await extractResearchDocument({ bytes: scanned, contentType: "application/pdf" });
  assert.equal(without.outcome, "empty");
  let received;
  const withOcr = await extractResearchDocument({ bytes: scanned, contentType: "application/pdf" }, {
    limits: { maxOcrPages: 2, maxOcrOutputChars: 20 },
    ocrImpl: (bytes, options) => {
      received = { bytes: bytes.length, ...options };
      return "Scanned Atlas permit record";
    },
  });
  assert.equal(withOcr.extractionMethod, "pdf-ocr");
  assert.equal(withOcr.passage, "Scanned Atlas permit");
  assert.match(withOcr.limitations.join(" "), /truncated to 20/);
  assert.equal(received.maxPages, 2);
  assert.equal(received.maxOutputChars, 20);
});

test("discovers only safe explicit underlying document URLs from JavaScript shells", async () => {
  const safe = await extractResearchDocument({
    bytes: "<script>render()</script><meta name='citation_pdf_url' content='/files/atlas.pdf'>",
    contentType: "text/html",
    sourceUrl: "https://records.example.gov/viewer/1",
  });
  assert.equal(safe.outcome, "underlying-document");
  assert.equal(safe.underlyingDocumentUrl, "https://records.example.gov/files/atlas.pdf");
  const unsafe = await extractResearchDocument({
    bytes: "<script>render()</script><meta name='document_url' content='javascript:alert(1)'><a rel='document' href='http://127.0.0.1/private.pdf'></a>",
    contentType: "text/html",
    sourceUrl: "https://records.example.gov/",
  });
  assert.equal(unsafe.outcome, "low-content");
  assert.match(unsafe.reason, /genuine-prose-below/);
  assert.equal(unsafe.underlyingDocumentUrl, null);
});

test("returns deterministic malformed outcomes", async () => {
  assert.equal((await extractResearchDocument({ bytes: "{\"broken\":", contentType: "application/json" })).outcome, "malformed");
  assert.equal((await extractResearchDocument({ bytes: "<a><b>text</a>", contentType: "application/xml" })).outcome, "malformed");
  assert.equal((await extractResearchDocument({ bytes: "not pdf", contentType: "application/pdf" })).outcome, "malformed");
});

test("enforces input, passage, index, and candidate-link bounds", async () => {
  const oversized = await extractResearchDocument({ bytes: "12345", contentType: "text/plain" }, { limits: { maxInputBytes: 4 } });
  assert.equal(oversized.outcome, "size-limit");
  const bounded = await extractResearchDocument({
    bytes: `<h1>${"x".repeat(20)}</h1>${Array.from({ length: 10 }, (_, index) => `<a rel="document" href="https://example.gov/${index}.pdf">d</a>`).join("")}`,
    contentType: "text/html",
  }, { limits: { minHtmlProseChars: 0, maxPassageChars: 10, maxIndexEntries: 1, maxIndexEntryChars: 5, maxCandidateLinks: 2 } });
  assert.equal(bounded.passage.length, 10);
  assert.deepEqual(bounded.index, ["xxxxx"]);
  assert.equal(bounded.candidateLinks.length, 2);
});