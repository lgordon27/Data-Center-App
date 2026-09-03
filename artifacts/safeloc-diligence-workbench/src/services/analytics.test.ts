import assert from "node:assert/strict";
import test from "node:test";
import { trackEvent } from "./analytics";

function setTestWindow(windowValue: Window | undefined) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowValue,
  });
}

test("tracks an event when the hosted tracker is available", () => {
  const calls: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  setTestWindow({
    umami: {
      track: (name, data) => calls.push({ name, data }),
    },
  } as Window);

  trackEvent("company_lens_selected", { company: "nvidia" });

  assert.deepEqual(calls, [{ name: "company_lens_selected", data: { company: "nvidia" } }]);
  setTestWindow(undefined);
});

test("swallows tracker errors so product interactions remain usable", () => {
  setTestWindow({
    umami: {
      track: () => {
        throw new Error("tracker unavailable");
      },
    },
  } as Window);

  assert.doesNotThrow(() => trackEvent("research_handoff_completed", { destination: "case_brief" }));
  setTestWindow(undefined);
});