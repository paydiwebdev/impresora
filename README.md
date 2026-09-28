# Generador de Etiquetas de Cajas

Aplicación web (HTML + CSS + JavaScript, sin servidor ni conexión) que:

1. Carga un informe de fabricaciones en formato `.xls` / `.xlsx`.
2. Busca una orden de fabricación por su número.
3. Calcula cuántas cajas hacen falta según las unidades por caja.
4. Genera e imprime una etiqueta de **10 × 5 cm** por cada caja.

Funciona en **PC (Windows)**, **tablet** y **móvil Android**. Todo se ejecuta en local: no usa API remota ni necesita wifi.

---

## Índice

1. [Cómo se usa](#1-cómo-se-usa)
2. [Formato del Excel](#2-formato-del-excel)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [Cómo funciona por dentro](#4-cómo-funciona-por-dentro)
5. [Ejecutar en Windows](#5-ejecutar-en-windows)
6. [Instalar en Android](#6-instalar-en-android)
7. [Impresión](#7-impresión)
8. [Personalizar la etiqueta](#8-personalizar-la-etiqueta)
9. [Limitaciones conocidas](#9-limitaciones-conocidas)
10. [Solución de problemas](#10-solución-de-problemas)

---

## 1. Cómo se usa

| Pantalla | Qué se hace |
|---|---|
| **Nº de orden** | Pulsar el selector de archivo y elegir el informe `.xls`. Escribir el nº de orden. Marcar **EXACTA** si la cantidad del Excel es la correcta; si no, desmarcarla e indicar el **nº de unidades totales**. Pulsar **ACEPTAR**. |
| **Cargando** | Pantalla breve mientras se busca la orden. |
| **Unidades por caja** | Muestra el resumen de la orden (orden, cliente, publicidad, total). Se escribe el nº de unidades por caja y se ve al instante la previsualización (p. ej. `6 cajas · última caja: 50 unidades`). Pulsar **GENERAR ETIQUETAS**. |
| **Etiquetas** | Se muestran todas las etiquetas. Botones: **IMPRIMIR**, **EDITAR** y **NUEVA ORDEN**. |
| **Edición completa** | Permite cambiar orden, cliente, publicidad, total, nº de cajas, unidades por caja y las unidades de **cada caja** individualmente. Si las cajas no suman el total indicado, la app avisa antes de guardar. |
| **Error** | Aparece si falta el nº de orden, la orden no existe, etc. |

> El informe se carga **una vez por sesión**. Los datos viven en memoria: si se cierra la app, hay que volver a cargar el archivo (ver [sección 9](#9-limitaciones-conocidas)).

### Contenido de cada etiqueta

- ORDEN FABRICACION Nº
- NOMBRE CLIENTE
- PUBLICIDAD (columna *Descripción* del Excel)
- TOTAL UNIDS y UNIDADES X CAJA
- UNIDADES EN CAJA
- CAJA *n* DE *N*

### Cálculo de cajas

```
numeroCajas = ceil(total / unidadesPorCaja)
```

Todas las cajas llevan `unidadesPorCaja` salvo la última, que lleva el resto. Ejemplo: 555 unidades a 100 por caja → 6 cajas (5 de 100 y una de 55).

---

## 2. Formato del Excel

El parser está pensado para el **"Informe de fabricaciones"** exportado tal cual:

```
Página: 1
25/09/2026
        Informe de fabricaciones
Código | Descripción | Cliente | Artículo | Fecha | Fecha entrega | Cantidad | Arts.Fabricados
803    | ...
```

Reglas que aplica `xls-loader.js`:

- Solo lee la **primera hoja** del libro.
- Ignora las filas de título que hay encima de la tabla (`Página: 1`, fecha, título).
- La **fila de cabecera** es la primera cuya primera celda es exactamente `Código`.
- Las **cabeceras repetidas** por salto de página se descartan.
- Las filas completamente vacías se descartan.
- Las columnas se localizan **por nombre**, no por posición, así que el orden de columnas no importa. Los nombres deben coincidir exactamente (con tildes):
  `Código`, `Descripción`, `Cliente`, `Artículo`, `Fecha`, `Fecha entrega`, `Cantidad`, `Arts.Fabricados`.
- `Cliente` y `Artículo` son una sola columna cada una (por ejemplo `46860 - SG BRAND MERCHANDISING`); no se separan.

Cada fila se convierte en un objeto:

```js
{
  codigo: "884",
  descripcion: "GRUAS BETANZOS",
  cliente: "238 - IMPRENTA VAZMAR",
  articulo: "CV+CF235 - Colocación Varilla 23,5 + Colocación Faldilla",
  fecha: "10/3/23",
  fechaEntrega: "10/5/23",
  cantidad: 80,
  artsFabricados: null      // celda vacía -> null
}
```

---

## 3. Estructura del proyecto

```
proyecto/
├── package.json                  ← dependencias de Capacitor (solo para Android)
├── capacitor.config.json         ← nombre e id de la app Android
├── README.md
├── .github/
│   └── workflows/
│       └── build-apk.yml         ← compila el APK en la nube
├── native/                       ← código Android para imprimir (solo APK)
│   ├── MainActivity.java.template
│   └── EtiquetaPrinterPlugin.java.template
└── www/                          ← LA APP (esto es lo que se ejecuta)
    ├── index.html
    ├── styles.css
    ├── xls-loader.js             ← lee y limpia el Excel
    ├── app.js                    ← lógica de pantallas, cajas y etiquetas
    └── lib/
        └── xlsx.full.min.js      ← SheetJS 0.20.3 (copia local)
```

- `native/` va **en la raíz del repositorio**, nunca dentro de `www/`.
- El orden de carga de scripts en `index.html` **importa** y debe ser este, al final del `<body>`:

```html
<script src="lib/xlsx.full.min.js"></script>
<script src="xls-loader.js"></script>
<script src="app.js"></script>
```

---

## 4. Cómo funciona por dentro

### `xls-loader.js`
Expone una función global:

```js
loadTicketData(file, onLoaded, onError)
```

Lee el archivo con `FileReader`, lo parsea con SheetJS y llama a `onLoaded(tickets)` con el array de objetos descrito arriba. No sabe nada de la interfaz.

### `app.js`
- `basedeDatos = { tickets: [...] }`: datos cargados del Excel, en memoria. Se declara con `let` al principio del archivo para que toda la app pueda leerlo.
- `datosOrdenActual`: la orden que se está trabajando (copia del ticket + `ordenExacta`, `unidadesPorCaja`, `numeroCajas`, `cajas[]`).
- `cambiarPantalla(id)`: muestra una `<section class="pantalla">` y oculta las demás.
- `consultarAPI(numero)`: busca en `basedeDatos.tickets` por `codigo` (nombre heredado de una versión con API; ahora es una búsqueda local con un retardo artificial de 600 ms).
- `calcularCajas(cantidad, porCaja)`: devuelve el array de unidades por caja.
- `mostrarEtiquetas` / `crearEtiqueta`: generan el HTML de cada etiqueta.
- `abrirEdicion` / `guardarEdicion`: pantalla de edición manual.
- `escaparHTML`: escapa los textos del Excel antes de insertarlos en el HTML.
- Botón **IMPRIMIR**: detecta si está dentro de la app Android y usa el plugin nativo, o `window.print()` en el navegador (ver [sección 7](#7-impresión)).

### `styles.css`
Estilos de pantallas y etiquetas, más las reglas `@page` y `@media print` que controlan la impresión.

---

## 5. Ejecutar en Windows

No hay que instalar nada.

1. Copiar la carpeta `www/` al PC.
2. Comprobar que existe `www\lib\xlsx.full.min.js`.
3. Abrir `www\index.html` con el navegador (doble clic o *Abrir con*).

Navegadores en **Windows 7 (32 bits)**: usar la última versión que lo soporta, **Chrome 109** o **Firefox ESR 115**. La app usa sintaxis moderna (`?.`, `??`, `replaceAll`) que ambos admiten.

Para imprimir: botón **IMPRIMIR** → en el diálogo del navegador:

- **Destino:** la impresora de etiquetas.
- **Tamaño de papel:** el que coincida con la etiqueta (10 × 5 cm o el más cercano que ofrezca el driver).
- **Márgenes:** Ninguno.
- **Escala:** 100 % (no usar "Ajustar a la página").

---

## 6. Instalar en Android

Un navegador móvil no abre bien `file://`, y hace falta que funcione **sin wifi**. La solución es empaquetar la app como **APK** con [Capacitor](https://capacitorjs.com/) (una app nativa que contiene la web dentro de un WebView).

Las herramientas modernas de Android (Android Studio, Node actual) **no funcionan en Windows 7 de 32 bits**, así que el APK se compila **en la nube con GitHub Actions** (gratis). El PC solo necesita un navegador.

### 6.1 Crear el repositorio

1. Crear cuenta en <https://github.com> y un repositorio nuevo (por ejemplo `ticket-app`).
2. Subir los archivos con la web de GitHub. **No hace falta crear carpetas**: en *Add file → Create new file*, escribir la ruta completa en el campo de nombre y GitHub crea las carpetas al teclear `/`.

| Ruta a escribir | Contenido |
|---|---|
| `package.json` | ver 6.2 |
| `capacitor.config.json` | ver 6.2 |
| `.github/workflows/build-apk.yml` | ver 6.2 |
| `native/MainActivity.java.template` | plugin de impresión (ver [sección 7](#7-impresión)) |
| `native/EtiquetaPrinterPlugin.java.template` | plugin de impresión (ver [sección 7](#7-impresión)) |
| `www/index.html` | tu `index.html` |
| `www/app.js` | tu `app.js` |
| `www/styles.css` | tu `styles.css` |
| `www/xls-loader.js` | tu `xls-loader.js` |
| `www/lib/xlsx.full.min.js` | SheetJS (ver 6.3) |

### 6.2 Archivos de configuración

**`package.json`**

```json
{
  "name": "ticket-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "echo 'static app, nothing to build'"
  },
  "dependencies": {
    "@capacitor/core": "^5.7.0",
    "@capacitor/android": "^5.7.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^5.7.0"
  }
}
```

**`capacitor.config.json`** (cambiar `appId` y `appName` a gusto)

```json
{
  "appId": "com.tuempresa.ticketapp",
  "appName": "TicketApp",
  "webDir": "www",
  "bundledWebRuntime": false
}
```

**`.github/workflows/build-apk.yml`**

```yaml
name: Build APK

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Install dependencies
        run: npm install

      - name: Add Android platform
        run: npx cap add android

      - name: Install custom print plugin
        run: |
          APP_ID=$(node -p "require('./capacitor.config.json').appId")
          JAVA_DIR="android/app/src/main/java/$(echo "$APP_ID" | tr . /)"
          mkdir -p "$JAVA_DIR"
          sed "s/__APP_ID__/$APP_ID/g" native/MainActivity.java.template > "$JAVA_DIR/MainActivity.java"
          sed "s/__APP_ID__/$APP_ID/g" native/EtiquetaPrinterPlugin.java.template > "$JAVA_DIR/EtiquetaPrinterPlugin.java"

      - name: Sync web assets into Android project
        run: npx cap sync android

      - name: Setup JDK
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - name: Build debug APK
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: Upload APK as artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

> Los dos archivos `.java.template` contienen el texto `__APP_ID__`. El workflow lo sustituye por el `appId` de `capacitor.config.json`: **no lo edites a mano**.

### 6.3 SheetJS (la librería que lee el Excel)

No se instala con npm: se descarga **un archivo** y se incluye con la app (así funciona sin internet).

1. Descargar <https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js>
2. Guardarlo como `xlsx.full.min.js` y subirlo a `www/lib/xlsx.full.min.js`.

> No enlazar el script a la URL de internet en `index.html`: la app debe funcionar sin conexión.

### 6.4 Compilar y descargar el APK

1. Al confirmar (*Commit*) los archivos en la rama `main`, GitHub Actions arranca solo.
2. Ir a la pestaña **Actions** del repositorio y esperar a que termine (unos 3-5 min, marca verde). Si falla, abrir la ejecución y leer el paso en rojo.
3. Entrar en la ejecución, bajar a **Artifacts**, descargar `app-debug` y descomprimir el ZIP: dentro está `app-debug.apk`.
4. Para recompilar sin cambiar nada: **Actions → Build APK → Run workflow**.

### 6.5 Instalar en el móvil o tablet

1. Pasar el `app-debug.apk` al dispositivo (cable USB, correo, Drive...). Es lo único que requiere conexión y solo se hace una vez.
2. Abrirlo desde el móvil. Android pedirá **permitir instalar apps de esta fuente**: activarlo.
3. Instalar y abrir la app. Desde ese momento funciona **100 % sin conexión**.
4. Para cargar el informe, pasar el `.xls` al dispositivo (carpeta *Descargas*, por ejemplo) y elegirlo con el selector de archivo de la app.

**Requisitos del dispositivo:** Android 5.1 o superior, y el componente *Android System WebView* razonablemente actualizado (la app usa JavaScript moderno). Se actualiza desde Google Play.

### 6.6 Actualizar la app

Modificar el archivo en GitHub → se recompila solo → descargar el nuevo APK.

> ⚠️ **Desinstala la versión anterior antes de instalar la nueva.** Cada compilación en la nube genera una firma de depuración distinta, y Android rechaza actualizar encima con el error *"App no instalada"*. Para actualizar sin desinstalar habría que firmar el APK con un *keystore* propio.

---

## 7. Impresión

El botón **IMPRIMIR** usa un método distinto según dónde se ejecute la app:

| Entorno | Método |
|---|---|
| **Windows / navegador** | `window.print()` → diálogo de impresión del navegador (ver [sección 5](#5-ejecutar-en-windows)). |
| **Android (APK)** | Plugin nativo `EtiquetaPrinter` → diálogo de impresión de Android (`PrintManager`). |

### Por qué hace falta un plugin en Android

`window.print()` **no funciona** dentro del WebView de una app Android. Por eso el proyecto incluye un pequeño plugin en Java (`native/EtiquetaPrinterPlugin.java.template`) que envía el contenido actual de la pantalla al sistema de impresión de Android. Reutiliza las reglas `@media print` del CSS, así que solo se imprime la pantalla de etiquetas. El papel por defecto es de **100 × 50 mm**.

`MainActivity.java.template` solo registra el plugin. El workflow de GitHub copia ambos archivos al proyecto Android al compilar (paso *Install custom print plugin*).

### Código del botón en `app.js`

```js
document.getElementById("imprimirEtiquetas")
    .addEventListener("click", async () => {
        const dentroDeLaApp = window.Capacitor &&
            typeof Capacitor.isNativePlatform === "function" &&
            Capacitor.isNativePlatform();

        if (!dentroDeLaApp) {
            window.print(); // PC / navegador
            return;
        }

        const EtiquetaPrinter = Capacitor.Plugins && Capacitor.Plugins.EtiquetaPrinter;

        if (!EtiquetaPrinter) {
            alert("El plugin de impresión no está incluido en esta versión de la app.");
            return;
        }

        try {
            await EtiquetaPrinter.print(); // papel 100 x 50 mm
        } catch (err) {
            alert("No se pudo abrir la impresión: " + (err.message || err));
        }
    });
```

Se accede al plugin con `Capacitor.Plugins.EtiquetaPrinter`. **No** usar `Capacitor.registerPlugin(...)`: no existe en el objeto `Capacitor` que inyecta la app, porque no se empaqueta `@capacitor/core` en la web.

Para otro tamaño de etiqueta: `EtiquetaPrinter.print({ widthMm: 100, heightMm: 50, jobName: "Etiquetas" })`.

### Requisito de la impresora en Android

El diálogo de Android solo lista impresoras que tengan un **servicio de impresión** instalado (Mopria, HP, Brother, Epson o la app del fabricante). Si la impresora de etiquetas no aparece, hay que instalar el servicio de impresión de su fabricante desde Google Play.

### Probar sin impresora

Pulsar IMPRIMIR y, en el diálogo, elegir **"Guardar como PDF"**. Sirve para comprobar el diseño y que hay una etiqueta por página.

---

## 8. Personalizar la etiqueta

Todo está en `styles.css`.

| Qué cambiar | Dónde |
|---|---|
| Línea exterior **en pantalla** | `.etiqueta-carnet { border: 1px solid #000; }` |
| Línea exterior **al imprimir** | `@media print` → `.etiqueta-carnet { border: none; }` |
| Tamaño de la etiqueta en pantalla | `.etiqueta-carnet { width: 10cm; height: 5cm; }` |
| Tamaño al imprimir | `@media print` → `.etiqueta-carnet { width: 100%; height: 4.95cm; }` |
| Tamaño de papel solicitado | `@page { size: 10cm 5cm; margin: 0; }` |
| Tamaño del texto de cliente, publicidad, unidades y filas | `.etiqueta-cliente, .etiqueta-publicidad, .etiqueta-unidades, .fila-etiqueta { font-size: 11px; }` |
| Título superior | `.etiqueta-titulo { font-size: 16px; }` |
| Recuadro "CAJA n DE N" | `.etiqueta-caja` |

Reglas importantes para la impresión:

- En `@media print`, la etiqueta usa `width: 100%` y una altura fija en `cm`. **No usar `vw` / `vh`**: en la vista previa de impresión no equivalen al tamaño del papel y la etiqueta se parte en varias hojas.
- La altura es `4.95cm` (un poco menos que 5) para que nunca se desborde a una segunda hoja en blanco.
- Si el texto no cabe, reducir el `font-size` de las clases de arriba (por ejemplo de `11px` a `10px`).
- Cambiar el `border` de la regla base no afecta a la impresión si la regla de `@media print` lo pisa: hay que poner `border: none` explícito en el bloque de impresión.
- Para cambiar el tamaño de papel en Android, ajustar también `widthMm` / `heightMm` en la llamada a `EtiquetaPrinter.print(...)`.

---

## 9. Limitaciones conocidas

- **Los datos no se guardan.** `basedeDatos` está en memoria: al cerrar la app hay que cargar el Excel de nuevo. Podría persistirse con `localStorage` (guardando el JSON de los tickets).
- **Órdenes duplicadas.** La búsqueda devuelve la **primera** fila con ese código.
- **Fechas.** `fecha` y `fechaEntrega` salen con formato ambiguo (`"10/3/23"`). La app no las usa por ahora; habría que corregir su conversión antes de mostrarlas.
- **Nombre de columnas.** Si el sistema que genera el informe cambia el nombre de una cabecera, esa columna llegará vacía.
- **`index.html`.** Faltan `<!DOCTYPE html>` y la etiqueta `<html>`. Funciona, pero conviene añadirlos.
- **`nuevaOrden()`** usa `numeroOrden` como variable global (el elemento con ese `id`). Funciona, pero es más robusto usar `document.getElementById("numeroOrden")`.
- **Teclado virtual.** El código está comentado y sin terminar; se usa el teclado nativo del dispositivo.
- **CSS antiguo comentado.** Hay un bloque grande de estilos de etiqueta comentado en `styles.css`; se puede borrar.
- El APK es de **depuración**, válido para uso propio. Publicar en Google Play requeriría un APK/AAB firmado en modo *release*.

---

## 10. Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| `document.getElementById(...) is null` | El `id` no coincide entre HTML y JS, o el `<script>` está antes del elemento. Poner los scripts al final del `<body>`. |
| `xxx is not defined` al usar `codigo`, `descripcion`... | Son propiedades del objeto: usar `ticket.codigo`, `datos.descripcion`, no `codigo` a secas. |
| `This input element accepts a filename, which may only be programmatically set to the empty string` | No se puede escribir `.value` en un `<input type="file">`. Mostrar el nombre del archivo en un `<span>` con `.textContent`. |
| `XLSX is not defined` | Falta `lib/xlsx.full.min.js` o se carga después de `xls-loader.js`. |
| "No se encontró la orden" | No se ha cargado el Excel, el número no existe o hay diferencias de formato en el código. |
| Se cargan tickets pero faltan campos | Los nombres de columna del Excel no coinciden exactamente con los esperados (ver [sección 2](#2-formato-del-excel)). |
| El workflow de GitHub falla | Comprobar que `package.json` y `capacitor.config.json` están en la **raíz**, que existe `www/index.html` y que `native/` tiene los dos archivos `.java.template`. Si falla la compilación, copiar el error del paso en rojo. |
| *"App no instalada"* en Android | Hay una versión anterior con otra firma: desinstalarla primero. |
| `Capacitor.registerPlugin is not a function` | Usar `Capacitor.Plugins.EtiquetaPrinter` (ver [sección 7](#7-impresión)). |
| Alerta "El plugin de impresión no está incluido..." | El paso nativo no copió los `.java`. Revisar que `native/` esté en la raíz (no en `www/`), los nombres exactos de los archivos y que el paso *Install custom print plugin* salga en verde en Actions. |
| En Android no aparece mi impresora | Instalar el servicio de impresión del fabricante (o Mopria) desde Google Play. |
| La etiqueta sale partida en 2 o 3 hojas | Ver [sección 8](#8-personalizar-la-etiqueta): usar `width: 100%` y altura en `cm` (no `vh`), y reducir el tamaño de letra si no cabe. |
| Sale una hoja en blanco al final | Altura de la etiqueta igual o mayor que la del papel: dejarla en `4.95cm`. |
| La etiqueta no llega a los bordes del papel | En el diálogo de impresión: márgenes **Ninguno**, escala **100 %** y tamaño de papel correcto. |
