// Migration / seeder bookkeeping tables survive a wipe
const KEEP = ['sequelize_meta', 'sequelize_seeds'];

/**
 * Empties every table in the connected database (schema stays). Used by `npm run seed`
 * and by the test reset helper. Foreign key checks are off on the same connection only.
 * DELETE rather than TRUNCATE: TRUNCATE is DDL (slow on TiDB, implicit commit on MySQL) and
 * buys nothing here, since IDs are strings and demo tables are small.
 */
export const truncateAllTables = async (sequelize) => {
  const [rows] = await sequelize.query(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME NOT IN (:keep)`,
    { replacements: { keep: KEEP } },
  );
  if (!rows.length) return [];

  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
    for (const { name } of rows) await sequelize.query(`DELETE FROM \`${name}\``, { transaction });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
  });
  return rows.map((row) => row.name);
};
