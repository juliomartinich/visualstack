/* ================== DATA UTILITIES ================== */

// Cookie helpers
function setCookie(name, value, days = 400) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
}
function getCookie(name) {
  return document.cookie.split('; ').reduce((r, v) => {
    const parts = v.split('=');
    return parts[0] === name ? decodeURIComponent(parts[1]) : r;
  }, '');
}

function hhmmssToMin(hhmmss) {
  if (!hhmmss) return null;
  const [hh, mm, ss] = hhmmss.split(":").map(Number);
  return hh * 60 + mm + (ss ? ss / 60 : 0);
}

function minToHHMM(min) {
  const hh = Math.floor(min / 60);
  const mm = Math.round(min % 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatFecha(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1; // 0-based
  const d = Number(yyyymmdd.slice(6, 8));
  const fecha = new Date(y, m, d);
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const meses = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
  ];
  return `${dias[fecha.getDay()]} ${d} ${meses[m]}`;
}

function extendPedidoNegocio(pedido, id, plantasMap = {}) {
  const TiempoViaje = Number(pedido.TiempoViaje);
  const Frecuencia = Number(pedido.Frecuencia);
  const TiempoCarga = plantasMap[pedido.Planta]?.tiempo_carga ?? 0;
  const HoraInicioMin = hhmmssToMin(pedido.HoraInicio);
  const HoraAsignacionMin = HoraInicioMin - TiempoViaje - TiempoCarga;
  const TiempoCiclo = TiempoCarga + TiempoViaje + Frecuencia + TiempoViaje;
  const CantDescargas = pedido.CantCargas;

  const Descargas = Array.from({ length: CantDescargas }, (_, i) => {
    const Min = HoraInicioMin + i * Frecuencia;
    return { idx: i, Min, Hhmm: minToHHMM(Min) };
  });

  const HoraUltimaDescargaMin = Descargas.length
    ? Descargas[Descargas.length - 1].Min
    : HoraInicioMin;

  const HoraFinalMin = HoraUltimaDescargaMin + Frecuencia + TiempoViaje;

  return {
    id,
    ...pedido,
    TiempoCarga,
    TiempoCiclo,
    HoraInicioMin,
    HoraAsignacionMin,
    HoraFinalMin,
    Descargas,
    HoraAsignacionHhmm: minToHHMM(HoraAsignacionMin),
    HoraFinalHhmm: minToHHMM(HoraFinalMin)
  };
}

function extendPedidoXG(pedido, granularidad) {
  const offset = Math.floor(pedido.HoraAsignacionMin / granularidad);
  const descargarel = (pedido.Descargas ?? []).map(d =>
    Math.floor(d.Min / granularidad) - offset
  );
  const finrel = Math.floor(pedido.HoraFinalMin / granularidad) - offset;
  const ciclo = Math.ceil(pedido.TiempoCiclo / granularidad);
  const freq = Math.ceil(pedido.Frecuencia / granularidad);
  const demanda = generarDemanda(pedido.CantCargas, ciclo, freq);
  return { offset, descargarel, finrel, ciclo, freq, demanda };
}

function generarDemanda(cantCargas, ciclo, freq) {
  let largo = 0;
  for (let i = 0; i < cantCargas; i++) {
    const fin = i * freq + ciclo;
    largo = Math.max(largo, fin);
  }
  const demanda = new Array(largo).fill(0);
  for (let i = 0; i < cantCargas; i++) {
    const inicio = i * freq;
    const fin = inicio + ciclo;
    for (let t = inicio; t < fin; t++) {
      demanda[t] += 1;
    }
  }
  return demanda;
}

function slotToMinutes(slot, granularidadMin) {
  return slot * granularidadMin;
}

function minutesToHHMM(min) {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function slotToHHMM(slot, granularidadMin) {
  return minutesToHHMM(slotToMinutes(slot, granularidadMin));
}

function formatM3(v) {
  return d3.format(",.0f")(v).replace(/,/g, ".");
}

function calculateDespachosForPedido(p, granularidad) {
  const CantProgramada = Number(p.CantProgramada) || 0;
  const TamanoCarga = Number(p.TamanoCarga) || 8;
  const Frecuencia = Number(p.Frecuencia) || 0;
  const TiempoCarga = Number(p.TiempoCarga) || 0;
  const TiempoViaje = Number(p.TiempoViaje) || 0;
  const TiempoCiclo = Number(p.TiempoCiclo) || 0;

  const N = Math.ceil(CantProgramada / TamanoCarga);
  const despachos = [];

  const freqSlots = Math.ceil(Frecuencia / granularidad);
  const cicloSlots = Math.ceil(TiempoCiclo / granularidad);

  for (let i = 0; i < N; i++) {
    const despachoIndex = i + 1;
    const vol = (i === N - 1) ? (CantProgramada - i * TamanoCarga) : TamanoCarga;

    // El offset absoluto en slots se calcula sumando i * freqSlots al offset del pedido
    const offset = p.XG.offset + i * freqSlots;

    // La descarga relativa del despacho:
    // Si el pedido original tiene descargas definidas, las usamos de forma relativa.
    // Si no (o si nos pasamos de rango), la estimamos por defecto usando TiempoCarga + TiempoViaje.
    const descargaRel = (p.XG.descargarel && p.XG.descargarel[i] !== undefined)
      ? (p.XG.descargarel[i] - i * freqSlots)
      : Math.ceil((TiempoCarga + TiempoViaje) / granularidad);

    const HoraAsignacionMin = p.HoraAsignacionMin + i * Frecuencia;
    const HoraInicioMin = p.HoraInicioMin + i * Frecuencia;
    const HoraFinalMin = HoraAsignacionMin + TiempoCiclo;

    const d = {
      ...p,
      id: `${p.id}_d${despachoIndex}`,
      parentPedidoId: p.id,
      parentPedido: p, // Referencia al pedido original
      despachoIndex,
      isDespacho: true,
      CantProgramada: vol,
      CantCargas: 1,
      MaxCamiones: 1,
      HoraAsignacionMin,
      HoraInicioMin,
      HoraFinalMin,
      HoraAsignacionHhmm: minToHHMM(HoraAsignacionMin),
      HoraInicio: minToHHMM(HoraInicioMin),
      HoraFinalHhmm: minToHHMM(HoraFinalMin),
      Descargas: [{ idx: 0, Min: HoraInicioMin, Hhmm: minToHHMM(HoraInicioMin) }],
      descargasBandXY: [{ key: 0, x: offset + descargaRel }],
      XG: {
        offset,
        descargarel: [descargaRel],
        finrel: cicloSlots,
        ciclo: cicloSlots,
        freq: freqSlots,
        demanda: new Array(cicloSlots).fill(1)
      }
    };
    despachos.push(d);
  }
  return despachos;
}

function safeHhmmssToMin(timeStr) {
  if (!timeStr || timeStr === "0" || timeStr === "") return null;
  const parts = timeStr.split(":");
  if (parts.length < 2) return null;
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (isNaN(hh) || isNaN(mm)) return null;
  const ss = parts[2] ? parseFloat(parts[2]) : 0;
  return hh * 60 + mm + (isNaN(ss) ? 0 : ss / 60);
}

function repairTicketTimes(t) {
  const fields = ["Impreso", "InicioCarga", "FinCarga", "AObra", "EnObra", "InicioDescarga", "Aplanta", "Enplanta"];

  // 1. Parse all fields to minutes. If "0" or invalid, map to null.
  const minutes = {};
  fields.forEach(f => {
    const val = t[f];
    minutes[f] = safeHhmmssToMin(val);
  });

  // 2. We need to enforce a strict temporal sequence.
  // Find the first valid time to initialize our sequence.
  let currentVal = 0;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (minutes[f] !== null && minutes[f] > 0) {
      currentVal = minutes[f];
      break;
    }
  }

  // 3. Forward pass: fill in missing or out-of-order values.
  const repaired = {};
  fields.forEach(f => {
    let val = minutes[f];
    if (val === null || val < currentVal) {
      val = currentVal;
    }
    repaired[f] = val;
    currentVal = val;
  });

  return repaired;
}

function getTicketTimesAndProjection(t, ped) {
  const hasEnded = (t.Enplanta && t.Enplanta !== "0" && t.Enplanta !== "");
  const isEnCurso = !hasEnded;
  const pImpreso = (t.Impreso && t.Impreso !== "0") ? safeHhmmssToMin(t.Impreso) : (ped.HoraAsignacionMin || 0);
  const pInicioCarga = (t.InicioCarga && t.InicioCarga !== "0") ? safeHhmmssToMin(t.InicioCarga) : pImpreso;
  const pFinCarga = (t.FinCarga && t.FinCarga !== "0") ? safeHhmmssToMin(t.FinCarga) : (pInicioCarga + (ped.TiempoCarga || 0));
  const pAObra = (t.AObra && t.AObra !== "0") ? safeHhmmssToMin(t.AObra) : pFinCarga;
  const pEnObra = (t.EnObra && t.EnObra !== "0") ? safeHhmmssToMin(t.EnObra) : (pAObra + (ped.TiempoViaje || 0));
  const pInicioDescarga = (t.InicioDescarga && t.InicioDescarga !== "0") ? safeHhmmssToMin(t.InicioDescarga) : pEnObra;
  const pAplanta = (t.Aplanta && t.Aplanta !== "0") ? safeHhmmssToMin(t.Aplanta) : (pEnObra + (ped.Frecuencia || 0));
  const pEnplanta = (t.Enplanta && t.Enplanta !== "0") ? safeHhmmssToMin(t.Enplanta) : (pAplanta + (ped.TiempoViaje || 0));

  let HoraAsignacionMin = pImpreso;
  let HoraFinalMin;

  const fields = ["Impreso", "InicioCarga", "FinCarga", "AObra", "EnObra", "InicioDescarga", "Aplanta", "Enplanta"];

  if (isEnCurso) {
    let maxVal = pImpreso;
    fields.forEach(f => {
      const valStr = t[f];
      if (valStr && valStr !== "0" && valStr !== "") {
        const min = safeHhmmssToMin(valStr);
        if (min !== null && min > maxVal) {
          maxVal = min;
        }
      }
    });
    if (maxVal === pImpreso) {
      maxVal = pImpreso + 15;
    }
    const horaReporteMin = safeHhmmssToMin(window.horaReporte);
    if (horaReporteMin !== null && horaReporteMin > HoraAsignacionMin) {
      HoraFinalMin = Math.max(maxVal, horaReporteMin);
    } else {
      HoraFinalMin = maxVal;
    }
  } else {
    const repaired = repairTicketTimes(t);
    HoraAsignacionMin = repaired.Impreso;
    HoraFinalMin = repaired.Enplanta;
  }

  const projectedEndMin = isEnCurso ? Math.max(pEnplanta, HoraFinalMin) : HoraFinalMin;

  return {
    startMin: HoraAsignacionMin,
    endMin: HoraFinalMin,
    projectedEndMin: projectedEndMin
  };
}

function getTicketRealTimes(t, ped) {
  const res = getTicketTimesAndProjection(t, ped);
  return { startMin: res.startMin, endMin: res.endMin };
}

function calculateRealDespachosForPedido(p, tickets, granularidad) {
  if (!tickets || tickets.length === 0) return [];

  // Sort tickets chronologically by Impreso/InicioCarga first, to be absolutely sure of correct ordering
  const sortedTickets = tickets.slice().sort((a, b) => {
    const aMin = safeHhmmssToMin(a.Impreso) || safeHhmmssToMin(a.InicioCarga) || 0;
    const bMin = safeHhmmssToMin(b.Impreso) || safeHhmmssToMin(b.InicioCarga) || 0;
    return aMin - bMin;
  });

  const activeTickets = sortedTickets.filter(t => !t.CodAnulacion || t.CodAnulacion === "0" || t.CodAnulacion === "");
  const canceledTickets = sortedTickets.filter(t => t.CodAnulacion && t.CodAnulacion !== "0" && t.CodAnulacion !== "");

  const mappedActive = activeTickets.map((t, idx) => {
    const ticketId = t.ticketId || "";
    const despachoIndex = idx + 1;

    const hasEnded = (t.Enplanta && t.Enplanta !== "0" && t.Enplanta !== "");
    const isEnCurso = !hasEnded;

    const pImpreso = (t.Impreso && t.Impreso !== "0") ? safeHhmmssToMin(t.Impreso) : p.HoraAsignacionMin;

    let HoraAsignacionMin = pImpreso;
    let HoraFinalMin;
    let HoraInicioMin;

    const fields = ["Impreso", "InicioCarga", "FinCarga", "AObra", "EnObra", "InicioDescarga", "Aplanta", "Enplanta"];
    const isStepReal = {};
    const ticketTimes = {};

    if (isEnCurso) {
      // Do not project! Simply find the max non-zero recorded time
      let maxVal = pImpreso;
      fields.forEach(f => {
        const valStr = t[f];
        if (valStr && valStr !== "0" && valStr !== "") {
          const min = safeHhmmssToMin(valStr);
          if (min !== null && min > maxVal) {
            maxVal = min;
          }
        }
      });
      if (maxVal === pImpreso) {
        maxVal = pImpreso + 15;
      }
      const horaReporteMin = safeHhmmssToMin(window.horaReporte);
      if (horaReporteMin !== null && horaReporteMin > HoraAsignacionMin) {
        HoraFinalMin = Math.max(maxVal, horaReporteMin);
      } else {
        HoraFinalMin = maxVal;
      }
      HoraInicioMin = (t.InicioDescarga && t.InicioDescarga !== "0") ? safeHhmmssToMin(t.InicioDescarga) : ((t.EnObra && t.EnObra !== "0") ? safeHhmmssToMin(t.EnObra) : maxVal);

      fields.forEach(f => {
        const hasVal = (t[f] && t[f] !== "0" && t[f] !== "");
        isStepReal[f] = hasVal;
        if (hasVal) {
          ticketTimes[f] = minToHHMM(safeHhmmssToMin(t[f]));
        } else {
          ticketTimes[f] = "0";
        }
      });
    } else {
      // Completed ticket - use repaired sequence
      const repaired = repairTicketTimes(t);
      HoraAsignacionMin = repaired.Impreso;
      HoraInicioMin = repaired.InicioDescarga;
      HoraFinalMin = repaired.Enplanta;

      fields.forEach(f => {
        isStepReal[f] = true;
        ticketTimes[f] = minToHHMM(repaired[f]);
      });
    }

    const offset = Math.floor(HoraAsignacionMin / granularidad);
    const cicloSlots = Math.max(1, Math.ceil((HoraFinalMin - HoraAsignacionMin) / granularidad));
    const descargaRel = Math.max(0, Math.min(cicloSlots - 1, Math.floor(HoraInicioMin / granularidad) - offset));

    return {
      ...p,
      id: `${p.id}_t${ticketId}`, // Make it unique with 't' prefix and ticketId
      parentPedidoId: p.id,
      parentPedido: p,
      despachoIndex,
      isDespacho: true,
      isRealDespacho: true,
      isEnCursoDespacho: isEnCurso,
      isAnulado: false,
      CantProgramada: Number(t.Volumen) || 8,
      CantCargas: 1,
      MaxCamiones: 1,
      HoraAsignacionMin,
      HoraInicioMin,
      HoraFinalMin,
      HoraAsignacionHhmm: minToHHMM(HoraAsignacionMin),
      HoraInicio: minToHHMM(HoraInicioMin),
      HoraFinalHhmm: minToHHMM(HoraFinalMin),
      Descargas: [{ idx: 0, Min: HoraInicioMin, Hhmm: minToHHMM(HoraInicioMin) }],
      descargasBandXY: [{ key: 0, x: offset + descargaRel }],
      XG: {
        offset,
        descargarel: [descargaRel],
        finrel: cicloSlots,
        ciclo: cicloSlots,
        freq: 0,
        demanda: new Array(cicloSlots).fill(1)
      },
      ticketId,
      Camion: t.Camion,
      Planta: p.Planta,
      rawTicket: t,
      isStepReal,
      ticketTimes
    };
  });

  const mappedCanceled = canceledTickets.map((t) => {
    const ticketId = t.ticketId || "";

    // Find min/max non-zero minutes
    const fields = ["Impreso", "InicioCarga", "FinCarga", "AObra", "EnObra", "InicioDescarga", "Aplanta", "Enplanta"];
    let minVal = Infinity;
    let maxVal = -Infinity;
    fields.forEach(f => {
      const valStr = t[f];
      if (valStr && valStr !== "0" && valStr !== "") {
        const min = safeHhmmssToMin(valStr);
        if (min !== null) {
          if (min < minVal) minVal = min;
          if (min > maxVal) maxVal = min;
        }
      }
    });
    if (minVal === Infinity) {
      minVal = p.HoraAsignacionMin;
      maxVal = minVal + p.TiempoCiclo;
    }
    if (minVal === maxVal) {
      maxVal = minVal + 15;
    }

    const HoraAsignacionMin = minVal;
    const HoraInicioMin = minVal;
    const HoraFinalMin = maxVal;

    const offset = Math.floor(HoraAsignacionMin / granularidad);
    const cicloSlots = Math.max(1, Math.ceil((HoraFinalMin - HoraAsignacionMin) / granularidad));
    const descargaRel = 0;

    const isStepReal = {};
    const ticketTimes = {};
    fields.forEach(f => {
      const hasVal = (t[f] && t[f] !== "0" && t[f] !== "");
      isStepReal[f] = hasVal;
      if (hasVal) {
        ticketTimes[f] = minToHHMM(safeHhmmssToMin(t[f]));
      } else {
        ticketTimes[f] = "0";
      }
    });

    return {
      ...p,
      id: `${p.id}_t${ticketId}`,
      parentPedidoId: p.id,
      parentPedido: p,
      despachoIndex: null,
      isDespacho: true,
      isRealDespacho: true,
      isEnCursoDespacho: false,
      isAnulado: true,
      CantProgramada: Number(t.Volumen) || 8,
      CantCargas: 1,
      MaxCamiones: 1,
      HoraAsignacionMin,
      HoraInicioMin,
      HoraFinalMin,
      HoraAsignacionHhmm: minToHHMM(HoraAsignacionMin),
      HoraInicio: minToHHMM(HoraInicioMin),
      HoraFinalHhmm: minToHHMM(HoraFinalMin),
      Descargas: [{ idx: 0, Min: HoraInicioMin, Hhmm: minToHHMM(HoraInicioMin) }],
      descargasBandXY: [{ key: 0, x: offset + descargaRel }],
      XG: {
        offset,
        descargarel: [descargaRel],
        finrel: cicloSlots,
        ciclo: cicloSlots,
        freq: 0,
        demanda: new Array(cicloSlots).fill(1)
      },
      ticketId,
      Camion: t.Camion,
      Planta: p.Planta,
      rawTicket: t,
      isStepReal,
      ticketTimes
    };
  });

  return [...mappedActive, ...mappedCanceled];
}

function calculateMixedDespachosForPedido(p, tickets, granularidad) {
  // 1. Sort the real tickets chronologically
  const sortedTickets = (tickets || []).slice().sort((a, b) => {
    const aMin = safeHhmmssToMin(a.ticketTimes.Impreso) || safeHhmmssToMin(a.ticketTimes.InicioCarga) || 0;
    const bMin = safeHhmmssToMin(b.ticketTimes.Impreso) || safeHhmmssToMin(b.ticketTimes.InicioCarga) || 0;
    return aMin - bMin;
  });

  const activeReal = sortedTickets.filter(t => !t.isAnulado);
  const canceledReal = sortedTickets.filter(t => t.isAnulado);

  const mixed = [];
  let lastArrivalMin = null;

  // 2. Add all active real dispatches
  activeReal.forEach((t, idx) => {
    const despachoIndex = idx + 1;
    const hasEnded = (t.ticketTimes.Enplanta && t.ticketTimes.Enplanta !== "0");
    const isEnCurso = !hasEnded;

    // Calculate/project times
    const pImpreso = (t.ticketTimes.Impreso && t.ticketTimes.Impreso !== "0")
      ? safeHhmmssToMin(t.ticketTimes.Impreso)
      : p.HoraAsignacionMin;
    const pInicioCarga = (t.ticketTimes.InicioCarga && t.ticketTimes.InicioCarga !== "0")
      ? safeHhmmssToMin(t.ticketTimes.InicioCarga)
      : pImpreso;
    const pFinCarga = (t.ticketTimes.FinCarga && t.ticketTimes.FinCarga !== "0")
      ? safeHhmmssToMin(t.ticketTimes.FinCarga)
      : (pInicioCarga + p.TiempoCarga);
    const pAObra = (t.ticketTimes.AObra && t.ticketTimes.AObra !== "0")
      ? safeHhmmssToMin(t.ticketTimes.AObra)
      : pFinCarga;
    const pEnObra = (t.ticketTimes.EnObra && t.ticketTimes.EnObra !== "0")
      ? safeHhmmssToMin(t.ticketTimes.EnObra)
      : (pAObra + p.TiempoViaje);
    const pInicioDescarga = (t.ticketTimes.InicioDescarga && t.ticketTimes.InicioDescarga !== "0")
      ? safeHhmmssToMin(t.ticketTimes.InicioDescarga)
      : pEnObra;
    const pAplanta = (t.ticketTimes.Aplanta && t.ticketTimes.Aplanta !== "0")
      ? safeHhmmssToMin(t.ticketTimes.Aplanta)
      : (pEnObra + p.Frecuencia);
    const pEnplanta = (t.ticketTimes.Enplanta && t.ticketTimes.Enplanta !== "0")
      ? safeHhmmssToMin(t.ticketTimes.Enplanta)
      : (pAplanta + p.TiempoViaje);

    const HoraAsignacionMin = pImpreso;
    const HoraInicioMin = pInicioDescarga;

    let HoraFinalMin = pEnplanta;
    const horaReporteMin = safeHhmmssToMin(window.horaReporte);
    if (isEnCurso && horaReporteMin !== null && horaReporteMin > HoraAsignacionMin) {
      HoraFinalMin = Math.max(HoraFinalMin, horaReporteMin);
    }

    lastArrivalMin = HoraInicioMin;

    const offset = Math.floor(HoraAsignacionMin / granularidad);
    const cicloSlots = Math.max(1, Math.ceil((HoraFinalMin - HoraAsignacionMin) / granularidad));
    const descargaRel = Math.max(0, Math.min(cicloSlots - 1, Math.floor(HoraInicioMin / granularidad) - offset));

    mixed.push({
      ...p,
      id: `${p.id}_m${despachoIndex}`,
      parentPedidoId: p.id,
      parentPedido: p,
      despachoIndex,
      isDespacho: true,
      isMixedDespacho: true,
      mixedType: isEnCurso ? "en_curso" : "real",
      isAnulado: false,
      CantProgramada: Number(t.CantProgramada) || 8,
      CantCargas: 1,
      MaxCamiones: 1,
      HoraAsignacionMin,
      HoraInicioMin,
      HoraFinalMin,
      HoraAsignacionHhmm: minToHHMM(HoraAsignacionMin),
      HoraInicio: minToHHMM(HoraInicioMin),
      HoraFinalHhmm: minToHHMM(HoraFinalMin),
      Descargas: [{ idx: 0, Min: HoraInicioMin, Hhmm: minToHHMM(HoraInicioMin) }],
      descargasBandXY: [{ key: 0, x: offset + descargaRel }],
      XG: {
        offset,
        descargarel: [descargaRel],
        finrel: cicloSlots,
        ciclo: cicloSlots,
        freq: 0,
        demanda: new Array(cicloSlots).fill(1)
      },
      ticketId: t.ticketId,
      Camion: t.Camion,
      Planta: p.Planta,
      rawTicket: t.rawTicket || t,
      isStepReal: {
        Impreso: (t.ticketTimes.Impreso && t.ticketTimes.Impreso !== "0"),
        InicioCarga: (t.ticketTimes.InicioCarga && t.ticketTimes.InicioCarga !== "0"),
        FinCarga: (t.ticketTimes.FinCarga && t.ticketTimes.FinCarga !== "0"),
        AObra: (t.ticketTimes.AObra && t.ticketTimes.AObra !== "0"),
        EnObra: (t.ticketTimes.EnObra && t.ticketTimes.EnObra !== "0"),
        InicioDescarga: (t.ticketTimes.InicioDescarga && t.ticketTimes.InicioDescarga !== "0"),
        Aplanta: (t.ticketTimes.Aplanta && t.ticketTimes.Aplanta !== "0"),
        Enplanta: (t.ticketTimes.Enplanta && t.ticketTimes.Enplanta !== "0")
      },
      ticketTimes: {
        Impreso: minToHHMM(pImpreso),
        InicioCarga: minToHHMM(pInicioCarga),
        FinCarga: minToHHMM(pFinCarga),
        AObra: minToHHMM(pAObra),
        EnObra: minToHHMM(pEnObra),
        InicioDescarga: minToHHMM(pInicioDescarga),
        Aplanta: minToHHMM(pAplanta),
        Enplanta: minToHHMM(pEnplanta)
      }
    });
  });

  // 3. Recalculate remaining volume (saldo) and generate remaining theoretical dispatches
  const totalDespachado = d3.sum(activeReal, t => Number(t.CantProgramada) || 0);
  const totalPedido = Number(p.CantProgramada) || 0;
  const saldo = Math.max(0, totalPedido - totalDespachado);

  if (saldo > 0) {
    const tamanoCarga = Number(p.TamanoCarga) || 8;
    const teoRestantesCount = Math.ceil(saldo / tamanoCarga);
    const Frecuencia = Number(p.Frecuencia) || 0;
    const TiempoCarga = Number(p.TiempoCarga) || 0;
    const TiempoViaje = Number(p.TiempoViaje) || 0;
    const TiempoCiclo = Number(p.TiempoCiclo) || 0;

    for (let i = 0; i < teoRestantesCount; i++) {
      const teoIndex = activeReal.length + i + 1;
      const vol = (i === teoRestantesCount - 1) ? (saldo - i * tamanoCarga) : tamanoCarga;

      let HoraAsignacionMin, HoraInicioMin, HoraFinalMin;
      if (lastArrivalMin !== null) {
        // Future theoretical calculated from last Arrival + Frecuencia
        HoraInicioMin = lastArrivalMin + Frecuencia;
        HoraAsignacionMin = HoraInicioMin - TiempoCarga - TiempoViaje;
        HoraFinalMin = HoraAsignacionMin + TiempoCiclo;
      } else {
        // Default theoretical values if there is no real history yet.
        HoraInicioMin = p.HoraInicioMin + i * Frecuencia;
        HoraAsignacionMin = HoraInicioMin - TiempoCarga - TiempoViaje;
        HoraFinalMin = HoraAsignacionMin + TiempoCiclo;
      }
      lastArrivalMin = HoraInicioMin;

      const offset = Math.floor(HoraAsignacionMin / granularidad);
      const dSlots = Math.max(1, Math.ceil((HoraFinalMin - HoraAsignacionMin) / granularidad));
      const descargaRel = Math.max(0, Math.min(dSlots - 1, Math.floor(HoraInicioMin / granularidad) - offset));

      mixed.push({
        ...p,
        id: `${p.id}_m${teoIndex}`,
        parentPedidoId: p.id,
        parentPedido: p,
        despachoIndex: teoIndex,
        isDespacho: true,
        isMixedDespacho: true,
        mixedType: "teorico",
        isAnulado: false,
        CantProgramada: vol,
        CantCargas: 1,
        MaxCamiones: 1,
        HoraAsignacionMin,
        HoraInicioMin,
        HoraFinalMin,
        HoraAsignacionHhmm: minToHHMM(HoraAsignacionMin),
        HoraInicio: minToHHMM(HoraInicioMin),
        HoraFinalHhmm: minToHHMM(HoraFinalMin),
        Descargas: [{ idx: 0, Min: HoraInicioMin, Hhmm: minToHHMM(HoraInicioMin) }],
        descargasBandXY: [{ key: 0, x: offset + descargaRel }],
        XG: {
          offset,
          descargarel: [descargaRel],
          finrel: dSlots,
          ciclo: dSlots,
          freq: 0,
          demanda: new Array(dSlots).fill(1)
        },
        ticketId: "",
        Camion: "",
        Planta: p.Planta,
        rawTicket: null,
        isStepReal: {
          Impreso: false,
          InicioCarga: false,
          FinCarga: false,
          AObra: false,
          EnObra: false,
          InicioDescarga: false,
          Aplanta: false,
          Enplanta: false
        },
        ticketTimes: {
          Impreso: minToHHMM(HoraAsignacionMin),
          InicioCarga: minToHHMM(HoraAsignacionMin + TiempoCarga),
          FinCarga: minToHHMM(HoraAsignacionMin + TiempoCarga + TiempoCarga),
          AObra: minToHHMM(HoraAsignacionMin + TiempoCarga + TiempoViaje),
          EnObra: minToHHMM(HoraInicioMin),
          InicioDescarga: minToHHMM(HoraInicioMin),
          Aplanta: minToHHMM(HoraFinalMin - TiempoViaje),
          Enplanta: minToHHMM(HoraFinalMin)
        }
      });
    }
  }

  // 4. Append canceled real tickets directly to mixed
  canceledReal.forEach(cr => {
    mixed.push({
      ...cr,
      id: `${p.id}_m_anul_${cr.ticketId}`,
      isMixedDespacho: true,
      mixedType: "anulado"
    });
  });

  return mixed;
}

function getTomorrow(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
}

function enrichPedidosForDate(pedidosForDay) {
  const plantToScope = {};
  Object.entries(window.plantasData).forEach(([code, p]) => {
    plantToScope[code] = p.grupo_despacho || code;
  });
  const obraScopeCounts = {};
  pedidosForDay.forEach(p => {
    const scope = plantToScope[p.Planta] || p.Planta;
    const key = `${p.CodObra}_${scope}`;
    obraScopeCounts[key] = (obraScopeCounts[key] || 0) + 1;
  });
  pedidosForDay.forEach(p => {
    const scope = plantToScope[p.Planta] || p.Planta;
    const key = `${p.CodObra}_${scope}`;
    p.CantPedidosObra = obraScopeCounts[key];

    p.descargasBandXY = (p.XG?.descargarel ?? []).map(idx => ({
      key: idx,
      x: (p.XG?.offset ?? 0) + idx
    }));
  });
}

function calculateDisponiblesDespachos(allPedidos, selectedDate, permitidas, granularidad) {
  const datePedidos = allPedidos.filter(p => p["Fecha Pedido"] === selectedDate);
  const datePedidoIds = new Set(datePedidos.map(p => p.id));
  const dateTickets = Object.entries(window.ticketsData || {})
    .map(([tId, t]) => ({ ...t, ticketId: tId }))
    .filter(t => datePedidoIds.has(String(t.Pedido)));

  const activeTickets = [];
  dateTickets.forEach(t => {
    if (t.CodAnulacion && t.CodAnulacion !== "0" && t.CodAnulacion !== "") {
      return;
    }

    const ped = datePedidos.find(o => String(o.id) === String(t.Pedido));
    const ticketPlant = ped ? ped.Planta : (t.Planta || "");

    if (permitidas.includes(ticketPlant)) {
      activeTickets.push({
        ...t,
        ticketPlant,
        ped
      });
    }
  });

  const trucksMap = {};
  activeTickets.forEach(t => {
    const camion = t.Camion;
    if (!camion) return;

    const ped = t.ped || {};

    const times = getTicketRealTimes(t, ped);
    const tkStartMin = times.startMin;
    const tkEndMin = times.endMin;

    const obra = ped.Obra || "";
    const cliente = ped.Cliente || "";
    const ticketWithObra = {
      ...t,
      Obra: obra,
      Cliente: cliente,
      startMin: tkStartMin,
      endMin: tkEndMin
    };

    if (!trucksMap[camion]) {
      trucksMap[camion] = {
        impresoMin: tkStartMin,
        ticketId: t.ticketId || "",
        Planta: t.ticketPlant,
        tickets: []
      };
    } else if (tkStartMin < trucksMap[camion].impresoMin) {
      trucksMap[camion].impresoMin = tkStartMin;
      trucksMap[camion].ticketId = t.ticketId || "";
      trucksMap[camion].Planta = t.ticketPlant;
    }

    trucksMap[camion].tickets.push(ticketWithObra);
  });

  // Ordenar cronológicamente los tickets de cada camión
  Object.values(trucksMap).forEach(info => {
    info.tickets.sort((a, b) => a.startMin - b.startMin);
  });

  const disponibles = [];
  Object.entries(trucksMap).forEach(([camion, info]) => {
    // Si la planta del primer ticket del camión no está en el filtro actual, la ignoramos para esta planta
    if (!permitidas.includes(info.Planta)) {
      return;
    }

    const startMin = info.impresoMin;

    // Resolver tiempos y proyecciones
    const ticketsTimes = info.tickets.map(tk => {
      const ped = datePedidos.find(o => String(o.id) === String(tk.Pedido)) || {};
      return getTicketTimesAndProjection(tk, ped);
    });

    let maxTicketEndMin = startMin;
    let maxProjectedEndMin = startMin;
    ticketsTimes.forEach(tk => {
      if (tk.endMin > maxTicketEndMin) {
        maxTicketEndMin = tk.endMin;
      }
      if (tk.projectedEndMin > maxProjectedEndMin) {
        maxProjectedEndMin = tk.projectedEndMin;
      }
    });

    const overallEndMin = Math.max(maxTicketEndMin, maxProjectedEndMin, startMin + 480);

    const duration = overallEndMin - startMin;
    const offset = Math.floor(startMin / granularidad);
    const finrel = Math.ceil(duration / granularidad);

    const baseP = datePedidos.find(o => o.Planta === info.Planta) || datePedidos[0] || {};
    const sanitizedId = `disponibles_${camion.replace(/\s+/g, "_")}`;

    disponibles.push({
      ...baseP,
      id: sanitizedId,
      Planta: info.Planta,
      parentPedidoId: sanitizedId,
      parentPedido: {
        id: sanitizedId,
        CantCargas: 1,
        MaxCamiones: 1,
        CantPedidosObra: 1
      },
      Camion: camion,
      ticketId: info.ticketId,
      isDespacho: true,
      isDisponibles: true,
      isRealDespacho: false,
      isMixedDespacho: false,
      isAnulado: false,
      Confirmado: "SI",
      CantProgramada: 1,
      HoraAsignacionMin: startMin,
      HoraInicioMin: startMin,
      HoraFinalMin: overallEndMin,
      realEndMin: maxTicketEndMin,
      projectedEndMin: Math.max(maxTicketEndMin, maxProjectedEndMin),
      jornadaEndMin: startMin + 480,
      HoraAsignacionHhmm: minToHHMM(startMin),
      HoraInicio: minToHHMM(startMin),
      HoraFinalHhmm: minToHHMM(overallEndMin),
      Descargas: [{ idx: 0, Min: startMin, Hhmm: minToHHMM(startMin) }],
      descargasBandXY: [],
      XG: {
        offset,
        descargarel: [],
        finrel,
        ciclo: finrel,
        freq: 0,
        demanda: new Array(finrel).fill(1)
      },
      ColorPedido: 11,
      Cliente: `Camión ${camion}`,
      Obra: `Disponible (Primer Ticket #${info.ticketId})`,
      Producto: "Disponibilidad Camión",
      allTickets: info.tickets
    });
  });

  return disponibles;
}

function calculateAlmuerzoDespachos(allPedidos, selectedDate, permitidas, granularidad, despachosTeoricos = null) {
  const datePedidos = allPedidos.filter(p => p["Fecha Pedido"] === selectedDate);
  const datePedidoIds = new Set(datePedidos.map(p => p.id));
  const dateTickets = Object.entries(window.ticketsData || {})
    .map(([tId, t]) => ({ ...t, ticketId: tId }))
    .filter(t => datePedidoIds.has(String(t.Pedido)));

  const activeTickets = [];
  dateTickets.forEach(t => {
    if (t.CodAnulacion && t.CodAnulacion !== "0" && t.CodAnulacion !== "") {
      return;
    }
    const ped = datePedidos.find(o => String(o.id) === String(t.Pedido));
    const ticketPlant = ped ? ped.Planta : (t.Planta || "");
    if (permitidas.includes(ticketPlant)) {
      activeTickets.push({ ...t, ticketPlant, ped });
    }
  });

  // Agrupar camiones únicos por planta (la planta de su primer ticket del día)
  const trucksMap = {};
  activeTickets.forEach(t => {
    const camion = t.Camion;
    if (!camion) return;
    const ped = t.ped || {};
    const times = getTicketRealTimes(t, ped);
    const tkStartMin = times.startMin;

    if (!trucksMap[camion]) {
      trucksMap[camion] = {
        impresoMin: tkStartMin,
        Planta: t.ticketPlant
      };
    } else if (tkStartMin < trucksMap[camion].impresoMin) {
      trucksMap[camion].impresoMin = tkStartMin;
      trucksMap[camion].Planta = t.ticketPlant;
    }
  });

  // Agrupar los camiones por planta para programarlos
  const trucksByPlant = {};
  Object.entries(trucksMap).forEach(([camion, info]) => {
    if (!permitidas.includes(info.Planta)) return;
    if (!trucksByPlant[info.Planta]) {
      trucksByPlant[info.Planta] = [];
    }
    trucksByPlant[info.Planta].push(camion);
  });

  // Calcular la envolvente base actual
  const ocupacionBase = new Array(Math.ceil(1440 / granularidad)).fill(0);

  if (despachosTeoricos && despachosTeoricos.length > 0) {
    despachosTeoricos.forEach(d => {
      // Filtrar por planta
      if (!permitidas.includes(d.Planta)) return;
      if (!d.XG) return;

      const start = d.XG.offset;
      const end = start + d.XG.finrel;
      for (let t = start; t < end; t++) {
        if (t >= 0 && t < ocupacionBase.length) {
          ocupacionBase[t] += (d.XG.demanda[t - start] || 1);
        }
      }
    });
  } else {
    // Fallback: usar tickets históricos
    activeTickets.forEach(t => {
      const ped = t.ped || {};
      const times = getTicketRealTimes(t, ped);
      const startSlot = Math.max(0, Math.floor(times.startMin / granularidad));
      const endSlot = Math.min(ocupacionBase.length - 1, Math.floor(times.endMin / granularidad));
      for (let s = startSlot; s <= endSlot; s++) {
        ocupacionBase[s]++;
      }
    });
  }

  const almuerzos = [];

  const startSlotGlobal = 660 / granularidad; // 11:00
  const maxStartSlotGlobal = 855 / granularidad; // 14:15
  const durationSlots = 45 / granularidad; // 9
  const shiftIntervalSlots = 5 / granularidad; // 1 slot (5 mins)

  // Posibles turnos cada 5 min (11:00, 11:05, 11:10, ..., 14:15)
  const shiftStarts = [];
  for (let s = startSlotGlobal; s <= maxStartSlotGlobal; s += shiftIntervalSlots) {
    shiftStarts.push(s);
  }

  // Flatten the camiones into a single list to optimize globally
  const allTrucks = [];
  Object.entries(trucksByPlant).forEach(([planta, camiones]) => {
    const baseP = datePedidos.find(o => o.Planta === planta) || datePedidos[0] || {};
    camiones.forEach(camion => {
      allTrucks.push({ camion, planta, baseP, assignedStart: 0 });
    });
  });

  if (allTrucks.length > 0) {
    // 1. Initial Valley-Centering Heuristic
    const windowEnd = maxStartSlotGlobal + durationSlots;
    let tempOcupacion = ocupacionBase.slice(startSlotGlobal, windowEnd);

    // console.log("tempOcupacion inicial:", tempOcupacion.join(", "));

    allTrucks.forEach(t => {
      // Buscar el fondo absoluto del valle en la ventana
      const minVal = Math.min(...tempOcupacion);
      const minSlot = startSlotGlobal + tempOcupacion.indexOf(minVal);

      // Centrar el turno alrededor del fondo del valle
      const idealStart = minSlot - Math.floor(durationSlots / 2);

      // Ajustar al turno de inicio válido más cercano
      let closestStart = shiftStarts[0];
      let minDiff = Infinity;
      shiftStarts.forEach(s => {
        const diff = Math.abs(s - idealStart);
        if (diff < minDiff) {
          minDiff = diff;
          closestStart = s;
        }
      });

      t.assignedStart = closestStart;
      for (let s = closestStart; s < closestStart + durationSlots; s++) {
        const relS = s - startSlotGlobal;
        if (relS >= 0 && relS < tempOcupacion.length) {
          tempOcupacion[relS] = (tempOcupacion[relS] || 0) + 1;
        }
      }

      const inicioHHMM = slotToHHMM(closestStart, granularidad);
      const medioHHMM = slotToHHMM(minSlot, granularidad);
      const finHHMM = slotToHHMM(closestStart + durationSlots, granularidad);

      // console.log(`Asignacion camion ${t.camion}: Inicio=${inicioHHMM}, Medio (valle)=${medioHHMM}, Fin=${finHHMM} | minVal=${minVal}, minSlot=${minSlot}`);
    });

    // 2. Simulated Annealing (recocido simulado)
    // funcion de Costo
    const calculateCost = (ocupacionArr) => {
      let maxVal = 0;
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      // Evaluar la curva sólo en el rango del slice (que ya es la ventana de almuerzos)
      for (let i = 0; i < ocupacionArr.length; i++) {
        const val = ocupacionArr[i] || 0;
        if (val > maxVal) maxVal = val;
        sum += val;
        sumSq += val * val;
        count++;
      }
      const variance = (sumSq - (sum * sum) / count) / count;
      // aplasta el pico mas alto a toda costa (*10000),
      //  e intenta dejarlo lo mas liso posible
      return maxVal * 10000 + variance;
    };

    let currentCost = calculateCost(tempOcupacion);
    let bestCost = currentCost;
    let bestAssignment = allTrucks.map(t => t.assignedStart);

    let temp = 1000.0;
    const coolingRate = 0.995;
    const iterations = 5000;

    // el loop termina por las 5000 iteracionesm o porque llega a las temp < 0.1
    for (let i = 0; i < iterations; i++) {
      if (temp < 0.1) break;

      // elige un camion al azar
      const truckIdx = Math.floor(Math.random() * allTrucks.length);
      const truck = allTrucks[truckIdx];
      const oldStart = truck.assignedStart;

      // mueve el comienzo del almuerzo al azar para el camion elegido al azar
      const newStart = shiftStarts[Math.floor(Math.random() * shiftStarts.length)];
      if (oldStart === newStart) continue;

      // Update tempOcupacion delta (primero resta el viejo, luego suma el nuevo
      for (let s = oldStart; s < oldStart + durationSlots; s++) tempOcupacion[s - startSlotGlobal]--;
      for (let s = newStart; s < newStart + durationSlots; s++) tempOcupacion[s - startSlotGlobal]++;

      const newCost = calculateCost(tempOcupacion);
      // acepta o rechaza el cambio segun si el Costo mejoró o no
      if (newCost < currentCost || Math.exp((currentCost - newCost) / temp) > Math.random()) {
        currentCost = newCost;
        truck.assignedStart = newStart;
        if (newCost < bestCost) {
          bestCost = newCost;
          bestAssignment = allTrucks.map(t => t.assignedStart);
        }
      } else {
        // Revert change
        for (let s = newStart; s < newStart + durationSlots; s++) tempOcupacion[s - startSlotGlobal]--;
        for (let s = oldStart; s < oldStart + durationSlots; s++) tempOcupacion[s - startSlotGlobal]++;
      }

      temp *= coolingRate;
    }

    // Apply best assignment found
    allTrucks.forEach((t, i) => {
      t.assignedStart = bestAssignment[i];
    });
    // end de Simulated Annealing

  }

  allTrucks.forEach(t => {
    const sanitizedId = `almuerzo_${t.camion.replace(/\\s+/g, "_")}`;
    const demanda = new Array(durationSlots).fill(1);

    almuerzos.push({
      ...t.baseP,
      id: sanitizedId,
      parentPedido: { ...t.baseP, id: sanitizedId, Confirmado: "SI", MaxCamiones: 1, isAlmuerzo: true },
      isAlmuerzo: true, // flag custom
      Planta: t.planta,
      Obra: "ALMUERZO",
      Cliente: t.camion,
      Confirmado: "SI",
      CantProgramada: 1,
      CantCargas: 1,
      MaxCamiones: 1,
      Camion: t.camion,
      XG: {
        offset: t.assignedStart,
        finrel: durationSlots,
        demanda: demanda,
        descargarel: []
      },
      STK: {
        segmentosXY: []
      }
    });
  });

  return almuerzos;
}

