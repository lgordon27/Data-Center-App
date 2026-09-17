export interface ResearchExtractionLimits {
  maxInputBytes: number;
  maxPassageChars: number;
  maxIndexEntries: number;
  maxIndexEntryChars: number;
  maxCandidateLinks: number;
  maxMarkupChars: number;
  maxJsonNodes: number;
  maxPdfStreams: number;
  maxPdfInflatedBytes: number;
  maxOcrInputBytes: number;
  maxOcrPages: number;
  maxOcrOutputChars: number;
  ocrTimeoutMs: number;
}

export interface ResearchExtractionResult {
  extractionMethod: string;
  outcome: "extracted" | "empty" | "malformed" | "underlying-document" | "size-limit" | "unsupported";
  passage: string;
  index: string[];
  candidateLinks: string[];
  contentHash: string;
  limitations: string[];
  underlyingDocumentUrl: string | null;
}

export const RESEARCH_EXTRACTION_LIMITS: Readonly<ResearchExtractionLimits>;

export function extractResearchDocument(
  input: {
    bytes: Uint8Array | string;
    contentType?: string | null;
    sourceUrl?: string | null;
    format?: "html" | "text" | "json" | "xml" | "pdf";
  },
  options?: {
    format?: "html" | "text" | "json" | "xml" | "pdf";
    limits?: Partial<ResearchExtractionLimits>;
    ocrImpl?: (
      bytes: Uint8Array,
      options: { maxPages: number; maxOutputChars: number; signal: AbortSignal },
    ) => Promise<string | { text?: string }> | string | { text?: string };
  },
): Promise<ResearchExtractionResult>;