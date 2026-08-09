# scripts/

## check-html.mjs

Validación de sintaxis del JavaScript inline de `index.html`.

```bash
node scripts/check-html.mjs
```

Saca el contenido de cada `<script>` sin `src=`, lo escribe a un temporal y lo
parsea con `node --check`. Sale `0` si todo parsea, `1` si algo no. Los errores
salen con el número de línea de `index.html` (el temporal se rellena con líneas
en blanco hasta la posición real del bloque), así se puede abrir directo.

El temporal se escribe como `.cjs` a propósito: eso lo parsea como script
clásico, igual que un `<script>` del browser. Un `.mjs` lo trataría como módulo
ESM, que acepta cosas que el browser rechazaría.

**Esta es la validación de sintaxis del proyecto.** Reemplaza al viejo
`node --check index.html`, que era imposible: un `.html` arranca con `<!DOCTYPE`
y no es JavaScript, así que ese comando nunca validó nada — fallaba en silencio
o se salteaba.

## Antes de cerrar un cambio

```bash
node scripts/check-html.mjs
node harness-all.mjs
```

`harness-all.mjs` corre todos los `harness-*.mjs` del raíz y suma un PASS/FAIL
total. Los harness son dev-only y están gitignoreados; no son parte del sitio.
