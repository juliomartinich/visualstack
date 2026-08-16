/* ========================= INTERACTION ========================= */

function getCurrentGanttView() {
  const vgt1 = document.getElementById("filter-viewgantt")?.value;
  const vgt2 = document.getElementById("header-viewgantt")?.value;
  let ganttView = 'pedidos';
  if (vgt2 || vgt1) {
    ganttView = (vgt2 || vgt1).trim();
  } else if (typeof getCookie === 'function') {
    ganttView = (getCookie("viewGantt") || 'pedidos').trim();
  }
  return ganttView;
}

function getCurrentGraphView() {
  const vg1 = document.getElementById("filter-viewgraph")?.value;
  const vg2 = document.getElementById("header-viewgraph")?.value;
  let graphView = 'camiones';
  if (vg2 || vg1) {
    graphView = (vg2 || vg1).trim();
  } else if (typeof getCookie === 'function') {
    graphView = (getCookie("viewGraph") || 'camiones').trim();
  }

  const vgt1 = document.getElementById("filter-viewgantt")?.value;
  const vgt2 = document.getElementById("header-viewgantt")?.value;
  let ganttView = 'pedidos';
  if (vgt2 || vgt1) {
    ganttView = (vgt2 || vgt1).trim();
  } else if (typeof getCookie === 'function') {
    ganttView = (getCookie("viewGantt") || 'pedidos').trim();
  }

  if (graphView === 'camiones' && ganttView === 'despachos') {
    return 'camionesd';
  }
  if (graphView === 'camiones' && ganttView === 'despachos_reales') {
    return 'camiones_cd';
  }
  if (graphView === 'camiones' && (ganttView === 'despachos_mix' || ganttView === 'almuerzo')) {
    return 'camiones_mix';
  }
  return graphView;
}

/* ==== DETECCIÓN DE PEDIDO EXTENDIDO ACTIVO =====*/
function findActiveLayer(capasReversa, t, my, scales) {
  const currentGraphView = getCurrentGraphView();

  for (const capa of capasReversa) {
    if (currentGraphView === 'recursos') {
      // 1. Zona Camiones: innerH * 0.55 to innerH
      if (my >= innerH * 0.55 && capa.STK?.segmentosXY) {
        const y = scales.yCamiones;
        const seg = capa.STK.segmentosXY.find(s => s.x === t);
        if (seg && seg.v > 0 && my >= y(seg.y1) - 2 && my <= y(seg.y0) + 2) {
          return capa;
        }
      }
      // 2. Zona Asignaciones: innerH * 0.35 to innerH * 0.55
      if (my >= innerH * 0.35 && my < innerH * 0.55 && capa.STK_PLANTAS?.bloquesXY) {
        const y = scales.yAsignaciones;
        const found = capa.STK_PLANTAS.bloquesXY.some(seg => 
          seg.x === t && seg.v > 0 && my >= Math.min(y(seg.y1), y(seg.y0)) - 2 && my <= Math.max(y(seg.y1), y(seg.y0)) + 2
        );
        if (found) return capa;
      }
      // 3. Zona Plantas (Colas): innerH * 0.12 to innerH * 0.35
      if (my >= innerH * 0.12 && my < innerH * 0.35) {
        const isReal = getCurrentGanttView() === 'despachos_reales';
        const blocks = isReal ? capa.STK_PLANTAS?.bloquesXY : capa.STK_COLAS?.bloquesXY;
        if (blocks) {
          const y = scales.yColas;
          const found = blocks.some(seg => 
            seg.x === t && seg.v > 0 && my >= Math.min(y(seg.y1), y(seg.y0)) - 2 && my <= Math.max(y(seg.y1), y(seg.y0)) + 2
          );
          if (found) return capa;
        }
      }
      continue;
    }

    // 1. Zona de Colas (Si el ratón está en la parte superior del gráfico en vista colas)
    if (currentGraphView === 'colas') {
      const isReal = getCurrentGanttView() === 'despachos_reales';
      const blocks = isReal ? capa.STK_PLANTAS?.bloquesXY : capa.STK_COLAS?.bloquesXY;
      if (blocks) {
        if (scales.yColasPlants) {
          const y = scales.yColasPlants[capa.Planta];
          if (y) {
            const found = blocks.some(seg => 
              seg.x === t && seg.v > 0 && my >= Math.min(y(seg.y1), y(seg.y0)) - 2 && my <= Math.max(y(seg.y1), y(seg.y0)) + 2
            );
            if (found) return capa;
          }
        } else {
          const y = scales.y;
          const found = blocks.some(seg => 
            seg.x === t && seg.v > 0 && my >= Math.min(y(seg.y1), y(seg.y0)) - 2 && my <= Math.max(y(seg.y1), y(seg.y0)) + 2
          );
          if (found) return capa;
        }
      }
    }

    // 2. Zona de Camiones
    if ((currentGraphView === 'camiones' || currentGraphView === 'camionesd' || currentGraphView === 'camiones_cd' || currentGraphView === 'camiones_mix') && capa.STK?.segmentosXY) {
      const y = scales.y;
      const seg = capa.STK.segmentosXY.find(s => s.x === t);
      if (seg && seg.v > 0 && my >= y(seg.y1) - 2 && my <= y(seg.y0) + 2) {
        return capa;
      }
    }
    
    // 3. Caso Plantas / Asignaciones (soporta vista dividida y normal)
    if (currentGraphView === 'plantas' && capa.STK_PLANTAS?.bloquesXY) {
      if (scales.yPlants) {
        const y = scales.yPlants[capa.Planta];
        if (y) {
          const found = capa.STK_PLANTAS.bloquesXY.some(seg => 
            seg.x === t && seg.v > 0 && my >= Math.min(y(seg.y1), y(seg.y0)) - 2 && my <= Math.max(y(seg.y1), y(seg.y0)) + 2
          );
          if (found) return capa;
        }
      } else {
        const found = capa.STK_PLANTAS.bloquesXY.some(seg => 
          seg.x === t && seg.v > 0 && my >= scales.y(seg.y1) - 2 && my <= scales.y(seg.y0) + 2
        );
        if (found) return capa;
      }
    }
  }
  return null;
}

function scrollToGanttRow(pedidoId) {
  let row = d3.select(`#gantt-row-${pedidoId}`);
  // Si no se encuentra (posiblemente en modo despachos), buscar el primer viaje (_v0)
  if (row.empty()) {
    row = d3.select(`#gantt-row-${pedidoId}_v0`);
  }
  if (row.empty()) return;

  const gContainer = document.getElementById("gantt-scroll-container");
  const element = row.node();
  const elementTop = element.getBoundingClientRect().top;
  const containerTop = gContainer.getBoundingClientRect().top;

  gContainer.scrollTo({
    top: gContainer.scrollTop + (elementTop - containerTop) - 20,
    behavior: "smooth"
  });
}

/* ==== HIGHLIGHT DEL ÁREA ACTIVA ====*/
function drawActiveArea({ overlay, layers, getCapas, activa, scales, colorOrigen, colorSort }) {
  const activeGroups = layers.filter(d => d === activa);
  if (activeGroups.empty()) return;

  let areaD = null;
  activeGroups.selectAll("path.area").each(function() {
    const dVal = d3.select(this).attr("d");
    if (dVal) areaD = dVal;
  });

  if (areaD) {
    const main = overlay.selectAll("path.main").data([null]);

    main.enter()
      .append("path")
      .attr("class", "main")
      .merge(main)
      .attr("d", areaD)
      .attr("fill", colorOrigen)
      .attr("fill-opacity", 0.45)
      .attr("stroke", colorSort)
      .attr("stroke-width", 1.3)
      .attr("stroke-linecap", "round");
  } else {
    overlay.selectAll("path.main").remove();
  }

  const baseRects = activeGroups.selectAll("path.carga");
  if (!baseRects.empty()) {
    const activeRects = overlay.selectAll("path.main-carga").data(baseRects.data());
    
    activeRects.enter()
      .append("path")
      .attr("class", "main-carga")
      .merge(activeRects)
      .attr("d", (d, i) => baseRects.nodes()[i].getAttribute("d"))
      .attr("fill", d => d.delayed ? "saddlebrown" : colorOrigen)
      .attr("fill-opacity", d => d.delayed ? 0.5 : 0.7)
      .attr("stroke", colorSort)
      .attr("stroke-width", 1.5);
      
    activeRects.exit().remove();
  } else {
    overlay.selectAll("path.main-carga").remove();
  }

  const baseConexiones = activeGroups.selectAll("path.conexion");
  if (!baseConexiones.empty()) {
    const activeConexiones = overlay.selectAll("path.main-conexion").data(baseConexiones.data());
    
    activeConexiones.enter()
      .append("path")
      .attr("class", "main-conexion")
      .merge(activeConexiones)
      .attr("d", (d, i) => baseConexiones.nodes()[i].getAttribute("d"))
      .attr("fill", "none")
      .attr("stroke", "saddlebrown")
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0.5);
      
    activeConexiones.exit().remove();
  } else {
    overlay.selectAll("path.main-conexion").remove();
  }

  /* ==== DESCARGAS – OVERLAY =====*/
  const currentGraphView = getCurrentGraphView();
  const descargas = ((currentGraphView === 'camiones' || currentGraphView === 'camionesd' || currentGraphView === 'camiones_cd' || currentGraphView === 'camiones_mix' || currentGraphView === 'recursos') && activa.STK && activa.STK.descargasXY) ? activa.STK.descargasXY : [];
  const tris = overlay
    .selectAll("path.descarga-activa")
    .data(descargas, d => d.key);

  tris.enter()
    .append("path")
    .attr("class", "descarga-activa")
    .attr("d", d3.symbol().type(d3.symbolTriangle).size(170))
    .merge(tris)
    .attr("transform", d => {
      const y = (currentGraphView === 'recursos' || currentGraphView === 'camiones' || currentGraphView === 'camionesd' || currentGraphView === 'camiones_cd' || currentGraphView === 'camiones_mix') && scales.yCamiones ? scales.yCamiones : scales.y;
      return `translate(${scales.x(d.x)}, ${y(d.y)}) rotate(180)`;
    })
    .attr("fill", getColorSort(activa))
    .attr("stroke", "white")
    .attr("stroke-width", 1.5)
    .style("pointer-events", "none");

  tris.exit().remove();
}

/* ==== TOOLTIP ====*/
function renderTooltip(panel, activa, t, granularidad) {
  const p = activa;
  const totalMin = t * granularidad;
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;

  if (p.isAlmuerzo) {
    const offsetMin = (p.XG?.offset || 0) * granularidad;
    const durationMin = (p.XG?.finrel || 0) * granularidad;
    const startStr = String(Math.floor(offsetMin / 60)).padStart(2, "0") + ":" + String(offsetMin % 60).padStart(2, "0");
    const endStr = String(Math.floor((offsetMin + durationMin) / 60)).padStart(2, "0") + ":" + String((offsetMin + durationMin) % 60).padStart(2, "0");
    
    if (Alpine && Alpine.store('filtros')) {
      Alpine.store('filtros').setTooltipData({
        type: 'almuerzo',
        camion: p.Camion || "-",
        duration: durationMin,
        startStr,
        endStr
      });
    }
    return;
  }

  if (p.isDisponibles) {
    const tickets = (p.allTickets || []).map(tk => ({
      ticketId: tk.ticketId || "-",
      startStr: minToHHMM(tk.startMin),
      endStr: minToHHMM(tk.endMin),
      volumen: tk.Volumen !== undefined ? `${tk.Volumen}` : "-",
      obraCliente: (tk.Obra || tk.Cliente) ? `${tk.Obra || "-"}${tk.Cliente ? ` - ${tk.Cliente}` : ""}` : "-"
    }));

    const overtimeMin = (typeof p.HoraFinJornadaNormalMin === "number")
      ? Math.max(0, p.HoraFinalMin - p.HoraFinJornadaNormalMin)
      : 0;
    const otH = Math.floor(overtimeMin / 60);
    const otM = overtimeMin % 60;
    const overtimeStr = `${String(otH).padStart(2, "0")}:${String(otM).padStart(2, "0")}`;

    if (Alpine && Alpine.store('filtros')) {
      Alpine.store('filtros').setTooltipData({
        type: 'disponibles',
        camion: p.Camion,
        horaInicio: p.HoraInicio,
        fin8Hrs: p.HoraFinJornadaNormalHhmm || "-",
        horaFin: p.HoraFinalHhmm,
        sobretiempo: overtimeStr,
        tickets: tickets,
        cursor: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
      });
    }
    return;
  }

  const ref = p.isDespacho ? p.parentPedido : p;
  const isReal = p.isRealDespacho;
  const isMixed = p.isMixedDespacho;

  let volumeHtml = `<b>${p.CantProgramada} m³</b>`;
  if (p.isDespacho && (isReal || isMixed)) {
    const teo = ref.despachos ? ref.despachos.find(d => d.despachoIndex === p.despachoIndex) : null;
    const volTeorico = teo ? teo.CantProgramada : Math.round(ref.CantProgramada / (ref.CantCargas || 1));
    
    let volReal = "-";
    if (isReal) {
      volReal = p.CantProgramada;
    } else if (isMixed) {
      if (p.mixedType === "real" || p.mixedType === "en_curso" || p.mixedType === "anulado") {
        volReal = p.CantProgramada;
      }
    }
    volumeHtml = `<span style="color: #888;">${volTeorico}</span> / <b>${volReal} m³</b>`;
  }

  let rawTicketHtml = "";
  if (p.rawTicket) {
    const raw = p.rawTicket;
    rawTicketHtml = `
      <div style="margin-top: 8px; border-top: 1px dashed #ddd; padding-top: 6px; text-align: left;">
        <span style="font-size: 10px; font-weight: 700; color: #555;">Datos Ticket Real Originales:</span>
        <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px; padding: 4px; margin-top: 4px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 8.5px; color: #777; text-align: center; table-layout: fixed;">
            <thead>
              <tr style="border-bottom: 1px solid #eee; background-color: #fafafa;">
                <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Impreso">Impreso</th>
                <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="InicioCarga">InicioCarga</th>
                <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="FinCarga">FinCarga</th>
                <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="AObra">AObra</th>
                <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="EnObra">EnObra</th>
                <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="InicioDescarga">InicioDescarga</th>
                <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Aplanta">Aplanta</th>
                <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Enplanta">Enplanta</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 3px 1px; border-bottom: 1px solid #f0f0f0;">${raw.Impreso || '-'}</td>
                <td style="padding: 3px 1px; border-bottom: 1px solid #f0f0f0;">${raw.InicioCarga || '-'}</td>
                <td style="padding: 3px 1px; border-bottom: 1px solid #f0f0f0;">${raw.FinCarga || '-'}</td>
                <td style="padding: 3px 1px; border-bottom: 1px solid #f0f0f0;">${raw.AObra || '-'}</td>
                <td style="padding: 3px 1px; border-bottom: 1px solid #f0f0f0;">${raw.EnObra || '-'}</td>
                <td style="padding: 3px 1px; border-bottom: 1px solid #f0f0f0;">${raw.InicioDescarga || '-'}</td>
                <td style="padding: 3px 1px; border-bottom: 1px solid #f0f0f0;">${raw.Aplanta || '-'}</td>
                <td style="padding: 3px 1px; border-bottom: 1px solid #f0f0f0;">${raw.Enplanta || '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  let gridContent = "";
  if (isReal || isMixed) {
    const repaired = repairTicketTimes(p.ticketTimes);
    const cargaPrep = repaired.AObra - repaired.Impreso;
    const viaje = repaired.EnObra - repaired.AObra;
    const estadia = repaired.Aplanta - repaired.EnObra;
    const retorno = repaired.Enplanta - repaired.Aplanta;
    const ciclo = repaired.Enplanta - repaired.Impreso;

    let anulacionHtml = "";
    if (p.rawTicket && p.rawTicket.CodAnulacion !== undefined) {
      const cod = p.rawTicket.CodAnulacion;
      if (cod !== "0" && cod !== "") {
        anulacionHtml = `<span>Cod. Anulación</span><b style="grid-column: 2 / span 3; text-align: left; color: #e63946; font-weight: bold;">${cod} (ANULADO)</b>`;
      } else {
        anulacionHtml = `<span>Cod. Anulación</span><b style="grid-column: 2 / span 3; text-align: left; color: #777; font-weight: normal;">0 (No anulado)</b>`;
      }
    }

    let redestinoHtml = "";
    if (p.rawTicket && p.rawTicket.TicketRedestino !== undefined) {
      const red = p.rawTicket.TicketRedestino;
      if (red !== "0" && red !== "") {
        redestinoHtml = `<span>Ticket Redestino</span><b style="grid-column: 2 / span 3; text-align: left; color: #ff8c00; font-weight: bold;">${red}</b>`;
      } else {
        redestinoHtml = `<span>Ticket Redestino</span><b style="grid-column: 2 / span 3; text-align: left; color: #777; font-weight: normal;">0 (Ninguno)</b>`;
      }
    }

    const teo = p.mixedType === "teorico" ? p : (ref.despachos ? ref.despachos.find(d => d.despachoIndex === p.despachoIndex) : null);
    const teoAsignacion = teo ? teo.HoraAsignacionHhmm : "-";
    const teoCarga = teo ? `${teo.TiempoCarga} min` : "-";
    const teoViaje = teo ? `${teo.TiempoViaje} min` : "-";
    const teoLlegada = teo ? teo.HoraInicio : "-";
    const teoEstadia = teo ? `${teo.Frecuencia} min` : "-";
    const teoRetorno = teo ? `${teo.TiempoViaje} min` : "-";
    const teoCiclo = teo ? `${teo.TiempoCiclo} min` : "-";

    const getIndicatorHtml = (valReal, valTeo) => {
      if (valReal === undefined || valTeo === undefined || valReal === null || valTeo === null || isNaN(valReal) || isNaN(valTeo)) {
        return `<span style="grid-column: 4;"></span>`;
      }
      const diff = valReal - valTeo;
      if (diff > 0) {
        return `<span style="grid-column: 4; text-align: center; color: #e63946; font-size: 11px; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 2px; cursor: default;" title="Atrasado/Mayor por ${diff} min">▲ +${diff}</span>`;
      } else if (diff < 0) {
        return `<span style="grid-column: 4; text-align: center; color: #2ec4b6; font-size: 11px; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 2px; cursor: default;" title="Anticipado/Menor por ${Math.abs(diff)} min">▼ ${diff}</span>`;
      } else {
        return `<span style="grid-column: 4; text-align: center; color: #2ec4b6; font-size: 11px; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 2px; cursor: default;" title="Igual a lo teórico">─ 0</span>`;
      }
    };

    const isStepReal = p.isStepReal || {
      Impreso: true,
      InicioCarga: true,
      FinCarga: true,
      AObra: true,
      EnObra: true,
      InicioDescarga: true,
      Aplanta: true,
      Enplanta: true
    };

    const renderCell = (fieldName, valRealStr, valTeo, isStepRealFlag) => {
      if (p.mixedType === "teorico") {
        return `<b style="grid-column: 3;">-</b><span style="grid-column: 4;"></span>`;
      }
      if (isStepRealFlag) {
        let diffHtml = "";
        const realMin = safeHhmmssToMin(valRealStr);
        if (fieldName === "Asignacion") {
          diffHtml = getIndicatorHtml(realMin, teo ? teo.HoraAsignacionMin : null);
        } else if (fieldName === "Carga") {
          diffHtml = getIndicatorHtml(Math.round(cargaPrep), teo ? teo.TiempoCarga : null);
        } else if (fieldName === "Viaje") {
          diffHtml = getIndicatorHtml(Math.round(viaje), teo ? teo.TiempoViaje : null);
        } else if (fieldName === "Llegada") {
          diffHtml = getIndicatorHtml(realMin, teo ? teo.HoraInicioMin : null);
        } else if (fieldName === "Estadia") {
          diffHtml = getIndicatorHtml(Math.round(estadia), teo ? teo.Frecuencia : null);
        } else if (fieldName === "Retorno") {
          diffHtml = getIndicatorHtml(Math.round(retorno), teo ? teo.TiempoViaje : null);
        } else if (fieldName === "Ciclo") {
          diffHtml = getIndicatorHtml(Math.round(ciclo), teo ? teo.TiempoCiclo : null);
        }
        return `<b style="grid-column: 3;">${valRealStr}</b>${diffHtml}`;
      } else {
        if (p.isRealDespacho || valRealStr === "00:00" || valRealStr === "-") {
          return `<b style="grid-column: 3; color: #bbb; font-weight: normal;">-</b><span style="grid-column: 4; text-align: center; color: #bbb;">─</span>`;
        }
        return `<b style="grid-column: 3; color: #888; font-weight: normal;">${valRealStr}*</b><span style="grid-column: 4; text-align: center; color: #888;">─</span>`;
      }
    };

    gridContent = `
        <div class="full-row product-row"><span>Producto</span><b style="grid-column: 2 / span 3;">${p.Producto}</b></div>
        
        <!-- Header row for comparison -->
        <span>Concepto</span><b style="color: #888; font-size: 11px; font-weight: 600; text-align: right; padding-right: 5px;">Teórico</b><b style="grid-column: 3; color: #333; font-size: 11px;">Real</b><span style="grid-column: 4; font-size: 10px; color: #888; text-align: center; font-weight: 600;">+/-</span>
        
        <span>Ticket / Camión</span><b style="grid-column: 2 / span 2; text-align: left;">${p.mixedType === "teorico" ? "No asignado" : `#${p.ticketId} / ${p.Camion}`}</b><span style="grid-column: 4;"></span>
        
        <span>Hora Asignación</span><b style="color: #888; font-weight: normal; text-align: right; padding-right: 5px;">${teoAsignacion}</b>${renderCell("Asignacion", minToHHMM(repaired.Impreso), teo, isStepReal.Impreso)}
        
        <span>Tiempo de Carga</span><b style="color: #888; font-weight: normal; text-align: right; padding-right: 5px;">${teoCarga}</b>${renderCell("Carga", `${Math.round(cargaPrep)} min`, teo, isStepReal.FinCarga)}
        
        <span>Tiempo de Viaje</span><b style="color: #888; font-weight: normal; text-align: right; padding-right: 5px;">${teoViaje}</b>${renderCell("Viaje", `${Math.round(viaje)} min`, teo, isStepReal.EnObra)}
        
        <span>Hora en Obra</span><b style="color: #888; font-weight: normal; text-align: right; padding-right: 5px;">${teoLlegada}</b>${renderCell("Llegada", minToHHMM(repaired.EnObra), teo, isStepReal.EnObra)}
        
        <span>Estadía en Obra</span><b style="color: #888; font-weight: normal; text-align: right; padding-right: 5px;">${teoEstadia}</b>${renderCell("Estadia", `${Math.round(estadia)} min`, teo, isStepReal.Aplanta)}
        
        <span>Tiempo de Retorno</span><b style="color: #888; font-weight: normal; text-align: right; padding-right: 5px;">${teoRetorno}</b>${renderCell("Retorno", `${Math.round(retorno)} min`, teo, isStepReal.Enplanta)}
        
        <span>Tiempo de Ciclo</span><b style="color: #888; font-weight: normal; text-align: right; padding-right: 5px;">${teoCiclo}</b>${renderCell("Ciclo", `${Math.round(ciclo)} min`, teo, isStepReal.Enplanta)}
 
        <span>Viajes / Camiones</span><b style="color: #888; font-weight: normal; text-align: right; padding-right: 5px;">(${ref.CantCargas} / ${ref.MaxCamiones})</b><b style="grid-column: 3;">${p.mixedType === "teorico" ? "-" : `${ref.CantRealDespachos || 0} / ${ref.MaxRealCamiones || 0}`}</b><span style="grid-column: 4;"></span>
        
        <span>Confirmado</span><b style="grid-column: 2 / span 3; text-align: left;">${p.Confirmado}</b>
        
        <span>Pedidos de la Obra</span><b style="grid-column: 2 / span 3; text-align: left;">${ref.CantPedidosObra}</b>
        ${anulacionHtml}
        ${redestinoHtml}
    `;
  } else {
    gridContent = `
        <div class="full-row product-row"><span>Producto</span><b>${p.Producto}</b></div>
        <span>Hora Asignación</span><b>${p.HoraAsignacionHhmm}</b>
        <span>Tiempo de Carga + Prep</span><b>${p.TiempoCarga} min</b>
        <span>Tiempo de Viaje</span><b>${p.TiempoViaje} min</b>
        <span>Hora requerida cliente</span><b>${p.HoraInicio}</b>
        <span>Frecuencia / Estadía</span><b>${p.Frecuencia} min</b>

        <div class="cycle-time-box">
          <div class="cycle-time-label">Tiempo de Ciclo</div>
          <div class="cycle-time-value">${(p.TiempoCarga || 0) + (p.Frecuencia || 0) + 2 * (p.TiempoViaje || 0)} min</div>
        </div>

        <span>Viajes / Camiones</span><b>${ref.CantCargas} / ${ref.MaxCamiones}</b>
        <span>Confirmado</span><b>${p.Confirmado}</b>
        <span>Pedidos de la Obra</span><b>${ref.CantPedidosObra}</b>
    `;
  }

  panel.html(`
    <div class="tooltip-card">
      <div class="tooltip-header" style="display: flex; flex-direction: column; gap: 4px; align-items: stretch; width: 100%; border-bottom: 1px solid #eee; padding-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <div class="pedido" style="font-weight: 700; font-size: 14px;">Pedido #${ref.id}</div>
          <div style="font-size: 12.5px;">${volumeHtml}</div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 600; font-size: 12px; color: #444;">
            ${p.isDespacho ? (
              isMixed ? (
                p.mixedType === "real" ? `Despacho Mix ${p.despachoIndex} (Real - Ticket #${p.ticketId})` :
                p.mixedType === "en_curso" ? `Despacho Mix ${p.despachoIndex} (En Curso - Ticket #${p.ticketId})` :
                p.mixedType === "anulado" ? `Despacho Mix (ANULADO - Ticket #${p.ticketId})` :
                `Despacho Mix ${p.despachoIndex} (Teórico)`
              ) : (
                isReal ? (
                  p.isAnulado ? `Despacho Real (ANULADO - Ticket #${p.ticketId})` :
                  p.isEnCursoDespacho ? `Despacho Real ${p.despachoIndex} de ${ref.CantRealDespachos} (En Curso - Ticket #${p.ticketId})` : `Despacho Real ${p.despachoIndex} de ${ref.CantRealDespachos} (Ticket #${p.ticketId})`
                ) : `Despacho ${p.despachoIndex} de ${ref.CantCargas}`
              )
            ) : ''}
          </div>
          <div class="planta" style="font-size: 11px; color: #666; font-weight: normal; margin-left: auto;">
            Planta ${p.Planta}${window.plantasData && window.plantasData[p.Planta] ? ` - ${window.plantasData[p.Planta].nombre}` : ''}
          </div>
        </div>
      </div>

      <div class="tooltip-grid ${(isReal || isMixed) ? 'comparison' : ''}">
        ${gridContent}
      </div>

      <div class="tooltip-footer">
        <div><b>Cliente:</b> ${p.Cliente}</div>
        <div><b>Obra:</b> ${p.Obra}</div>
        <div class="muted" style="display: flex; align-items: center;">
          <span>Cursor: ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} &middot; Color: ${p.ColorPedido}</span>
          <span style="flex-grow: 1; margin-left: 10px; margin-right: 10px; height: 12px; background-color: ${window.pedidoColorsMap ? window.pedidoColorsMap.get(p.ColorPedido) : '#ccc'}; border: 1px solid #ccc; border-radius: 2px;"></span>
        </div>
        ${rawTicketHtml}
      </div>
    </div>
  `);
    
    if (Alpine && Alpine.store('filtros')) {
      Alpine.store('filtros').setTooltipData({
        type: 'html',
        content: panel.html()
      });
    }
}

/* ==== RESET ====*/
function resetInteraction({ cursor, layers, overlay, panel, band }) {
  layers.classed("inactive", false).classed("active", false);
  overlay.selectAll("*").remove();
  if (band) band.clear();
  
  if (Alpine && Alpine.store('filtros')) {
    Alpine.store('filtros').setTooltipData(null);
  }
}

/* ========================= INTERACCIÓN PRINCIPAL =========================*/
const lastActivePedido = { current: null };
window.selectedPedido = { current: null };
const selectedPedido = window.selectedPedido;
window.selectedCamion = { current: null };
const selectedCamion = window.selectedCamion;
const lastWasHovering = { current: false };

function setupInteraction(
  svg, g, layers, getCapas, scales, band,
  granularidad, panel, innerW, innerH,
  ganttPanel, metrics, margin, getColorSort
) {
  // Cursors
  const cursor = g.append("line")
    .attr("class", "cursor")
    .attr("y1", 0)
    .attr("y2", innerH)
    .style("opacity", 0);

  const circleCamiones = g.append("circle").attr("class", "cursor-circle camiones").attr("r", 4).attr("fill", "blue").style("opacity", 0).style("pointer-events", "none");
  const labelCamiones = g.append("text").attr("class", "cursor-label camiones").attr("fill", "blue").attr("font-size", "11px").attr("font-weight", "bold").style("opacity", 0).style("pointer-events", "none");

  const circleColas = g.append("circle").attr("class", "cursor-circle colas").attr("r", 4).attr("fill", "#555").style("opacity", 0).style("pointer-events", "none");
  const labelColas = g.append("text").attr("class", "cursor-label colas").attr("fill", "#555").attr("font-size", "11px").attr("font-weight", "bold").style("opacity", 0).style("pointer-events", "none");

  const circleAsignaciones = g.append("circle").attr("class", "cursor-circle asignaciones").attr("r", 4).attr("fill", "#777").style("opacity", 0).style("pointer-events", "none");
  const labelAsignaciones = g.append("text").attr("class", "cursor-label asignaciones").attr("fill", "#777").attr("font-size", "11px").attr("font-weight", "bold").style("opacity", 0).style("pointer-events", "none");

  const circleDelay = g.append("circle").attr("class", "cursor-circle delay").attr("r", 4).attr("fill", "red").style("opacity", 0).style("pointer-events", "none");
  const labelDelay = g.append("text").attr("class", "cursor-label delay").attr("fill", "red").attr("font-size", "11px").attr("font-weight", "bold").style("opacity", 0).style("pointer-events", "none");

  const circleWaitCarga = g.append("circle").attr("class", "cursor-circle wait-carga").attr("r", 4).attr("fill", "blue").style("opacity", 0).style("pointer-events", "none");
  const labelWaitCarga = g.append("text").attr("class", "cursor-label wait-carga").attr("fill", "blue").attr("font-size", "11px").attr("font-weight", "bold").style("opacity", 0).style("pointer-events", "none");

  function syncCursor(t) {
    const currentGraphView = getCurrentGraphView();
    if (t === null) {
      cursor.style("opacity", 0);
      circleCamiones.style("opacity", 0); labelCamiones.style("opacity", 0);
      circleColas.style("opacity", 0); labelColas.style("opacity", 0);
      circleAsignaciones.style("opacity", 0); labelAsignaciones.style("opacity", 0);
      circleDelay.style("opacity", 0); labelDelay.style("opacity", 0);
      circleWaitCarga.style("opacity", 0); labelWaitCarga.style("opacity", 0);
      d3.select("#gantt-chart svg line.cursor").style("opacity", 0);
      g.selectAll("circle.cursor-circle-plant").style("opacity", 0);
      g.selectAll("text.cursor-label-plant").style("opacity", 0);
      g.selectAll("circle.cursor-circle-delay-plant").style("opacity", 0);
      g.selectAll("text.cursor-label-delay-plant").style("opacity", 0);
      g.selectAll("circle.cursor-circle-wait-plant").style("opacity", 0);
      g.selectAll("text.cursor-label-wait-plant").style("opacity", 0);
      return;
    }

    const xPos = scales.x(t);
    cursor.attr("x1", xPos).attr("x2", xPos).style("opacity", 1);

    // 1. Camiones
    const envCamiones = (currentGraphView === 'recursos' ? metrics.envolventeCamiones : metrics.envolvente)?.[t] || 0;
    const yCam = (currentGraphView === 'recursos' ? scales.yCamiones : scales.y);
    if (yCam && envCamiones > 0) {
      circleCamiones.attr("cx", xPos).attr("cy", yCam(envCamiones)).style("opacity", 1);
      labelCamiones.attr("x", xPos + 8).attr("y", yCam(envCamiones) - 5).text(envCamiones).style("opacity", 1);
    } else {
      circleCamiones.style("opacity", 0); labelCamiones.style("opacity", 0);
    }

    // 2. Colas (solo en recursos o colas sin dividir)
    if (currentGraphView === 'recursos' || (currentGraphView === 'colas' && !scales.yColasPlants)) {
      const envColas = (currentGraphView === 'recursos' ? metrics.envolventeColas : metrics.envolvente)?.[t] || 0;
      const yCol = (currentGraphView === 'recursos' ? scales.yColas : scales.y);
      if (yCol && envColas > 0) {
        circleColas.attr("cx", xPos).attr("cy", yCol(envColas)).style("opacity", 1);
        labelColas.attr("x", xPos + 8).attr("y", yCol(envColas) - 5).text(envColas).style("opacity", 1);
      } else {
        circleColas.style("opacity", 0); labelColas.style("opacity", 0);
      }
    } else {
      circleColas.style("opacity", 0); labelColas.style("opacity", 0);
    }

    // Manejo dinámico de círculos e indicadores para plantas en la vista split Asignaciones
    let splitPlants = [];
    if (currentGraphView === 'plantas' && scales.yPlants) {
      splitPlants = Object.keys(scales.yPlants);
    }

    const circles = g.selectAll("circle.cursor-circle-plant")
      .data(splitPlants);
    circles.exit().remove();
    const newCircles = circles.enter()
      .append("circle")
      .attr("class", "cursor-circle-plant")
      .attr("r", 4)
      .attr("fill", "#777")
      .style("pointer-events", "none");
    const activeCircles = circles.merge(newCircles);

    const labels = g.selectAll("text.cursor-label-plant")
      .data(splitPlants);
    labels.exit().remove();
    const newLabels = labels.enter()
      .append("text")
      .attr("class", "cursor-label-plant")
      .attr("fill", "#777")
      .attr("font-size", "11px")
      .attr("font-weight", "bold")
      .style("pointer-events", "none");
    const activeLabels = labels.merge(newLabels);

    if (currentGraphView === 'plantas' && scales.yPlants) {
      activeCircles.each(function(pCode) {
        const yVal = metrics.plantStacks?.[pCode]?.metrics?.envolvente?.[t] || 0;
        const y = scales.yPlants[pCode];
        if (y && yVal > 0) {
          d3.select(this)
            .attr("cx", xPos)
            .attr("cy", y(yVal))
            .style("opacity", 1);
        } else {
          d3.select(this).style("opacity", 0);
        }
      });

      activeLabels.each(function(pCode) {
        const yVal = metrics.plantStacks?.[pCode]?.metrics?.envolvente?.[t] || 0;
        const y = scales.yPlants[pCode];
        if (y && yVal > 0) {
          d3.select(this)
            .attr("x", xPos + 8)
            .attr("y", y(yVal) - 5)
            .text(yVal)
            .style("opacity", 1);
        } else {
          d3.select(this).style("opacity", 0);
        }
      });
    }

    // Manejo dinámico de círculos e indicadores para plantas en la vista split Plantas (Colas y Delay)
    let splitColasPlants = [];
    if (currentGraphView === 'colas' && scales.yColasPlants) {
      splitColasPlants = Object.keys(scales.yColasPlants);
    }

    // Círculos/labels para Colas en split
    const colasCircles = g.selectAll("circle.cursor-circle-colas-plant")
      .data(splitColasPlants);
    colasCircles.exit().remove();
    const newColasCircles = colasCircles.enter()
      .append("circle")
      .attr("class", "cursor-circle-colas-plant")
      .attr("r", 4)
      .attr("fill", "#555")
      .style("pointer-events", "none");
    const activeColasCircles = colasCircles.merge(newColasCircles);

    const colasLabels = g.selectAll("text.cursor-label-colas-plant")
      .data(splitColasPlants);
    colasLabels.exit().remove();
    const newColasLabels = colasLabels.enter()
      .append("text")
      .attr("class", "cursor-label-colas-plant")
      .attr("fill", "#555")
      .attr("font-size", "11px")
      .attr("font-weight", "bold")
      .style("pointer-events", "none");
    const activeColasLabels = colasLabels.merge(newColasLabels);

    if (currentGraphView === 'colas' && scales.yColasPlants) {
      activeColasCircles.each(function(pCode) {
        const yVal = metrics.plantStacks?.[pCode]?.metrics?.envolvente?.[t] || 0;
        const y = scales.yColasPlants[pCode];
        if (y && yVal > 0) {
          d3.select(this)
            .attr("cx", xPos)
            .attr("cy", y(yVal))
            .style("opacity", 1);
        } else {
          d3.select(this).style("opacity", 0);
        }
      });

      activeColasLabels.each(function(pCode) {
        const yVal = metrics.plantStacks?.[pCode]?.metrics?.envolvente?.[t] || 0;
        const y = scales.yColasPlants[pCode];
        if (y && yVal > 0) {
          d3.select(this)
            .attr("x", xPos + 8)
            .attr("y", y(yVal) - 5)
            .text(yVal)
            .style("opacity", 1);
        } else {
          d3.select(this).style("opacity", 0);
        }
      });
    }

    // Círculos/labels para Delay en split
    const delayCircles = g.selectAll("circle.cursor-circle-delay-plant")
      .data(splitColasPlants);
    delayCircles.exit().remove();
    const newDelayCircles = delayCircles.enter()
      .append("circle")
      .attr("class", "cursor-circle-delay-plant")
      .attr("r", 4)
      .attr("fill", "red")
      .style("pointer-events", "none");
    const activeDelayCircles = delayCircles.merge(newDelayCircles);

    const delayLabels = g.selectAll("text.cursor-label-delay-plant")
      .data(splitColasPlants);
    delayLabels.exit().remove();
    const newDelayLabels = delayLabels.enter()
      .append("text")
      .attr("class", "cursor-label-delay-plant")
      .attr("fill", "red")
      .attr("font-size", "11px")
      .attr("font-weight", "bold")
      .style("pointer-events", "none");
    const activeDelayLabels = delayLabels.merge(newDelayLabels);

    // Círculos/labels para Wait Carga en split
    const waitCircles = g.selectAll("circle.cursor-circle-wait-plant")
      .data(splitColasPlants);
    waitCircles.exit().remove();
    const newWaitCircles = waitCircles.enter()
      .append("circle")
      .attr("class", "cursor-circle-wait-plant")
      .attr("r", 4)
      .attr("fill", "blue")
      .style("pointer-events", "none");
    const activeWaitCircles = waitCircles.merge(newWaitCircles);

    const waitLabels = g.selectAll("text.cursor-label-wait-plant")
      .data(splitColasPlants);
    waitLabels.exit().remove();
    const newWaitLabels = waitLabels.enter()
      .append("text")
      .attr("class", "cursor-label-wait-plant")
      .attr("fill", "blue")
      .attr("font-size", "11px")
      .attr("font-weight", "bold")
      .style("pointer-events", "none");
    const activeWaitLabels = waitLabels.merge(newWaitLabels);

    if (currentGraphView === 'colas' && scales.yColasPlants) {
      const isColasAndReal = currentGraphView === 'colas' && getCurrentGanttView() === 'despachos_reales';
      activeDelayCircles.each(function(pCode) {
        const delayVal = metrics.plantStacks?.[pCode]?.metrics?.delay2ByTime?.[t] || 0;
        const yDelay = scales.yDelayPlants?.[pCode];
        if (yDelay && delayVal > 0 && !isColasAndReal) {
          const delayMin = delayVal * granularidad;
          d3.select(this)
            .attr("cx", xPos)
            .attr("cy", yDelay(delayMin))
            .style("opacity", 1);
        } else {
          d3.select(this).style("opacity", 0);
        }
      });

      activeDelayLabels.each(function(pCode) {
        const delayVal = metrics.plantStacks?.[pCode]?.metrics?.delay2ByTime?.[t] || 0;
        const yDelay = scales.yDelayPlants?.[pCode];
        if (yDelay && delayVal > 0 && !isColasAndReal) {
          const delayMin = delayVal * granularidad;
          d3.select(this)
            .attr("x", xPos + 8)
            .attr("y", yDelay(delayMin) - 5)
            .text(delayMin)
            .style("opacity", 1);
        } else {
          d3.select(this).style("opacity", 0);
        }
      });

      activeWaitCircles.each(function(pCode) {
        const waitVal = metrics.plantStacks?.[pCode]?.metrics?.waitCargaByTime?.[t] || 0;
        const yDelay = scales.yDelayPlants?.[pCode];
        if (yDelay && waitVal > 0) {
          const waitMin = waitVal;
          d3.select(this)
            .attr("cx", xPos)
            .attr("cy", yDelay(waitMin))
            .style("opacity", 1);
        } else {
          d3.select(this).style("opacity", 0);
        }
      });

      activeWaitLabels.each(function(pCode) {
        const waitVal = metrics.plantStacks?.[pCode]?.metrics?.waitCargaByTime?.[t] || 0;
        const yDelay = scales.yDelayPlants?.[pCode];
        if (yDelay && waitVal > 0) {
          const waitMin = waitVal;
          d3.select(this)
            .attr("x", xPos + 8)
            .attr("y", yDelay(waitMin) - 5)
            .text(waitMin)
            .style("opacity", 1);
        } else {
          d3.select(this).style("opacity", 0);
        }
      });
    }

    // 3. Asignaciones (solo en recursos o plantas sin dividir)
    if (currentGraphView === 'recursos' || (currentGraphView === 'plantas' && !scales.yPlants)) {
      const envAsignaciones = (currentGraphView === 'recursos' ? metrics.envolventeAsignaciones : metrics.envolvente)?.[t] || 0;
      const yAs = (currentGraphView === 'recursos' ? scales.yAsignaciones : scales.y);
      if (yAs && envAsignaciones > 0) {
        circleAsignaciones.attr("cx", xPos).attr("cy", yAs(envAsignaciones)).style("opacity", 1);
        labelAsignaciones.attr("x", xPos + 8).attr("y", yAs(envAsignaciones) - 5).text(envAsignaciones).style("opacity", 1);
      } else {
        circleAsignaciones.style("opacity", 0); labelAsignaciones.style("opacity", 0);
      }
    } else {
      circleAsignaciones.style("opacity", 0); labelAsignaciones.style("opacity", 0);
    }

    // 4. Delay (global)
    const delayVal = metrics.delay2ByTime ? metrics.delay2ByTime[t] : 0;
    const isColasAndReal = currentGraphView === 'colas' && getCurrentGanttView() === 'despachos_reales';
    if (scales.yDelay && delayVal > 0 && !(currentGraphView === 'colas' && scales.yColasPlants) && !isColasAndReal) {
      const delayMin = delayVal * granularidad;
      circleDelay.attr("cx", xPos).attr("cy", scales.yDelay(delayMin)).style("opacity", 1);
      labelDelay.attr("x", xPos + 8).attr("y", scales.yDelay(delayMin) - 5).text(delayMin).style("opacity", 1);
    } else {
      circleDelay.style("opacity", 0); labelDelay.style("opacity", 0);
    }

    // 4b. Espera Carga (global)
    const waitVal = metrics.waitCargaByTime ? metrics.waitCargaByTime[t] : 0;
    if (scales.yDelay && waitVal > 0 && !(currentGraphView === 'colas' && scales.yColasPlants)) {
      const waitMin = waitVal;
      circleWaitCarga.attr("cx", xPos).attr("cy", scales.yDelay(waitMin)).style("opacity", 1);
      labelWaitCarga.attr("x", xPos + 8).attr("y", scales.yDelay(waitMin) - 5).text(waitMin).style("opacity", 1);
    } else {
      circleWaitCarga.style("opacity", 0); labelWaitCarga.style("opacity", 0);
    }

    // Cursor Gantt sincronizado
    const ganttSvg = d3.select("#gantt-chart svg");
    if (!ganttSvg.empty()) {
      const ganttG = ganttSvg.select("g.gantt-main");
      if (!ganttG.empty()) {
        let gc = ganttG.select("line.cursor");
        if (gc.empty()) {
          gc = ganttG.append("line").attr("class", "cursor").attr("y1", 0).attr("y2", 2000).style("pointer-events", "none");
        }
        gc.attr("x1", xPos).attr("x2", xPos).style("opacity", 1);
      }
    }
  }
  window.moveCursorTo = syncCursor;

  // Interacción desde Stack -> Gantt
  function handlePointer(ev) {
    const currentGraphView = getCurrentGraphView();
    const [mx, my] = d3.pointer(ev);
    const t = Math.round(scales.x.invert(mx));

    syncCursor(t);

    const capasReversa = [...getCapas()].reverse();
    const activa = findActiveLayer(capasReversa, t, my, scales);

    // Solo hacemos highlight por hover si no hay un pedido seleccionado por click
    if (!selectedPedido.current) {
      highlightPedido(activa, mx, my, t);
    }

    return activa;
  }

  function highlightPedido(activa, mx, my, t) {
    const focus = activa || selectedPedido.current || (selectedCamion.current ? { isCamionFilter: true, Camion: selectedCamion.current } : null);

    const getBaseCamion = (name) => {
      if (!name) return "";
      return String(name).replace(/\s+T\d+$/, "").trim();
    };

    const isCamionFilter = focus && focus.isCamionFilter;
    const targetCamion = focus && focus.Camion;
    const isDisponiblesMode = (focus && focus.isDisponibles) || (document.getElementById("filter-viewgantt")?.value === "disponibles");

    // 1. Identify state changes
    const isFocusChange = focus !== lastActivePedido.current;
    const isHoverTransition = (!!activa) !== lastWasHovering.current;

    // If nothing changed and we are in a static state (not hovering), skip
    if (!isFocusChange && !isHoverTransition && !activa) {
      return;
    }

    lastActivePedido.current = focus;
    lastWasHovering.current = !!activa;

    if (!focus) {
      layers.style("opacity", CFG.opacity || 0.7);
      
      // Restaurar colores DINÁMICOS originales iterando por cada grupo
      layers.each(function(d) {
        const group = d3.select(this);
        group.selectAll("path.area, path.carga")
          .style("fill", getAreaColor(d));
        group.selectAll("path.line-top, path.carga")
          .attr("stroke", getColorSort(d))
          .attr("stroke-width", scales.yCamiones ? CFG.lineStrokeWidth : 1);
      });

      // Restaurar opacidad y stroke de las envolventes de los pedidos padre
      d3.selectAll("path.line-parent-envelope")
        .style("opacity", 1.0)
        .attr("stroke-width", CFG.lineStrokeWidth);

      overlay.selectAll("*").remove();
      if (band) band.clear();
      panel.html(`<div class="tooltip-card"></div>`);

      d3.selectAll(".gantt-row").style("opacity", 1);
      return;
    }

    // 2. Highlighting (Area & Band)
    if (isFocusChange) {
      const isHover = !!activa;
      const parentId = focus.parentPedidoId || focus.id;
      const codObra = focus.CodObra;
      const colorOrigen = getColorOrigen(focus);
      const colorObra = "red";

      layers.style("opacity", d => {
        if (isDisponiblesMode) {
          return 0.7; // Mantener la opacidad original de todas las capas
        }
        if (isCamionFilter) {
          const matches = getBaseCamion(d.Camion) === getBaseCamion(targetCamion);
          return matches ? 1.0 : 0.4;
        }
        const isSameParent = (d.parentPedidoId || d.id) === parentId;
        const isSameObra = !isHover && codObra && d.CodObra === codObra;
        return (isSameParent || isSameObra) ? 1 : 0.5;
      });
      
      // Highlight con COLOR DE ORIGEN (o COLOR DE OBRA si es selección y aplica)
      layers.each(function(d) {
        const group = d3.select(this);
        
        if (isDisponiblesMode) {
          // Mantener los colores originales de relleno intactos
          group.selectAll("path.area, path.carga")
            .style("fill", getAreaColor(d));
          
          // Sólo destacar el borde (line-top) del camión elegido haciéndolo más grueso
          const isTarget = isCamionFilter
            ? (getBaseCamion(d.Camion) === getBaseCamion(targetCamion))
            : (d.id === focus.id);
          group.selectAll("path.line-top, path.carga")
            .attr("stroke", isTarget ? "#1e293b" : getColorSort(d))
            .attr("stroke-width", isTarget ? 3 : CFG.lineStrokeWidth)
            .attr("stroke-opacity", isTarget ? 1.0 : CFG.lineOpacity);
          
          return;
        }

        if (isCamionFilter) {
          const isTarget = getBaseCamion(d.Camion) === getBaseCamion(targetCamion);
          group.selectAll("path.area, path.carga")
            .style("fill", getAreaColor(d));
          group.selectAll("path.line-top, path.carga")
            .attr("stroke", isTarget ? "#1e293b" : getColorSort(d))
            .attr("stroke-width", 3)
            .attr("stroke-opacity", isTarget ? 1.0 : CFG.lineOpacity);
          return;
        }

        const isTarget = (d.parentPedidoId || d.id) === parentId || (!isHover && codObra && d.CodObra === codObra);
        const isObraHighlight = !isHover && codObra && d.CodObra === codObra && (d.parentPedidoId || d.id) !== parentId;
        
        group.selectAll("path.area, path.carga")
          .style("fill", isTarget ? (isObraHighlight ? colorObra : colorOrigen) : getAreaColor(d));
        
        group.selectAll("path.line-top, path.carga")
          .attr("stroke", getColorSort(d)) // Siempre el Color del Sort (dinámico)
          .attr("stroke-width", isTarget ? 2 : (scales.yCamiones ? CFG.lineStrokeWidth : 1));
      });

      // Highlight de las envolventes de pedidos padre
      d3.selectAll("path.line-parent-envelope")
        .style("opacity", d => {
          if (isDisponiblesMode || isCamionFilter) return 0.3;
          const isSameParent = d.id === parentId;
          const isSameObra = !isHover && codObra && d.parentPedido.CodObra === codObra;
          return (isSameParent || isSameObra) ? 1.0 : 0.3;
        })
        .attr("stroke-width", d => {
          if (isDisponiblesMode || isCamionFilter) return CFG.lineStrokeWidth;
          const isSameParent = d.id === parentId;
          const isSameObra = !isHover && codObra && d.parentPedido.CodObra === codObra;
          return (isSameParent || isSameObra) ? CFG.lineStrokeWidth * 1.5 : CFG.lineStrokeWidth;
        });

      if (isCamionFilter) {
        if (band) band.clear();
        panel.html(`<div class="tooltip-card" style="padding: 10px; font-size: 12px; font-weight: 500; border-left: 4px solid #3b82f6;">Buscando Camión: <b>#${getBaseCamion(targetCamion)}</b></div>`);
      } else {
        drawActiveArea({ overlay, layers, getCapas, activa: focus, scales, colorOrigen, colorSort: getColorSort(focus) });
        band.show(focus, getColorSort(focus));
      }

      // Highlight en Gantt (highlight all voyages of the same parent, or same obra if not hovering)
      d3.selectAll(".gantt-row")
        .classed("inactive", d => {
          if (isDisponiblesMode) {
            return isCamionFilter ? (getBaseCamion(d.Camion) !== getBaseCamion(targetCamion)) : d.id !== focus.id;
          }
          if (isCamionFilter) {
            return getBaseCamion(d.Camion) !== getBaseCamion(targetCamion);
          }
          const isSameParent = (d.parentPedidoId || d.id) === parentId;
          const isSameObra = !isHover && codObra && d.CodObra === codObra;
          return !(isSameParent || isSameObra);
        })
        .classed("active", d => {
          if (isDisponiblesMode) {
            return isCamionFilter ? (getBaseCamion(d.Camion) === getBaseCamion(targetCamion)) : d.id === focus.id;
          }
          if (isCamionFilter) {
            return getBaseCamion(d.Camion) === getBaseCamion(targetCamion);
          }
          const isSameParent = (d.parentPedidoId || d.id) === parentId;
          const isSameObra = !isHover && codObra && d.CodObra === codObra;
          return (isSameParent || isSameObra);
        });
    }

    // 3. Tooltip logic (Render & Position)
    let refT = t;
    let refMX = mx;
    let refMY = my;

    if (isCamionFilter) {
      // General camion search filter does not render detailed tooltip coordinate fallback
      return;
    }
    // If we don't have coordinates (Gantt hover or selection without hover), fallback to bar center
    if (refT === undefined || refMX === undefined) {
      refT = focus.XG.offset + focus.XG.finrel / 2;
      refMX = scales.x(refT);
      refMY = innerH * 0.5;
    }

    renderTooltip(panel, focus, refT, granularidad);
    positionTooltip(panel, margin, refMX, refMY, innerW, innerH);
  }

  window.selectPedido = (p, fromGantt = false, forceSelect = false) => {
    if (forceSelect && p) {
      selectedPedido.current = p;
    } else {
      selectedPedido.current = (selectedPedido.current?.id === p?.id) ? null : p;
    }

    // Limpiar filtro general de camión si seleccionamos un pedido/despacho
    if (selectedPedido.current) {
      window.selectedCamion.current = null;
      const camionInput = document.getElementById("filter-camion");
      if (camionInput) camionInput.value = "";
    }

    highlightPedido(null);
    if (selectedPedido.current && !fromGantt) {
      scrollToGanttRow(selectedPedido.current.id);
    }
  };

  // Interacción desde Gantt -> Stack
  window.highlightFromGantt = (activa) => {
    // Solo hacemos highlight por hover desde Gantt si no hay un pedido seleccionado por click
    if (!selectedPedido.current && !selectedCamion.current) {
      highlightPedido(activa);
    }
  };

  window.highlightPedido = highlightPedido;

  const overlay = g.append("g")
    .attr("class", "overlay");

  const interactionRect = g.append("rect")
    .attr("width", innerW)
    .attr("height", innerH)
    .style("fill", "none")
    .style("pointer-events", "all");

  const envG = g.append("g")
    .attr("class", "envolvente-cursor")
    .style("pointer-events", "none");

  const envCircle = envG.append("circle")
    .attr("r", 3)
    .attr("fill", "darkblue")
    .style("opacity", 0);

  const envLabel = envG.append("text")
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", "darkblue")
    .attr("dy", "-6")
    .style("opacity", 0);

  const delayLabel = envG.append("text")
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", "red")
    .attr("dy", "-6")
    .style("opacity", 0);

  interactionRect
    .on("mousemove", ev => {
      handlePointer(ev);
    })
    .on("click", ev => {
      const p = handlePointer(ev);
      window.selectPedido(p);

      // Synchronize with CodObra filter panel
      const codObraInput = document.getElementById("filter-codobra");
      if (codObraInput) {
        if (p && p.isDisponibles) {
          codObraInput.value = "";
          // No despachamos evento "input" para evitar sobreescribir el destacado exclusivo del camión disponible
        } else if (p && p.CodObra) {
          codObraInput.value = p.Obra ? `${p.CodObra} - ${p.Obra}` : String(p.CodObra);
          codObraInput.dispatchEvent(new Event("input"));
        } else {
          // Clear if clicked background or order with no CodObra
          codObraInput.value = "";
          codObraInput.dispatchEvent(new Event("input"));
        }
      }
    })
    .on("mouseleave", () => {
      highlightPedido(null);
      syncCursor(null);
    });

  // Listener en el SVG del Gantt para que no se bloquee con las barras
  d3.select("#gantt-chart").on("mousemove", ev => {
    const [mx] = d3.pointer(ev);
    // Ajustar por el margen izquierdo del grupo gantt-main
    const t = Math.round(scales.x.invert(mx - margin.left));
    // Solo si el mouse está dentro del rango horizontal del gráfico
    if (t >= scales.x.domain()[0] && t <= scales.x.domain()[1]) {
      syncCursor(t);
    } else {
      syncCursor(null);
    }
  }).on("mouseleave", () => {
    syncCursor(null);
  });

  // Re-apply selection if it exists (correspondence between views)
  if (window.selectedPedido.current) {
    const parentId = window.selectedPedido.current.id;
    const freshPedido = getCapas().find(p => p.id === parentId);
    if (freshPedido) {
      window.selectedPedido.current = freshPedido;
      lastActivePedido.current = null; // Force refresh
      highlightPedido(null);
    }
  }
}

/* ==== BANDA INFERIOR ==== */
function drawBand(g, scales, innerH, granularidad) {
  const bandHeight = 8;
  const bandY = innerH + 18;
  const labelOffset = 12;

  const bandG = g.append("g")
    .attr("class", "pedido-band")
    .attr("transform", `translate(0,${bandY})`)
    .style("pointer-events", "none");

  const bgG = bandG.append("g").attr("class", "band-bg");
  const fgG = bandG.append("g").attr("class", "band-fg");

  const labelsG = bandG.append("g")
    .attr("class", "band-labels");

  return {
    g: fgG,
    height: bandHeight,
    show(pedido, color) {
      const ext = pedido.XG;
      if (!ext) {
        this.clear();
        return;
      }

      const { offset, finrel } = ext;

      // Generar rectángulos del fondo de la banda
      const bandRects = [];
      if (pedido.isDisponibles && typeof pedido.HoraFinJornadaNormalMin === "number") {
        const limitSlot = Math.floor(pedido.HoraFinJornadaNormalMin / granularidad);
        if (limitSlot > offset && limitSlot < offset + finrel) {
          // Parte normal (naranja)
          bandRects.push({
            x: scales.x(offset),
            width: scales.x(limitSlot) - scales.x(offset),
            fill: color
          });
          // Parte extra (celeste)
          bandRects.push({
            x: scales.x(limitSlot),
            width: scales.x(offset + finrel) - scales.x(limitSlot),
            fill: "#38bdf8"
          });
        } else if (limitSlot <= offset) {
          // Todo extra (celeste)
          bandRects.push({
            x: scales.x(offset),
            width: scales.x(offset + finrel) - scales.x(offset),
            fill: "#38bdf8"
          });
        } else {
          // Todo normal (naranja)
          bandRects.push({
            x: scales.x(offset),
            width: scales.x(offset + finrel) - scales.x(offset),
            fill: color
          });
        }
      } else {
        // Por defecto
        bandRects.push({
          x: scales.x(offset),
          width: scales.x(offset + finrel) - scales.x(offset),
          fill: color
        });
      }

      bgG.selectAll("rect")
        .data(bandRects)
        .join("rect")
        .attr("x", d => d.x)
        .attr("width", d => d.width)
        .attr("y", 0)
        .attr("height", bandHeight)
        .attr("rx", 2)
        .attr("fill", d => d.fill)
        .attr("opacity", 0.8);

      const descargasXY = pedido.descargasBandXY || [];
      const tris = fgG
        .selectAll("path.descarga-activa")
        .data(descargasXY, d => d.key);

      tris.enter()
        .append("path")
        .attr("class", "descarga-activa")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(40))
        .merge(tris)
        .attr("transform", d => `translate(${scales.x(d.x)}, ${bandHeight * 0.75})`)
        .attr("fill", "white")
        .style("pointer-events", "none");

      tris.exit().remove();

      const labels = [
        { x: offset, anchor: "start" },
        { x: offset + finrel, anchor: "end" }
      ];

      labelsG.selectAll("text.band-label")
        .data(labels)
        .join("text")
        .attr("class", "band-label")
        .attr("x", d => scales.x(d.x))
        .attr("y", bandHeight + labelOffset)
        .attr("text-anchor", d => d.anchor)
        .attr("fill", "#666")
        .attr("font-size", 10)
        .text(d => slotToHHMM(d.x, granularidad));
    },
    clear() {
      bgG.selectAll("*").remove();
      fgG.selectAll("*").remove();
      labelsG.selectAll("*").remove();
    }
  };
}
