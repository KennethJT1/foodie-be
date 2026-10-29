// Runs in every test file: release the DB pool so Jest can exit cleanly
import { afterAll } from '@jest/globals';
import { sequelize } from '../../src/db/index.js';

afterAll(() => sequelize.close());
