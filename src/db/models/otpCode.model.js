import { idColumn } from '../id.js';

export const OTP_PURPOSES = ['login', 'verify', 'reset', 'phone_change'];

export default (sequelize, DataTypes) =>
  sequelize.define(
    'OtpCode',
    {
      id: idColumn(),
      identifier: { type: DataTypes.STRING(191), allowNull: false },
      purpose: { type: DataTypes.ENUM(...OTP_PURPOSES), allowNull: false },
      codeHash: { type: DataTypes.CHAR(64), allowNull: false },
      attempts: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      expiresAt: { type: DataTypes.DATE(3), allowNull: false },
      consumedAt: { type: DataTypes.DATE(3), allowNull: true },
    },
    { tableName: 'otp_codes' },
  );
