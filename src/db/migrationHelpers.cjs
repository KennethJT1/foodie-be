// Shared column definitions for migrations (CommonJS: sequelize-cli loads migrations with require()).
// Kept outside migrations/ so sequelize-cli does not run it as a migration.
//
//   const { TABLE_OPTIONS, id, foreignId, timestamps } = require('../migrationHelpers.cjs');
//   await queryInterface.createTable('addresses', {
//     ...id(Sequelize),
//     user_id: foreignId(Sequelize, 'users', { onDelete: 'CASCADE' }),
//     ...timestamps(Sequelize),
//   }, TABLE_OPTIONS);

const ID_LENGTH = 64; // keep in step with src/db/id.js

// Pass to every createTable: case- and accent-insensitive search must not depend on the server default
const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' };

// String primary key: UUID v7 from the app, or a fixed seed ID
const id = (Sequelize) => ({
  id: { type: Sequelize.STRING(ID_LENGTH), primaryKey: true, allowNull: false },
});

// FK column; ON DELETE RESTRICT unless told otherwise (Database Schema, section 1)
const foreignId = (Sequelize, table, { allowNull = false, onDelete = 'RESTRICT' } = {}) => ({
  type: Sequelize.STRING(ID_LENGTH),
  allowNull,
  references: { model: table, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete,
});

// DATETIME(3) in UTC
const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE(3), allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3)') },
  updated_at: { type: Sequelize.DATE(3), allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3)') },
});

// For paranoid models (users, vendors, food items, comments); never on money tables
const softDelete = (Sequelize) => ({
  deleted_at: { type: Sequelize.DATE(3), allowNull: true },
});

// Integer kobo, never floats
const kobo = (Sequelize, { allowNull = false, defaultValue = 0 } = {}) => ({
  type: Sequelize.BIGINT,
  allowNull,
  ...(defaultValue !== undefined && { defaultValue }),
});

module.exports = { ID_LENGTH, TABLE_OPTIONS, id, foreignId, timestamps, softDelete, kobo };
