// ESM project: run through `node --experimental-vm-modules` (see the `test` script)
export default {
  testEnvironment: 'node',
  // Integration tests talk to MySQL; a remote/TLS database can take several seconds to connect
  testTimeout: 20_000,
  transform: {},
  roots: ['<rootDir>/tests'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/afterAll.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/db/seed/**'],
};
