/* ==== * Construcción del stack (enriquece pedidos)
   Además calcula metricas generales del conjunto de pedidos * ====*/
function buildStack(pedidos) {
  // acumuladores globales 
  let totalM3 = 0;
  let totalM3Confirmados = 0;
  let totalM3NoConfirmados = 0;

  // ordeno los pedidos: confirmados abajo (stack inicial), no confirmados arriba 
  /*
  // Sort anterior usado: Confirmado, CantCargas (desc), CantProgramada (desc)
  pedidos.sort((a, b) => {
    const confA = a.Confirmado === "SI" ? 0 : 1;
    const confB = b.Confirmado === "SI" ? 0 : 1;
    if (confA !== confB) return confA - confB;
    if (a.CantCargas !== b.CantCargas) return b.CantCargas - a.CantCargas;
    return b.CantProgramada - a.CantProgramada;
  });
  */

  pedidos.sort((a, b) => {
    const getPriority = (p) => {
      // 1. Masivos (> 100 m3)
      if ((p.CantProgramada ?? 0) > 100) return 0;
      // 2. Color 8
      if (p.ColorPedido == 8) return 1;
      // 3. No confirmados (Al final)
      if (p.Confirmado !== "SI") return 5;
      
      // 4. Confirmados (Azules > 1 camión)
      if (p.MaxCamiones > 1) return 2;
      
      // 5. Verdes (1 camión)
      if (p.CantPedidosObra === 1) return 4; // Verde Oscuro
      return 3;                              // Verde Claro
    };

    const prioA = getPriority(a);
    const prioB = getPriority(b);
    if (prioA !== prioB) return prioA - prioB;

    // A igual prioridad, por hora de inicio (offset)
    return (a.XG?.offset ?? 0) - (b.XG?.offset ?? 0);
  });

const horaMax = Math.max(0, d3.max(pedidos, p => (p.XG?.offset ?? 0) + (p.XG?.finrel ?? 0)) || 0);
const ocupacion = Array(horaMax + 1).fill(0);

pedidos.forEach(pedido => {
  // métricas de m3 
  const cant = pedido.CantProgramada ?? 0;
  totalM3 += cant;
  if (pedido.Confirmado === "SI") {
    totalM3Confirmados += cant;
  } else {
    totalM3NoConfirmados += cant;
  }

  // calculo las areas apiladas (stacked)
  const segmentosXY = [];
  (pedido.XG.demanda || []).forEach((v, i) => {
    const x = pedido.XG.offset + i;
    if (x < 0 || x > horaMax) return; // Enmark timeframe

    const y0 = ocupacion[x] || 0;
    const y1 = y0 + v;
    segmentosXY.push({ x, y0, y1, v });
    if (v > 0) {
      ocupacion[x] = y1;
    }
  });

  // derivar descargas gráficas
  const descargasXY = [];
  (pedido.XG.descargarel ?? []).forEach(idx => {
    const x = pedido.XG.offset + idx;
    if (x < 0 || x > horaMax) return; // Enmark timeframe

    const seg = segmentosXY.find(s => s.x === x && s.v > 0);
    if (!seg) return;
    descargasXY.push({
      key: idx,   // clave estable
      x,          // slot absoluto
      y: seg.y1   // techo del stack
    });
  });

  /* enriquecimiento directo del pedido */
  pedido.STK = { segmentosXY, descargasXY };
});

const ocupacionMax = d3.max(ocupacion);
const metrics = {
  volumenT: totalM3,
  volConfirmado: totalM3Confirmados,
  volNoConfirmado: totalM3NoConfirmados,
  envolvente: ocupacion,
  ...computeGlobalMetrics(ocupacion, CFG.granularidadMin)
};

  return { horaMax, ocupacionMax, metrics };
}

/* encuentra pedidos cercanos para mostrar en panel inferior */
function findSimilarPedidos({
  pedidos,
  pedidoBase,
  t,
  maxPorLado,
  delta = 6   // ±6 slots = 30 min
}) {
  const idxBase = pedidos.findIndex(p => p.id === pedidoBase.id);
  if (idxBase === -1) return [pedidoBase];

  const resultado = [];

  // helper: activo en ventana
  const activoEnVentana = p => {
    const { offset, finrel } = p.XG;
    const x0 = offset;
    const x1 = offset + finrel;
    return x1 >= (t - delta) && x0 <= (t + delta);
  };

  /* hacia arriba del stack */
  for (let i = idxBase - 1; i >= 0 && resultado.length < maxPorLado; i--) {
    if (activoEnVentana(pedidos[i])) {
      resultado.unshift(pedidos[i]);
    }
  }

  /* pedido base */
  resultado.push(pedidoBase);

  /* hacia abajo del stack */
  let countDown = 0;
  for (let i = idxBase + 1; i < pedidos.length && countDown < maxPorLado; i++) {
    if (activoEnVentana(pedidos[i])) {
      resultado.push(pedidos[i]);
      countDown++;
    }
  }

  return [...resultado].sort((a, b) => a.XG.offset - b.XG.offset);
}

/*  */
function computeGlobalMetrics(ocupacion, granularidadMin) {
  let maxGlobal = { value: -Infinity, slot: null };
  let maxAM = { value: -Infinity, slot: null };
  let min12_14 = { value: +Infinity, slot: null };
  let maxPM14 = { value: -Infinity, slot: null };

  ocupacion.forEach((v, slot) => {
    const minutes = slot * granularidadMin;

    // máxima general
    if (v > maxGlobal.value) {
      maxGlobal = { value: v, slot };
    }

    // AM < 12:00
    if (minutes < 12 * 60 && v > maxAM.value) {
      maxAM = { value: v, slot };
    }

    // entre 12:00 y 14:00
    if (minutes >= 12 * 60 && minutes <= 14 * 60 && v < min12_14.value) {
      min12_14 = { value: v, slot };
    }

    // después de 14:00
    if (minutes > 14 * 60 && v > maxPM14.value) {
      maxPM14 = { value: v, slot };
    }
  });

  return {
    maxGlobal: {
      value: maxGlobal.value,
      slot: maxGlobal.slot,
      hora: slotToHHMM(maxGlobal.slot, granularidadMin)
    },
    maxAM: {
      value: maxAM.value,
      slot: maxAM.slot,
      hora: slotToHHMM(maxAM.slot, granularidadMin)
    },
    min12_14: {
      value: min12_14.value,
      slot: min12_14.slot,
      hora: slotToHHMM(min12_14.slot, granularidadMin)
    },
    maxPM14: {
      value: maxPM14.value,
      slot: maxPM14.slot,
      hora: slotToHHMM(maxPM14.slot, granularidadMin)
    }
  };
}

/* desglosa pedidos en viajes individuales para vista de plantas */
function decomposePedidosIntoVoyages(pedidos, granularidadMin) {
  const voyages = [];
  pedidos.forEach(p => {
    const numViajes = p.CantCargas || 1;
    const cycleTime = (p.TiempoCarga || 0) + (p.Frecuencia || 0) + 2 * (p.TiempoViaje || 0);
    const cycleSlots = Math.ceil(cycleTime / granularidadMin);
    const freqSlots = Math.floor((p.Frecuencia || 0) / granularidadMin);
    const cargaSlots = Math.ceil((p.TiempoCarga || 0) / granularidadMin);
    const viajeSlots = Math.ceil((p.TiempoViaje || 0) / granularidadMin);
    
    for (let i = 0; i < numViajes; i++) {
      const voyageOffset = p.XG.offset + i * freqSlots;
      const descargaRelativa = cargaSlots + viajeSlots;

      // Clonamos el objeto y ajustamos su ID y XG
      const voyage = {
        ...p,
        id: `${p.id}_v${i}`,
        parentPedidoId: p.id,
        viajeIndex: i + 1,
        XG: {
          ...p.XG,
          offset: voyageOffset,
          finrel: cycleSlots,
          demanda: [], // no relevante para gantt individual
          descargarel: [descargaRelativa] 
        }
      };
      
      // Ajustar hito de descarga para el viaje
      voyage.STK = {
        segmentosXY: [], // no usado en gantt individual
        descargasXY: [{ 
          key: 0, 
          x: voyageOffset + descargaRelativa, 
          y: 0 
        }] 
      };
      
      voyages.push(voyage);
    }
  });
  return voyages;
}
