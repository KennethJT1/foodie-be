import { UniqueConstraintError, ValidationError as SequelizeValidationError } from 'sequelize';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ERROR_CODES,
  PayloadTooLargeError,
  ValidationError,
} from '../errors/index.js';

// Maps anything thrown in the app to an AppError the client may see
const normalise = (err) => {
  if (err instanceof AppError) return err;

  // Must come before SequelizeValidationError: it is a subclass of it.
  // Services should check uniqueness themselves with a specific message; this is the safety net.
  if (err instanceof UniqueConstraintError) {
    const fieldErrors = Object.fromEntries(
      (err.errors ?? []).map((e) => [e.path, `That ${e.path} is already in use. Try another one.`]),
    );
    return new ConflictError('CONFLICT', undefined, fieldErrors);
  }

  if (err instanceof SequelizeValidationError) {
    const fieldErrors = Object.fromEntries((err.errors ?? []).map((e) => [e.path, e.message]));
    return new ValidationError(fieldErrors);
  }

  // body-parser errors: malformed JSON, payload too large, unsupported encoding...
  if (err.type && err.status >= 400 && err.status < 500) {
    if (err.type === 'entity.too.large')
      return new PayloadTooLargeError('That request is too large. Try sending less data.');
    if (err.type === 'entity.parse.failed') return new BadRequestError("The request body isn't valid JSON.");
    return new BadRequestError();
  }

  return null;
};

export const errorHandler = (err, req, res, next) => {
  const appError = normalise(err);

  if (!appError) {
    // Unknown error: log everything, tell the client nothing internal
    req.log?.error({ err }, 'Unhandled error');
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: ERROR_CODES.INTERNAL_ERROR.message, requestId: req.id },
    });
  }

  if (appError.status >= 500) req.log?.error({ err }, appError.message);

  const error = { code: appError.code, message: appError.message };
  if (appError.fieldErrors && Object.keys(appError.fieldErrors).length) error.fieldErrors = appError.fieldErrors;
  error.requestId = req.id;

  res.status(appError.status).json({ success: false, error });
};
