import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env.js';
import * as schema from './schema.js';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  ssl: env.databaseUrl.includes('sslmode=') ? undefined : env.isProd ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error', err);
});

export const db = drizzle(pool, { schema });
export { schema };
