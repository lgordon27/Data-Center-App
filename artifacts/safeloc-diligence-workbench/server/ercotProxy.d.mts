export type ErcotProxyResult = {
  status: "live" | "cached" | "error";
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  data: Record<string, unknown> | null;
  diagnostics: Record<string, unknown>;
};

export function handleErcotQueueRequest(req: unknown, res: unknown): Promise<void>;