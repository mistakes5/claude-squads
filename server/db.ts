import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

// Pool is lazy — only connects when a query is actually made
const pool = DATABASE_URL
  ? new pg.Pool({ connectionString: DATABASE_URL })
  : null;

export async function query(text: string, params?: unknown[]) {
  if (!pool) {
    throw new Error("DATABASE_URL not configured — database features unavailable");
  }
  return pool.query(text, params);
}

export { pool };
