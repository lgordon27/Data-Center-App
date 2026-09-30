const APPLICATION_ERROR_PATTERNS = [
  /\ban error has occurred in this application\b/i,
];

const HTML_SHELL_PATTERNS = [
  ["bot-verification-page", /\b(?:verify you are human|verify that you are human|human verification|checking your browser|checking if the site connection is secure|unusual traffic from your (?:computer )?network|are you a robot|complete the security check|captcha)\b/i],
  ["javascript-required-shell", /\b(?:enable|turn on) javascript(?: and cookies)? to (?:continue|proceed|access|view|use)\b|\bjavascript is (?:required|disabled|not enabled)\b|\bthis (?:site|page|application) requires javascript\b/i],
  ["login-or-paywall-shell", /\b(?:sign in|log in|register) to (?:continue|read|view|access)\b|\bsubscribe to (?:continue|read|view)\b|\bsubscription required\b|\bmembers[- ]only content\b|\bthis content is for subscribers\b|\bplease subscribe to read\b/i],
];

const CHROME_LABELS = [
  "skip to main content",
  "skip to content",
  "return to home",
  "about us",
  "main content",
  "accessibility",
  "projects",
  "project",
  "analysis",
  "privacy",
  "contact",
  "previous",
  "subscribe",
  "download",
  "loading",
  "search",
  "terms",
  "news",
  "share",
  "print",
  "email",
  "close",
  "open",
  "menu",
  "home",
  "back",
  "next",
  "sign in",
  "log in",
  "please wait",
  "working",
];
const CHROME_LABEL_PATTERN = new RegExp(
  `^(?:${CHROME_LABELS.map((label) => label.replace(/\s+/g, "\\s+")).join("|")})(?:(?:\\s+|\\s*[|•·>›»/—–-]+\\s*)(?:${CHROME_LABELS
    .map((label) => label.replace(/\s+/g, "\\s+"))
    .join("|")}))*[.!…]*$`,
  "i",
);

const PURE_STATUS_PATTERN = /^(?:(?:please wait|loading|working|page not found|not found|access denied|404(?: not found)?|503 service unavailable)[.!…]*)(?:(?:[ \t]+|[|•·>›»/—–-]+)(?:please wait|loading|working|page not found|not found|access denied|404(?: not found)?|503 service unavailable)[.!…]*)*$/i;

/**
 * Returns a bounded, deterministic rejection reason for unusable captured
 * text. This is a content-quality check only; it does not establish source
 * identity, claim support, or evidence eligibility.
 */
export function researchContentRejectionReason(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (APPLICATION_ERROR_PATTERNS.some((pattern) => pattern.test(value))) {
    return "application-error-page";
  }

  for (const [reason, pattern] of HTML_SHELL_PATTERNS) {
    if (pattern.test(value)) return reason;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (PURE_STATUS_PATTERN.test(normalized)) return "status-only-content";
  if (CHROME_LABEL_PATTERN.test(normalized)) return "navigation-only-content";

  const controlCharacters = value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g)?.length ?? 0;
  if (controlCharacters >= 8 && controlCharacters / value.length >= 0.01) {
    return "control-heavy-content";
  }
  return null;
}

export function hasUsableResearchPassage(value) {
  return typeof value === "string"
    && value.trim().length > 0
    && researchContentRejectionReason(value) === null;
}