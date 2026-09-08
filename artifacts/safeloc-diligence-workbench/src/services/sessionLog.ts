import type { Classification } from "@/model/cashFlowEngine";

export const SESSION_ACTION_EVENT = "safeloc:session-action";
export const DECISION_HISTORY_EVENT = "safeloc:decision-history";
const CURRENT_SESSION_STORAGE_KEY = "safeloc:diligence:current-session:v1";

export type SessionAction = {
  action: string;
  itemId: string;
};

export type DecisionHistoryEntry =
  | {
      kind: "ai";
      itemId: string;
      proposedClassification: Classification;
      reasoning: string;
      decision: "accepted" | "overridden";
      resultingClassification: Classification;
      recordedAt: string;
    }
  | {
      kind: "manual";
      itemId: string;
      previousClassification: Classification;
      resultingClassification: Classification;
      recordedAt: string;
    };

const actions: SessionAction[] = [];
const decisionHistory: DecisionHistoryEntry[] = [];

export function logSessionAction(action: string, itemId: string) {
  const entry = { action, itemId };
  actions.push(entry);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<SessionAction>(SESSION_ACTION_EVENT, { detail: entry }));
  }
}

export function getSessionActions(): SessionAction[] {
  return actions.map((entry) => ({ ...entry }));
}

export function clearSessionActions() {
  actions.length = 0;
}

export function recordAIDecision(
  itemId: string,
  proposedClassification: Classification,
  reasoning: string,
  decision: "accepted" | "overridden",
  resultingClassification: Classification,
) {
  const entry: DecisionHistoryEntry = {
    kind: "ai",
    itemId,
    proposedClassification,
    reasoning,
    decision,
    resultingClassification,
    recordedAt: new Date().toISOString(),
  };
  decisionHistory.push(entry);
  persistDecisionHistory();
  dispatchDecisionHistoryEvent(entry);
}

export function recordManualClassificationChange(
  itemId: string,
  previousClassification: Classification,
  resultingClassification: Classification,
) {
  const entry: DecisionHistoryEntry = {
    kind: "manual",
    itemId,
    previousClassification,
    resultingClassification,
    recordedAt: new Date().toISOString(),
  };
  decisionHistory.push(entry);
  persistDecisionHistory();
  dispatchDecisionHistoryEvent(entry);
}

export function getDecisionHistory(): DecisionHistoryEntry[] {
  return decisionHistory.map((entry) => ({ ...entry }));
}

export function restoreDecisionHistory(entries: DecisionHistoryEntry[]) {
  decisionHistory.length = 0;
  decisionHistory.push(...entries.map((entry) => ({ ...entry })));
}

export function clearDecisionHistory() {
  decisionHistory.length = 0;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DECISION_HISTORY_EVENT));
  }
}

function dispatchDecisionHistoryEvent(entry: DecisionHistoryEntry) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<DecisionHistoryEntry>(DECISION_HISTORY_EVENT, { detail: entry }));
  }
}

function persistDecisionHistory() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(CURRENT_SESSION_STORAGE_KEY);
    if (!raw) return;
    const session = JSON.parse(raw);
    if (!session || typeof session !== "object" || Array.isArray(session)) return;
    window.localStorage.setItem(
      CURRENT_SESSION_STORAGE_KEY,
      JSON.stringify({ ...session, decisionHistory: getDecisionHistory() }),
    );
  } catch {
    // Session history is an optional persistence enhancement.
  }
}