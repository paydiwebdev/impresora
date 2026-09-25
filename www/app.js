// ============================================================
// DATOS SIMULADOS
// Sustituir consultarAPI() por el GET real cuando conectemos la API.
// ============================================================

const baseDatosSimulada = {
    "1001": {
        ordenFabricacion: "1001",
        nombreCliente: "CLIENTE A",
        publicidad: "CAMPAÑA VERANO",
        totalUnidades: 1200
    },

    "1002": {
        ordenFabricacion: "1002",
        nombreCliente: "CLIENTE B",
        publicidad: "PROMOCIÓN ESPECIAL",
        totalUnidades: 500
    },

    "123456": {
        ordenFabricacion: "123456",
        nombreCliente: "CLIENTE DEMO",
        publicidad: "PUBLICIDAD DEMO",
        totalUnidades: 1250
    }
};


// ============================================================
// ESTADO DE LA APLICACIÓN
// ============================================================

let datosOrdenActual = null;


// ============================================================
// CAMBIO DE PANTALLAS
// ============================================================

function cambiarPantalla(idPantalla) {
    document.querySelectorAll(".pantalla").forEach((pantalla) => {
        pantalla.classList.remove("activa");
    });

    const pantalla = document.getElementById(idPantalla);

    if (pantalla) {
        pantalla.classList.add("activa");
        window.scrollTo(0, 0);
    }
}
// ============================================================
// CASILLA EXACTA
// ============================================================

const ordenExacta = document.getElementById("ordenExacta");
const bloqueUnidadesTotales = document.getElementById("bloqueUnidadesTotales");

ordenExacta.addEventListener("change", () => {
    bloqueUnidadesTotales.classList.toggle("oculto", ordenExacta.checked);
});




// logica para teclado virtual sin usar ni acabar de arreglar logica
// // ============================================================
// // TECLADO VIRTUAL
// // ============================================================

// const pantallaEntradaActiva = document.getElementById("pantallaEntrada").classList.contains("activa");

// document.querySelectorAll("[data-numero]").forEach((boton) => {
//     boton.addEventListener("click", () => {
//         campoActivo.value += boton.dataset.numero;
//     });
// });

// borrar.addEventListener("click", () => {
//     campoActivo.value = "";
// });

// retroceder.addEventListener("click", () => {
//     campoActivo.value = campoActivo.value.slice(0, -1);
// });

// // ============================================================
// // TECLADO FÍSICO BORRAR
// // ============================================================

// document.addEventListener("keydown", (event) => {
//     const pantallaEntradaActiva =
//         document.getElementById("pantallaEntrada").classList.contains("activa");

//     if (!pantallaEntradaActiva) {
//         return;
//     }

//     if (/^[0-9]$/.test(event.key)) {
//         campoActivo.value += event.key;
//     }

//     if (event.key === "Backspace") {
//         campoActivo.value = campoActivo.value.slice(0, -1);
//     }

//     if (event.key === "Escape") {
//         campoActivo.value = "";
//     }

//     if (event.key === "Enter") {
//         consultarOrden();
//     }
// });


// ============================================================
// CONSULTA API SIMULADA
// ============================================================

function consultarAPI(numero) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(baseDatosSimulada[numero] || null);
        }, 600);
    });
}


// ============================================================
// CONSULTAR ORDEN
// ============================================================

document.getElementById("consultarOrden").addEventListener("click", consultarOrden);

async function consultarOrden() {
    const numero = numeroOrden.value.trim();

    if (!numero) {
        mostrarError("Introduzca un número de orden.");
        return;
    }

    const exacta = ordenExacta.checked;
    const unidadesManuales = parseInt(
        document.getElementById("unidadesTotales").value,
        10
    );

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

        datosOrdenActual = {
            ...datos,
            ordenExacta: exacta
        };

        // Si NO es exacta, usamos las unidades introducidas manualmente.
        if (!exacta) {
            datosOrdenActual.totalUnidades = unidadesManuales;
        }

        mostrarResumenConfiguracion();
        cambiarPantalla("pantallaConfiguracion");

    } catch (error) {
        mostrarError("No se pudo consultar la orden.");
    }
}


// ============================================================
// PANTALLA UNIDADES POR CAJA
// ============================================================

const unidadesPorCajaInput = document.getElementById("unidadesPorCaja");

unidadesPorCajaInput.addEventListener("input", actualizarCalculo);

function mostrarResumenConfiguracion() {
    const datos = datosOrdenActual;

    document.getElementById("resumenOrden").innerHTML = `
        <strong>Orden:</strong> ${escaparHTML(datos.ordenFabricacion)}<br>
        <strong>Cliente:</strong> ${escaparHTML(datos.nombreCliente)}<br>
        <strong>Publicidad:</strong> ${escaparHTML(datos.publicidad)}<br>
        <strong>Total unidades:</strong> ${formatearNumero(datos.totalUnidades)}
    `;

    unidadesPorCajaInput.value = "";
    document.getElementById("previsualizacionCalculo").textContent = "";
}

function actualizarCalculo() {
    const unidadesPorCaja = parseInt(unidadesPorCajaInput.value, 10);

    if (
        !Number.isInteger(unidadesPorCaja) ||
        unidadesPorCaja <= 0 ||
        !datosOrdenActual
    ) {
        document.getElementById("previsualizacionCalculo").textContent = "";
        return;
    }

    const total = Number(datosOrdenActual.totalUnidades);
    const numeroCajas = Math.ceil(total / unidadesPorCaja);
    const resto = total % unidadesPorCaja;

    let texto = `${numeroCajas} ${numeroCajas === 1 ? "caja" : "cajas"}`;

    if (resto > 0) {
        texto += ` · última caja: ${resto} unidades`;
    } else {
        texto += " · todas las cajas completas";
    }

    document.getElementById("previsualizacionCalculo").textContent = texto;
}


// ============================================================
// GENERAR ETIQUETAS
// ============================================================

document.getElementById("generarEtiqueta").addEventListener("click", generarEtiquetas);

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

    const totalUnidades = Number(datosOrdenActual.totalUnidades);

    if (!Number.isFinite(totalUnidades) || totalUnidades <= 0) {
        mostrarError("El total de unidades no es válido.");
        return;
    }

    const numeroCajas = Math.ceil(totalUnidades / unidadesPorCaja);

    datosOrdenActual.unidadesPorCaja = unidadesPorCaja;
    datosOrdenActual.numeroCajas = numeroCajas;

    datosOrdenActual.cajas = calcularCajas(
        totalUnidades,
        unidadesPorCaja
    );

    mostrarEtiquetas(datosOrdenActual);

    document.getElementById("informacionCajas").textContent =
        `${numeroCajas} ${numeroCajas === 1 ? "caja" : "cajas"} · ` +
        `${formatearNumero(totalUnidades)} unidades`;

    cambiarPantalla("pantallaEtiqueta");
}


// ============================================================
// CALCULAR DISTRIBUCIÓN DE CAJAS
// ============================================================

function calcularCajas(totalUnidades, unidadesPorCaja) {
    const cajas = [];
    let restantes = totalUnidades;

    while (restantes > 0) {
        const unidadesEstaCaja = Math.min(
            unidadesPorCaja,
            restantes
        );

        cajas.push(unidadesEstaCaja);
        restantes -= unidadesEstaCaja;
    }

    return cajas;
}


// ============================================================
// MOSTRAR ETIQUETAS
// ============================================================

function mostrarEtiquetas(datos) {
    const contenedor = document.getElementById("contenedorEtiqueta");
    contenedor.innerHTML = "";

    datos.cajas.forEach((unidadesEstaCaja, indice) => {
        const numeroCaja = indice + 1;

        const etiqueta = crearEtiqueta(
            datos,
            numeroCaja,
            datos.cajas.length,
            unidadesEstaCaja
        );

        contenedor.appendChild(etiqueta);
    });
}


// ============================================================
// CREAR UNA ETIQUETA
// ============================================================

function crearEtiqueta(
    datos,
    numeroCaja,
    numeroCajas,
    unidadesEstaCaja
) {
    const etiqueta = document.createElement("div");
    etiqueta.className = "etiqueta-carnet";

    etiqueta.innerHTML = `
        <div class="etiqueta-titulo">
            ORDEN FABRICACION Nº: <strong>${escaparHTML(datos.ordenFabricacion)}</strong>
        </div>

        <div class="etiqueta-cliente">
            NOMBRE CLIENTE: <strong>${escaparHTML(datos.nombreCliente)}</strong>
        </div>

        <div class="etiqueta-publicidad">
            PUBLICIDAD: <strong>${escaparHTML(datos.publicidad)}</strong>
        </div>

        <div class="etiqueta-datos">
            ${crearFilaEtiqueta(
                "TOTAL UNIDS:",
                formatearNumero(datos.totalUnidades)
            )}

            ${crearFilaEtiqueta(
                "UNIDADES X CAJA:",
                formatearNumero(datos.unidadesPorCaja)
            )}
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

function crearFilaEtiqueta(titulo, valor) {
    return `
        <div class="fila-etiqueta">
            ${escaparHTML(titulo)}
            <strong>${escaparHTML(String(valor))}</strong>
        </div>
    `;
}


// ============================================================
// EDICIÓN COMPLETA
// ============================================================

document.getElementById("editarEtiquetas").addEventListener("click", abrirEdicion);

function abrirEdicion() {
    if (!datosOrdenActual) {
        return;
    }

    document.getElementById("editarOrden").value =
        datosOrdenActual.ordenFabricacion || "";

    document.getElementById("editarCliente").value =
        datosOrdenActual.nombreCliente || "";

    document.getElementById("editarPublicidad").value =
        datosOrdenActual.publicidad || "";

    document.getElementById("editarTotal").value =
        datosOrdenActual.totalUnidades || "";

    document.getElementById("editarNumeroCajas").value =
        datosOrdenActual.cajas.length;

    document.getElementById("editarUnidadesCaja").value =
        datosOrdenActual.unidadesPorCaja || "";

    construirListaCajasEdicion();

    cambiarPantalla("pantallaEdicion");
}


// ============================================================
// LISTA DE CAJAS EDITABLE
// ============================================================

document.getElementById("editarNumeroCajas")
    .addEventListener("change", construirListaCajasEdicion);

document.getElementById("editarUnidadesCaja")
    .addEventListener("input", () => {
        // No modificamos automáticamente las cajas existentes.
        // Solo actualizamos el campo general de unidades/caja.
    });

function construirListaCajasEdicion() {
    const numeroCajas = parseInt(
        document.getElementById("editarNumeroCajas").value,
        10
    );

    const contenedor = document.getElementById("listaCajasEdicion");

    if (!Number.isInteger(numeroCajas) || numeroCajas <= 0) {
        contenedor.innerHTML = "";
        actualizarTotalEditado();
        return;
    }

    const valoresActuales = datosOrdenActual?.cajas || [];

    contenedor.innerHTML = "";

    for (let i = 0; i < numeroCajas; i++) {
        const valor = valoresActuales[i] ?? "";

        const caja = document.createElement("div");
        caja.className = "caja-edicion";

        caja.innerHTML = `
            <label for="cajaEditada${i}">
                CAJA ${i + 1}
            </label>

            <input
                id="cajaEditada${i}"
                class="input-caja-editada"
                type="number"
                min="0"
                step="1"
                value="${valor}"
                data-indice="${i}"
            >
        `;

        contenedor.appendChild(caja);
    }

    document.querySelectorAll(".input-caja-editada").forEach((input) => {
        input.addEventListener("input", actualizarTotalEditado);
    });

    actualizarTotalEditado();
}

function actualizarTotalEditado() {
    let total = 0;

    document.querySelectorAll(".input-caja-editada").forEach((input) => {
        const valor = parseInt(input.value, 10);

        if (Number.isInteger(valor) && valor >= 0) {
            total += valor;
        }
    });

    document.getElementById("totalEditado").textContent =
        formatearNumero(total);
}


// ============================================================
// GUARDAR EDICIÓN
// ============================================================

document.getElementById("guardarEdicion")
    .addEventListener("click", guardarEdicion);

function guardarEdicion() {
    const numeroCajas = parseInt(
        document.getElementById("editarNumeroCajas").value,
        10
    );

    if (!Number.isInteger(numeroCajas) || numeroCajas <= 0) {
        alert("El número de cajas no es válido.");
        return;
    }

    const cajas = [];

    for (let i = 0; i < numeroCajas; i++) {
        const input = document.getElementById(`cajaEditada${i}`);

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

    const totalCajas = cajas.reduce(
        (suma, valor) => suma + valor,
        0
    );

    const totalIntroducido = parseInt(
        document.getElementById("editarTotal").value,
        10
    );

    if (!Number.isInteger(totalIntroducido) || totalIntroducido < 0) {
        alert("El total de unidades no es válido.");
        return;
    }

    // Guardamos todos los cambios manuales.
    datosOrdenActual.ordenFabricacion =
        document.getElementById("editarOrden").value.trim();

    datosOrdenActual.nombreCliente =
        document.getElementById("editarCliente").value.trim();

    datosOrdenActual.publicidad =
        document.getElementById("editarPublicidad").value.trim();

    datosOrdenActual.totalUnidades = totalIntroducido;

    datosOrdenActual.numeroCajas = numeroCajas;

    datosOrdenActual.unidadesPorCaja = parseInt(
        document.getElementById("editarUnidadesCaja").value,
        10
    ) || 0;

    datosOrdenActual.cajas = cajas;

    // Aviso si el total de las cajas no coincide con el total indicado.
    if (totalCajas !== totalIntroducido) {
        const continuar = confirm(
            `Las cajas suman ${totalCajas} unidades, ` +
            `pero el total indicado es ${totalIntroducido}.\n\n` +
            `¿Desea guardar de todos modos?`
        );

        if (!continuar) {
            return;
        }
    }

    mostrarEtiquetas(datosOrdenActual);

    document.getElementById("informacionCajas").textContent =
        `${datosOrdenActual.cajas.length} ` +
        `${datosOrdenActual.cajas.length === 1 ? "caja" : "cajas"} · ` +
        `${formatearNumero(totalCajas)} unidades en cajas`;

    cambiarPantalla("pantallaEtiqueta");
}


// ============================================================
// CANCELAR EDICIÓN
// ============================================================

document.getElementById("cancelarEdicion")
    .addEventListener("click", () => {
        mostrarEtiquetas(datosOrdenActual);
        cambiarPantalla("pantallaEtiqueta");
});


// ============================================================
// IMPRIMIR
// ============================================================

document.getElementById("imprimirEtiquetas")
    .addEventListener("click", () => {
        window.print();
    });


// ============================================================
// VOLVER / NUEVA ORDEN
// ============================================================

document.getElementById("volverEntrada")
    .addEventListener("click", () => {
        cambiarPantalla("pantallaEntrada");
    });

document.getElementById("nuevaOrden")
    .addEventListener("click", nuevaOrden);

function nuevaOrden() {
    datosOrdenActual = null;

    numeroOrden.value = "";
    ordenExacta.checked = true;
    document.getElementById("unidadesTotales").value = "";
    document.getElementById("unidadesPorCaja").value = "";

    bloqueUnidadesTotales.classList.add("oculto");

    cambiarPantalla("pantallaEntrada");
}


// ============================================================
// ERROR
// ============================================================

function mostrarError(mensaje) {
    document.getElementById("mensajeError").textContent = mensaje;
    cambiarPantalla("pantallaError");
}

document.getElementById("volverError")
    .addEventListener("click", () => {
        cambiarPantalla("pantallaEntrada");
});


// ============================================================
// UTILIDADES
// ============================================================

function formatearNumero(numero) {
    return Number(numero).toLocaleString("es-ES");
}

function escaparHTML(valor) {
    return String(valor)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
