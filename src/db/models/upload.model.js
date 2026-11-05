import { idColumn } from '../id.js';

export const UPLOAD_PURPOSES = [
  'food_photo',
  'vendor_logo',
  'vendor_cover',
  'vendor_document',
  'rider_document',
  'refund_photo',
  'avatar',
];

export default (sequelize, DataTypes) => {
  const Upload = sequelize.define(
    'Upload',
    {
      id: idColumn(),
      userId: { type: DataTypes.UUID, allowNull: false },
      purpose: { type: DataTypes.ENUM(...UPLOAD_PURPOSES), allowNull: false },
      publicId: { type: DataTypes.STRING(255), allowNull: false },
      resourceType: { type: DataTypes.ENUM('image', 'raw'), allowNull: false },
      isPrivate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      format: { type: DataTypes.STRING(8), allowNull: false },
      url: { type: DataTypes.STRING(768), allowNull: false },
      width: { type: DataTypes.INTEGER, allowNull: true },
      height: { type: DataTypes.INTEGER, allowNull: true },
      bytes: { type: DataTypes.INTEGER, allowNull: false },
    },
    { tableName: 'uploads' },
  );

  Upload.associate = (models) => {
    Upload.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  };
  return Upload;
};
