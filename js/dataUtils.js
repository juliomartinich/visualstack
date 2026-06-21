/* ================== DATA UTILITIES ================== */

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

