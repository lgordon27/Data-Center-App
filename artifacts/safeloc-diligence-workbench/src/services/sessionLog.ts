export const SESSION_ACTION_EVENT = "safeloc:session-action";

export type SessionAction = {
  action: string;
  itemId: string;
};

const actions: SessionAction[] = [];

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