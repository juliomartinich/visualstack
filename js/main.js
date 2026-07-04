/* ================== MAIN ================== */

// Configuración y creación del SVG principal
const width = 1260;
const height = 490;
const margin = { top: 20, right: 20, bottom: 40, left: 50 };

const panel = d3.select("#panel");
const { svg, g, innerW, innerH } = createSVG("#chart", width, height, margin);

// Variables globales
let pedidos, layers, area, scales, band, ganttPanel;
let fullPedidos, meta, rawReportDate, grupos = {}, tomorrowStr, uniqueDates;
let filterFechaPanel, filterFechaHeader, filterPlantaHeader, filterSelect;
let codObraInput, headerCodObraInput, codObraList, filterCheck, headerFilterCheck;
window.appCache = {};

/* ================== 1. LEER DATOS ================== */
function leerDatos() {
  return Promise.all([
    fetch(`data/Pedidos.json?v=${Date.now()}`, { cache: "no-store" }).then(r => r.json()),
    fetch(`data/colores.json?v=${Date.now()}`, { cache: "no-store" }).then(r => r.json()).catch(() => []),
    fetch(`data/plantas.json?v=${Date.now()}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
    fetch(`data/Tick.json?v=${Date.now()}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({}))
  ]);
}

/* ================== 2. ENRIQUECER DATOS ================== */
function enriquecerDatos(data, coloresData, plantasData, ticketsData) {
  window.plantasData = plantasData;
  window.ticketsData = ticketsData.Ticket || {};
  window.pedidoColorsMap = new Map(coloresData.map(c => [c.id, c.color]));

  /* ===== INFO DE METADATOS ===== */
  rawReportDate = data.DiaReporte;
  window.horaReporte = data.HoraReporte;
  window.diaReporte = data.DiaReporte;
  meta = {
    DiaReporte: formatFecha(rawReportDate),
    HoraReporte: data.HoraReporte
  };

  // Carga TODOS los pedidos sin filtrado inicial por fecha
  fullPedidos = Object.entries(data.pedidos)
    .filter(([id]) => id !== "dummy")
    .map(([id, p]) => {
      const pedidoNeg = extendPedidoNegocio(p, id, plantasData);
      const XG = extendPedidoXG(pedidoNeg, CFG.granularidadMin);
      const MaxCamiones = XG.demanda.length
        ? Math.max(...XG.demanda)
        : 0;
      const result = { ...pedidoNeg, XG, MaxCamiones };
      result.despachos = calculateDespachosForPedido(result, CFG.granularidadMin);

      // Mapea los despachos reales desde Tick.json
      const orderTickets = Object.entries(window.ticketsData)
        .filter(([tId, t]) => String(t.Pedido) === id)
        .map(([tId, t]) => ({ ...t, ticketId: tId }));
      result.realDespachos = calculateRealDespachosForPedido(result, orderTickets, CFG.granularidadMin);
      result.CantRealDespachos = result.realDespachos.filter(d => !d.isAnulado).length;

      // Calcula MaxRealCamiones (cantidad máxima de camiones simultáneos activos en cualquier minuto)
      if (result.realDespachos.length === 0) {
        result.MaxRealCamiones = 0;
      } else {
        const tMin = Math.min(...result.realDespachos.map(d => d.HoraAsignacionMin));
        const tMax = Math.max(...result.realDespachos.map(d => d.HoraFinalMin));
        const timeline = new Array(Math.max(1, tMax - tMin + 1)).fill(0);
        result.realDespachos.forEach(d => {
          const start = d.HoraAsignacionMin - tMin;
          const end = d.HoraFinalMin - tMin;
          for (let t = start; t < end; t++) {
            if (t >= 0 && t < timeline.length) {
              timeline[t]++;
            }
          }
        });
        result.MaxRealCamiones = Math.max(...timeline);
      }

      return result;
    });

  // Agrupa plantas por grupo de despacho
  Object.entries(window.plantasData).forEach(([code, p]) => {
    const g = p.grupo_despacho;
    if (g) {
      if (!grupos[g]) grupos[g] = [];
      grupos[g].push(code);
    }
  });

  tomorrowStr = getTomorrow(rawReportDate);
  uniqueDates = [...new Set(fullPedidos.map(p => p["Fecha Pedido"]))].sort();
}

/* ================== 3. DIBUJAR ================== */
function dibujar() {
  const activePlanta = localStorage.getItem("filterPlantaGrupo") || "Grupo:TODOS";
  renderDateOptionsForFilter(activePlanta);
  renderDashboard(activePlanta);
}
window.dibujar = dibujar;

/* ================== 4. INTERACCIÓN ================== */
function inicializarInteraccion() {
  svg.on("mouseleave", () => resetInteraction({
    cursor: d3.select(".cursor"),
    layers: d3.selectAll("g.pedido"),
    overlay: d3.select(".overlay"),
    panel,
    band: window.currentBand
  }));
}

// Orquestador del flujo principal de inicialización
leerDatos()
  .then(([data, coloresData, plantasData, ticketsData]) => {
    enriquecerDatos(data, coloresData, plantasData, ticketsData);
    inicializarControles();
    dibujar();
    inicializarInteraccion();
  });

/* ================== END MAIN ================== */