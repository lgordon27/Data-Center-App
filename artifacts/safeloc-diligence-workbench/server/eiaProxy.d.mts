export function monthWindow(now?: Date, count?: number): { start: string; end: string };
export function selectMonthWindow<T extends { period: string }>(items: T[], count: number): T[];
export function aggregateFuelShares(records: Array<{ period: string; fuel: string; generationMwh: number }>): unknown[];
export function normalizeEiaUpstreamPayloads(payloads: unknown): unknown;
export function fetchEiaSnapshot(options?: unknown): Promise<unknown>;
export function handleEiaElectricityRequest(req: unknown, res: unknown): Promise<void>;