// ---------------------------------------------------------------------------
// harness-config.mjs — pruebas en SECO de la normalización de la alícuota de
// IVA del negocio: _cfgParsePct (B5).
// Recorta el bloque CONFIG-CORE de index.html y lo corre contra la tabla de
// casos. No toca Supabase ni el navegador. Correr con: node harness-config.mjs
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, 'index.html'), 'utf8');

const startMark = '=== CONFIG-CORE START ===';
const endMark   = '=== CONFIG-CORE END ===';
const si = HTML.indexOf(startMark);
const ei = HTML.indexOf(endMark);
if (si < 0 || ei < 0) { console.error('No encontré los marcadores CONFIG-CORE en index.html'); process.exit(1); }
const block = HTML.slice(HTML.indexOf('\n', si) + 1, HTML.lastIndexOf('\n', ei));

let _cfgParsePct;
try { ({ _cfgParsePct } = new Function(block + '\nreturn {_cfgParsePct};')()); }
catch (e) { console.error('El bloque CONFIG-CORE no parsea/evalúa:', e.message); process.exit(1); }

// --- mini framework de asserts ----------------------------------------------
let pass = 0, fail = 0;
const C = { g:'\x1b[32m', r:'\x1b[31m', y:'\x1b[33m', d:'\x1b[2m', b:'\x1b[1m', x:'\x1b[0m' };
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ${C.g}✓${C.x} ${msg}`); }
  else { fail++; console.log(`  ${C.r}✗ ${msg}${C.x}`); }
}
function head(t) { console.log(`\n${C.b}${t}${C.x}`); }

// Object.is distingue 0 de -0 y no confunde null con 0 por coerción.
function caso(entrada, esperado, porque) {
  const obtuve = _cfgParsePct(entrada);
  ok(Object.is(obtuve, esperado),
     `${JSON.stringify(entrada)} → ${JSON.stringify(esperado)}  ${C.d}(obtuve ${JSON.stringify(obtuve)}) — ${porque}${C.x}`);
}

// ===========================================================================
// TABLA DE CASOS — B5: _cfgParsePct
// ===========================================================================
head('B5 — números válidos');
caso('21',    21,    'el caso normal: responsable inscripto al 21%');
caso('10,5',  10.5,  'coma decimal (teclado es-AR) → punto');
caso('21.5',  21.5,  'punto decimal, se respeta');
caso(' 21 ',  21,    'espacios alrededor, se recortan');
caso(21,      21,    'ya viene numérico (lo que devuelve Supabase)');

head('B5 — vacío e inválido → null (se guarda NULL explícito)');
caso('',      null,  'campo vacío: se guarda NULL, no se conserva el valor previo');
caso('   ',   null,  'solo espacios, es vacío igual');
caso('abc',   null,  'basura → null, NUNCA NaN (NaN rompe el insert)');
caso(null,    null,  'null entra, null sale');
caso(undefined, null,'undefined entra, null sale');

// ===========================================================================
// El caso que motiva la función: 0 es un valor LEGÍTIMO
// ===========================================================================
// Un exento factura al 0%. Si 0 cayera en la rama de "vacío" se guardaría NULL
// y el costeo de Fase 1 no tendría con qué distinguir "0% cobrado" de "sin dato".
// Number('') también es 0, que es justo la trampa a evitar.
head('B5 — 0 es válido, no es "vacío"');
caso('0',     0,     'exento: alícuota 0% explícita');
caso(0,       0,     'numérico 0, mismo caso');
ok(_cfgParsePct('0') !== null,  `_cfgParsePct('0') no es null  ${C.d}— 0 se guarda, no cae al default${C.x}`);
ok(_cfgParsePct('') === null,   `_cfgParsePct('') sí es null   ${C.d}— la distinción vacío/cero se sostiene${C.x}`);

// --- resumen final -----------------------------------------------------------
console.log(`\n${C.b}RESUMEN:${C.x} ${C.g}${pass} OK${C.x}` + (fail ? `, ${C.r}${fail} FALLARON${C.x}` : '') + '\n');
process.exit(fail ? 1 : 0);
