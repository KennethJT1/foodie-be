import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const OPENAPI_DIR = path.resolve('docs/openapi');

/**
 * Builds one OpenAPI document from docs/openapi/: index.yaml holds info and
 * shared components; every other *.yaml (one per module) adds paths and components.
 */
export const loadOpenApiSpec = () => {
  const spec = parse(readFileSync(path.join(OPENAPI_DIR, 'index.yaml'), 'utf8'));
  spec.paths ??= {};
  spec.components ??= {};

  const moduleFiles = readdirSync(OPENAPI_DIR)
    .filter((file) => file.endsWith('.yaml') && file !== 'index.yaml')
    .sort();

  for (const file of moduleFiles) {
    const part = parse(readFileSync(path.join(OPENAPI_DIR, file), 'utf8')) ?? {};
    Object.assign(spec.paths, part.paths);
    for (const [section, entries] of Object.entries(part.components ?? {})) {
      spec.components[section] = { ...spec.components[section], ...entries };
    }
  }

  return spec;
};
