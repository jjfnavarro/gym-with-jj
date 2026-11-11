import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['apps/api/src/server.ts', 'apps/api/src/owner.ts'],
  outdir: 'apps/api/dist',
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'shared-workspace',
      setup(build) {
        build.onResolve({ filter: /^@gym\/shared$/ }, () => ({
          path: fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)),
        }));
      },
    },
  ],
});
