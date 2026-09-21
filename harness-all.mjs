// ---------------------------------------------------------------------------
// harness-all.mjs — corre todos los harness-*.mjs y suma un PASS/FAIL total.
// Correr con: node harness-all.mjs
// ---------------------------------------------------------------------------
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const archivos = readdirSync(__dirname)
  .filter(f => /^harness-.+\.mjs$/.test(f) && f !== 'harness-all.mjs')
  .sort();

const C = { g:'\x1b[32m', r:'\x1b[31m', b:'\x1b[1m', x:'\x1b[0m' };
let algunoFallo = false;

for (const archivo of archivos) {
  console.log(`\n${C.b}=== ${archivo} ===${C.x}`);
  const res = spawnSync(process.execPath, [join(__dirname, archivo)], { stdio: 'inherit' });
  if (res.status !== 0) algunoFallo = true;
}

console.log(`\n${C.b}TOTAL:${C.x} ${algunoFallo ? C.r + 'ALGO FALLÓ' : C.g + 'TODO PASS'}${C.x}\n`);
process.exit(algunoFallo ? 1 : 0);
