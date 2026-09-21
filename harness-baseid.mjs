// ---------------------------------------------------------------------------
// harness-baseid.mjs — pruebas en SECO de verificarBaseId (F0.3).
// Recorta el bloque BASEID-CORE de index.html y lo corre con document/_sb
// mockeados. No toca Supabase ni el navegador. Correr con: node harness-baseid.mjs
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, 'index.html'), 'utf8');

const startMark = '=== BASEID-CORE START ===';
const endMark   = '=== BASEID-CORE END ===';
const si = HTML.indexOf(startMark);
const ei = HTML.indexOf(endMark);
if (si < 0 || ei < 0) { console.error('No encontré los marcadores BASEID-CORE en index.html'); process.exit(1); }
const block = HTML.slice(HTML.indexOf('\n', si) + 1, HTML.lastIndexOf('\n', ei));

// --- mini framework de asserts ----------------------------------------------
let pass = 0, fail = 0;
const C = { g:'\x1b[32m', r:'\x1b[31m', y:'\x1b[33m', d:'\x1b[2m', b:'\x1b[1m', x:'\x1b[0m' };
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ${C.g}✓${C.x} ${msg}`); }
  else { fail++; console.log(`  ${C.r}✗ ${msg}${C.x}`); }
}
function eq(a, b, msg) { ok(a === b, `${msg} ${C.d}(esperado ${JSON.stringify(b)}, obtuve ${JSON.stringify(a)})${C.x}`); }
function head(t) { console.log(`\n${C.b}${t}${C.x}`); }

// --- mock de document --------------------------------------------------------
function makeDocument() {
  const els = {
    'baseid-aviso': { style:{ display:'' } },
    'baseid-aviso-txt': { textContent:'' },
    'ficha-id': { value:'' },
  };
  return { els, getElementById:(id)=>els[id] };
}

// --- mock de _sb: encadenable, resuelve con lo que le pasemos por fixture ----
function makeSb(fixtureData) {
  let neqCalled = false;
  const chain = {
    from:()=>chain, select:()=>chain, eq:()=>chain, is:()=>chain,
    neq:()=>{ neqCalled=true; return chain; },
    limit:()=>chain,
    maybeSingle: async ()=>({ data: fixtureData, error:null }),
  };
  return { sb: chain, wasNeqCalled:()=>neqCalled };
}

// --- eval del bloque extraído, inyectando document/_sb mockeados ------------
function run(val, { document, _sb, artId='' }) {
  document.els['ficha-id'].value = artId;
  const fn = new Function('document', '_sb', block + '\nreturn verificarBaseId;');
  const verificarBaseId = fn(document, _sb);
  return verificarBaseId(val);
}

// ===========================================================================
head('CASO — base_id que NO existe (F0.3: .single() → .maybeSingle())');
{
  const document = makeDocument();
  const { sb } = makeSb(null); // ninguna fila coincide
  let threw = false;
  try {
    await run('AMORT-CORSA-DEL-NUEVO', { document, _sb: sb });
  } catch (e) { threw = true; console.log(`  ${C.r}excepción:${C.x} ${e.message}`); }
  ok(!threw, 'no tira excepción/406 cuando no hay ninguna fila con ese base_id');
  eq(document.els['baseid-aviso'].style.display, 'none', 'el aviso queda oculto');
}

head('CASO — base_id que SÍ existe');
{
  const document = makeDocument();
  const dataFila = { id:5, codigo_articulo:'AMO-001', descripcion:'Amortiguador delantero' };
  const { sb } = makeSb(dataFila);
  await run('AMORT-CORSA-DEL', { document, _sb: sb });
  eq(document.els['baseid-aviso'].style.display, 'block', 'el aviso se muestra');
  ok(document.els['baseid-aviso-txt'].textContent.includes('AMO-001'), 'el texto del aviso menciona el código encontrado');
}

head('CASO — input vacío no consulta la base');
{
  const document = makeDocument();
  const { sb } = makeSb(null);
  let queried = false;
  const spySb = { from:()=>{ queried=true; return sb; } };
  await run('   ', { document, _sb: spySb });
  ok(!queried, 'con el input en blanco, no llega a armar la consulta');
  eq(document.els['baseid-aviso'].style.display, 'none', 'el aviso queda oculto');
}

// --- resumen final -----------------------------------------------------------
console.log(`\n${C.b}RESUMEN:${C.x} ${C.g}${pass} OK${C.x}` + (fail ? `, ${C.r}${fail} FALLARON${C.x}` : '') + '\n');
process.exit(fail ? 1 : 0);
