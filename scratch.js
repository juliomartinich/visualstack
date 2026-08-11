function calculateAlmuerzoDespachos(allPedidos, selectedDate, permitidas, granularidad) {
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

  const almuerzos = [];
  
  const startSlotGlobal = 720 / granularidad; // 12:00
  const maxStartSlotGlobal = 855 / granularidad; // 14:15
  const durationSlots = 45 / granularidad; // 9
  const MAX_CONCURRENT = 30;

  Object.entries(trucksByPlant).forEach(([planta, camiones]) => {
    // Para esta planta, llevamos un registro de concurrencia por slot
    const slotsOcupacion = {};
    
    const baseP = datePedidos.find(o => o.Planta === planta) || datePedidos[0] || {};

    camiones.forEach(camion => {
      // Buscar el primer bloque de `durationSlots` slots seguidos desde `startSlotGlobal` hasta `maxStartSlotGlobal`
      // donde la concurrencia sea < MAX_CONCURRENT
      let assignedStart = startSlotGlobal;
      let found = false;

      for (let s = startSlotGlobal; s <= maxStartSlotGlobal; s++) {
        let fits = true;
        for (let i = 0; i < durationSlots; i++) {
          const curr = slotsOcupacion[s + i] || 0;
          if (curr >= MAX_CONCURRENT) {
            fits = false;
            break;
          }
        }
        if (fits) {
          assignedStart = s;
          found = true;
          break;
        }
      }

      if (!found) {
        // Si no se pudo asignar respetando el límite, forzar en el último slot posible
        assignedStart = maxStartSlotGlobal;
      }

      // Marcar ocupación
      for (let i = 0; i < durationSlots; i++) {
        slotsOcupacion[assignedStart + i] = (slotsOcupacion[assignedStart + i] || 0) + 1;
      }

      // Crear objeto de despacho/pedido simulado
      const sanitizedId = `almuerzo_${camion.replace(/\s+/g, "_")}`;
      
      const demanda = new Array(durationSlots).fill(1); // 1 camión por esos slots
      
      almuerzos.push({
        ...baseP,
        id: sanitizedId,
        parentPedido: { ...baseP, id: sanitizedId, Confirmado: "SI", MaxCamiones: 1 },
        isAlmuerzo: true, // flag custom
        Planta: planta,
        Obra: "ALMUERZO",
        Cliente: camion,
        Confirmado: "SI",
        CantProgramada: 1,
        CantCargas: 1,
        MaxCamiones: 1,
        Camion: camion,
        XG: {
          offset: assignedStart,
          finrel: durationSlots,
          demanda: demanda,
          descargarel: []
        },
        STK: {
          segmentosXY: []
        }
      });
    });
  });

  return almuerzos;
}
