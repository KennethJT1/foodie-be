import { UniqueConstraintError, ValidationError as SequelizeValidationError } from 'sequelize';
import { AppError, ConflictError, ValidationError } from '../errors/index.js';

// Maps anything thrown in the app to an AppError the client may see
const normalise = (err) => {
  if (err instanceof AppError) return err;

  // Must come before SequelizeValidationError: it is a subclass of it
  if (err instanceof UniqueConstraintError) {
    const fieldErrors = Object.fromEntries(
      (err.errors ?? []).map((e) => [e.path, `This ${e.path} is already in use`]),
    );
    return new ConflictError('This already exists', fieldErrors);
  }

  if (err instanceof SequelizeValidationError) {
    const fieldErrors = Object.fromEntries((err.errors ?? []).map((e) => [e.path, e.message]));
    return new ValidationError(fieldErrors);
  }

  // body-parser errors: malformed JSON, payload too large...
  if (err.type && err.status >= 400 && err.status < 500) {
    const message = err.type === 'entity.parse.failed' ? 'The request body is not valid JSON' : err.message;
    return new AppError(message, { code: 'VALIDATION_ERROR', status: err.status });
  }

  return null;
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  const appError = normalise(err);

  if (!appError) {
    // Unknown error: log everything, tell the client nothing internal
    req.log?.error({ err }, 'Unhandled error');
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: 'Something went wrong', requestId: req.id },
    });
  }

  if (appError.status >= 500) req.log?.error({ err }, appError.message);

  const error = { code: appError.code, message: appError.message };
  if (appError.fieldErrors && Object.keys(appError.fieldErrors).length) error.fieldErrors = appError.fieldErrors;
  error.requestId = req.id;

  res.status(appError.status).json({ success: false, error });
};
