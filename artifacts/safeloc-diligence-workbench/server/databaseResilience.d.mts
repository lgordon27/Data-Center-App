import type { Pool, PoolClient } from "pg";
export const DATABASE_POOL_SETTINGS: Readonly<{ connectionTimeoutMillis: number; idleTimeoutMillis: number }>;
export function isDatabaseConnectionError(error: unknown): boolean;
export function logDatabaseConnectionError(error: unknown, scope?: string, logger?: Pick<Console, "warn">): void;
export function protectDatabaseClient<T extends PoolClient>(client: T, logger?: Pick<Console, "warn">): T;
export function protectDatabasePool<T extends Pool>(pool: T, logger?: Pick<Console, "warn">): T;
export function installDatabaseSafetyNet(target?: NodeJS.Process, logger?: Pick<Console, "warn" | "error">): () => void;
export function retryDatabaseConnectionOperation<T>(operation: () => Promise<T>): Promise<T>;
export function boundedAuditOperation<T>(operation: () => Promise<T>, timeoutMs?: number): Promise<T>;
