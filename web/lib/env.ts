import "server-only";
import { z } from "zod";

const Identifier = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

const Schema = z.object({
  DATABRICKS_HOST: z.string().url().optional(),
  DATABRICKS_TOKEN: z.string().min(10).optional(),
  DATABRICKS_WAREHOUSE_ID: z.string().regex(/^[A-Za-z0-9]+$/).optional(),
  CITIBIKE_SCHEMA: z.string().regex(Identifier, "CITIBIKE_SCHEMA must be catalog.schema").default("workspace.citibike"),
  DEMO_MODE: z.enum(["0", "1"]).default("0"),
  // Optional live forecasts from the team's area forecast collector (catalog.schema.table).
  WEATHER_FORECAST_TABLE: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/, "WEATHER_FORECAST_TABLE must be catalog.schema.table")
    .default("workspace.default.weather_forecast_history"),
});

export type ServerEnv = z.infer<typeof Schema> & { demo: boolean };

let cached: ServerEnv | null = null;

/** Validated server configuration. Throws a readable error when live mode is misconfigured. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = Schema.parse({
    DATABRICKS_HOST: process.env.DATABRICKS_HOST || undefined,
    DATABRICKS_TOKEN: process.env.DATABRICKS_TOKEN || undefined,
    DATABRICKS_WAREHOUSE_ID: process.env.DATABRICKS_WAREHOUSE_ID || undefined,
    CITIBIKE_SCHEMA: process.env.CITIBIKE_SCHEMA || undefined,
    DEMO_MODE: process.env.DEMO_MODE || undefined,
    WEATHER_FORECAST_TABLE: process.env.WEATHER_FORECAST_TABLE || undefined,
  });
  const demo = parsed.DEMO_MODE === "1";
  if (!demo && (!parsed.DATABRICKS_HOST || !parsed.DATABRICKS_TOKEN || !parsed.DATABRICKS_WAREHOUSE_ID)) {
    throw new ConfigError(
      "Databricks is not configured. Set DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_WAREHOUSE_ID, " +
        "or set DEMO_MODE=1 to serve synthetic data.",
    );
  }
  cached = { ...parsed, demo };
  return cached;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
