// Shared model attribute helpers

/** DECIMAL comes back from MySQL as a string; this getter reads it as a number (null stays null). */
export const numberGetter = (name) =>
  function get() {
    const value = this.getDataValue(name);
    return value == null ? null : Number(value);
  };

/** Integer kobo in a BIGINT (mysql2 returns BIGINT as a string; read as a number). */
export const koboColumn = (DataTypes, name) => ({
  type: DataTypes.BIGINT,
  allowNull: false,
  defaultValue: 0,
  get() {
    return Number(this.getDataValue(name));
  },
});
