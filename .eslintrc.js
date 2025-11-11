module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
    },
  },
  env: {
    browser: true,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'plugin:@typescript-eslint/eslint-recommended',
    'prettier/@typescript-eslint',
    'prettier',
  ],
  rules: {
    'no-console': 'off',
    'no-useless-catch': 'off',
    'complexity': ['warn', { max: 10 }],
    'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
    'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
  },
}
