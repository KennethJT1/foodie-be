// Error codes the frontend reacts to (05-backend-handoff.md, section 2 "Errors").
// `message` is the default text; it is shown to users as-is, so keep it friendly and plain.
// Default messages match the frontend mock API (foodie-fe src/mocks/utils/respond.js).
export const ERROR_CODES = {
  BAD_REQUEST: { status: 400, message: 'That request was not valid.' },

  UNAUTHENTICATED: { status: 401, message: 'Please log in to continue.' },
  INVALID_CREDENTIALS: { status: 401, message: 'That email or password is wrong. Try again or reset your password.' },

  FORBIDDEN: { status: 403, message: "You don't have access to do that." },
  ACCOUNT_BANNED: {
    status: 403,
    message: 'This account has been banned. Contact support if you think this is a mistake.',
  },
  ACCOUNT_SUSPENDED: { status: 403, message: 'This account is suspended for now. Contact support to find out more.' },

  NOT_FOUND: { status: 404, message: "We couldn't find that." },

  // Generic 409 (e.g. a phone number already registered); the specific ones below are preferred
  CONFLICT: { status: 409, message: 'That conflicts with something that already exists.' },
  ALREADY_SUBMITTED: { status: 409, message: 'This has already been submitted.' },
  NOT_APPROVED: { status: 409, message: "Your account hasn't been approved yet." },
  TRIAL_USED: { status: 409, message: 'You have already used your free trial.' },
  SAME_PLAN: { status: 409, message: "You're already on this plan." },
  DOWNGRADE_AT_RENEWAL: { status: 409, message: 'A smaller plan starts when your current plan renews.' },
  PAYMENT_REQUIRED: { status: 409, message: 'This change needs a payment. Continue to pay for the new plan.' },
  PLAN_LIMIT: { status: 409, message: "You've reached your plan's limit. Upgrade your plan to add more." },
  INVALID_STATUS: { status: 409, message: "This can't be done now. Refresh to see the latest status." },
  OFFER_GONE: { status: 409, message: 'This job has expired or another rider took it.' },
  CANNOT_CANCEL: { status: 409, message: "This order can't be cancelled now because the vendor has accepted it." },

  PAYLOAD_TOO_LARGE: { status: 413, message: 'That file is too large. Try a smaller one.' },

  VALIDATION_ERROR: { status: 422, message: 'Please check the highlighted fields.' },
  // Checkout quote failures
  VENDOR_PAUSED: { status: 422, message: "This store isn't taking orders right now." },
  VENDOR_CLOSED: { status: 422, message: 'This store is closed right now. Check its opening hours.' },
  OUT_OF_RANGE: { status: 422, message: "This store doesn't deliver to that address. Try another address." },
  ITEM_UNAVAILABLE: {
    status: 422,
    message: 'Some items in your cart are no longer available. Remove them to continue.',
  },
  EMPTY_CART: { status: 422, message: 'Your cart is empty. Add something to continue.' },

  RATE_LIMITED: { status: 429, message: 'Too many tries. Please wait a moment.' },

  INTERNAL_ERROR: { status: 500, message: 'Something went wrong on our side.' },
};
