// `npm run seed`: wipes every table and rebuilds the deterministic demo world
// (05-backend-handoff.md, section 8). Each phase adds its slice to SEED_STEPS.
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { connectDatabase, sequelize } from '../index.js';
import { truncateAllTables } from '../wipe.js';

// Run in order; each step is `async ({ sequelize, transaction }) => void`
const SEED_STEPS = [];

const run = async () => {
  // The demo world replaces real data; production gets its own reference-data seed (phase 22)
  if (env.NODE_ENV === 'production') throw new Error('Refusing to wipe and seed a production database');

  await connectDatabase();
  const wiped = await truncateAllTables(sequelize);
  logger.info(`Wiped ${wiped.length} tables in ${sequelize.config.database}`);

  await sequelize.transaction(async (transaction) => {
    for (const step of SEED_STEPS) {
      await step({ sequelize, transaction });
      logger.info(`Seeded ${step.name}`);
    }
  });
  logger.info(`Seed complete (${SEED_STEPS.length} steps)`);
};

run()
  .catch((err) => {
    logger.fatal({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
