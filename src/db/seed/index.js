// `npm run seed`: wipes every table and rebuilds the deterministic demo world
// (05-backend-handoff.md, section 8). Each phase adds its slice to SEED_STEPS.
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { closeRedis } from '../../config/redis.js';
import { createSeededFaker } from '../../core/utils/random.js';
import { connectDatabase, sequelize } from '../index.js';
import { truncateAllTables } from '../wipe.js';
import { prepareMedia } from './media.js';
import { catalogue } from './steps/catalogue.js';
import { reference } from './steps/reference.js';
import { riders } from './steps/riders.js';
import { subscriptions } from './steps/subscriptions.js';
import { users } from './steps/users.js';
import { vendors } from './steps/vendors.js';

// Run in order; each step is `async ({ sequelize, transaction, faker, now }) => void`. They share
// one seeded Faker, so adding a step at the end never changes the data of the steps before it.
const SEED_STEPS = [reference, users, vendors, riders, subscriptions, catalogue];

const run = async () => {
  // The demo world replaces real data; production gets its own reference-data seed (phase 22)
  if (env.NODE_ENV === 'production') throw new Error('Refusing to wipe and seed a production database');

  await connectDatabase();
  // Photos first: downloads and uploads must not hold the seed transaction open
  await prepareMedia();
  const wiped = await truncateAllTables(sequelize);
  logger.info(`Wiped ${wiped.length} tables in ${sequelize.config.database}`);

  const faker = createSeededFaker();
  const now = Date.now();
  await sequelize.transaction(async (transaction) => {
    for (const step of SEED_STEPS) {
      await step({ sequelize, transaction, faker, now });
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
  // Steps clear Redis caches, so close Redis too or the process never exits
  .finally(() => Promise.all([sequelize.close(), closeRedis()]));
