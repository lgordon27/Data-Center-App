export function resolveResearchModelConfig(env = process.env) {
  const model = String(env.OPENAI_RESEARCH_MODEL ?? "").trim() || "gpt-6.1-sol";
  const reasoningModel = /^gpt-6\.1-sol(?:-|$)/.test(model);
  const effort = String(env.OPENAI_RESEARCH_REASONING_EFFORT ?? "").trim().toLowerCase();
  const reasoningEffort = reasoningModel
    ? ["low", "medium", "high"].includes(effort) ? effort : "low"
    : null;
  const defaultTokensPerMinute = reasoningModel ? 450_000 : 30_000;
  const configuredTpm = Number.parseInt(env.OPENAI_TPM_LIMIT ?? "", 10);
  return Object.freeze({
    model, reasoningEffort, defaultTokensPerMinute,
    tokensPerMinute: Number.isInteger(configuredTpm) && configuredTpm > 0
      ? Math.min(configuredTpm, 1_000_000) : defaultTokensPerMinute,
    categoryOutputTokens: reasoningModel ? 12_000 : 3_500,
    projectOutputTokens: reasoningModel ? 24_000 : 8_000,
    cacheModelVersion: `${model}:reasoning-${reasoningEffort ?? "not-applicable"}:output-v2`,
  });
}

export const RESEARCH_MODEL_CONFIG = resolveResearchModelConfig();
