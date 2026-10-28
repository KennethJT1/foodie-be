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

module.exports = {
  development: base,
  test: base,
  production: { ...base, pool: { max: 20, min: 2, acquire: 30000, idle: 10000 } },
};
