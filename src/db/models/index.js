import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DataTypes } from 'sequelize';
import { sequelize } from '../sequelize.js';

const MODELS_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Loads every `*.model.js` in `dir`. Each file default-exports `(sequelize, DataTypes) => Model`
 * and may set `Model.associate = (models) => { ... }`, called once all models are defined.
 */
export const loadModels = async (db, dir = MODELS_DIR) => {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.model.js')).sort();

  const models = {};
  for (const file of files) {
    const { default: define } = await import(pathToFileURL(path.join(dir, file)).href);
    const model = define(db, DataTypes);
    models[model.name] = model;
  }

  for (const model of Object.values(models)) model.associate?.(models);
  return models;
};

export const models = await loadModels(sequelize);
