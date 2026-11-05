import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const RiderBankAccount = sequelize.define(
    'RiderBankAccount',
    {
      id: idColumn(),
      riderId: { type: DataTypes.UUID, allowNull: false, unique: true },
      bankCode: { type: DataTypes.STRING(20), allowNull: false },
      bankName: { type: DataTypes.STRING(120), allowNull: false },
      accountNumber: { type: DataTypes.STRING(10), allowNull: false },
      accountName: { type: DataTypes.STRING(120), allowNull: false },
    },
    { tableName: 'rider_bank_accounts' },
  );

  RiderBankAccount.associate = (models) => {
    RiderBankAccount.belongsTo(models.Rider, { as: 'rider', foreignKey: 'riderId' });
  };
  return RiderBankAccount;
};
