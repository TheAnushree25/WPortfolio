import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  // Generated: Next's build and its types file, and the Cloudflare adapter's and Wrangler's output.
  { ignores: ['.next/**', 'node_modules/**', '.analysis/**', 'next-env.d.ts', '.open-next/**', '.wrangler/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];

export default eslintConfig;
