import { idColumn } from '../id.js';

// restaurant / home_cook: vendor types; rider: every rider
export const DOCUMENT_SUBJECTS = ['restaurant', 'home_cook', 'rider'];

export default (sequelize, DataTypes) =>
  sequelize.define(
    'RequiredDocument',
    {
      id: idColumn(),
      appliesTo: { type: DataTypes.ENUM(...DOCUMENT_SUBJECTS), allowNull: false },
      type: { type: DataTypes.STRING(40), allowNull: false },
      label: { type: DataTypes.STRING(120), allowNull: false },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'required_documents' },
  );
