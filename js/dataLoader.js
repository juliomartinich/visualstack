/* ========================= DATA LOADER MODULE ========================= */

function loadAppData() {
  return Promise.all([
    fetch(`data/Pedidos.json?v=${Date.now()}`, { cache: "no-store" }).then(r => r.json()),
    fetch(`data/colores.json?v=${Date.now()}`, { cache: "no-store" }).then(r => r.json()).catch(() => []),
    fetch(`data/plantas.json?v=${Date.now()}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
    fetch(`data/Tick.json?v=${Date.now()}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({}))
  ])
    .then(([data, coloresData, plantasData, ticketsData]) => {
      window.plantasData = plantasData;
      window.ticketsData = ticketsData.Ticket || {};
      window.pedidoColorsMap = new Map(coloresData.map(c => [c.id, c.color]));

      /* ===== META INFO ===== */
      const rawReportDate = data.DiaReporte;
      window.horaReporte = data.HoraReporte;
      window.diaReporte = data.DiaReporte;
      const meta = {
        DiaReporte: formatFecha(rawReportDate),
        HoraReporte: data.HoraReporte
      };

      // Load ALL orders without initial filtering by date
      const fullPedidos = Object.entries(data.pedidos)
        .filter(([id]) => id !== "dummy")
        .map(([id, p]) => {
          const pedidoNeg = extendPedidoNegocio(p, id, plantasData);
          const XG = extendPedidoXG(pedidoNeg, CFG.granularidadMin);
          const MaxCamiones = XG.demanda.length
            ? Math.max(...XG.demanda)
            : 0;
          const result = { ...pedidoNeg, XG, MaxCamiones };
          result.despachos = calculateDespachosForPedido(result, CFG.granularidadMin);

          // Map real dispatches from Tick.json
          const orderTickets = Object.entries(window.ticketsData)
            .filter(([tId, t]) => String(t.Pedido) === id)
            .map(([tId, t]) => ({ ...t, ticketId: tId }));
          result.realDespachos = calculateRealDespachosForPedido(result, orderTickets, CFG.granularidadMin);
          result.CantRealDespachos = result.realDespachos.filter(d => !d.isAnulado).length;

          // Calculate MaxRealCamiones (maximum simultaneous trucks active at any minute)
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

      return { fullPedidos, meta, rawReportDate };
    });
}
