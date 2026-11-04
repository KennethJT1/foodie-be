import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const VendorDocument = sequelize.define(
    'VendorDocument',
    {
      id: idColumn(),
      vendorId: { type: DataTypes.STRING(64), allowNull: false },
      type: { type: DataTypes.STRING(40), allowNull: false },
      label: { type: DataTypes.STRING(120), allowNull: false },
      uploadId: { type: DataTypes.STRING(64), allowNull: false },
    },
    { tableName: 'vendor_documents' },
  );

  VendorDocument.associate = (models) => {
    VendorDocument.belongsTo(models.Vendor, { as: 'vendor', foreignKey: 'vendorId' });
    VendorDocument.belongsTo(models.Upload, { as: 'upload', foreignKey: 'uploadId' });
  };
  return VendorDocument;
};
