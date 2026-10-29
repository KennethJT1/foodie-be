// Runs once before the whole test run: creates the test database if needed and migrates it.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import mysql from 'mysql2/promise';

const require = createRequire(import.meta.url);

export default async () => {
  process.env.NODE_ENV = 'test';
  // database.cjs loads .env and refuses a test database name that does not end in _test
  const { test: config } = require('../../src/config/database.cjs');

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    ssl: config.dialectOptions.ssl,
  });
  // Same collation as production (case- and accent-insensitive search). An old test database
  // with another default is dropped: it only ever holds test data.
  const [[existing]] = await connection.query(
    'SELECT DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [config.database],
  );
  if (existing && existing.collation !== 'utf8mb4_0900_ai_ci')
    await connection.query(`DROP DATABASE \`${config.database}\``);
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  await connection.end();

  execFileSync('npx', ['sequelize-cli', 'db:migrate'], {
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'pipe',
  });
};
