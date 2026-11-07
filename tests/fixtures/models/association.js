// Test-only associations for the widget fixtures
export const defineAssociations = ({ Widget, WidgetPart }) => {
  Widget.hasMany(WidgetPart, { as: 'parts', foreignKey: 'widgetId' });
  WidgetPart.belongsTo(Widget, { as: 'widget', foreignKey: 'widgetId' });
};
