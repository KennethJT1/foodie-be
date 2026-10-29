// ESM project: run through `node --experimental-vm-modules` (see the `test` script)
export default {
  testEnvironment: 'node',
  // Integration tests talk to MySQL and Redis; against remote servers each query is ~0.5 s
  testTimeout: 60_000,
  transform: {},
  roots: ['<rootDir>/tests'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/afterAll.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/db/seed/**'],
};
