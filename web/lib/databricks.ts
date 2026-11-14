import "server-only";
import { env } from "./env";

/**
 * Minimal client for the Databricks SQL Statement Execution API (2.0).
 * - Runs on the server only; the token never reaches the browser.
 * - Uses named parameters (:name) for every user-supplied value.
 * - Polls while a cold serverless warehouse starts, within a hard deadline.
 * - Follows result chunks and converts values using the result schema.
 */

type ParamType = "STRING" | "INT" | "BIGINT" | "DOUBLE" | "TIMESTAMP" | "BOOLEAN";
export interface SqlParam {
  name: string;
  value: string | number | boolean | null;
  type?: ParamType;
}

interface Column {
  name: string;
  type_name: string;
}
interface ResultChunk {
  data_array?: (string | null)[][];
  next_chunk_internal_link?: string;
}
interface StatementResponse {
  statement_id: string;
  status: { state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "CLOSED"; error?: { message?: string; error_code?: string } };
  manifest?: { schema?: { columns?: Column[] } };
  result?: ResultChunk;
}

export class DatabricksError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "DatabricksError";
  }
}

const DEADLINE_MS = 50_000; // stay inside a 60 s serverless function limit
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const { DATABRICKS_HOST, DATABRICKS_TOKEN } = env();
  const res = await fetch(`${DATABRICKS_HOST!.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${DATABRICKS_TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(35_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DatabricksError(`Databricks API ${res.status}: ${body.slice(0, 300)}`, String(res.status));
  }
  return res.json();
}

function convert(value: string | null, typeName: string): unknown {
  if (value === null) return null;
  switch (typeName) {
    case "INT": case "BIGINT": case "LONG": case "SHORT": case "BYTE":
    case "FLOAT": case "DOUBLE": case "DECIMAL":
      return Number(value);
    case "BOOLEAN":
      return value === "true";
    case "TIMESTAMP": case "TIMESTAMP_NTZ": {
      // API returns ISO-like text; normalise to ISO 8601 UTC.
      const iso = value.includes("T") ? value : value.replace(" ", "T");
      return /Z|[+-]\d\d:?\d\d$/.test(iso) ? new Date(iso).toISOString() : new Date(iso + "Z").toISOString();
    }
    default:
      return value;
  }
}

export async function query<T>(statement: string, parameters: SqlParam[] = []): Promise<T[]> {
  const { DATABRICKS_WAREHOUSE_ID } = env();
  const started = Date.now();
  let resp = (await call("/api/2.0/sql/statements/", {
    method: "POST",
    body: JSON.stringify({
      warehouse_id: DATABRICKS_WAREHOUSE_ID,
      statement,
      parameters: parameters.map((p) => ({ name: p.name, value: p.value === null ? null : String(p.value), type: p.type ?? "STRING" })),
      wait_timeout: "30s",
      on_wait_timeout: "CONTINUE",
      format: "JSON_ARRAY",
      disposition: "INLINE",
    }),
  })) as StatementResponse;

  while (resp.status.state === "PENDING" || resp.status.state === "RUNNING") {
    if (Date.now() - started > DEADLINE_MS) {
      await call(`/api/2.0/sql/statements/${resp.statement_id}/cancel`, { method: "POST" }).catch(() => undefined);
      throw new DatabricksError("Query timed out while the SQL warehouse was starting. Try again in a minute.", "TIMEOUT");
    }
    await sleep(1500);
    resp = (await call(`/api/2.0/sql/statements/${resp.statement_id}`)) as StatementResponse;
  }
  if (resp.status.state !== "SUCCEEDED") {
    throw new DatabricksError(resp.status.error?.message ?? `Statement ${resp.status.state}`, resp.status.error?.error_code);
  }

  const columns = resp.manifest?.schema?.columns ?? [];
  const rows: T[] = [];
  let chunk: ResultChunk | undefined = resp.result;
  while (chunk) {
    for (const r of chunk.data_array ?? []) {
      const obj: Record<string, unknown> = {};
      columns.forEach((c, i) => {
        obj[c.name] = convert(r[i] ?? null, c.type_name);
      });
      rows.push(obj as T);
    }
    chunk = chunk.next_chunk_internal_link ? ((await call(chunk.next_chunk_internal_link)) as ResultChunk) : undefined;
  }
  return rows;
}
