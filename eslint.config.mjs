import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: [
      'lib/auth/**',
      'lib/packages/**',
      'lib/registration-links/**',
      'components/registration-links/**',
      'app/register/**',
      'lib/supabase/**',
      'app/login/**',
      'app/auth/**',
      'app/(app)/**',
      'middleware.ts',
    ],
    rules: { 'no-console': 'error' },
  },
  {
    files: [
      'components/**',
      'app/(app)/packages/PackagesManager.tsx',
      'app/login/LoginForm.tsx',
      'app/auth/recovery/RecoveryForm.tsx',
      'app/(dev)/showcase/ComponentDemos.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@supabase/*',
            '**/lib/supabase/admin',
            '@/lib/supabase/admin',
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    '.open-next/**',
    '.wrangler/**',
    'node_modules/**',
    'vendor/glisse/**',
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
  ]),
]);
