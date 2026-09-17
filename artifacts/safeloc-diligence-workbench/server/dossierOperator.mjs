import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const seedFile = path.join(root, "server", "dossiers.seed.json");

function sanitize(value, key = "") {
  if (/(secret|password|credential|token|session|raw.?provider|payload)/i.test(key)) return undefined;
  if (Array.isArray(value)) return value.map((item) => sanitize(item)).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k)]).filter(([, v]) => v !== undefined));
  }
  return value;
}
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (process.argv[2] === "import") {
      if (!process.argv.includes("--confirm-canonical-write")) {
        throw new Error("Import requires --confirm-canonical-write. This command is an operator-only canonical mutation.");
      }
      const inputPath = process.argv.find((argument, index) =>
        index > 2 && argument !== "--confirm-canonical-write" && argument !== "--",
      );
      const records = JSON.parse(await readFile(inputPath || seedFile, "utf8"));
      for (const record of records) {
        await pool.query(
          `INSERT INTO dossiers (slug, name, version, coverage_state, as_of_date, canonical_data)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, version=EXCLUDED.version,
           coverage_state=EXCLUDED.coverage_state, as_of_date=EXCLUDED.as_of_date,
           canonical_data=EXCLUDED.canonical_data, updated_at=now()`,
          [record.slug, record.name, record.version || "1", record.coverageState || "review", record.asOfDate || null, record.canonicalData],
        );
      }
      console.log(`Imported ${records.length} canonical dossiers.`);
    } else if (process.argv[2] === "export") {
      const result = await pool.query("SELECT slug, name, version, coverage_state AS \"coverageState\", as_of_date AS \"asOfDate\", canonical_data AS \"canonicalData\" FROM dossiers ORDER BY slug");
      const output = process.argv.find((argument, index) => index > 2 && argument !== "--")
        || "dossiers.export.json";
      await writeFile(output, JSON.stringify(sanitize(result.rows), null, 2) + "\n", { mode: 0o600 });
      console.log(`Exported ${result.rows.length} sanitized canonical dossiers.`);
    } else throw new Error("Usage: dossierOperator.mjs import [file] | export [file]");
  } finally {
    await pool.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });