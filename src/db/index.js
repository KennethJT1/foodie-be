import { Sequelize } from 'sequelize';
import dbConfig from '../config/database.cjs';
import { env } from '../config/env.js';

const config = dbConfig[env.NODE_ENV];

export const sequelize = new Sequelize(config.database, config.username, config.password, {
  ...config,
  logging: env.DB_LOGGING ? console.log : false,
});

export const connectDatabase = async () => {
  await sequelize.authenticate();
};
