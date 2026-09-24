import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { extractResearchDocument } from "./researchDocumentExtraction.mjs";

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

test("extracts bounded HTML without executing script", async () => {
  globalThis.__extractionScriptRan = false;
  const result = await extractResearchDocument({
    bytes: "<title>Atlas</title><script>globalThis.__extractionScriptRan=true</script><h1>Permit</h1><p>Approved.</p>",
    contentType: "text/html",
  });
  assert.equal(result.outcome, "extracted");
  assert.equal(result.passage, "Atlas Permit Approved.");
  assert.deepEqual(result.index, ["Atlas", "Permit"]);
  assert.equal(globalThis.__extractionScriptRan, false);
  assert.match(result.contentHash, /^[a-f0-9]{64}$/);
});

test("prioritizes article facts over long navigation and boilerplate text", async () => {
  const navigation = `<nav><h2>${"Navigation links and cookie settings. ".repeat(180)}</h2>${"Footer links. ".repeat(180)}</nav>`;
  const result = await extractResearchDocument({
    bytes: `<header>${navigation}</header><main><h1>Project Atlas</h1><p>The Texas facility received a 240 MW interconnection approval.</p></main><footer>${"Footer links. ".repeat(400)}</footer>`,
    contentType: "text/html",
  });
  assert.ok(result.passage.length <= 4_000);
  assert.match(result.passage, /240 MW interconnection approval/);
  assert.doesNotMatch(result.passage, /Navigation links|Footer links|cookie settings/);
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
  assert.equal(unsafe.outcome, "empty");
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
  }, { limits: { maxPassageChars: 10, maxIndexEntries: 1, maxIndexEntryChars: 5, maxCandidateLinks: 2 } });
  assert.equal(bounded.passage.length, 10);
  assert.deepEqual(bounded.index, ["xxxxx"]);
  assert.equal(bounded.candidateLinks.length, 2);
});