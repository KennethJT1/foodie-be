// Error codes shared with the frontend mock API (Backend Architecture, section 5)
export const ERROR_CODES = {
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', status: 422 },
  UNAUTHENTICATED: { code: 'UNAUTHENTICATED', status: 401 },
  FORBIDDEN: { code: 'FORBIDDEN', status: 403 },
  NOT_FOUND: { code: 'NOT_FOUND', status: 404 },
  CONFLICT: { code: 'CONFLICT', status: 409 },
  RATE_LIMITED: { code: 'RATE_LIMITED', status: 429 },
  SUBSCRIPTION_INACTIVE: { code: 'SUBSCRIPTION_INACTIVE', status: 402 },
  PAYMENT_FAILED: { code: 'PAYMENT_FAILED', status: 402 },
  INTERNAL: { code: 'INTERNAL', status: 500 },
};
