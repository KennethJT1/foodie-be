import { idColumn } from '../../../src/db/id.js';

export default (sequelize, DataTypes) => {
  const WidgetPart = sequelize.define(
    'WidgetPart',
    {
      id: idColumn(),
      widgetId: { type: DataTypes.STRING(64), allowNull: false },
      label: { type: DataTypes.STRING(60), allowNull: false },
    },
    { tableName: 'test_widget_parts' },
  );

  WidgetPart.associate = (models) => {
    WidgetPart.belongsTo(models.Widget, { as: 'widget', foreignKey: 'widgetId' });
  };
  return WidgetPart;
};
