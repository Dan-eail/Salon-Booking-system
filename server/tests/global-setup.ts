import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/** Creates the test database if needed and applies migrations. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgresql://belle:belle_dev_password@localhost:5432/belle_test');
  const dbName = url.pathname.slice(1);
  const admin = new pg.Client({ connectionString: url.toString().replace(`/${dbName}`, '/postgres') });
  await admin.connect();
  const exists = await admin.query('select 1 from pg_database where datname = $1', [dbName]);
  if (!exists.rowCount) await admin.query(`create database "${dbName}"`);
  await admin.end();

  const pool = new pg.Pool({ connectionString: url.toString() });
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  await pool.end();
}
