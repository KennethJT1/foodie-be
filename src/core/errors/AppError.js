import { ERROR_CODES } from './errorCodes.js';

export class AppError extends Error {
  /**
   * @param {string} message  safe to show to the client
   * @param {object} [options]
   * @param {keyof ERROR_CODES} [options.code]
   * @param {number} [options.status]  overrides the code's default status
   * @param {Record<string, string>} [options.fieldErrors]
   */
  constructor(message, { code = 'INTERNAL', status, fieldErrors } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = ERROR_CODES[code]?.code ?? code;
    this.status = status ?? ERROR_CODES[code]?.status ?? 500;
    this.fieldErrors = fieldErrors;
    this.isOperational = true;
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors, message = 'Some fields are invalid') {
    super(message, { code: 'VALIDATION_ERROR', fieldErrors });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'You need to log in') {
    super(message, { code: 'UNAUTHENTICATED' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do this') {
    super(message, { code: 'FORBIDDEN' });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, { code: 'NOT_FOUND' });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'This already exists', fieldErrors) {
    super(message, { code: 'CONFLICT', fieldErrors });
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests, please try again shortly') {
    super(message, { code: 'RATE_LIMITED' });
  }
}

export class SubscriptionInactiveError extends AppError {
  constructor(message = 'Your subscription is not active') {
    super(message, { code: 'SUBSCRIPTION_INACTIVE' });
  }
}

export class PaymentFailedError extends AppError {
  constructor(message = 'Payment failed') {
    super(message, { code: 'PAYMENT_FAILED' });
  }
}
