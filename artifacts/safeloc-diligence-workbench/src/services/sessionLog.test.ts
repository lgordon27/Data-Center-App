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