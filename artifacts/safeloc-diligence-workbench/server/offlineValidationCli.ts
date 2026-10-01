import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  adaptSavedOfflineRun,
  adaptSavedOfflineInput,
  createMatrixBaselineRun,
  formatOfflineChecklist,
  validateOfflineSavedRun,
  type OfflineValidationCase,
} from "./offlineDossierValidation.js";

const matrixPath = fileURLToPath(new URL("./fixtures/offline-validation-matrix.json", import.meta.url));

type MatrixFile = { schemaVersion: number; fixtureStatus: string; cases: OfflineValidationCase[] };

async function loadMatrix(): Promise<MatrixFile> {
  const matrix = JSON.parse(await readFile(matrixPath, "utf8")) as MatrixFile;
  if (
    matrix.schemaVersion !== 1 ||
    matrix.fixtureStatus !== "offline-validation-only" ||
    !Array.isArray(matrix.cases) ||
    matrix.cases.length !== 5
  ) {
    throw new Error("Offline validation matrix is malformed; expected exactly five offline-only cases.");
  }
  return matrix;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const format = option(args, "--format") ?? "text";
  if (format !== "text" && format !== "json") throw new Error("--format must be text or json.");
  const inputPath = option(args, "--input");
  const selectedCase = option(args, "--case");
  const matrix = await loadMatrix();

  if (inputPath) {
    const resolvedInput = path.resolve(process.cwd(), inputPath);
    const raw = JSON.parse(await readFile(resolvedInput, "utf8")) as unknown;
    const run = adaptSavedOfflineInput(raw);
    const testCase = selectedCase
      ? matrix.cases.find((candidate) => candidate.caseId === selectedCase)
      : matrix.cases.find((candidate) => candidate.project.projectReference === run.project.projectReference);
    if (selectedCase && !testCase) throw new Error(`Unknown matrix case: ${selectedCase}`);
    const report = validateOfflineSavedRun(run, testCase);
    if (format === "json") process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else process.stdout.write(`${formatOfflineChecklist(report)}\n`);
    if (report.findings.some((finding) => finding.status === "FAIL")) process.exitCode = 1;
    return;
  }

  if (selectedCase) throw new Error("--case is only valid with --input.");
  const reports = matrix.cases.map((testCase) => ({
    caseId: testCase.caseId,
    displayName: testCase.displayName,
    report: validateOfflineSavedRun(adaptSavedOfflineRun(createMatrixBaselineRun(testCase)), testCase),
  }));
  if (format === "json") {
    process.stdout.write(`${JSON.stringify({ matrixVersion: matrix.schemaVersion, reports }, null, 2)}\n`);
  } else {
    process.stdout.write(reports.map(({ report }) => formatOfflineChecklist(report)).join("\n\n---\n\n") + "\n");
  }
  if (reports.some(({ report }) => report.findings.some((finding) => finding.status === "FAIL"))) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Offline validation failed."}\n`);
    process.exitCode = 2;
  });
}