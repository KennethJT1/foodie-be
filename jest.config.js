// ESM project: run through `node --experimental-vm-modules` (see the `test` script)
export default {
  testEnvironment: 'node',
  // Integration tests talk to MySQL and Redis; against remote servers each query is ~0.5 s, and the
  // checkout → dispatch → delivery flows make dozens of round trips per test. A test that runs out
  // of time leaves its queries running, which then also times out the shared afterAll.
  testTimeout: 180_000,
  transform: {},
  roots: ['<rootDir>/tests'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/afterAll.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/db/seed/**'],
};
