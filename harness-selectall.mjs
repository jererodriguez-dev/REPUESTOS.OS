// ---------------------------------------------------------------------------
// harness-selectall.mjs — pruebas en SECO de _sbSelectAll (F0.4).
// Recorta el bloque SELECTALL-CORE de index.html y lo corre contra un
// buildQuery mockeado que simula > 1000 filas en Supabase. Cubre tanto el
// importador de catálogo como el de precios, que comparten este mismo helper.
// Correr con: node harness-selectall.mjs
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, 'index.html'), 'utf8');

const startMark = '=== SELECTALL-CORE START ===';
const endMark   = '=== SELECTALL-CORE END ===';
const si = HTML.indexOf(startMark);
const ei = HTML.indexOf(endMark);
if (si < 0 || ei < 0) { console.error('No encontré los marcadores SELECTALL-CORE en index.html'); process.exit(1); }
const block = HTML.slice(HTML.indexOf('\n', si) + 1, HTML.lastIndexOf('\n', ei));
const exports = '\nreturn _sbSelectAll;';
let _sbSelectAll;
try { _sbSelectAll = new Function(block + exports)(); }
catch (e) { console.error('El bloque SELECTALL-CORE no parsea/evalúa:', e.message); process.exit(1); }

// --- mini framework de asserts ----------------------------------------------
let pass = 0, fail = 0;
const C = { g:'\x1b[32m', r:'\x1b[31m', y:'\x1b[33m', d:'\x1b[2m', b:'\x1b[1m', x:'\x1b[0m' };
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ${C.g}✓${C.x} ${msg}`); }
  else { fail++; console.log(`  ${C.r}✗ ${msg}${C.x}`); }
}
function eq(a, b, msg) { ok(a === b, `${msg} ${C.d}(esperado ${JSON.stringify(b)}, obtuve ${JSON.stringify(a)})${C.x}`); }
function head(t) { console.log(`\n${C.b}${t}${C.x}`); }

// --- fixture: simula la tabla "articulos" con N filas, respondiendo a .range() como PostgREST ---
function makeFakeTabla(totalFilas) {
  const filas = Array.from({ length: totalFilas }, (_, i) => ({ id: i + 1, codigo_articulo: `ART-${i + 1}` }));
  let calls = 0;
  const buildQuery = () => {
    calls++;
    return {
      range: async (from, to) => ({ data: filas.slice(from, to + 1), error: null }),
    };
  };
  return { buildQuery, getCalls: () => calls };
}

// ===========================================================================
head('CASO — espejo del importador de catálogo/precios: > 1000 filas pagina completo');
{
  const { buildQuery, getCalls } = makeFakeTabla(2500);
  const { data, error } = await _sbSelectAll(buildQuery);
  eq(error, null, 'sin error');
  eq(data.length, 2500, 'trae las 2500 filas, no se corta en el tope de 1000 de PostgREST');
  eq(getCalls(), 3, 'pagina en 3 tandas de a 1000 (1000+1000+500)');
  eq(data[0].codigo_articulo, 'ART-1', 'la primera fila es la correcta');
  eq(data[2499].codigo_articulo, 'ART-2500', 'la última fila (de la 3ª página) también llega');
}

head('CASO — exactamente 1000 filas (borde del tope de PostgREST)');
{
  const { buildQuery, getCalls } = makeFakeTabla(1000);
  const { data } = await _sbSelectAll(buildQuery);
  eq(data.length, 1000, 'trae las 1000 filas');
  eq(getCalls(), 2, 'pide una 2ª página (vacía) para confirmar que no hay más, sin perder filas');
}

head('CASO — menos de 1000 filas: no pagina de más');
{
  const { buildQuery, getCalls } = makeFakeTabla(37);
  const { data } = await _sbSelectAll(buildQuery);
  eq(data.length, 37, 'trae las 37 filas');
  eq(getCalls(), 1, 'una sola tanda alcanza');
}

head('CASO — tabla vacía');
{
  const { buildQuery } = makeFakeTabla(0);
  const { data, error } = await _sbSelectAll(buildQuery);
  eq(error, null, 'sin error');
  eq(data.length, 0, 'devuelve lista vacía, no undefined ni null');
}

head('CASO — error en una página corta el resto y lo propaga');
{
  let calls = 0;
  const buildQuery = () => ({
    range: async () => {
      calls++;
      if (calls === 2) return { data: null, error: { message: 'boom' } };
      return { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null };
    },
  });
  const { data, error } = await _sbSelectAll(buildQuery);
  ok(error && error.message === 'boom', 'propaga el error de la página que falló');
  eq(data.length, 1000, 'conserva lo acumulado antes del error (1ª página)');
}

// --- resumen final -----------------------------------------------------------
console.log(`\n${C.b}RESUMEN:${C.x} ${C.g}${pass} OK${C.x}` + (fail ? `, ${C.r}${fail} FALLARON${C.x}` : '') + '\n');
process.exit(fail ? 1 : 0);
