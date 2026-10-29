import { sequelize } from '../../src/db/index.js';
import { truncateAllTables } from '../../src/db/wipe.js';

// Call in beforeEach / beforeAll of integration tests that write data
export const resetDatabase = () => truncateAllTables(sequelize);
