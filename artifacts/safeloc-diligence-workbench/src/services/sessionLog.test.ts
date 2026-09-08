import assert from "node:assert/strict";
import test from "node:test";
import {
  clearDecisionHistory,
  getDecisionHistory,
  recordAIDecision,
  recordManualClassificationChange,
} from "./sessionLog";

test("records AI outcomes and manual classification changes without losing decision context", () => {
  clearDecisionHistory();

  recordAIDecision(
    "community_risk",
    "Missing Evidence",
    "No facility-level disclosure establishes this input.",
    "overridden",
    "Verified Evidence",
  );
  recordManualClassificationChange("water_rights", "Missing Evidence", "Model Inference");

  const history = getDecisionHistory();
  assert.equal(history.length, 2);
  assert.deepEqual(history[0], {
    kind: "ai",
    itemId: "community_risk",
    proposedClassification: "Missing Evidence",
    reasoning: "No facility-level disclosure establishes this input.",
    decision: "overridden",
    resultingClassification: "Verified Evidence",
    recordedAt: history[0].recordedAt,
  });
  assert.equal(history[1].kind, "manual");
  assert.equal(history[1].itemId, "water_rights");
  assert.equal(history[1].previousClassification, "Missing Evidence");
  assert.equal(history[1].resultingClassification, "Model Inference");

  clearDecisionHistory();
  assert.deepEqual(getDecisionHistory(), []);
});

test("persists decision history into the current session snapshot", () => {
  const key = "safeloc:diligence:current-session:v1";
  const values = new Map<string, string>([[key, JSON.stringify({ version: 2, classifications: {} })]]);
  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (storageKey: string) => values.get(storageKey) ?? null,
        setItem: (storageKey: string, value: string) => values.set(storageKey, value),
      },
      dispatchEvent: () => true,
    },
  });
  try {
    clearDecisionHistory();
    recordAIDecision("electricity_cost", "Missing Evidence", "Facility tariff not established.", "accepted", "Missing Evidence");
    const stored = JSON.parse(values.get(key) ?? "{}");
    assert.equal(stored.decisionHistory.length, 1);
    assert.equal(stored.decisionHistory[0].itemId, "electricity_cost");
  } finally {
    clearDecisionHistory();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
  }
});