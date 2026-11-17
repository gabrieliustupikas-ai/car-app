// Copies packages/core/src into supabase/functions/_shared/core so Edge Functions (Deno) run the exact
// same validation/XP code as the app. Run after changing core: `npm run sync:core` (CI checks it's in sync).
import { cpSync, rmSync, mkdirSync, writeFileSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/core/src');
const dest = join(root, 'supabase/functions/_shared/core');
const check = process.argv.includes('--check');

function list(dir, base = dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === '__tests__') return [];
    return statSync(p).isDirectory() ? list(p, base) : [p.slice(base.length + 1)];
  });
}

if (check) {
  const a = list(src), b = list(dest).filter((f) => f !== 'README.md');
  const diff = a.length !== b.length || a.some((f) => readFileSync(join(src, f), 'utf8') !== readFileSync(join(dest, f), 'utf8'));
  if (diff) { console.error('supabase/functions/_shared/core is out of sync. Run: npm run sync:core'); process.exit(1); }
  console.log('core in sync');
} else {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, filter: (p) => !p.includes('__tests__') });
  writeFileSync(join(dest, 'README.md'), 'GENERATED from packages/core/src by `npm run sync:core`. Do not edit.\n');
  console.log('synced core →', dest);
}
