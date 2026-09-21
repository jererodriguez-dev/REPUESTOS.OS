// ---------------------------------------------------------------------------
// harness-precios.mjs — pruebas en SECO de las funciones puras del importador
// de precios: _impParsePrecio (F0.6) y _impVariacion (T2).
// Recorta el bloque PRECIOS-CORE de index.html y lo corre contra la tabla de
// casos. No toca Supabase ni el navegador. Correr con: node harness-precios.mjs
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, 'index.html'), 'utf8');

const startMark = '=== PRECIOS-CORE START ===';
const endMark   = '=== PRECIOS-CORE END ===';
const si = HTML.indexOf(startMark);
const ei = HTML.indexOf(endMark);
if (si < 0 || ei < 0) { console.error('No encontré los marcadores PRECIOS-CORE en index.html'); process.exit(1); }
const block = HTML.slice(HTML.indexOf('\n', si) + 1, HTML.lastIndexOf('\n', ei));

let _impParsePrecio, _impVariacion;
try { ({ _impParsePrecio, _impVariacion } = new Function(block + '\nreturn {_impParsePrecio,_impVariacion};')()); }
catch (e) { console.error('El bloque PRECIOS-CORE no parsea/evalúa:', e.message); process.exit(1); }

// --- mini framework de asserts ----------------------------------------------
let pass = 0, fail = 0;
const C = { g:'\x1b[32m', r:'\x1b[31m', y:'\x1b[33m', d:'\x1b[2m', b:'\x1b[1m', x:'\x1b[0m' };
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ${C.g}✓${C.x} ${msg}`); }
  else { fail++; console.log(`  ${C.r}✗ ${msg}${C.x}`); }
}
function head(t) { console.log(`\n${C.b}${t}${C.x}`); }

// compara contemplando NaN (NaN === NaN es false)
function caso(entrada, esperado, porque) {
  const obtuve = _impParsePrecio(entrada);
  const igual = Number.isNaN(esperado) ? Number.isNaN(obtuve) : obtuve === esperado;
  ok(igual, `${JSON.stringify(entrada)} → ${esperado}  ${C.d}(obtuve ${obtuve}) — ${porque}${C.x}`);
}

// ===========================================================================
// TABLA DE CASOS — F0.6: punto de miles sin coma decimal
// ===========================================================================
head('F0.6 — miles con punto y SIN coma decimal (el bug: "65.900" leía 65,9)');
caso('65.900',    65900,    'el bug original');
caso('69.800',    69800,    'el bug original');
caso('1.234.567', 1234567,  'dos puntos de miles');

head('NO romper: el punto como separador DECIMAL se respeta');
caso('77250.5',   77250.5,  'punto decimal, NO tocar');
caso('65.90',     65.9,     '2 decimales, no matchea el regex de miles');

head('NO romper: las ramas viejas (coma decimal / formato yanqui)');
caso('72.300,50', 72300.5,  'miles + coma decimal (rama vieja)');
caso('1,234.56',  1234.56,  'formato yanqui (rama vieja)');

head('Limpieza de símbolos y bordes');
caso('$ 65.900',  65900,    'limpieza de símbolos + miles');
caso('65900',     65900,    'sin separadores');
caso('',          NaN,      'basura → NaN (la preview la marca en rojo)');

// ===========================================================================
// TABLA DE CASOS — T2: la columna VAR. no puede cantar 0,0% en un alta
// ===========================================================================
// Sin precio actual no hay variación: es un alta de precio inicial. Si se
// presenta como 0,0%, el filtro antierrores (Nivel A #10) nunca la va a frenar.
function casoAlta(actual, nuevo, porque) {
  const v = _impVariacion(actual, nuevo);
  ok(v.alta === true && v.texto === 'ALTA' && v.color === 'var(--info)',
     `(${JSON.stringify(actual)}, ${nuevo}) → ALTA  ${C.d}(obtuve ${JSON.stringify(v.texto)}) — ${porque}${C.x}`);
}
function casoPct(actual, nuevo, texto, color, porque) {
  const v = _impVariacion(actual, nuevo);
  ok(v.alta === false && v.texto === texto && v.color === color,
     `(${actual}, ${nuevo}) → ${texto}  ${C.d}(obtuve ${JSON.stringify(v.texto)}) — ${porque}${C.x}`);
}

head('T2 — sin precio actual: es un ALTA, no un 0,0%');
casoAlta(0,    65900, 'actual 0: el bug (el ternario viejo devolvía 0)');
casoAlta(null, 65900, 'actual null: artículo sin precio cargado');

head('T2 — NO romper: con precio actual > 0 se calcula igual que antes');
casoPct(50000, 65900, '+31.8%', 'var(--danger)',  'sube → rojo, con signo +');
casoPct(65900, 50000, '-24.1%', 'var(--success)', 'baja → verde');
casoPct(65900, 65900, '0.0%',   'var(--text3)',   'sin cambio → gris, sin signo');

// --- resumen final -----------------------------------------------------------
console.log(`\n${C.b}RESUMEN:${C.x} ${C.g}${pass} OK${C.x}` + (fail ? `, ${C.r}${fail} FALLARON${C.x}` : '') + '\n');
process.exit(fail ? 1 : 0);
