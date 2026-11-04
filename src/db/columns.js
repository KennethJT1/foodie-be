// Shared model attribute helpers

/** DECIMAL comes back from MySQL as a string; this getter reads it as a number (null stays null). */
export const numberGetter = (name) =>
  function get() {
    const value = this.getDataValue(name);
    return value == null ? null : Number(value);
  };
