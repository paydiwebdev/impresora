/**
 * Box label generator: application logic.
 *
 * Flow: look up a manufacturing order -> split its units into boxes ->
 * preview / edit the labels -> print (100 x 50 mm).
 *
 * External dependency:
 *   loadTicketData(file, onSuccess, onError)
 *   Provided by the Excel-parsing script. Parses a spreadsheet File and
 *   calls onSuccess(tickets), where tickets is an array of orders.
 */


// =============================================================================
// 1. STATE, CONSTANTS AND DOM REFERENCES
// =============================================================================

/**
 * @typedef {Object} Orden
 * @property {string}   codigo           Manufacturing order number.
 * @property {string}   cliente          Customer name.
 * @property {string}   descripcion      Advertising / product description.
 * @property {number}   cantidad         Total units in the order.
 * @property {boolean}  ordenExacta      False when the total was typed in manually.
 * @property {number}   [unidadesPorCaja] Standard units per box.
 * @property {number}   [numeroCajas]    Number of boxes.
 * @property {number[]} [cajas]          Units in each box, in label order.
 */

/** In-memory order database, refreshed from the local Excel file. */
let basedeDatos = { tickets: [] };

/** @type {Orden|null} Order currently being processed. */
let datosOrdenActual = null;

/** When true, a fresh Excel is requested from the launcher on startup. */
const AUTO_ACTUALIZAR = true;

const RUTA_EXCEL = "/datos/pedidos.xls";
const RUTA_ACTUALIZAR = "/api/actualizar";

const numeroOrdenInput = document.getElementById("numeroOrden");
const ordenExacta = document.getElementById("ordenExacta");
const bloqueUnidadesTotales = document.getElementById("bloqueUnidadesTotales");
const unidadesTotalesInput = document.getElementById("unidadesTotales");
const unidadesPorCajaInput = document.getElementById("unidadesPorCaja");


// =============================================================================
// 2. UTILITIES
// =============================================================================

/**
 * Shorthand for document.getElementById.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function porId(id) {
    return document.getElementById(id);
}

/**
 * Formats a number using Spanish locale conventions.
 * @param {number|string} numero
 * @returns {string}
 */
function formatearNumero(numero) {
    return Number(numero).toLocaleString("es-ES");
}

/**
 * Escapes HTML special characters so text can be safely interpolated
 * into innerHTML templates.
 * @param {*} valor
 * @returns {string}
 */
function escaparHTML(valor) {
    return String(valor)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// =============================================================================
// 3. NAVIGATION
// =============================================================================

/**
 * Shows one screen and hides all the others.
 * @param {string} idPantalla Element id of the screen to activate.
 */
function cambiarPantalla(idPantalla) {
    document.querySelectorAll(".pantalla").forEach((pantalla) => {
        pantalla.classList.remove("activa");
    });

    const pantalla = porId(idPantalla);

    if (pantalla) {
        pantalla.classList.add("activa");
        window.scrollTo(0, 0);
    }
}

/**
 * Displays the error screen with the given message.
 * @param {string} mensaje
 */
function mostrarError(mensaje) {
    porId("mensajeError").textContent = mensaje;
    cambiarPantalla("pantallaError");
}


// =============================================================================
// 4. DATABASE
// =============================================================================

/**
 * Loads the locally stored Excel file into memory.
 *
 * Resolves to true once the file was found and handed to the parser; the
 * parsing result itself arrives asynchronously through loadTicketData's
 * callbacks. Resolves to false when the file is missing or the request
 * fails (e.g. the app was opened without the launcher).
 *
 * @returns {Promise<boolean>}
 */
// =============================================================================
// ANDROID VERSION: replacement for the database logic in app.js
//
// In section 1 (constants), DELETE:
//     const RUTA_EXCEL = "/datos/pedidos.xls";
//     const RUTA_ACTUALIZAR = "/api/actualizar";
//
// In section 4 (DATABASE), DELETE the old cargarExcelLocal() and
// iniciarBaseDeDatos(), and paste everything below in their place.
// Keep AUTO_ACTUALIZAR, renderTickets() and consultarAPI() as they are.
//
// Requires (once, in the Capacitor project):
//     npm install @capacitor/filesystem
//     npx cap sync android
// =============================================================================
 
const URL_EXCEL =
    "https://raw.githubusercontent.com/paydiwebdev/impresora/refs/heads/main/www/tmp_excel.xls";
const NOMBRE_EXCEL = "pedidos.xls";
const TIMEOUT_DESCARGA_MS = 30000;
 
/**
 * Returns the Capacitor Filesystem plugin.
 * @returns {Object}
 * @throws {Error} When the plugin is not installed in the native project.
 */
function obtenerFilesystem() {
    const plugin = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Filesystem;
    if (!plugin) {
        throw new Error("Falta el plugin @capacitor/filesystem (npm install + npx cap sync).");
    }
    return plugin;
}
 
/**
 * Converts a Blob to a base64 string without the "data:...;base64," prefix.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobABase64(blob) {
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(String(lector.result).split(",")[1]);
        lector.onerror = () => reject(lector.error);
        lector.readAsDataURL(blob);
    });
}
 
/**
 * Converts a base64 string to a Blob.
 * @param {string} base64
 * @returns {Blob}
 */
function base64ABlob(base64) {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
 
    for (let i = 0; i < binario.length; i++) {
        bytes[i] = binario.charCodeAt(i);
    }
 
    return new Blob([bytes]);
}
 
/**
 * Downloads the Excel file from GitHub.
 * The download completes in memory before anything is written, so a failed
 * download never damages the copy already stored on the device.
 *
 * @returns {Promise<Blob>}
 * @throws {Error} On HTTP errors, empty files, timeouts or no connection.
 */
async function descargarExcel() {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_DESCARGA_MS);
 
    try {
        const respuesta = await fetch(URL_EXCEL, {
            cache: "no-store",
            signal: controlador.signal
        });
        if (!respuesta.ok) throw new Error("HTTP " + respuesta.status);
 
        const blob = await respuesta.blob();
        if (blob.size === 0) throw new Error("El archivo descargado está vacío.");
 
        return blob;
    } finally {
        clearTimeout(temporizador);
    }
}
 
/**
 * Saves the Excel in the app's private storage (overwrites the previous one).
 * @param {Blob} blob
 */
async function guardarExcel(blob) {
    await obtenerFilesystem().writeFile({
        path: NOMBRE_EXCEL,
        data: await blobABase64(blob),
        directory: "DATA"
    });
}
 
/**
 * Reads the stored Excel from the app's private storage.
 * @returns {Promise<Blob|null>} The file, or null if it was never downloaded.
 */
async function leerExcelGuardado() {
    try {
        const { data } = await obtenerFilesystem().readFile({
            path: NOMBRE_EXCEL,
            directory: "DATA"
        });
        return base64ABlob(data);
    } catch (error) {
        return null;
    }
}
 
/**
 * Loads the stored Excel into memory.
 *
 * Resolves to true once the file was found and handed to the parser; the
 * parsing result arrives through loadTicketData's callbacks. Resolves to
 * false when nothing has been downloaded yet or reading fails.
 *
 * @returns {Promise<boolean>}
 */
async function cargarExcelLocal() {
    try {
        const blob = await leerExcelGuardado();
        if (!blob) return false;
 
        loadTicketData(
            new File([blob], NOMBRE_EXCEL),
            (tickets) => {
                basedeDatos = { tickets };
                renderTickets();
            },
            (err) => alert("Error leyendo el archivo: " + err.message)
        );
        return true;
    } catch (error) {
        console.error("cargarExcelLocal falló:", error);
        return false;
    }
}
 
/**
 * Startup routine. Loads the stored Excel immediately so the app is usable
 * offline, then tries to download a newer version in the background.
 */
async function iniciarBaseDeDatos() {
    const hayLocal = await cargarExcelLocal();
    if (!hayLocal) console.warn("Todavía no hay base de datos local.");
 
    if (!AUTO_ACTUALIZAR) return;
 
    try {
        await guardarExcel(await descargarExcel());
        await cargarExcelLocal();
    } catch (error) {
        console.warn("No se pudo actualizar (¿sin conexión?):", error);
    }
}


/** Logs how many orders are currently in memory. */
function renderTickets() {
    console.log(basedeDatos.tickets.length + " tickets cargados");
}

/**
 * Looks up an order by its code.
 *
 * The artificial delay simulates a network round trip so the loading screen
 * is visible; replace the body with the real API request when available.
 *
 * @param {string} numero Order code.
 * @returns {Promise<Object|null>} The matching order, or null.
 */
function consultarAPI(numero) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const ticket = basedeDatos.tickets.find((t) => t.codigo === numero);
            resolve(ticket || null);
        }, 600);
    });
}


// =============================================================================
// 5. ENTRY SCREEN: ORDER LOOKUP
// =============================================================================

/**
 * Validates the entry form, looks the order up and moves on to the
 * box configuration screen. When the order is not "exact", the manually
 * entered total replaces the quantity stored in the database.
 */
async function consultarOrden() {
    const numero = numeroOrdenInput.value.trim();
    iniciarBaseDeDatos();
    if (!numero) {
        mostrarError("Introduzca un número de orden.");
        return;
    }

    const exacta = ordenExacta.checked;
    const unidadesManuales = parseInt(unidadesTotalesInput.value, 10);

    if (!exacta && (!Number.isInteger(unidadesManuales) || unidadesManuales <= 0)) {
        mostrarError("Si la orden no es exacta, debe indicar el número de unidades totales.");
        return;
    }

    cambiarPantalla("pantallaCargando");

    try {
        const datos = await consultarAPI(numero);

        if (!datos) {
            mostrarError("No se encontró la orden " + numero + ".");
            return;
        }

        datosOrdenActual = { ...datos, ordenExacta: exacta };

        if (!exacta) {
            datosOrdenActual.cantidad = unidadesManuales;
        }

        mostrarResumenConfiguracion();
        cambiarPantalla("pantallaConfiguracion");
    } catch (error) {
        mostrarError("No se pudo consultar la orden.");
    }
}

/** Clears the entry form and returns to the first screen. */
function nuevaOrden() {
    datosOrdenActual = null;

    numeroOrdenInput.value = "";
    ordenExacta.checked = true;
    unidadesTotalesInput.value = "";
    unidadesPorCajaInput.value = "";

    bloqueUnidadesTotales.classList.add("oculto");

    cambiarPantalla("pantallaEntrada");
}


// =============================================================================
// 6. CONFIGURATION SCREEN: UNITS PER BOX
// =============================================================================

/** Renders the order summary and resets the units-per-box field. */
function mostrarResumenConfiguracion() {
    const datos = datosOrdenActual;

    porId("resumenOrden").innerHTML = `
        <strong>Orden:</strong> ${escaparHTML(datos.codigo)}<br>
        <strong>Cliente:</strong> ${escaparHTML(datos.cliente)}<br>
        <strong>Publicidad:</strong> ${escaparHTML(datos.descripcion)}<br>
        <strong>Total unidades:</strong> ${formatearNumero(datos.cantidad)}
    `;

    unidadesPorCajaInput.value = "";
    porId("previsualizacionCalculo").textContent = "";
}

/**
 * Shows a live preview of how many boxes the current units-per-box value
 * produces, and how many units the last box holds.
 */
function actualizarCalculo() {
    const unidadesPorCaja = parseInt(unidadesPorCajaInput.value, 10);
    const preview = porId("previsualizacionCalculo");

    if (!Number.isInteger(unidadesPorCaja) || unidadesPorCaja <= 0 || !datosOrdenActual) {
        preview.textContent = "";
        return;
    }

    const total = Number(datosOrdenActual.cantidad);
    const numeroCajas = Math.ceil(total / unidadesPorCaja);
    const resto = total % unidadesPorCaja;

    let texto = `${numeroCajas} ${numeroCajas === 1 ? "caja" : "cajas"}`;
    texto += resto > 0
        ? ` · última caja: ${resto} unidades`
        : " · todas las cajas completas";

    preview.textContent = texto;
}

/**
 * Splits a total quantity into boxes of a fixed size. The last box holds
 * the remainder when the total is not an exact multiple.
 *
 * @param {number} cantidad Total units.
 * @param {number} unidadesPorCaja Box capacity.
 * @returns {number[]} Units in each box.
 */
function calcularCajas(cantidad, unidadesPorCaja) {
    const cajas = [];
    let restantes = cantidad;

    while (restantes > 0) {
        const unidadesEstaCaja = Math.min(unidadesPorCaja, restantes);

        cajas.push(unidadesEstaCaja);
        restantes -= unidadesEstaCaja;
    }

    return cajas;
}

/** Validates the configuration, computes the boxes and shows the labels. */
function generarEtiquetas() {
    if (!datosOrdenActual) {
        mostrarError("No hay ninguna orden cargada.");
        return;
    }

    const unidadesPorCaja = parseInt(unidadesPorCajaInput.value, 10);

    if (!Number.isInteger(unidadesPorCaja) || unidadesPorCaja <= 0) {
        alert("Introduzca un número válido de unidades por caja.");
        return;
    }

    const cantidad = Number(datosOrdenActual.cantidad);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
        mostrarError("El total de unidades no es válido.");
        return;
    }

    const numeroCajas = Math.ceil(cantidad / unidadesPorCaja);

    datosOrdenActual.unidadesPorCaja = unidadesPorCaja;
    datosOrdenActual.numeroCajas = numeroCajas;
    datosOrdenActual.cajas = calcularCajas(cantidad, unidadesPorCaja);

    mostrarEtiquetas(datosOrdenActual);

    porId("informacionCajas").textContent =
        `${numeroCajas} ${numeroCajas === 1 ? "caja" : "cajas"} · ` +
        `${formatearNumero(cantidad)} unidades`;

    cambiarPantalla("pantallaEtiqueta");
}


// =============================================================================
// 7. LABELS SCREEN: PREVIEW AND PRINTING
// =============================================================================

/**
 * Renders one label per box, replacing any previous content.
 * @param {Orden} datos Order with its `cajas` array already computed.
 */
function mostrarEtiquetas(datos) {
    const contenedor = porId("contenedorEtiqueta");
    contenedor.innerHTML = "";

    datos.cajas.forEach((unidadesEstaCaja, indice) => {
        const etiqueta = crearEtiqueta(
            datos,
            indice + 1,
            datos.cajas.length,
            unidadesEstaCaja
        );

        contenedor.appendChild(etiqueta);
    });
}

/**
 * Builds the DOM element for a single label.
 *
 * @param {Orden}  datos            Order data.
 * @param {number} numeroCaja       1-based index of this box.
 * @param {number} numeroCajas      Total number of boxes.
 * @param {number} unidadesEstaCaja Units in this box.
 * @returns {HTMLDivElement}
 */
function crearEtiqueta(datos, numeroCaja, numeroCajas, unidadesEstaCaja) {
    const etiqueta = document.createElement("div");
    etiqueta.className = "etiqueta-carnet";

    etiqueta.innerHTML = `
        <div class="etiqueta-titulo">
            ORDEN FABRICACION Nº: <strong class="etiqueta-orden-trabajo">${escaparHTML(datos.codigo)}</strong>
        </div>
        <div class="etiqueta-cliente">
            CLIENTE: <strong>${escaparHTML(datos.cliente)}</strong>
        </div>
        <div class="etiqueta-publicidad">
            PUBLICIDAD: <strong>${escaparHTML(datos.descripcion)}</strong>
        </div>
        <div class="etiqueta-datos">
            ${crearFilaEtiqueta("TOTAL UNIDS:", formatearNumero(datos.cantidad))}
        </div>
        <div class="etiqueta-unidades">
            UNIDADES EN CAJA:
            <strong>${formatearNumero(unidadesEstaCaja)} </strong>
        </div>
        <div class="etiqueta-caja">
            <strong>CAJA ${numeroCaja} DE ${numeroCajas}</strong>
        </div>
    `;

    return etiqueta;
}

/**
 * Builds the HTML for a "title: value" row inside a label.
 * @param {string} titulo
 * @param {string|number} valor
 * @returns {string}
 */
function crearFilaEtiqueta(titulo, valor) {
    return `
        <div class="fila-etiqueta">
            ${escaparHTML(titulo)}
            <strong>${escaparHTML(String(valor))}</strong>
        </div>
    `;
}

/**
 * Detects whether the app is running inside the native Capacitor shell.
 * @returns {boolean}
 */
function esAppNativa() {
    return Boolean(
        window.Capacitor &&
        typeof Capacitor.isNativePlatform === "function" &&
        Capacitor.isNativePlatform()
    );
}

/**
 * Prints the labels. Uses the browser print dialog on desktop and the
 * EtiquetaPrinter Capacitor plugin (100 x 50 mm paper) on Android.
 */
async function imprimirEtiquetas() {
    if (!esAppNativa()) {
        window.print();
        return;
    }

    const EtiquetaPrinter = Capacitor.Plugins && Capacitor.Plugins.EtiquetaPrinter;

    if (!EtiquetaPrinter) {
        alert("El plugin de impresión no está incluido en esta versión de la app.");
        return;
    }

    try {
        await EtiquetaPrinter.print();
    } catch (err) {
        alert("No se pudo abrir la impresión: " + (err.message || err));
    }
}


// =============================================================================
// 8. EDIT SCREEN
// =============================================================================

/** Opens the edit screen pre-filled with the current order. */
function abrirEdicion() {
    if (!datosOrdenActual) return;

    porId("editarOrden").value = datosOrdenActual.codigo || "";
    porId("editarCliente").value = datosOrdenActual.cliente || "";
    porId("editarPublicidad").value = datosOrdenActual.descripcion || "";
    porId("editarTotal").value = datosOrdenActual.cantidad || "";
    porId("editarNumeroCajas").value = datosOrdenActual.cajas.length;
    porId("editarUnidadesCaja").value = datosOrdenActual.unidadesPorCaja || "";

    // Discard inputs from a previous edit session so the list is rebuilt
    // from the current order instead of reusing stale values.
    porId("listaCajasEdicion").innerHTML = "";

    construirListaCajasEdicion();
    cambiarPantalla("pantallaEdicion");
}

/**
 * Computes the values for the box list after the box count changes.
 *
 * The last box always stays last (it is normally the partial one). Boxes are
 * added or removed immediately before it; new boxes take `valorNuevaCaja`.
 *
 * @param {string[]} actuales      Values currently in the list.
 * @param {number}   numeroCajas   Desired number of boxes (> 0).
 * @param {string}   valorNuevaCaja Default value for newly added boxes.
 * @returns {string[]}
 */
function calcularValoresCajas(actuales, numeroCajas, valorNuevaCaja) {
    if (actuales.length === 0) {
        return Array(numeroCajas).fill(valorNuevaCaja);
    }

    const ultima = actuales[actuales.length - 1];
    const anteriores = actuales.slice(0, -1);
    const necesarias = numeroCajas - 1;

    const valores = anteriores.length >= necesarias
        ? anteriores.slice(0, necesarias)
        : anteriores.concat(Array(necesarias - anteriores.length).fill(valorNuevaCaja));

    valores.push(ultima);
    return valores;
}

/**
 * Creates the editable field for a single box.
 * @param {number} indice 0-based box index.
 * @param {string} valor  Initial value.
 * @returns {HTMLDivElement}
 */
function crearCampoCaja(indice, valor) {
    const caja = document.createElement("div");
    caja.className = "caja-edicion";

    caja.innerHTML = `
        <label for="cajaEditada${indice}">
            CAJA ${indice + 1}
        </label>

        <input
            id="cajaEditada${indice}"
            class="input-caja-editada"
            type="number"
            min="0"
            step="1"
            value="${valor}"
            data-indice="${indice}"
        >
    `;

    caja.querySelector("input").addEventListener("input", actualizarTotalEditado);
    return caja;
}

/**
 * Rebuilds the list of editable boxes to match the "number of boxes" field.
 * Values already typed on screen are preserved; on first build they come
 * from the current order.
 */
function construirListaCajasEdicion() {
    const numeroCajas = parseInt(porId("editarNumeroCajas").value, 10);
    const contenedor = porId("listaCajasEdicion");

    if (!Number.isInteger(numeroCajas) || numeroCajas <= 0) {
        contenedor.innerHTML = "";
        actualizarTotalEditado();
        return;
    }

    const inputsActuales = contenedor.querySelectorAll(".input-caja-editada");
    const actuales = inputsActuales.length
        ? Array.from(inputsActuales).map((input) => input.value)
        : (datosOrdenActual?.cajas || []).map(String);

    const porCaja = parseInt(porId("editarUnidadesCaja").value, 10);
    const valorNuevaCaja = Number.isInteger(porCaja) && porCaja > 0 ? String(porCaja) : "";

    const valores = calcularValoresCajas(actuales, numeroCajas, valorNuevaCaja);

    contenedor.innerHTML = "";

    for (let i = 0; i < numeroCajas; i++) {
        contenedor.appendChild(crearCampoCaja(i, valores[i] ?? ""));
    }

    actualizarTotalEditado();
}

/** Recomputes and displays the sum of all valid box inputs. */
function actualizarTotalEditado() {
    let total = 0;

    document.querySelectorAll(".input-caja-editada").forEach((input) => {
        const valor = parseInt(input.value, 10);

        if (Number.isInteger(valor) && valor >= 0) {
            total += valor;
        }
    });

    porId("totalEditado").textContent = formatearNumero(total);
}

/**
 * Validates the edit form and applies the changes to the current order.
 * Warns (with a confirmation) when the boxes do not add up to the stated total.
 */
function guardarEdicion() {
    const numeroCajas = parseInt(porId("editarNumeroCajas").value, 10);

    if (!Number.isInteger(numeroCajas) || numeroCajas <= 0) {
        alert("El número de cajas no es válido.");
        return;
    }

    const cajas = [];

    for (let i = 0; i < numeroCajas; i++) {
        const input = porId(`cajaEditada${i}`);

        if (!input) {
            alert("No se pudieron leer todas las cajas.");
            return;
        }

        const valor = parseInt(input.value, 10);

        if (!Number.isInteger(valor) || valor < 0) {
            alert(`El valor de la caja ${i + 1} no es válido.`);
            return;
        }

        cajas.push(valor);
    }

    const totalCajas = cajas.reduce((suma, valor) => suma + valor, 0);
    const totalIntroducido = parseInt(porId("editarTotal").value, 10);

    if (!Number.isInteger(totalIntroducido) || totalIntroducido < 0) {
        alert("El total de unidades no es válido.");
        return;
    }
    if (totalCajas !== totalIntroducido) {
        const continuar = confirm(
            `Las cajas suman ${totalCajas} unidades, ` +
            `pero el total indicado es ${totalIntroducido}.\n\n` +
            `¿Desea guardar de todos modos?`
        );

        if (!continuar) return;
    }
    datosOrdenActual.codigo = porId("editarOrden").value.trim();
    datosOrdenActual.cliente = porId("editarCliente").value.trim();
    datosOrdenActual.descripcion = porId("editarPublicidad").value.trim();
    datosOrdenActual.cantidad = totalIntroducido;
    datosOrdenActual.numeroCajas = numeroCajas;
    datosOrdenActual.unidadesPorCaja =
        parseInt(porId("editarUnidadesCaja").value, 10) || 0;
    datosOrdenActual.cajas = cajas;



    mostrarEtiquetas(datosOrdenActual);

    porId("informacionCajas").textContent =
        `${cajas.length} ${cajas.length === 1 ? "caja" : "cajas"} · ` +
        `${formatearNumero(totalCajas)} unidades en cajas`;

    cambiarPantalla("pantallaEtiqueta");
}

/** Discards the edit form and returns to the labels screen. */
function cancelarEdicion() {
    mostrarEtiquetas(datosOrdenActual);
    cambiarPantalla("pantallaEtiqueta");
}


// =============================================================================
// 9. EVENT WIRING
// =============================================================================

/**
 * Enter-key shortcut: submits the form of whichever screen is active
 * (order lookup on the entry screen, label generation on the configuration
 * screen).
 * @param {KeyboardEvent} event
 */
function manejarTeclaEnter(event) {
    if (event.key !== "Enter") return;

    const enConfiguracion = porId("pantallaConfiguracion").classList.contains("activa");
    const enEntrada = porId("pantallaEntrada").classList.contains("activa");

    if (enConfiguracion) generarEtiquetas();
    if (enEntrada) consultarOrden();
}

/** Attaches every event listener. Called once when the script loads. */
function registrarEventos() {
    // Startup: runs after all scripts have loaded so loadTicketData exists.
    window.addEventListener("load", iniciarBaseDeDatos);

    // Global shortcuts
    document.addEventListener("keydown", manejarTeclaEnter);

    // Entry screen
    ordenExacta.addEventListener("change", () => {
        bloqueUnidadesTotales.classList.toggle("oculto", ordenExacta.checked);
    });
    porId("consultarOrden").addEventListener("click", consultarOrden);

    // Configuration screen
    unidadesPorCajaInput.addEventListener("input", actualizarCalculo);
    porId("generarEtiqueta").addEventListener("click", generarEtiquetas);

    // Labels screen
    porId("editarEtiquetas").addEventListener("click", abrirEdicion);
    porId("imprimirEtiquetas").addEventListener("click", imprimirEtiquetas);
    porId("nuevaOrden").addEventListener("click", nuevaOrden);
    porId("volverEntrada").addEventListener("click", () => cambiarPantalla("pantallaEntrada"));

    // Edit screen
    porId("editarNumeroCajas").addEventListener("change", construirListaCajasEdicion);
    porId("guardarEdicion").addEventListener("click", guardarEdicion);
    porId("cancelarEdicion").addEventListener("click", cancelarEdicion);

    // Error screen
    porId("volverError").addEventListener("click", () => cambiarPantalla("pantallaEntrada"));
}

registrarEventos();