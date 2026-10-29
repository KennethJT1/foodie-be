import { ERROR_CODES } from './errorCodes.js';

export class AppError extends Error {
  /**
   * @param {keyof ERROR_CODES} code  must be listed in ERROR_CODES
   * @param {string} [message]  shown to the user as-is; defaults to the code's friendly message
   * @param {object} [options]
   * @param {number} [options.status]  overrides the code's default status (e.g. 503 for readiness)
   * @param {Record<string, string>} [options.fieldErrors]  keys are dotted request field paths
   */
  constructor(code, message, { status, fieldErrors } = {}) {
    const definition = ERROR_CODES[code];
    // A typo in a code is a programming error: fail loudly instead of sending an unknown code
    if (!definition) throw new Error(`Unknown error code: ${code}`);

    super(message ?? definition.message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status ?? definition.status;
    this.fieldErrors = fieldErrors;
    this.isOperational = true;
  }
}

/** Throws if `code` belongs to a different HTTP status than the class it is used with. */
const codeFor = (code, status) => {
  if (ERROR_CODES[code]?.status !== status) throw new Error(`${code} is not a ${status} error code`);
  return code;
};

export class BadRequestError extends AppError {
  constructor(message) {
    super('BAD_REQUEST', message);
  }
}

// new UnauthenticatedError('INVALID_CREDENTIALS')
export class UnauthenticatedError extends AppError {
  constructor(code = 'UNAUTHENTICATED', message) {
    super(codeFor(code, 401), message);
  }
}

// new ForbiddenError('ACCOUNT_BANNED')
export class ForbiddenError extends AppError {
  constructor(code = 'FORBIDDEN', message) {
    super(codeFor(code, 403), message);
  }
}

export class NotFoundError extends AppError {
  constructor(message) {
    super('NOT_FOUND', message);
  }
}

// new ConflictError('TRIAL_USED', 'You have already used your free trial.')
export class ConflictError extends AppError {
  constructor(code = 'CONFLICT', message, fieldErrors) {
    super(codeFor(code, 409), message, { fieldErrors });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message) {
    super('PAYLOAD_TOO_LARGE', message);
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors, message) {
    super('VALIDATION_ERROR', message, { fieldErrors });
  }
}

// Checkout quote failures: new QuoteError('OUT_OF_RANGE')
export class QuoteError extends AppError {
  constructor(code, message) {
    if (code === 'VALIDATION_ERROR') throw new Error('Use ValidationError for field errors');
    super(codeFor(code, 422), message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message) {
    super('RATE_LIMITED', message);
  }
}
