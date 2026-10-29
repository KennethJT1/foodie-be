import { describe, expect, it } from '@jest/globals';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ERROR_CODES,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  QuoteError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from '../../../src/core/errors/index.js';

describe('ERROR_CODES', () => {
  it('has every code the handoff lists, with its status', () => {
    const expected = {
      BAD_REQUEST: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      ACCOUNT_BANNED: 403,
      ACCOUNT_SUSPENDED: 403,
      NOT_FOUND: 404,
      ALREADY_SUBMITTED: 409,
      NOT_APPROVED: 409,
      TRIAL_USED: 409,
      SAME_PLAN: 409,
      DOWNGRADE_AT_RENEWAL: 409,
      PAYMENT_REQUIRED: 409,
      PLAN_LIMIT: 409,
      INVALID_STATUS: 409,
      OFFER_GONE: 409,
      CANNOT_CANCEL: 409,
      PAYLOAD_TOO_LARGE: 413,
      VALIDATION_ERROR: 422,
      VENDOR_PAUSED: 422,
      VENDOR_CLOSED: 422,
      OUT_OF_RANGE: 422,
      ITEM_UNAVAILABLE: 422,
      EMPTY_CART: 422,
      RATE_LIMITED: 429,
      INTERNAL_ERROR: 500,
    };
    for (const [code, status] of Object.entries(expected)) expect(ERROR_CODES[code]?.status).toBe(status);
  });

  it('drops the codes the contract does not use', () => {
    for (const code of ['INTERNAL', 'SUBSCRIPTION_INACTIVE', 'PAYMENT_FAILED'])
      expect(ERROR_CODES[code]).toBeUndefined();
  });

  it('gives every code a friendly sentence', () => {
    for (const { message } of Object.values(ERROR_CODES)) expect(message).toMatch(/^[A-Z].*[.!?]$/);
  });
});

describe('AppError', () => {
  it('uses the code default message and status', () => {
    const err = new AppError('NOT_FOUND');
    expect(err).toMatchObject({ code: 'NOT_FOUND', status: 404, message: ERROR_CODES.NOT_FOUND.message });
  });

  it('accepts a message and a status override', () => {
    const err = new AppError('INTERNAL_ERROR', 'Down for a moment.', { status: 503 });
    expect(err).toMatchObject({ code: 'INTERNAL_ERROR', status: 503, message: 'Down for a moment.' });
  });

  it('rejects unknown codes', () => {
    expect(() => new AppError('NOPE')).toThrow('Unknown error code: NOPE');
  });
});

describe('error classes', () => {
  it.each([
    [new BadRequestError(), 'BAD_REQUEST', 400],
    [new UnauthenticatedError(), 'UNAUTHENTICATED', 401],
    [new UnauthenticatedError('INVALID_CREDENTIALS'), 'INVALID_CREDENTIALS', 401],
    [new ForbiddenError(), 'FORBIDDEN', 403],
    [new ForbiddenError('ACCOUNT_BANNED'), 'ACCOUNT_BANNED', 403],
    [new ForbiddenError('ACCOUNT_SUSPENDED'), 'ACCOUNT_SUSPENDED', 403],
    [new NotFoundError(), 'NOT_FOUND', 404],
    [new ConflictError(), 'CONFLICT', 409],
    [new ConflictError('TRIAL_USED'), 'TRIAL_USED', 409],
    [new PayloadTooLargeError(), 'PAYLOAD_TOO_LARGE', 413],
    [new ValidationError({ email: 'Enter a valid email address' }), 'VALIDATION_ERROR', 422],
    [new QuoteError('OUT_OF_RANGE'), 'OUT_OF_RANGE', 422],
    [new RateLimitedError(), 'RATE_LIMITED', 429],
  ])('%p → %s %i', (err, code, status) => {
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(code);
    expect(err.status).toBe(status);
  });

  it('takes a specific code and message', () => {
    const err = new ConflictError('TRIAL_USED', 'You have already used your free trial.');
    expect(err.message).toBe('You have already used your free trial.');
  });

  it('keeps fieldErrors', () => {
    expect(new ConflictError('CONFLICT', undefined, { phone: 'Taken' }).fieldErrors).toEqual({ phone: 'Taken' });
    expect(new ValidationError({ 'address.line1': 'Required' }).fieldErrors).toEqual({ 'address.line1': 'Required' });
  });

  it('refuses a code from another status', () => {
    expect(() => new ConflictError('NOT_FOUND')).toThrow('NOT_FOUND is not a 409 error code');
    expect(() => new ForbiddenError('UNAUTHENTICATED')).toThrow();
    expect(() => new QuoteError('VALIDATION_ERROR')).toThrow();
  });
});
