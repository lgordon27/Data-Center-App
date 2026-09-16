export declare const releaseIdentity: {
  applicationVersion: string;
  releaseId: string;
  commitSha: string | null;
  sourceCommitSha: string | null;
  commitShaSource: string;
  commitShaMatchesSource: boolean | null;
  deploymentId: string | null;
  buildTimestamp: string;
};
export declare function handleVersionRequest(req: unknown, res: {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}): void;
export declare function handleReleaseDocumentRequest(req: unknown, res: {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}): void;