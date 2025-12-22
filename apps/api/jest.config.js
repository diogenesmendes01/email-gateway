module.exports = {
  preset: null,
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.spec.ts',
    '**/*.spec.ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      isolatedModules: true
    }]
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/main.ts',
    '!src/**/*.module.ts',
  ],
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^@email-gateway/(.*)$': '<rootDir>/../../packages/$1/src',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  extensionsToTreatAsEsm: [],
  globals: {},
  setupFilesAfterEnv: [],
  transformIgnorePatterns: [
    'node_modules'
  ]
};
