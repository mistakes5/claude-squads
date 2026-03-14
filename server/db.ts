import pg from "pg";

// Lazy pool — defers reading DATABASE_URL until the first query,
// so dotenv.config() has time to run before we check the env var.
let pool: pg.Pool | null = null;
let poolInitialized = false;

function getPool(): pg.Pool | null {
  if (!poolInitialized) {
    poolInitialized = true;
    const url = process.env.DATABASE_URL;
    if (url) {
      pool = new pg.Pool({ connectionString: url });
    }
  }
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  const p = getPool();
  if (!p) {
    throw new Error("DATABASE_URL not configured — database features unavailable");
  }
  return p.query(text, params);
}

export { pool };
