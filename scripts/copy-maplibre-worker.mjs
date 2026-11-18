// MapLibre 6 loads its web worker from a URL next to its own module, which bundlers rewrite.
// Copy the self-contained worker into apps/mobile/public so it's served at /maplibre-gl-worker.mjs.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/mobile/package.json'));
const src = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist/maplibre-gl-worker.mjs');
const dest = join(root, 'apps/mobile/public/maplibre-gl-worker.mjs');
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log('maplibre worker →', dest);
