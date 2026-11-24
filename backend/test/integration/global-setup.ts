import { Client } from 'pg';
import { migrate } from '../../src/db/migrate';

/** Builds the test schema from the migrations once per run, on a database the tests own. */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgres://outlet_hq:outlet_hq@localhost:5432/outlet_hq_test';
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(
      `Refusing to run tests against "${url}": the database name must contain "test".`,
    );
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();
  await migrate(url);
}
