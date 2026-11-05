import { DataTypes } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';

// Every primary and foreign key is a UUID in CHAR(36): generated rows get v7 (time-ordered, so
// inserts stay fast); the seeder uses fixed name-based UUIDs for its demo rows (seed/ids.js).
export const newId = () => uuidv7();

// Model attribute for `id`; a value passed on create (seed IDs) wins over the default
export const idColumn = () => ({
  type: DataTypes.UUID,
  primaryKey: true,
  allowNull: false,
  defaultValue: newId,
});
