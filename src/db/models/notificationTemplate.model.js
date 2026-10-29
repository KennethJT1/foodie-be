export const TEMPLATE_CHANNELS = ['email', 'sms', 'inapp'];

export default (sequelize, DataTypes) =>
  sequelize.define(
    'NotificationTemplate',
    {
      key: { type: DataTypes.STRING(64), primaryKey: true },
      channel: { type: DataTypes.ENUM(...TEMPLATE_CHANNELS), allowNull: false },
      subject: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      body: { type: DataTypes.STRING(1000), allowNull: false },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'notification_templates' },
  );
