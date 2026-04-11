import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    singleQuote: true,
    sortImports: {
      enabled: true,
    },
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    rules: {
      'no-unused-vars': ['warn', { fix: { imports: 'safe-fix', variables: 'off' } }],
    },
  },
});
