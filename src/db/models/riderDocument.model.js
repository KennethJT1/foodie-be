import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const RiderDocument = sequelize.define(
    'RiderDocument',
    {
      id: idColumn(),
      riderId: { type: DataTypes.UUID, allowNull: false },
      type: { type: DataTypes.STRING(40), allowNull: false },
      label: { type: DataTypes.STRING(120), allowNull: false },
      uploadId: { type: DataTypes.UUID, allowNull: false },
    },
    { tableName: 'rider_documents' },
  );

  RiderDocument.associate = (models) => {
    RiderDocument.belongsTo(models.Rider, { as: 'rider', foreignKey: 'riderId' });
    RiderDocument.belongsTo(models.Upload, { as: 'upload', foreignKey: 'uploadId' });
  };
  return RiderDocument;
};
