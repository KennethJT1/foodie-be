import { idColumn } from '../../../src/db/id.js';

// Test-only model: a widget has many parts
export default (sequelize, DataTypes) => {
  const Widget = sequelize.define(
    'Widget',
    {
      id: idColumn(),
      name: { type: DataTypes.STRING(60), allowNull: false },
      status: { type: DataTypes.ENUM('draft', 'live'), allowNull: false, defaultValue: 'draft' },
      priceKobo: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'test_widgets', paranoid: true },
  );

  Widget.associate = (models) => {
    Widget.hasMany(models.WidgetPart, { as: 'parts', foreignKey: 'widgetId' });
  };
  return Widget;
};
