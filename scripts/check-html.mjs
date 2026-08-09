// ---------------------------------------------------------------------------
// check-html.mjs — validación de sintaxis del JS inline de index.html.
//
// Reemplaza al viejo `node --check index.html`, que era imposible: un .html
// arranca con <!DOCTYPE y no es JavaScript, así que ese comando nunca validó
// nada.
//
// Qué hace: saca el contenido de cada <script> inline (ignora los que tienen
// src=, que son CDN), lo escribe a un temporal y lo parsea con `node --check`.
// El temporal se rellena con líneas en blanco hasta la posición real del bloque,
// así los errores salen con el número de línea de index.html, no del temporal.
//
// Correr con: node scripts/check-html.mjs
// Sale 0 si todo parsea, 1 si algo no.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const C = { g:'\x1b[32m', r:'\x1b[31m', d:'\x1b[2m', b:'\x1b[1m', x:'\x1b[0m' };

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const archivo = join(raiz, 'index.html');
const html = readFileSync(archivo, 'utf8');

// Bloques <script> con contenido propio. Los de CDN (src=) no tienen nada que
// parsear acá.
const bloques = [];
const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
let m;
while ((m = re.exec(html)) !== null) {
  const [todo, attrs, cuerpo] = m;
  if (/\bsrc\s*=/i.test(attrs)) continue;
  if (!cuerpo.trim()) continue;
  // línea (1-based) de la etiqueta <script> de apertura
  const lineaApertura = html.slice(0, m.index + todo.indexOf('>') + 1).split('\n').length;
  bloques.push({ cuerpo, lineaApertura });
}

if (!bloques.length) {
  console.error(`${C.r}✗${C.x} no encontré ningún <script> inline en index.html`);
  process.exit(1);
}

// .cjs fuerza el parseo como script clásico, igual que un <script> del browser,
// sin depender de si hay package.json ni de su "type". Un .mjs lo trataría como
// módulo ESM, que acepta cosas que el browser rechazaría (y al revés).
const temporal = join(tmpdir(), `check-html-${process.pid}.cjs`);
let fallo = false;

try {
  for (const [i, b] of bloques.entries()) {
    // El cuerpo capturado ya arranca con el salto de línea que cierra la
    // etiqueta de apertura, así que el relleno llega hasta la línea anterior.
    const relleno = '\n'.repeat(b.lineaApertura - 1);
    writeFileSync(temporal, relleno + b.cuerpo, 'utf8');
    const res = spawnSync(process.execPath, ['--check', temporal], { encoding: 'utf8' });
    const etiqueta = `<script> inline #${i + 1} ${C.d}(index.html línea ${b.lineaApertura})${C.x}`;
    if (res.status === 0) {
      console.log(`  ${C.g}✓${C.x} ${etiqueta}`);
    } else {
      fallo = true;
      console.log(`  ${C.r}✗${C.x} ${etiqueta}`);
      // node imprime la ruta del temporal; la cambiamos por index.html para que
      // el error se pueda abrir directo.
      process.stdout.write((res.stderr || '').split(temporal).join(archivo));
    }
  }
} finally {
  try { unlinkSync(temporal); } catch {}
}

console.log(`\n${C.b}check-html:${C.x} ${fallo ? C.r + 'SINTAXIS ROTA' : C.g + 'OK'}${C.x}\n`);
process.exit(fallo ? 1 : 0);
