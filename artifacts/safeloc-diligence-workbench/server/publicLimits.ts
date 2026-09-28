import type { Pool } from "pg";

type QueryClient = Awaited<ReturnType<Pool["connect"]>>;
type ClientPool = Pick<Pool, "connect" | "query">;

export const EVIDENCE_LIMIT = 30;
export const EVIDENCE_WINDOW_MS = 60_000;

export function clientIdentity(request: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return request.ip?.trim() || request.socket?.remoteAddress?.trim() || "unknown";
}

export function createPublicRateLimiter(pool: ClientPool, {
  limit = EVIDENCE_LIMIT, windowMs = EVIDENCE_WINDOW_MS, now = () => new Date(),
} = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error("Invalid public rate limit configuration.");
  }
  return {
    async allow(request: { ip?: string; socket?: { remoteAddress?: string } }) {
      const key = clientIdentity(request);
      const current = now().getTime();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Transaction-scoped lock serializes the read/insert across workers.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
        await client.query(
          "DELETE FROM public_request_events WHERE client_key = $1 AND requested_at <= $2",
          [key, new Date(current - windowMs)],
        );
        const existing = await client.query<{ requested_at: Date }>(
          "SELECT requested_at FROM public_request_events WHERE client_key = $1 ORDER BY requested_at ASC",
          [key],
        );
        if (existing.rows.length >= limit) {
          await client.query("COMMIT");
          return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil(
              (new Date(existing.rows[0].requested_at).getTime() + windowMs - current) / 1000,
            )),
          };
        }
        await client.query("INSERT INTO public_request_events (client_key, requested_at) VALUES ($1, $2)", [
          key, new Date(current),
        ]);
        await client.query("COMMIT");
        return { allowed: true, retryAfterSeconds: 0 };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export interface ModelPrice {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface SpendConfig {
  capUsd: number;
  prices: Record<string, ModelPrice>;
  now?: () => Date;
}

function microUsd(usd: number): number {
  const value = Math.ceil(usd * 1_000_000);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid daily spend amount.");
  return value;
}

function tokensPrice(input: number, output: number, price: ModelPrice): number {
  for (const count of [input, output]) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid provider token usage.");
  }
  return microUsd(input * price.inputUsdPerMillion / 1_000_000
    + output * price.outputUsdPerMillion / 1_000_000);
}

export function createDailySpendGuard(pool: Pick<Pool, "query">, config: SpendConfig) {
  const cap = microUsd(config.capUsd);
  if (cap < 1 || !Object.keys(config.prices).length) throw new Error("Invalid daily spend cap or prices.");
  for (const price of Object.values(config.prices)) {
    if (!price || !Number.isFinite(price.inputUsdPerMillion) || price.inputUsdPerMillion < 0
      || !Number.isFinite(price.outputUsdPerMillion) || price.outputUsdPerMillion < 0) {
      throw new Error("Invalid model prices.");
    }
  }
  const now = config.now ?? (() => new Date());
  async function settleReservation(
    reservation: { day: string; amount: number; model: string },
    spentAmount: number,
  ) {
    const result = await pool.query(
      `UPDATE public_provider_spend
       SET reserved_micro_usd = reserved_micro_usd - $2,
           spent_micro_usd = spent_micro_usd + $3
       WHERE spend_day = $1 AND reserved_micro_usd >= $2`,
      [reservation.day, reservation.amount, spentAmount],
    );
    if (result.rowCount !== 1) throw new Error("Provider spend reservation was not found.");
  }
  return {
    async reserve({ model, inputTokenCeiling, outputTokenCeiling }: {
      model: string; inputTokenCeiling: number; outputTokenCeiling: number;
    }) {
      const price = config.prices[model];
      if (!price) throw new Error("No price configured for model.");
      const day = now().toISOString().slice(0, 10);
      const amount = tokensPrice(inputTokenCeiling, outputTokenCeiling, price);
      await pool.query("INSERT INTO public_provider_spend (spend_day) VALUES ($1) ON CONFLICT DO NOTHING", [day]);
      const result = await pool.query(
        `UPDATE public_provider_spend
         SET reserved_micro_usd = reserved_micro_usd + $2
         WHERE spend_day = $1 AND spent_micro_usd + reserved_micro_usd + $2 <= $3
         RETURNING spend_day`,
        [day, amount, cap],
      );
      return result.rowCount === 1
        ? { allowed: true as const, reservation: { day, amount, model } }
        : { allowed: false as const };
    },
    async record(reservation: { day: string; amount: number; model: string }, usage: {
      prompt_tokens: number; completion_tokens: number;
    }) {
      const price = config.prices[reservation.model];
      if (!price) throw new Error("No price configured for model.");
      const actual = tokensPrice(usage.prompt_tokens, usage.completion_tokens, price);
      await settleReservation(reservation, actual);
    },
    async recordReserved(reservation: { day: string; amount: number; model: string }) {
      await settleReservation(reservation, reservation.amount);
    },
    async release(reservation: { day: string; amount: number; model: string }) {
      const result = await pool.query(
        `UPDATE public_provider_spend
         SET reserved_micro_usd = reserved_micro_usd - $2
         WHERE spend_day = $1 AND reserved_micro_usd >= $2`,
        [reservation.day, reservation.amount],
      );
      if (result.rowCount !== 1) throw new Error("Provider spend reservation was not found.");
    },
  };
}

export function evidenceSpendConfig(env: NodeJS.ProcessEnv = process.env): SpendConfig {
  function positive(name: string, fallback: string) {
    const value = Number(env[name] ?? fallback);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${name}.`);
    return value;
  }
  return {
    capUsd: positive("AI_EVIDENCE_DAILY_CAP_USD", "5"),
    prices: {
      "gpt-4o-mini": {
        inputUsdPerMillion: positive("AI_EVIDENCE_INPUT_USD_PER_MILLION", "0.15"),
        outputUsdPerMillion: positive("AI_EVIDENCE_OUTPUT_USD_PER_MILLION", "0.60"),
      },
    },
  };
}