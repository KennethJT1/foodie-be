// Shared by the app (src/db/index.js) and sequelize-cli (.sequelizerc).
// CommonJS because sequelize-cli loads its config with require().
require('dotenv').config({ quiet: true });

const base = {
  dialect: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  timezone: '+00:00', // store UTC; display in Africa/Lagos
  define: {
    underscored: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
  },
  dialectOptions: {
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: false,
    // Managed hosts (TiDB Cloud, PlanetScale, Aiven...) require TLS
    ...(process.env.DB_SSL === 'true' && {
      ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    }),
  },
  migrationStorageTableName: 'sequelize_meta',
  seederStorage: 'sequelize',
  seederStorageTableName: 'sequelize_seeds',
};

// Tests wipe tables between files, so they must never point at a real database
const testDatabase = process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`;
if (!testDatabase.endsWith('_test')) {
  throw new Error(`DB_NAME_TEST must end in "_test" (got "${testDatabase}")`);
}

// Tests may use another server (e.g. a local MySQL while dev points at a managed one): DB_TEST_*
const env = process.env;
const testServer = {
  ...(env.DB_TEST_HOST && { host: env.DB_TEST_HOST }),
  ...(env.DB_TEST_PORT && { port: Number(env.DB_TEST_PORT) }),
  ...(env.DB_TEST_USER && { username: env.DB_TEST_USER }),
  ...(env.DB_TEST_PASS !== undefined && { password: env.DB_TEST_PASS }),
};
const testSsl =
  env.DB_TEST_SSL === undefined
    ? base.dialectOptions.ssl
    : env.DB_TEST_SSL === 'true'
      ? { minVersion: 'TLSv1.2', rejectUnauthorized: true }
      : undefined;

module.exports = {
  development: base,
  test: { ...base, ...testServer, database: testDatabase, dialectOptions: { ...base.dialectOptions, ssl: testSsl } },
  production: { ...base, pool: { max: 20, min: 2, acquire: 30000, idle: 10000 } },
};
