import { idColumn } from '../id.js';

export const ROLES = ['customer', 'vendor', 'rider', 'admin'];
export const USER_STATUSES = ['active', 'suspended', 'banned'];

export default (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: idColumn(),
      role: { type: DataTypes.ENUM(...ROLES), allowNull: false },
      adminRole: { type: DataTypes.STRING(32), allowNull: true },
      firstName: { type: DataTypes.STRING(60), allowNull: false },
      lastName: { type: DataTypes.STRING(60), allowNull: false },
      email: { type: DataTypes.STRING(191), allowNull: true, unique: true },
      phone: { type: DataTypes.STRING(20), allowNull: true, unique: true },
      passwordHash: { type: DataTypes.STRING(255), allowNull: true },
      googleId: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      avatarUrl: { type: DataTypes.STRING(500), allowNull: true },
      status: { type: DataTypes.ENUM(...USER_STATUSES), allowNull: false, defaultValue: 'active' },
      phoneVerifiedAt: { type: DataTypes.DATE(3), allowNull: true },
      emailVerifiedAt: { type: DataTypes.DATE(3), allowNull: true },
      lastLoginAt: { type: DataTypes.DATE(3), allowNull: true },
      name: {
        type: DataTypes.VIRTUAL,
        get() {
          return `${this.firstName} ${this.lastName}`.trim();
        },
      },
    },
    {
      tableName: 'users',
      paranoid: true,
      // Never hand the password hash to anything that serialises the model
      defaultScope: { attributes: { exclude: ['passwordHash'] } },
      scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
    },
  );

  return User;
};
