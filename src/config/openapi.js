import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

// The master API contract (agreed with the frontend); Swagger UI serves it as-is
const OPENAPI_FILE = path.resolve('docs/api/openapi.yaml');

export const loadOpenApiSpec = () => parse(readFileSync(OPENAPI_FILE, 'utf8'));
