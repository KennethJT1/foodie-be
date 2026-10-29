import { Sequelize } from 'sequelize';
import dbConfig from '../config/database.cjs';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const config = dbConfig[env.NODE_ENV];

export const sequelize = new Sequelize(config.database, config.username, config.password, {
  ...config,
  logging: env.DB_LOGGING ? (sql) => logger.info(sql) : false,
  define: {
    ...config.define,
    // snake_case columns, camelCase attributes; created_at / updated_at on every table.
    // Models that must keep history on delete add `paranoid: true` themselves.
    underscored: true,
    timestamps: true,
    freezeTableName: false,
  },
});

export const connectDatabase = async () => {
  await sequelize.authenticate();
};
