import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const VendorDocument = sequelize.define(
    'VendorDocument',
    {
      id: idColumn(),
      vendorId: { type: DataTypes.UUID, allowNull: false },
      type: { type: DataTypes.STRING(40), allowNull: false },
      label: { type: DataTypes.STRING(120), allowNull: false },
      uploadId: { type: DataTypes.UUID, allowNull: false },
    },
    { tableName: 'vendor_documents' },
  );

  return VendorDocument;
};
