// Runs before each test file's modules load (Jest setupFiles), so env.js sees these
process.env.NODE_ENV = 'test';
// Tests make many auth requests from one IP; rateLimit.test.js turns limits on explicitly
process.env.RATE_LIMITS = 'false';
// bcrypt cost 4 keeps password hashing fast in tests
process.env.BCRYPT_ROUNDS = '4';
