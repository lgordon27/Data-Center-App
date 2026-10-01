import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResearchSearchAudit } from "../components/ResearchSearchAudit";
import { ResearchHandoffSummary } from "../components/ResearchHandoffSummary";
import { ReviewedShowcaseEntries } from "../components/ReviewedShowcaseEntries";
import { RetainedResearchFindings } from "../components/RetainedResearchFindings";

// The Node/tsx test runner uses classic JSX for these component imports;
// the application itself uses Vite's automatic JSX transform.
Object.assign(globalThis, { React });

test("older category records missing counts and query arrays render without exposing diagnostics", () => {
  const html = renderToStaticMarkup(createElement(ResearchSearchAudit, {
    audit: {
      categories: [
        null,
        { categoryId: "legacy", state: "Not searched", providerFailure: "secret provider body" },
      ],
    } as never,
    coverage: { searchTermsSource: "tool-observed" } as never,
  }));
  assert.match(html, /Search incomplete/);
  assert.match(html, /Research category/);
  assert.doesNotMatch(html, /secret provider body|undefined|NaN/);
});

test("empty handoffs without categories, dates, history or proposals explain unknown completeness", () => {
  const html = renderToStaticMarkup(createElement(ResearchHandoffSummary, {
    projectName: "Offline fixture",
    projectLocation: "Location not recorded",
    evidence: [],
    proposals: {},
    dispositions: {},
    onReviewFindings: () => {},
  }));
  assert.match(html, /Search incomplete/);
  assert.match(html, /Category detail was not recorded/);
  assert.doesNotMatch(html, /Invalid Date|NaN|undefined/);
});

test("reviewed catalog hooks keep loading, unavailable and empty states provider-free", () => {
  for (const state of ["loading", "unavailable", "ready"] as const) {
    const html = renderToStaticMarkup(createElement(ReviewedShowcaseEntries, {
      state, entries: [], onOpen: () => { throw new Error("An empty catalog cannot open a snapshot."); },
    }));
    assert.doesNotMatch(html, /<button|Stargate|Red Oak/);
    assert.match(html, state === "loading" ? /Loading reviewed/ : state === "unavailable" ? /unavailable/ : /No reviewed examples/);
  }
});

test("a supplied isolated reviewed entry dispatches only its supplied route callback", () => {
  let opened: string | null = null;
  const tree = ReviewedShowcaseEntries({
    state: "ready",
    entries: [{
      slug: "isolated-reviewed-fixture",
      name: "Isolated reviewed fixture",
      location: "Offline location",
      asOfDate: null,
      coverageState: "partial",
      modelState: "Not modeled",
    }],
    onOpen: (slug) => { opened = slug; },
  });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /date unavailable/);
  assert.match(html, /Not modeled/);
  const props = tree.props as { children: Array<{ props: { onClick: () => void } }> };
  props.children[0].props.onClick();
  assert.equal(opened, "isolated-reviewed-fixture");
});

test("older retained findings fall back to unresolved presentation without crashing or inventing dates", () => {
  const html = renderToStaticMarkup(createElement(RetainedResearchFindings, {
    findings: [{ id: "older", passage: "Exact retained offline passage." }] as never,
  }));
  assert.match(html, /Ambiguous applicability/);
  assert.match(html, /Financial eligibility unresolved/);
  assert.match(html, /Source publication date: not reported/);
  assert.match(html, /Source link unavailable/);
  assert.doesNotMatch(html, /Invalid Date|undefined|NaN/);
});