// ---------------------------------------------------------------------------
// harness-cat.mjs — pruebas en SECO del importador de catálogo.
// Recorta el bloque CAT-CORE de index.html y corre sus funciones puras contra
// fixtures. No toca Supabase ni el navegador. Correr con:  node harness-cat.mjs
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, 'index.html'), 'utf8');

// --- 1) extraer el bloque CAT-CORE tal cual y evaluarlo en Node ---------------
const startMark = '=== CAT-CORE START ===';
const endMark   = '=== CAT-CORE END ===';
const si = HTML.indexOf(startMark);
const ei = HTML.indexOf(endMark);
if (si < 0 || ei < 0) { console.error('No encontré los marcadores CAT-CORE en index.html'); process.exit(1); }
// arranco DESPUÉS de la línea del marcador START (es un comentario) y corto en el marcador END
const block = HTML.slice(HTML.indexOf('\n', si) + 1, HTML.lastIndexOf('\n', ei));
const exports = '\nreturn {CAT_CAMPOS,_normTxt,_catAutodetect,_catAplKey,_esMotor,_catParseAplic,_catResolverRubro,_catHojaIgnorada,_catVWindow,_catPlanImport,_catBuildOperaciones,_catBuildLimpieza,_catPlanDeshacer,_catPuedeDeshacer,_catContarPorRubro};';
let core;
try { core = new Function(block + exports)(); }
catch (e) { console.error('El bloque CAT-CORE no parsea/evalúa:', e.message); process.exit(1); }
const { _catAutodetect, _catParseAplic, _catResolverRubro, _catHojaIgnorada, _catVWindow, _catPlanImport,
        _catBuildOperaciones, _catBuildLimpieza, _catPlanDeshacer, _catPuedeDeshacer, _catContarPorRubro } = core;

// --- mini framework de asserts ----------------------------------------------
let pass = 0, fail = 0;
const C = { g:'\x1b[32m', r:'\x1b[31m', y:'\x1b[33m', d:'\x1b[2m', b:'\x1b[1m', x:'\x1b[0m' };
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ${C.g}✓${C.x} ${msg}`); }
  else { fail++; console.log(`  ${C.r}✗ ${msg}${C.x}`); }
}
function eq(a, b, msg) { ok(a === b, `${msg} ${C.d}(esperado ${JSON.stringify(b)}, obtuve ${JSON.stringify(a)})${C.x}`); }
function head(t) { console.log(`\n${C.b}${t}${C.x}`); }

// --- simulación de "base de datos" para la idempotencia ----------------------
const makeDB = () => ({ articulos:[], aplicaciones:[], codToId:{}, nextId:1 });
const dbView = db => ({
  arts: db.articulos.map(a => ({ id:a.id, codigo_articulo:a.codigo_articulo })),
  apls: db.aplicaciones.map(a => ({ id_articulo:a.id_articulo, marca:a.marca, modelo:a.modelo, motor:a.motor })),
});
function aplicarSim(plan, db) {
  plan.articulos.insert.forEach(x => {
    const id = db.nextId++;
    db.articulos.push({ id, codigo_articulo:x.payload.codigo_articulo, descripcion:x.payload.descripcion });
    db.codToId[x.payload.codigo_articulo.toLowerCase()] = id;
  });
  plan.articulos.update.forEach(u => { const a = db.articulos.find(z => z.id === u.id); if (a) a.descripcion = u.payload.descripcion; });
  plan.aplicaciones.insert.forEach(a => {
    const id = db.codToId[a.codigo.toLowerCase()];
    db.aplicaciones.push({ id_articulo:id, marca:a.marca, modelo:a.modelo, motor:a.motor, anio_desde:a.anio_desde, anio_hasta:a.anio_hasta });
  });
}
const runPlan = (hojas, map, opts, db) => { const v = dbView(db); return _catPlanImport(hojas, map, opts, v.arts, v.apls); };

// --- helpers de impresión ----------------------------------------------------
function showMap(headers, map) {
  console.log(`  ${C.d}headers:${C.x} ${headers.join(' | ')}`);
  const usados = Object.entries(map).filter(([, v]) => v).map(([k, v]) => `${k}→${v}`);
  const ignorados = headers.filter(h => !Object.values(map).includes(h));
  console.log(`  ${C.d}detectó:${C.x} ${usados.join(', ')}`);
  console.log(`  ${C.d}ignora :${C.x} ${ignorados.length ? ignorados.join(', ') : '—'}`);
}
function showPlan(plan) {
  console.log(`  ${C.d}artículos:${C.x} ${plan.articulos.insert.length} INSERT, ${plan.articulos.update.length} UPDATE, ${plan.articulos.error.length} error`);
  plan.articulos.insert.forEach(x => console.log(`      ${C.g}+${C.x} ${x.payload.codigo_articulo}  stock=${x.payload.stock}  "${x.payload.descripcion}"`));
  plan.articulos.update.forEach(u => console.log(`      ${C.y}~${C.x} ${u.codigo}  "${u.payload.descripcion}"`));
  console.log(`  ${C.d}aplicaciones a insertar:${C.x} ${plan.aplicaciones.insert.length}`);
  plan.aplicaciones.insert.forEach(a => console.log(`      • ${a.codigo}: ${[a.marca, a.modelo, a.motor].filter(Boolean).join(' / ')}${a.anio_desde ? `  [${a.anio_desde}${a.anio_hasta ? '-' + a.anio_hasta : ''}]` : ''}`));
  if (plan.noParseados.length) {
    console.log(`  ${C.r}no parseados:${C.x} ${plan.noParseados.length}`);
    plan.noParseados.forEach(n => console.log(`      ${C.r}?${C.x} ${n.codigo}: "${n.segmento}"`));
  }
}

// ===========================================================================
// FIXTURE (a) — plantilla limpia (flujo feliz, columnas estructuradas, sep OFF)
// ===========================================================================
const fxA = {
  nombre: 'RULEMANES',
  headers: ['Código','Código barra','Descripción','Marca artículo','Marca aplicación','Modelo','Motor','Stock','Ubicación'],
  rows: [
    { 'Código':'RLM-6204','Código barra':'7891234560012','Descripción':'Ruleman rueda delantera','Marca artículo':'SKF','Marca aplicación':'Renault','Modelo':'Clio','Motor':'K7M','Stock':4,'Ubicación':'A-12' },
    { 'Código':'RLM-6204','Código barra':'7891234560012','Descripción':'Ruleman rueda delantera','Marca artículo':'SKF','Marca aplicación':'Renault','Modelo':'Kangoo','Motor':'K9K','Stock':4,'Ubicación':'A-12' },
    { 'Código':'RLM-6205','Código barra':'','Descripción':'Ruleman rueda trasera','Marca artículo':'SKF','Marca aplicación':'','Modelo':'','Motor':'K9K','Stock':2,'Ubicación':'B-03' },
    { 'Código':'RLM-6206','Código barra':'','Descripción':'Ruleman X','Marca artículo':'SKF','Marca aplicación':'Renault','Modelo':'','Motor':'K4M','Stock':1,'Ubicación':'C-01' },
  ],
};

head('FIXTURE (a) — plantilla limpia / columnas estructuradas / checkbox OFF');
{
  const map = _catAutodetect(fxA.headers);
  showMap(fxA.headers, map);
  const hojas = [{ nombre:fxA.nombre, rows:fxA.rows, rubroId:'r-rulemanes', rubroNombre:'RULEMANES' }];
  const plan = runPlan(hojas, map, { separarAplic:false }, makeDB());
  showPlan(plan);
  eq(map.stock, 'Stock', 'stock detecta la columna Stock');
  eq(map.marca_art, 'Marca artículo', 'marca artículo bien separada de marca aplicación');
  eq(map.marca_apl, 'Marca aplicación', 'marca aplicación detectada');
  eq(plan.articulos.insert.length, 3, '3 artículos nuevos (RLM-6204/6205/6206)');
  eq(plan.articulos.error.length, 0, 'código repetido (RLM-6204 x2) NO es error');
  eq(plan.aplicaciones.insert.length, 3, '3 aplicaciones (6204 x2 + 6206 x1; 6205 sin marca → sin app)');
  eq(plan.aplicaciones.insert.filter(a => a.codigo === 'RLM-6204').length, 2, 'RLM-6204 acumula 2 aplicaciones de 2 filas con el mismo código');
  const k4m = plan.aplicaciones.insert.find(a => a.codigo === 'RLM-6206');
  ok(k4m && k4m.modelo === null && k4m.motor === 'K4M', 'RLM-6206 → app con modelo NULL y motor K4M');
}

// ===========================================================================
// FIXTURE (b) — imita STOCK_JM_SUSPENSION: CANTIDAD vs STOCK, /// y columnas basura
// ===========================================================================
const fxB = {
  nombre: 'STOCK_JM_SUSPENSION',
  headers: ['CODIGO','DESCRIPCION','APLICACIONES','STOCK','CANTIDAD','SKF','DASSEN','TRW','NAKATA'],
  rows: [
    { CODIGO:'AMO-001', DESCRIPCION:'Amortiguador delantero', APLICACIONES:'RENAULT CLIO 2008-2014 /// RENAULT KANGOO K9K /// PEUGEOT 206 2010', STOCK:'En stock', CANTIDAD:2, SKF:'333831', DASSEN:'D-100', TRW:'JGS-1', NAKATA:'NK-9' },
    { CODIGO:'AMO-002', DESCRIPCION:'Amortiguador trasero', APLICACIONES:'VW GOL 1.6 /// K4M /// FIAT PALIO /// RENAULT K9K', STOCK:'En stock', CANTIDAD:6, SKF:'555', DASSEN:'D-200', TRW:'TRW-2', NAKATA:'NK-10' },
    { CODIGO:'AMO-003', DESCRIPCION:'Espiral delantero', APLICACIONES:'  ///  /// CHEVROLET CORSA', STOCK:'En stock', CANTIDAD:1, SKF:'', DASSEN:'', TRW:'', NAKATA:'' },
  ],
};

head('FIXTURE (b) — hoja real sintética / parser /// / checkbox ON');
let mapB, hojasB;
{
  mapB = _catAutodetect(fxB.headers);
  showMap(fxB.headers, mapB);
  hojasB = [{ nombre:fxB.nombre, rows:fxB.rows, rubroId:'r-amort', rubroNombre:'AMORTIGUADORES' }];
  const plan = runPlan(hojasB, mapB, { separarAplic:true }, makeDB());
  showPlan(plan);
  eq(mapB.stock, 'CANTIDAD', 'stock detecta CANTIDAD (no STOCK="En stock") [D3]');
  eq(mapB.aplic, 'APLICACIONES', 'columna Aplicaciones detectada');
  const basura = ['SKF','DASSEN','TRW','NAKATA'].filter(h => Object.values(mapB).includes(h));
  eq(basura.length, 0, 'columnas de marca cruzada (SKF/DASSEN/TRW/NAKATA) ignoradas');
  eq(plan.articulos.insert[0].payload.stock, 2, 'AMO-001 stock=2 desde CANTIDAD');
  eq(plan.aplicaciones.insert.length, 7, '7 aplicaciones parseadas (3 + 3 + 1)');
  eq(plan.noParseados.length, 1, '1 segmento no parseado ("K4M" motor suelto sin marca) [D2]');
  // casos puntuales del parser
  const a1 = plan.aplicaciones.insert.filter(a => a.codigo === 'AMO-001');
  ok(a1.some(a => a.marca === 'RENAULT' && a.modelo === 'CLIO' && a.anio_desde === 2008 && a.anio_hasta === 2014), 'rango de año 2008-2014');
  ok(a1.some(a => a.marca === 'PEUGEOT' && a.modelo === '206' && a.anio_desde === 2010 && a.anio_hasta === null), 'año suelto 2010; "206" queda como modelo (no motor)');
  ok(a1.some(a => a.marca === 'RENAULT' && a.modelo === 'KANGOO' && a.motor === 'K9K'), 'marca+modelo+motor (RENAULT KANGOO K9K)');
  const a2 = plan.aplicaciones.insert.filter(a => a.codigo === 'AMO-002');
  ok(a2.some(a => a.marca === 'RENAULT' && a.modelo === null && a.motor === 'K9K'), 'motor con marca y sin modelo (RENAULT K9K) → modelo NULL');
  ok(plan.noParseados.some(n => n.segmento === 'K4M'), 'el "K4M" suelto va a no-parseados, no se descarta en silencio');
}

// ===========================================================================
// FIXTURE (c) — ALIAS hoja→rubro
// ===========================================================================
head('FIXTURE (c) — alias hoja→rubro');
{
  const rubrosDB = [{ id:'r1', nombre:'AMORTIGUADORES' }, { id:'r2', nombre:'RULEMANES' }];
  const sinAlias = _catResolverRubro('AMORTIGUADORES V2', rubrosDB, []);
  ok(sinAlias === null, 'sin alias, "AMORTIGUADORES V2" no matchea (la UI pediría resolverlo)');
  const exacto = _catResolverRubro('amortiguadores', rubrosDB, []);
  ok(exacto && exacto.via === 'nombre' && exacto.rubroId === 'r1', 'match por nombre exacto (case/acentos-insensible)');
  const aliasDB = [{ id:1, alias_texto:'amortiguadores v2', rubro_id:'r1' }];
  const viaAlias = _catResolverRubro('AMORTIGUADORES V2', rubrosDB, aliasDB);
  ok(viaAlias && viaAlias.via === 'alias' && viaAlias.rubroId === 'r1', 'con alias guardado, "AMORTIGUADORES V2" → rubro AMORTIGUADORES');
  console.log(`  ${C.d}resuelto:${C.x} "AMORTIGUADORES V2" → ${viaAlias ? viaAlias.rubroNombre + ' (' + viaAlias.via + ')' : '—'}`);
}

// ===========================================================================
// HOJAS DE AYUDA — _catHojaIgnorada (las que arrancan con "_" no son datos)
// ===========================================================================
head('HOJAS DE AYUDA — _catHojaIgnorada');
{
  ok(_catHojaIgnorada('_INSTRUCCIONES') === true, '"_INSTRUCCIONES" se ignora');
  ok(_catHojaIgnorada(' _PLANTILLA') === true, '" _PLANTILLA" (espacio adelante) se ignora');
  ok(_catHojaIgnorada('RULEMANES') === false, '"RULEMANES" NO se ignora');
  ok(_catHojaIgnorada('RULEMANES_2026') === false, '"RULEMANES_2026" NO se ignora (el _ está en el medio)');
  ok(_catHojaIgnorada('') === false, 'nombre vacío NO se ignora (no rompe)');
  ok(_catHojaIgnorada(null) === false, 'null NO se ignora (no rompe)');
  ok(_catHojaIgnorada(undefined) === false, 'undefined NO se ignora (no rompe)');
}

head('HOJAS DE AYUDA — libro simulado de 3 hojas (mismo filtro que catLeerArchivo)');
{
  const libro = [
    { nombre:'_INSTRUCCIONES', rows:[{ A:'Cómo llenar la planilla' }] },
    { nombre:'RULEMANES',      rows:fxA.rows },
    { nombre:'DISCOS',         rows:[{ CODIGO:'DIS-1', DESCRIPCION:'Disco delantero' }] },
  ];
  // el filtro real de catLeerArchivo: se queda con las hojas con filas y no ignoradas
  const hojas = libro.filter(h => h.rows.length && !_catHojaIgnorada(h.nombre));
  const ignoradas = libro.filter(h => _catHojaIgnorada(h.nombre)).map(h => h.nombre);
  console.log(`  ${C.d}quedan  :${C.x} ${hojas.map(h => h.nombre).join(', ')}`);
  console.log(`  ${C.d}ignoradas:${C.x} ${ignoradas.join(', ') || '—'}`);
  eq(hojas.length, 2, 'de 3 hojas quedan 2 de datos');
  eq(hojas.map(h => h.nombre).join(','), 'RULEMANES,DISCOS', 'quedan RULEMANES y DISCOS, en orden');
  eq(ignoradas.join(','), '_INSTRUCCIONES', 'se reporta cuál se ignoró (para el toast)');
  ok(!hojas.some(h => h.nombre === '_INSTRUCCIONES'), '_INSTRUCCIONES no llega a pedir rubro');
}

// ===========================================================================
// FIXTURE (e) — filas con error → sección fija, fuera del conteo de válidas
// ===========================================================================
head('FIXTURE (e) — filas con error (código/descripción faltante)');
{
  const fxE = {
    nombre: 'CON_ERRORES',
    headers: ['CODIGO','DESCRIPCION','CANTIDAD'],
    rows: [
      { CODIGO:'', DESCRIPCION:'Fila sin código', CANTIDAD:1 },
      { CODIGO:'X-1', DESCRIPCION:'', CANTIDAD:2 },
      { CODIGO:'X-2', DESCRIPCION:'Artículo válido', CANTIDAD:3 },
    ],
  };
  const map = _catAutodetect(fxE.headers);
  const hojas = [{ nombre:fxE.nombre, rows:fxE.rows, rubroId:'r-x', rubroNombre:'X' }];
  const plan = runPlan(hojas, map, { separarAplic:false }, makeDB());
  console.log(`  ${C.d}errores:${C.x} ${plan.articulos.error.length}`);
  plan.articulos.error.forEach(e => console.log(`      ${C.r}✗${C.x} [${e.codigo || '—'}] "${e.desc || '—'}" — ${e.motivo} (${e.hoja})`));
  eq(plan.articulos.error.length, 2, '2 filas con error (sin código / sin descripción)');
  ok(plan.articulos.error.every(e => 'desc' in e && 'hoja' in e), 'cada error trae desc y hoja (para la sección fija)');
  ok(plan.articulos.error.some(e => e.motivo === 'falta código'), 'detecta "falta código"');
  ok(plan.articulos.error.some(e => e.motivo === 'falta descripción' && e.codigo === 'X-1'), 'detecta "falta descripción" con su código');
  eq(plan.preview[0].totalValidas, 1, 'totalValidas = 1 (solo X-2); los errores no cuentan');
  eq(plan.preview[0].filas.length, 1, 'filas renderizables = 1 (los errores no van al cuerpo)');
  eq(plan.articulos.insert.length, 1, 'solo se importa la fila válida');
}

// ===========================================================================
// PREVIEW AGRUPADO POR RUBRO — plan.preview (F1.0c-1)
// El bloque del preview es por RUBRO, no por hoja: dos hojas del mismo rubro
// se funden en un solo grupo, y el orden es el de primera aparición del rubro.
// ===========================================================================
const fxG = {
  headers: ['CODIGO','DESCRIPCION'],
  hoja: (nombre, codigos, rubroId, rubroNombre) => ({
    nombre, rubroId, rubroNombre,
    rows: codigos.map(c => ({ CODIGO:c, DESCRIPCION:'Pieza ' + c })),
  }),
};

head('PREVIEW POR RUBRO — dos hojas del MISMO rubro → un solo grupo');
{
  const map = _catAutodetect(fxG.headers);
  const opts = { separarAplic:false };
  // base con F-4 ya cargado → esa fila cae en "a actualizar", no en "nuevos"
  const conF4 = () => { const db = makeDB(); db.articulos.push({ id:99, codigo_articulo:'F-4' }); db.codToId['f-4'] = 99; db.nextId = 100; return db; };
  const hA = fxG.hoja('FRENOS DEL',  ['F-1','F-2'], 'r1', 'FRENOS');
  const hB = fxG.hoja('FRENOS TRAS', ['F-3','F-4'], 'r1', 'FRENOS');

  // referencia: cada hoja corrida SOLA (es lo que el preview mostraba antes del refactor)
  const soloA = runPlan([hA], map, opts, conF4()).preview[0];
  const soloB = runPlan([hB], map, opts, conF4()).preview[0];

  const plan = runPlan([hA, hB], map, opts, conF4());
  console.log(`  ${C.d}grupos:${C.x} ${plan.preview.map(g => `${g.rubro} [${g.hojas.join(' · ')}] ${g.nuevos}n/${g.upd}u/${g.filas.length}f`).join('  |  ')}`);
  eq(plan.preview.length, 1, 'dos hojas del mismo rubro → UN solo grupo');
  const g = plan.preview[0];
  eq(g.rubro, 'FRENOS', 'el grupo lleva el nombre del rubro');
  eq(g.rubroId, 'r1', 'el grupo lleva el rubroId');
  eq(g.hojas.length, 2, 'el grupo recuerda las 2 hojas que aportaron');
  eq(g.hojas.join(','), 'FRENOS DEL,FRENOS TRAS', 'las hojas quedan en orden de aparición');
  eq(g.nuevos, soloA.nuevos + soloB.nuevos, 'nuevos = suma de las dos hojas');
  eq(g.upd, soloA.upd + soloB.upd, 'a actualizar = suma de las dos hojas');
  eq(g.err, soloA.err + soloB.err, 'con error = suma de las dos hojas');
  eq(g.filas.length, soloA.filas.length + soloB.filas.length, 'filas = concatenación de las dos hojas');
  eq(g.totalValidas, g.filas.length, 'totalValidas = filas.length del grupo');
  eq(g.filas[0].codigo, 'F-1', 'la concatenación respeta el orden de recorrido');
  eq(g.filas[g.filas.length - 1].codigo, 'F-4', '…y la última fila es la última de la 2ª hoja');
  eq(g.upd, 1, 'F-4 (ya en la base) es el único "a actualizar"');
  eq(g.nuevos, 3, 'F-1, F-2 y F-3 son altas');
}

head('PREVIEW POR RUBRO — dos hojas con rubros DISTINTOS → un grupo cada una');
{
  const map = _catAutodetect(fxG.headers);
  const opts = { separarAplic:false };
  const hA = fxG.hoja('FRENOS',    ['F-1','F-2'], 'r1', 'FRENOS');
  const hB = fxG.hoja('RULEMANES', ['R-1'],       'r2', 'RULEMANES');

  const soloA = runPlan([hA], map, opts, makeDB()).preview[0];
  const soloB = runPlan([hB], map, opts, makeDB()).preview[0];

  const plan = runPlan([hA, hB], map, opts, makeDB());
  console.log(`  ${C.d}grupos:${C.x} ${plan.preview.map(g => `${g.rubro} [${g.hojas.join(' · ')}]`).join('  |  ')}`);
  eq(plan.preview.length, 2, 'dos rubros → dos grupos');
  eq(plan.preview[0].rubro, 'FRENOS', '1er grupo = FRENOS');
  eq(plan.preview[1].rubro, 'RULEMANES', '2º grupo = RULEMANES');
  ok(plan.preview.every(g => g.hojas.length === 1), 'cada grupo tiene exactamente una hoja');
  eq(plan.preview[0].nuevos, soloA.nuevos, 'los conteos del grupo FRENOS no cambian');
  eq(plan.preview[1].nuevos, soloB.nuevos, 'los conteos del grupo RULEMANES no cambian');
  eq(plan.preview[0].filas.length, soloA.filas.length, 'las filas de FRENOS no se mezclan con las de RULEMANES');
  eq(plan.preview[1].filas.length, soloB.filas.length, 'ni al revés');
  eq(plan.preview[0].totalValidas, 2, 'FRENOS: 2 filas válidas');
  eq(plan.preview[1].totalValidas, 1, 'RULEMANES: 1 fila válida');
}

head('PREVIEW POR RUBRO — una sola hoja (el caso de siempre) se ve igual que antes');
{
  const map = _catAutodetect(fxG.headers);
  const hojas = [fxG.hoja('RULEMANES', ['R-1','R-2','R-3'], 'r1', 'RULEMANES')];
  const plan = runPlan(hojas, map, { separarAplic:false }, makeDB());
  eq(plan.preview.length, 1, 'una hoja → un grupo');
  eq(plan.preview[0].hojas.length, 1, 'con una sola hoja adentro');
  eq(plan.preview[0].hojas[0], 'RULEMANES', 'y el nombre de esa hoja intacto (es lo que pinta el encabezado)');
  eq(plan.preview[0].totalValidas, 3, 'totalValidas = las 3 filas, igual que antes del refactor');
  eq(plan.preview[0].nuevos, 3, 'nuevos = 3, igual que antes del refactor');
}

head('PREVIEW POR RUBRO — el orden es el de PRIMERA APARICIÓN del rubro');
{
  const map = _catAutodetect(fxG.headers);
  const hojas = [
    fxG.hoja('A', ['A-1'], 'r2', 'RULEMANES'),
    fxG.hoja('B', ['B-1'], 'r1', 'FRENOS'),
  ];
  const plan = runPlan(hojas, map, { separarAplic:false }, makeDB());
  console.log(`  ${C.d}orden:${C.x} ${plan.preview.map(g => g.rubroId).join(' → ')}`);
  eq(plan.preview[0].rubroId, 'r2', 'la hoja A (rubro r2) aparece primero → su grupo va primero');
  eq(plan.preview[1].rubroId, 'r1', 'el rubro r1 va segundo aunque su id sea "menor"');
}

head('PREVIEW POR RUBRO — hoja sin rubro asignado no rompe el agrupado');
{
  const map = _catAutodetect(fxG.headers);
  const hojas = [fxG.hoja('SIN RUBRO', ['S-1'], null, null)];
  const plan = runPlan(hojas, map, { separarAplic:false }, makeDB());
  eq(plan.preview.length, 1, 'rubroId null → igual arma su grupo (clave interna __sin__)');
  eq(plan.preview[0].rubroId, null, 'el grupo conserva el rubroId null tal cual');
  eq(plan.preview[0].hojas[0], 'SIN RUBRO', 'y sigue sabiendo de qué hoja vino');
}

// ===========================================================================
// VENTANA DE VIRTUALIZACIÓN — _catVWindow (índices a renderizar según el scroll)
// ===========================================================================
head('VIRTUALIZACIÓN — _catVWindow (windowing del cuerpo del preview)');
{
  const rowH = 44, colsH = 30, vh = 460, over = 6, total = 100000;
  const visibles = Math.ceil((vh - colsH) / rowH);   // filas que entran en el viewport (~10)

  let w = _catVWindow(0, vh, rowH, colsH, total, over);
  eq(w.start, 0, 'scroll 0 → start 0');
  ok(w.end >= visibles && w.end <= visibles + over + 1, `scroll 0 → end cubre viewport + overscan (end=${w.end})`);
  ok(w.end < total, 'scroll 0 → NO renderiza las 100.000 filas');

  const midScroll = 50000 * rowH;
  w = _catVWindow(midScroll, vh, rowH, colsH, total, over);
  const expFirst = Math.floor((midScroll - colsH) / rowH);
  ok(w.start <= expFirst && w.start >= expFirst - over, `medio → start arranca cerca del primer índice visible (start=${w.start})`);
  ok(w.end - w.start < 40, `medio → ventana chica, no el total (${w.end - w.start} filas)`);

  w = _catVWindow(total * rowH, vh, rowH, colsH, total, over);
  eq(w.end, total, 'fondo → end clampea al total (no se pasa)');
  ok(w.start > total - 40 && w.start < total, `fondo → start cerca del final (start=${w.start})`);

  w = _catVWindow(0, vh, rowH, colsH, 3, over);
  eq(w.start, 0, 'pocos ítems → start 0');
  eq(w.end, 3, 'pocos ítems → end = total (3), sin pasarse');
}

// ===========================================================================
// PRUEBA DE DOBLE IMPORTACIÓN — idempotencia (conteos Y descripción)
// ===========================================================================
function dobleImportacion(titulo, hojas, map, opts) {
  head(titulo);
  const db = makeDB();
  const p1 = runPlan(hojas, map, opts, db); aplicarSim(p1, db);
  const arts1 = db.articulos.length, apls1 = db.aplicaciones.length;
  const desc1 = Object.fromEntries(db.articulos.map(a => [a.codigo_articulo, a.descripcion]));
  console.log(`  ${C.d}1ª corrida:${C.x} ${p1.articulos.insert.length} altas, ${p1.aplicaciones.insert.length} apps  →  base: ${arts1} artículos / ${apls1} aplicaciones`);
  const p2 = runPlan(hojas, map, opts, db); aplicarSim(p2, db);
  console.log(`  ${C.d}2ª corrida:${C.x} ${p2.articulos.insert.length} altas, ${p2.aplicaciones.insert.length} apps, ${p2.articulos.update.length} updates  →  base: ${db.articulos.length} artículos / ${db.aplicaciones.length} aplicaciones`);
  eq(p2.articulos.insert.length, 0, 'segunda corrida: 0 artículos nuevos');
  eq(p2.aplicaciones.insert.length, 0, 'segunda corrida: 0 aplicaciones nuevas');
  // el resumen que ve el usuario en el preview: "0 nuevos · N a actualizar" (N = los que ya estaban)
  eq(p2.resumen.nuevos, 0, 'resumen 2ª corrida: 0 nuevos');
  eq(p2.resumen.upd, arts1, `resumen 2ª corrida: ${arts1} a actualizar (todos los existentes)`);
  eq(db.articulos.length, arts1, 'el conteo de artículos NO crece');
  eq(db.aplicaciones.length, apls1, 'el conteo de aplicaciones NO crece');
  const descOK = db.articulos.every(a => a.descripcion === desc1[a.codigo_articulo]);
  ok(descOK, 'la descripción NO crece ni repite el choricito en la 2ª pasada');
  if (!descOK) db.articulos.forEach(a => { if (a.descripcion !== desc1[a.codigo_articulo]) console.log(`      ${C.r}desc cambió${C.x} ${a.codigo_articulo}: "${desc1[a.codigo_articulo]}" → "${a.descripcion}"`); });
}

// (b) con sep ON: incluye RENAULT K9K (modelo NULL) para probar el dedup con NULL/''
dobleImportacion('DOBLE IMPORTACIÓN (b) — parser /// + app con modelo NULL', hojasB, mapB, { separarAplic:true });

// (d) sep OFF: el /// se suma a la descripción → no debe duplicarse al reimportar
const fxD = {
  nombre: 'VARIOS',
  headers: ['CODIGO','DESCRIPCION','APLICACIONES','CANTIDAD'],
  rows: [
    { CODIGO:'CH-001', DESCRIPCION:'Shampoo para autos', APLICACIONES:'', CANTIDAD:5 },           // artículo simple: solo código + descripción
    { CODIGO:'FIL-001', DESCRIPCION:'Filtro de aceite', APLICACIONES:'RENAULT /// PEUGEOT', CANTIDAD:3 }, // /// → descripción
  ],
};
const mapD = _catAutodetect(fxD.headers);
const hojasD = [{ nombre:fxD.nombre, rows:fxD.rows, rubroId:'r-varios', rubroNombre:'VARIOS' }];
head('FIXTURE (d) — checkbox OFF: el /// va a la descripción (artículo simple = código + desc)');
{
  const plan = runPlan(hojasD, mapD, { separarAplic:false }, makeDB());
  showPlan(plan);
  const fil = plan.articulos.insert.find(x => x.payload.codigo_articulo === 'FIL-001');
  const ch = plan.articulos.insert.find(x => x.payload.codigo_articulo === 'CH-001');
  eq(ch.payload.descripcion, 'Shampoo para autos', 'champú: descripción intacta, sin separador colgando');
  eq(fil.payload.descripcion, 'Filtro de aceite — RENAULT /// PEUGEOT', 'filtro: descripción + " — " + choricito');
  eq(plan.aplicaciones.insert.length, 0, 'checkbox OFF → no se crean aplicaciones');
}
dobleImportacion('DOBLE IMPORTACIÓN (d) — la descripción con /// no crece al reimportar', hojasD, mapD, { separarAplic:false });

// ===========================================================================
// FIXTURE (f) — REVIVE: código soft-deleted se actualiza+revive (no INSERT → no rompe UNIQUE)
// ===========================================================================
head('FIXTURE (f) — revive de fila soft-deleted (punto fino #1: UNIQUE codigo_articulo)');
{
  const fxF = {
    nombre:'RULEMANES',
    headers:['Código','Descripción','Marca artículo','Stock'],
    rows:[
      { 'Código':'RLM-9', 'Descripción':'Ruleman nuevo', 'Marca artículo':'SKF', 'Stock':5 },   // no existe → alta
      { 'Código':'RLM-7', 'Descripción':'Ruleman revivido', 'Marca artículo':'NSK', 'Stock':9 }, // existe soft-deleted → revive
    ],
  };
  const map = _catAutodetect(fxF.headers);
  // RLM-7 está en la base pero soft-deleted (deleted_at != null) con valores viejos
  const arts = [{ id:77, codigo_articulo:'RLM-7', descripcion:'desc vieja', marca_articulo:'OLD', rubro_id:'r-old', deleted_at:'2026-06-10T00:00:00Z' }];
  const hojas = [{ nombre:fxF.nombre, rows:fxF.rows, rubroId:'r-rulemanes', rubroNombre:'RULEMANES' }];
  const plan = _catPlanImport(hojas, map, { separarAplic:false }, arts, []);
  eq(plan.articulos.insert.length, 1, 'RLM-9 (inexistente) → 1 alta');
  eq(plan.articulos.update.length, 1, 'RLM-7 (soft-deleted) → 1 update, NO alta (no rompe el UNIQUE)');
  const u = plan.articulos.update[0];
  eq(u.id, 77, 'el update apunta al id de la fila soft-deleted');
  ok(u.reviv === true, 'el update queda marcado como revive');
  eq(u.payload.deleted_at, null, 'el payload setea deleted_at=null (revive la fila)');
  eq(u.antes.deleted_at, '2026-06-10T00:00:00Z', 'el "antes" guarda el deleted_at original (deshacer la vuelve a enterrar)');
  eq(u.antes.descripcion, 'desc vieja', 'el "antes" guarda la descripción previa');
  eq(plan.resumen.reviv, 1, 'el resumen cuenta 1 revivido');
}

// ===========================================================================
// FIXTURE (g) — F1.0d: el reimport NO pisa el rubro de los artículos existentes
// ===========================================================================
head('FIXTURE (g) — el rubro del artículo existente lo decide Jere, no el archivo');
{
  const fxG = {
    nombre:'RULEMANES',
    headers:['Código','Descripción','Marca artículo','Stock'],
    rows:[
      { 'Código':'RLM-1', 'Descripción':'Ruleman actualizado', 'Marca artículo':'SKF', 'Stock':3 }, // existe activo
      { 'Código':'RLM-2', 'Descripción':'Ruleman nuevo',       'Marca artículo':'NSK', 'Stock':1 }, // no existe → alta
      { 'Código':'RLM-3', 'Descripción':'Ruleman revivido',    'Marca artículo':'FAG', 'Stock':2 }, // soft-deleted → revive
    ],
  };
  const map = _catAutodetect(fxG.headers);
  // los dos que ya existen están clasificados a mano en OTRO rubro que el de la hoja
  const arts = [
    { id:1, codigo_articulo:'RLM-1', descripcion:'desc vieja', marca_articulo:'OLD', rubro_id:'r-clasificado-a-mano', deleted_at:null },
    { id:3, codigo_articulo:'RLM-3', descripcion:'desc vieja', marca_articulo:'OLD', rubro_id:'r-clasificado-a-mano', deleted_at:'2026-06-10T00:00:00Z' },
  ];
  const hojas = [{ nombre:fxG.nombre, rows:fxG.rows, rubroId:'r-de-la-hoja', rubroNombre:'RULEMANES' }];
  const plan = _catPlanImport(hojas, map, { separarAplic:false }, arts, []);
  const upd = plan.articulos.update.find(u => u.codigo === 'RLM-1');
  const rev = plan.articulos.update.find(u => u.codigo === 'RLM-3');
  const ins = plan.articulos.insert.find(x => x.codigo === 'RLM-2');
  console.log(`  ${C.d}update RLM-1:${C.x} ${JSON.stringify(upd.payload)}`);
  console.log(`  ${C.d}revive RLM-3:${C.x} ${JSON.stringify(rev.payload)}`);
  console.log(`  ${C.d}alta   RLM-2:${C.x} rubro_id=${JSON.stringify(ins.payload.rubro_id)}`);
  ok(!('rubro_id' in upd.payload), 'existente: el update NO manda rubro_id (no lo reclasifica)');
  eq(upd.payload.descripcion, 'Ruleman actualizado', 'existente: sí actualiza la descripción');
  eq(upd.payload.marca_articulo, 'SKF', 'existente: sí actualiza la marca');
  eq(ins.payload.rubro_id, 'r-de-la-hoja', 'nuevo: el insert SÍ toma el rubro de la hoja');
  ok(!('rubro_id' in rev.payload), 'revive: tampoco manda rubro_id (el artículo ya existía)');
  eq(rev.payload.deleted_at, null, 'revive: el payload igual setea deleted_at=null');
  eq(upd.antes.rubro_id, 'r-clasificado-a-mano', 'el "antes" sigue guardando el rubro (Deshacer queda intacto)');
}

// ===========================================================================
// SNAPSHOT DE OPERACIONES — _catBuildOperaciones (lo que se guarda para DESHACER)
// ===========================================================================
head('SNAPSHOT — _catBuildOperaciones (altas + "antes" de updates)');
{
  const updates = [
    { id:10, antes:{ descripcion:'A', marca_articulo:'M', rubro_id:'r1' } },
    { id:11, antes:{ descripcion:'B', marca_articulo:null, rubro_id:'r2', deleted_at:'2026-01-01' } },
  ];
  const ops = _catBuildOperaciones([1,2,3], [100,101], updates);
  eq(ops.altas_articulos.length, 3, '3 altas de artículos registradas');
  eq(ops.altas_aplicaciones.length, 2, '2 altas de aplicaciones registradas');
  eq(ops.updates_articulos.length, 2, '2 updates registrados con su "antes"');
  eq(ops.updates_articulos[0].antes.descripcion, 'A', 'conserva el "antes" del update');
  ok(_catBuildOperaciones(null,null,null).altas_articulos.length === 0, 'tolera entradas vacías (no rompe)');
}

// ===========================================================================
// REVERSIÓN — _catPlanDeshacer / _catPuedeDeshacer (qué revierte cada tipo)
// ===========================================================================
head('REVERSIÓN — _catPlanDeshacer + _catPuedeDeshacer');
{
  const impCat = { id:1, tipo:'CATALOGO', revertida_en:null, operaciones:{
    altas_articulos:[5,6], altas_aplicaciones:[50], updates_articulos:[{ id:9, antes:{ descripcion:'vieja', rubro_id:'rX' } }] } };
  const dCat = _catPlanDeshacer(impCat);
  eq(dCat.softDelArt.join(','), '5,6', 'CATALOGO: altas de artículos → soft-delete');
  eq(dCat.softDelApl.join(','), '50', 'CATALOGO: altas de aplicaciones → soft-delete');
  eq(dCat.restoreArt.length, 1, 'CATALOGO: 1 update a restaurar');
  eq(dCat.restoreArt[0].set.descripcion, 'vieja', 'CATALOGO: restaura el "antes" del update');
  ok(dCat.reviveArt.length === 0 && dCat.reviveApl.length === 0, 'CATALOGO: no revive nada');
  ok(_catPuedeDeshacer(impCat) === true, 'CATALOGO con operaciones y sin revertir → se puede deshacer');

  const impLimp = { id:2, tipo:'limpieza_rubro', revertida_en:null, operaciones:{ bajas_articulos:[7,8,9], bajas_aplicaciones:[70,71], rubros:['RULEMANES'] } };
  const dLimp = _catPlanDeshacer(impLimp);
  eq(dLimp.reviveArt.join(','), '7,8,9', 'limpieza: bajas de artículos → revivir');
  eq(dLimp.reviveApl.join(','), '70,71', 'limpieza: bajas de aplicaciones → revivir');
  ok(dLimp.softDelArt.length === 0, 'limpieza: no da de baja nada al deshacer');

  ok(_catPuedeDeshacer({ tipo:'CATALOGO', operaciones:null }) === false, 'sin operaciones (import vieja) → NO se puede deshacer');
  ok(_catPuedeDeshacer({ tipo:'CATALOGO', revertida_en:'2026-06-15', operaciones:{ altas_articulos:[1] } }) === false, 'ya revertida → NO se puede deshacer de nuevo');
  ok(_catPuedeDeshacer({ tipo:'PRECIOS_PROPIOS', operaciones:null }) === false, 'precios (sin operaciones) → NO se puede deshacer');
}

// ===========================================================================
// CONTEO POR RUBRO — _catContarPorRubro (para el panel "Limpiar rubros")
// ===========================================================================
head('CONTEO — _catContarPorRubro (artículos activos por rubro)');
{
  const arts = [{ rubro_id:'a' }, { rubro_id:'a' }, { rubro_id:'b' }, { rubro_id:null }];
  const c = _catContarPorRubro(arts);
  eq(c['a'], 2, 'rubro a → 2 artículos');
  eq(c['b'], 1, 'rubro b → 1 artículo');
  eq(c['__sin__'], 1, 'sin rubro → cae en la clave __sin__');
  ok(Object.keys(_catContarPorRubro([])).length === 0, 'lista vacía → objeto vacío');
}

// ===========================================================================
// F1.0c-2 — EL RUBRO SALE DE UNA COLUMNA (se resuelve por FILA, no por hoja)
// La resolución de los valores la hace la UI antes de llamar a _catPlanImport
// (la función es pura y no puede consultar la base): acá se simula igual que
// lo va a hacer la pantalla, con _catResolverRubro contra rubrosDB + aliasDB.
// ===========================================================================
const rubrosDBH = [
  { id:'r-rul', nombre:'RULEMANES' },
  { id:'r-amo', nombre:'AMORTIGUADORES' },
  { id:'r-fre', nombre:'FRENOS' },
];
const aliasDBH = [{ alias_texto:'bujes', rubro_id:'r-amo' }];   // alias_texto se guarda YA normalizado

// lo que va a hacer la UI: juntar los valores distintos de la columna y resolver cada uno
function resolverColumna(rows, col) {
  const out = {};
  rows.forEach(r => {
    const v = String(r[col] == null ? '' : r[col]).trim();
    if (!v) return;
    const n = core._normTxt(v);
    if (n in out) return;
    const res = _catResolverRubro(v, rubrosDBH, aliasDBH);
    if (res) out[n] = { rubroId:res.rubroId, rubroNombre:res.rubroNombre };
  });
  return out;
}

const fxH = {
  nombre: 'MAESTRA',
  headers: ['Código','Descripción','Rubro','Stock'],
  rows: [
    { 'Código':'RLM-1', 'Descripción':'Ruleman rueda',      'Rubro':'RULEMANES',      'Stock':2 },
    { 'Código':'AMO-1', 'Descripción':'Amortiguador del.',  'Rubro':'AMORTIGUADORES', 'Stock':1 },
    { 'Código':'FRE-1', 'Descripción':'Pastilla de freno',  'Rubro':'FRENOS',         'Stock':4 },
  ],
};

head('F1.0c-2 — una hoja con 3 valores distintos en la columna Rubro → 3 grupos');
{
  const map = _catAutodetect(fxH.headers);
  showMap(fxH.headers, map);
  eq(map.rubro, 'Rubro', 'la columna Rubro se autodetecta');
  eq(map.codigo, 'Código', 'y no le roba la columna a Código');
  eq(map.descripcion, 'Descripción', 'ni a Descripción');
  const hojas = [{ nombre:fxH.nombre, rows:fxH.rows, rubroId:'r-hoja', rubroNombre:'MAESTRA' }];
  const plan = _catPlanImport(hojas, map, { separarAplic:false, rubroFuente:'columna', rubrosResueltos:resolverColumna(fxH.rows,'Rubro') }, [], []);
  console.log(`  ${C.d}grupos:${C.x} ${plan.preview.map(g => `${g.rubro} [${g.hojas.join(' · ')}] ${g.filas.length}f`).join('  |  ')}`);
  eq(plan.preview.length, 3, '3 valores distintos → 3 grupos en el preview');
  eq(plan.preview.map(g => g.rubro).join(','), 'RULEMANES,AMORTIGUADORES,FRENOS', 'el orden es el de primera aparición en las filas');
  ok(plan.preview.every(g => g.filas.length === 1), 'cada grupo se lleva SU fila');
  ok(plan.preview.every(g => g.hojas.length === 1 && g.hojas[0] === 'MAESTRA'), 'los 3 grupos declaran la única hoja que los alimentó');
  eq(plan.articulos.insert.length, 3, 'las 3 filas entran como altas');
  eq(plan.articulos.insert.find(x => x.codigo === 'AMO-1').payload.rubro_id, 'r-amo', 'el alta toma el rubro de SU fila, no el de la hoja');
  eq(plan.rubrosPendientes.length, 0, 'nada quedó pendiente');
}

head('F1.0c-2 — celda de rubro vacía → la fila cae al rubro de la HOJA');
{
  const rows = fxH.rows.concat([{ 'Código':'X-9', 'Descripción':'Sin rubro en la fila', 'Rubro':'', 'Stock':1 }]);
  const map = _catAutodetect(fxH.headers);
  const hojas = [{ nombre:'MAESTRA', rows, rubroId:'r-hoja', rubroNombre:'MAESTRA' }];
  const plan = _catPlanImport(hojas, map, { separarAplic:false, rubroFuente:'columna', rubrosResueltos:resolverColumna(rows,'Rubro') }, [], []);
  eq(plan.preview.length, 4, 'el 4º grupo es el de la hoja');
  eq(plan.articulos.insert.find(x => x.codigo === 'X-9').payload.rubro_id, 'r-hoja', 'la fila sin valor hereda el rubro de la hoja (planilla mixta)');
  eq(plan.rubrosPendientes.length, 0, 'una celda vacía NO es un pendiente');
}

head('F1.0c-2 — valor que no resuelve → PENDIENTE, y esas filas no se importan');
{
  const rows = [
    { 'Código':'RLM-1', 'Descripción':'Ruleman',   'Rubro':'RULEMANES',  'Stock':1 },
    { 'Código':'SUS-1', 'Descripción':'Espiral',   'Rubro':'SUSPENSION', 'Stock':1 },
    { 'Código':'SUS-2', 'Descripción':'Brazo',     'Rubro':'SUSPENSION', 'Stock':1 },
    { 'Código':'SUS-3', 'Descripción':'Rótula',    'Rubro':'suspensión', 'Stock':1 },
  ];
  const map = _catAutodetect(fxH.headers);
  const hojas = [{ nombre:'MAESTRA', rows, rubroId:'r-hoja', rubroNombre:'MAESTRA' }];
  const plan = _catPlanImport(hojas, map, { separarAplic:false, rubroFuente:'columna', rubrosResueltos:resolverColumna(rows,'Rubro') }, [], []);
  console.log(`  ${C.d}pendientes:${C.x} ${JSON.stringify(plan.rubrosPendientes)}`);
  eq(plan.rubrosPendientes.length, 1, 'un solo valor pendiente (SUSPENSION / suspensión son el mismo)');
  eq(plan.rubrosPendientes[0].valor, 'SUSPENSION', 'guarda el valor tal como vino, para mostrarlo');
  eq(plan.rubrosPendientes[0].filas, 3, 'con las 3 filas que dependen de él');
  eq(plan.articulos.insert.length, 1, 'solo entra la fila que SÍ resolvió');
  ok(!plan.articulos.insert.some(x => x.codigo.startsWith('SUS-')), 'ninguna fila pendiente llegó a insert');
  ok(!plan.articulos.update.some(u => u.codigo.startsWith('SUS-')), 'ni a update');
  ok(!plan.articulos.error.some(e => e.codigo.startsWith('SUS-')), 'y tampoco son un ERROR de la fila: es un dato a resolver');
  eq(plan.preview.length, 1, 'el preview solo muestra lo que se va a importar');
}

head('F1.0c-2 — el valor resuelve por ALIAS, no por nombre exacto');
{
  const rows = [{ 'Código':'BUJ-1', 'Descripción':'Buje parrilla', 'Rubro':'BUJES', 'Stock':1 }];
  const map = _catAutodetect(fxH.headers);
  const hojas = [{ nombre:'MAESTRA', rows, rubroId:'r-hoja', rubroNombre:'MAESTRA' }];
  const plan = _catPlanImport(hojas, map, { separarAplic:false, rubroFuente:'columna', rubrosResueltos:resolverColumna(rows,'Rubro') }, [], []);
  eq(plan.rubrosPendientes.length, 0, 'con alias guardado no queda pendiente');
  eq(plan.articulos.insert[0].payload.rubro_id, 'r-amo', '"BUJES" cae en AMORTIGUADORES por el alias');
  eq(plan.preview[0].rubro, 'AMORTIGUADORES', 'y el bloque del preview muestra el rubro real, no el texto de la celda');
}

head('F1.0c-2 — el mismo valor escrito distinto es UN SOLO grupo');
{
  const rows = [
    { 'Código':'A-1', 'Descripción':'Uno',  'Rubro':'rulemanes',   'Stock':1 },
    { 'Código':'A-2', 'Descripción':'Dos',  'Rubro':' RULEMANES ', 'Stock':1 },
    { 'Código':'A-3', 'Descripción':'Tres', 'Rubro':'Rulemanes',   'Stock':1 },
  ];
  const map = _catAutodetect(fxH.headers);
  const hojas = [{ nombre:'MAESTRA', rows, rubroId:'r-hoja', rubroNombre:'MAESTRA' }];
  const plan = _catPlanImport(hojas, map, { separarAplic:false, rubroFuente:'columna', rubrosResueltos:resolverColumna(rows,'Rubro') }, [], []);
  eq(plan.preview.length, 1, 'mayúsculas, minúsculas y espacios de más → un solo grupo');
  eq(plan.preview[0].filas.length, 3, 'con las 3 filas adentro');
  eq(plan.preview[0].rubroId, 'r-rul', 'y el rubro resuelto es RULEMANES');
}

head('F1.0c-2 — DEFAULT: sin rubroFuente (o en "hoja") todo se comporta como antes');
{
  const map = _catAutodetect(fxH.headers);
  const mk = () => [{ nombre:'MAESTRA', rows:fxH.rows, rubroId:'r-hoja', rubroNombre:'MAESTRA' }];
  const ausente = _catPlanImport(mk(), map, { separarAplic:false }, [], []);
  const enHoja  = _catPlanImport(mk(), map, { separarAplic:false, rubroFuente:'hoja', rubrosResueltos:resolverColumna(fxH.rows,'Rubro') }, [], []);
  eq(ausente.preview.length, 1, 'sin rubroFuente: una hoja → UN grupo (el de la hoja), aunque la columna Rubro esté mapeada');
  ok(ausente.articulos.insert.every(x => x.payload.rubro_id === 'r-hoja'), 'sin rubroFuente: todas las altas toman el rubro de la hoja');
  ok(JSON.stringify(enHoja) === JSON.stringify(ausente), 'rubroFuente:"hoja" da un plan IDÉNTICO al de no pasar nada');
  eq(ausente.rubrosPendientes.length, 0, 'y nunca hay pendientes por el camino viejo');
}

// --- resumen final -----------------------------------------------------------
console.log(`\n${C.b}RESUMEN:${C.x} ${C.g}${pass} OK${C.x}` + (fail ? `, ${C.r}${fail} FALLARON${C.x}` : '') + '\n');
process.exit(fail ? 1 : 0);
