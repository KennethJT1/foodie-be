import { DataTypes } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';

// String primary keys (VARCHAR(64)): generated IDs are UUID v7 (time-ordered, so inserts stay
// fast); the seeder may set fixed IDs such as `usr_customer_ada` (handoff 8.2).
export const ID_LENGTH = 64;

export const newId = () => uuidv7();

// Model attribute for `id`; a value passed on create (seed IDs) wins over the default
export const idColumn = () => ({
  type: DataTypes.STRING(ID_LENGTH),
  primaryKey: true,
  allowNull: false,
  defaultValue: newId,
});
