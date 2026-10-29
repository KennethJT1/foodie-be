// Runs in every test file: release the DB pool and Redis connections so Jest can exit cleanly
import { afterAll } from '@jest/globals';
import { closeRedis } from '../../src/config/redis.js';
import { closeQueues } from '../../src/core/queue/index.js';
import { sequelize } from '../../src/db/index.js';
import { closeTestDb } from '../helpers/db.js';

afterAll(async () => {
  await closeQueues();
  await closeRedis();
  await sequelize.close();
  await closeTestDb();
});
