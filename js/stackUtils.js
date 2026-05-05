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
      // 2. Color 11 y 12
      if (p.ColorPedido == 11 || p.ColorPedido == 12) return 1;
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

/* ==== * Construcción del stack para Plantas (Cargas discretas) * ====*/
function buildPlantLoadStack(pedidos, granularidadMin) {
  let totalM3 = 0;
  let totalM3Confirmados = 0;
  let totalM3NoConfirmados = 0;

  pedidos.sort((a, b) => {
    const getPriority = (p) => {
      if ((p.CantProgramada ?? 0) > 100) return 0;
      if (p.ColorPedido == 11 || p.ColorPedido == 12) return 1;
      if (p.Confirmado !== "SI") return 5;
      if (p.MaxCamiones > 1) return 2;
      if (p.CantPedidosObra === 1) return 4;
      return 3;
    };
    const prioA = getPriority(a);
    const prioB = getPriority(b);
    if (prioA !== prioB) return prioA - prioB;
    return (a.XG?.offset ?? 0) - (b.XG?.offset ?? 0);
  });

  const horaMax = Math.max(0, d3.max(pedidos, p => {
    const numViajes = p.CantCargas || 1;
    const freqSlots = Math.floor((p.Frecuencia || 0) / granularidadMin);
    return (p.XG?.offset ?? 0) + (numViajes - 1) * freqSlots + 1;
  }) || 0);

  const ocupacionCargas = Array(horaMax + 1).fill(0);

  pedidos.forEach(pedido => {
    const cant = pedido.CantProgramada ?? 0;
    totalM3 += cant;
    if (pedido.Confirmado === "SI") {
      totalM3Confirmados += cant;
    } else {
      totalM3NoConfirmados += cant;
    }

    const numViajes = pedido.CantCargas || 1;
    const freqSlots = Math.floor((pedido.Frecuencia || 0) / granularidadMin);

    const bloquesXY = [];

    for (let i = 0; i < numViajes; i++) {
      const x = pedido.XG.offset + i * freqSlots;
      if (x < 0 || x > horaMax) continue;

      const y0 = ocupacionCargas[x] || 0;
      const y1 = y0 + 1; // Altura de 1 carga

      bloquesXY.push({ x, y0, y1, v: 1 });
      ocupacionCargas[x] = y1;
    }

    pedido.STK_PLANTAS = { bloquesXY };
  });

  const ocupacionMax = d3.max(ocupacionCargas) || 0;
  const metrics = {
    volumenT: totalM3,
    volConfirmado: totalM3Confirmados,
    volNoConfirmado: totalM3NoConfirmados,
    envolvente: ocupacionCargas,
    ...computeGlobalMetrics(ocupacionCargas, granularidadMin)
  };

  return { horaMax, ocupacionMax, metrics };
}

/* ==== * Construcción del stack para Colas (Lógica FIFO) * ====*/
function buildColasStack(pedidos, granularidadMin) {
  let totalM3 = 0;
  let totalM3Confirmados = 0;
  let totalM3NoConfirmados = 0;

  const uniquePlantas = new Set();
  pedidos.forEach(p => uniquePlantas.add(p.Planta));

  let bocasDisp = 0;
  uniquePlantas.forEach(pCode => {
    if (window.plantasData && window.plantasData[pCode] && window.plantasData[pCode].cant_bocas) {
      bocasDisp += window.plantasData[pCode].cant_bocas;
    } else {
      bocasDisp += 1; // Fallback per plant
    }
  });

  if (bocasDisp === 0) bocasDisp = 2; // Global fallback
  const getPriority = (p) => {
    if ((p.CantProgramada ?? 0) > 100) return 0;
    if (p.ColorPedido == 11 || p.ColorPedido == 12) return 1;
    if (p.Confirmado !== "SI") return 5;
    if (p.MaxCamiones > 1) return 2;
    if (p.CantPedidosObra === 1) return 4;
    return 3;
  };

  const voyages = [];
  pedidos.forEach(p => {
    const cant = p.CantProgramada ?? 0;
    totalM3 += cant;
    if (p.Confirmado === "SI") totalM3Confirmados += cant;
    else totalM3NoConfirmados += cant;

    const numViajes = p.CantCargas || 1;
    const freqSlots = Math.floor((p.Frecuencia || 0) / granularidadMin);

    for (let i = 0; i < numViajes; i++) {
      const xArrive = p.XG.offset + i * freqSlots;
      voyages.push({ pedido: p, xArrive, prio: getPriority(p) });
    }

    p.STK_COLAS = { bloquesXY: [], conexionesXY: [] };
  });

  voyages.sort((a, b) => {
    if (a.xArrive !== b.xArrive) return a.xArrive - b.xArrive;
    return a.prio - b.prio;
  });

  const horaMax = Math.max(0, d3.max(voyages, v => v.xArrive) || 0) + 100; // Extra buffer
  const bocas = Array(bocasDisp).fill(0);
  const queueLevels = Array(horaMax + 1).fill(0);
  const globalOcupacion = Array(horaMax + 1).fill(0);

  voyages.forEach(v => {
    let tServe = v.xArrive;
    let freeBoca = -1;
    while (true) {
      for (let j = 0; j < bocasDisp; j++) {
        if (bocas[j] <= tServe) {
          freeBoca = j;
          break;
        }
      }
      if (freeBoca !== -1) {
        bocas[freeBoca] = tServe + 1;
        v.xServe = tServe;
        v.boca = freeBoca;
        break;
      }
      tServe++;
    }

    if (v.xServe > v.xArrive) {
      const ql = queueLevels[v.xArrive] || 0;
      v.yWait = bocasDisp + ql;
      queueLevels[v.xArrive] = ql + 1;

      v.pedido.STK_COLAS.bloquesXY.push({ x: v.xArrive, y0: v.yWait, y1: v.yWait + 1, v: 1, type: 'wait' });
      v.pedido.STK_COLAS.bloquesXY.push({ x: v.xServe, y0: v.boca, y1: v.boca + 1, v: 1, type: 'serve', delayed: true });

      v.pedido.STK_COLAS.conexionesXY.push({
        x1: v.xArrive + 1,
        y1: v.yWait + 0.5,
        x2: v.xServe,
        y2: v.boca + 0.5
      });
      globalOcupacion[v.xArrive] = Math.max(globalOcupacion[v.xArrive] || 0, v.yWait + 1);
    } else {
      v.pedido.STK_COLAS.bloquesXY.push({ x: v.xServe, y0: v.boca, y1: v.boca + 1, v: 1, type: 'serve' });
    }

    globalOcupacion[v.xServe] = Math.max(globalOcupacion[v.xServe] || 0, v.boca + 1);
  });

  const maxDelayByTime = Array(horaMax + 1).fill(0);
  voyages.forEach(v => {
    const delay = v.xServe - v.xArrive;
    if (delay > maxDelayByTime[v.xArrive]) {
      maxDelayByTime[v.xArrive] = delay;
    }
  });

  const ocupacionMax = d3.max(globalOcupacion) || 2;
  const metrics = {
    volumenT: totalM3,
    volConfirmado: totalM3Confirmados,
    volNoConfirmado: totalM3NoConfirmados,
    envolvente: globalOcupacion,
    maxDelayByTime: maxDelayByTime,
    ...computeGlobalMetrics(globalOcupacion, granularidadMin)
  };

  return { horaMax: d3.max(voyages, v => v.xServe) + 1, ocupacionMax, metrics };
}

