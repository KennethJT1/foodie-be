import { ValidationError } from '../errors/index.js';

// Turns Zod issues into { "items.0.price": "message" }, first message per field
export const toFieldErrors = (issues) => {
  const fieldErrors = {};
  for (const issue of issues) {
    const field = issue.path.length ? issue.path.join('.') : '_root';
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
};

/**
 * Parses req.body / req.query / req.params with Zod and replaces them with the
 * clean result (unknown fields stripped).
 * Usage: validate({ body: createSchema, params: idParam })
 */
export const validate = (schemas) => (req, res, next) => {
  const fieldErrors = {};

  for (const part of ['params', 'query', 'body']) {
    const schema = schemas[part];
    if (!schema) continue;

    const result = schema.safeParse(req[part] ?? {});
    if (result.success) {
      req[part] = result.data;
    } else {
      Object.assign(fieldErrors, toFieldErrors(result.error.issues));
    }
  }

  if (Object.keys(fieldErrors).length) return next(new ValidationError(fieldErrors));
  next();
};
