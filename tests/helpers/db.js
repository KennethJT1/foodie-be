import { createRequire } from 'node:module';
import mysql from 'mysql2/promise';
import { invalidateSettings } from '../../src/modules/settings/settings.service.js';

const require = createRequire(import.meta.url);
const { test: config } = require('../../src/config/database.cjs');

// Bookkeeping tables survive a reset, like truncateAllTables()
const KEEP = new Set(['sequelize_meta', 'sequelize_seeds']);

let connection;
let tables;

// A test-only connection that allows several statements per query, so a reset is one round trip
// (the test database may be remote). The app's own pool never enables multipleStatements.
const connect = async () => {
  connection ??= await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.dialectOptions.ssl,
    multipleStatements: true,
  });
  return connection;
};

/**
 * Empties every table (and drops caches built from them). Call in beforeEach / beforeAll of
 * integration tests that write data.
 */
export const resetDatabase = async () => {
  await invalidateSettings();
  const db = await connect();
  if (!tables) {
    const [rows] = await db.query(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
    );
    tables = rows.map((row) => row.name).filter((name) => !KEEP.has(name));
  }
  if (!tables.length) return;
  await db.query(
    [
      'SET FOREIGN_KEY_CHECKS = 0',
      ...tables.map((name) => `DELETE FROM \`${name}\``),
      'SET FOREIGN_KEY_CHECKS = 1',
    ].join(';'),
  );
};

export const closeTestDb = async () => {
  await connection?.end();
  connection = undefined;
  tables = undefined;
};
