import type { Pool } from "pg";
import { releaseIdentity } from "./version.mjs";

export function normalizeResearchKey(value: string): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
  if (!normalized) throw new Error("Project name and location are required.");
  return normalized;
}

export function createResearchCacheStore(pool: Pick<Pool, "query">) {
  return {
    async put(projectName: string, location: string, result: unknown, researchDate: string,
      applicationVersion: string = releaseIdentity.applicationVersion) {
      const date = new Date(`${researchDate}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(researchDate)
        || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== researchDate
        || !applicationVersion.trim() || result === undefined) {
        throw new Error("Invalid research cache record.");
      }
      await pool.query(
        `INSERT INTO research_result_cache
           (project_key, location_key, result, research_date, application_version)
         VALUES ($1, $2, $3::jsonb, $4::date, $5)
         ON CONFLICT (project_key, location_key) DO UPDATE SET
           result = EXCLUDED.result, research_date = EXCLUDED.research_date,
           application_version = EXCLUDED.application_version, updated_at = now()`,
        [normalizeResearchKey(projectName), normalizeResearchKey(location), JSON.stringify(result),
          researchDate, applicationVersion],
      );
    },
    async get(projectName: string, location: string) {
      const { rows } = await pool.query<{
        result: unknown; research_date: Date | string; application_version: string;
      }>(
        `SELECT result, research_date, application_version FROM research_result_cache
         WHERE project_key = $1 AND location_key = $2`,
        [normalizeResearchKey(projectName), normalizeResearchKey(location)],
      );
      const row = rows[0];
      return row ? {
        result: row.result,
        researchDate: typeof row.research_date === "string"
          ? row.research_date.slice(0, 10) : row.research_date.toISOString().slice(0, 10),
        applicationVersion: row.application_version,
      } : null;
    },
  };
}