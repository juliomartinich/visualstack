/* ================== DASHBOARD ORCHESTRATION ================== */

function actualizarOpcionesGantt() {
  const selectViewGraph = document.getElementById("filter-viewgraph");
  const selectViewGantt = document.getElementById("filter-viewgantt");
  const headerViewGantt = document.getElementById("header-viewgantt");

  if (!selectViewGantt) return;

  const currentGraphVal = selectViewGraph ? selectViewGraph.value : "camiones";

  const updateDropdown = (selectEl) => {
    if (!selectEl) return;
    const optDisponibles = selectEl.querySelector('option[value="disponibles"]');
    const optAlmuerzo = selectEl.querySelector('option[value="almuerzo"]');
    
    if (currentGraphVal === "camiones") {
      // Si no existe la opción "disponibles", la agregamos al final
      if (!optDisponibles) {
        const newOpt = document.createElement("option");
        newOpt.value = "disponibles";
        newOpt.textContent = "Disponibles";
        selectEl.appendChild(newOpt);
      }
      if (!optAlmuerzo) {
        const newOpt = document.createElement("option");
        newOpt.value = "almuerzo";
        newOpt.textContent = "Almuerzo";
        selectEl.appendChild(newOpt);
      }
    } else {
      // Si existe la opción "disponibles", la eliminamos
      if (optDisponibles) {
        // Si estaba seleccionada la opción "disponibles" o "almuerzo", cambiamos la selección a "pedidos"
        if (selectEl.value === "disponibles" || selectEl.value === "almuerzo") {
          selectEl.value = "pedidos";
          setCookie("viewGantt", "pedidos");
        }
        optDisponibles.remove();
      }
      if (optAlmuerzo) {
        optAlmuerzo.remove();
      }
    }
  };

  updateDropdown(selectViewGantt);
  updateDropdown(headerViewGantt);
}

function inicializarControles() {
  // 1. Obtener el panel lateral de filtros y construir dinámicamente la botonera del header
  filterFechaPanel = document.getElementById("filter-fecha");
  const headerContainer = document.getElementById("header-date-container");
  headerContainer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; font-size: 11px; background: transparent; padding: 0; flex-wrap: nowrap; overflow: hidden;">
      <!-- Grupo Día -->
      <div style="display: flex; align-items: center; gap: 4px;">
        <label for="header-filter-fecha" style="font-weight: 600; color: #555;">Día:</label>
        <select id="header-filter-fecha" title="Cambiar Fecha" style="font-size: 11px; padding: 1px 3px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: pointer;"></select>
      </div>
      
      <!-- Grupo Planta -->
      <div style="display: flex; align-items: center; gap: 4px;">
        <label for="header-filter-plantagrupo" style="font-weight: 600; color: #555;">Planta:</label>
        <select id="header-filter-plantagrupo" title="Cambiar Planta" style="font-size: 11px; padding: 1px 3px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: pointer;"></select>
      </div>      

      <!-- Grupo Vistas -->
      <div style="display: flex; align-items: center; gap: 4px; border-left: 1px solid #ddd; padding-left: 10px;">
        <label for="header-viewgraph" style="font-weight: 600; color: #555;">Gráfico:</label>
        <select id="header-viewgraph" name="headerViewGraph" style="font-size: 11px; padding: 1px 3px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: pointer;">
          <option value="camiones">Camiones</option>
          <option value="plantas">Asignaciones</option>
          <option value="colas">Plantas</option>
          <option value="recursos">Recursos</option>
        </select>
        
        <label for="header-viewgantt" style="font-weight: 600; color: #555; margin-left: 6px;">Gantt:</label>
        <select id="header-viewgantt" name="headerViewGantt" style="font-size: 11px; padding: 1px 3px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: pointer;">
          <option value="pedidos">Pedidos</option>
          <option value="despachos">Despachos</option>
          <option value="despachos_reales">Despachos reales</option>
          <option value="despachos_mix">Despachos Mix</option>
        </select>
      </div>
    </div>
  `;

  // 2. Guardar referencias a los selectores del encabezado recién inyectados
  filterFechaHeader = document.getElementById("header-filter-fecha");
  filterPlantaHeader = document.getElementById("header-filter-plantagrupo");

  // 3. Poblar las opciones de fecha disponibles en los selectores del panel y del header
  populateDateSelect(filterFechaPanel);
  populateDateSelect(filterFechaHeader);

  // 4. Seleccionar la fecha inicial (usando la del reporte o la primera disponible) y aplicar estilo
  const initialDate = uniqueDates.includes(rawReportDate) ? rawReportDate : (uniqueDates[0] || "");
  filterFechaPanel.value = initialDate;
  filterFechaHeader.value = initialDate;
  updateSelectStyle(filterFechaHeader, filterPlantaHeader);

  // 5. Guardar referencias a otros inputs y filtros de la interfaz
  filterSelect = document.getElementById("filter-plantagrupo");
  codObraInput = document.getElementById("filter-codobra");
  headerCodObraInput = document.getElementById("header-filter-codobra");
  codObraList = document.getElementById("codobras-list");
  camionInput = document.getElementById("filter-camion");
  camionesList = document.getElementById("camiones-list");
  filterCheck = d3.select("#filter-green");
  headerFilterCheck = d3.select("#header-filter-green");

  // 6. Registrar escuchadores de eventos para los cambios de fecha y planta
  filterFechaPanel.addEventListener("change", handleDateChange);
  filterFechaHeader.addEventListener("change", handleDateChange);

  filterSelect.addEventListener("change", handlePlantaChange);
  filterPlantaHeader.addEventListener("change", handlePlantaChange);

  // 7. Registrar escuchador de eventos para el filtrado por código de obra e input de camión
  codObraInput.addEventListener("input", handleObraInput);
  if (headerCodObraInput) headerCodObraInput.addEventListener("input", handleObraInput);
  if (camionInput) camionInput.addEventListener("input", handleCamionInput);

  // 8. Registrar escuchadores de eventos para los filtros checkbox "verdes"
  filterCheck.on("change", handleFilterCheck);
  if (!headerFilterCheck.empty()) headerFilterCheck.on("change", handleFilterCheck);

  // 9. Actualizar y obtener el valor inicial seleccionado para plantas y grupos
  const initialSaved = updateFiltersForDate();

  // 10. Recuperar cookies guardadas para la vista de gráfico (Graph View), saneando valores obsoletos
  let savedGraphView = getCookie("viewGraph") || "camiones";
  if (savedGraphView === "camionesd" || savedGraphView === "camiones_cd" || savedGraphView === "camiones_mix") {
    savedGraphView = "camiones";
    setCookie("viewGraph", "camiones");
  } else if (savedGraphView === "recursos2") {
    savedGraphView = "recursos";
    setCookie("viewGraph", "recursos");
  }

  // 11. Recuperar cookie guardada para la vista Gantt (Gantt View)
  let savedGanttView = getCookie("viewGantt") || "pedidos";

  // 12. Sincronizar selectores del panel y del header con las vistas iniciales recuperadas
  const selectViewGraph = document.getElementById("filter-viewgraph");
  const headerViewGraph = document.getElementById("header-viewgraph");
  const selectViewGantt = document.getElementById("filter-viewgantt");
  const headerViewGantt = document.getElementById("header-viewgantt");

  if (selectViewGraph) selectViewGraph.value = savedGraphView;
  if (headerViewGraph) headerViewGraph.value = savedGraphView;
  if (selectViewGantt) selectViewGantt.value = savedGanttView;
  if (headerViewGantt) headerViewGantt.value = savedGanttView;

  // Actualizar visibilidad inicial de la opción "Disponibles"
  actualizarOpcionesGantt();

  // 13. Manejador global de eventos 'change' para sincronizar vistas y persistir en cookies
  document.addEventListener("change", (e) => {
    const ctrl = e.target;
    const name = ctrl.name;
    // Filtrar únicamente los controles de cambio de vista (gráfico o gantt)
    if (!["viewGraph", "headerViewGraph", "viewGantt", "headerViewGantt"].includes(name)) return;

    const val = ctrl.value;
    if (name === "viewGraph" || name === "headerViewGraph") {
      setCookie("viewGraph", val);
      // Sincronizar el valor entre el selector del panel lateral y del header
      const s1 = document.getElementById("filter-viewgraph");
      const s2 = document.getElementById("header-viewgraph");
      if (s1) s1.value = val;
      if (s2) s2.value = val;
      
      // Actualizar visibilidad de la opción "Disponibles" en base al nuevo gráfico
      actualizarOpcionesGantt();
    } else if (name === "viewGantt" || name === "headerViewGantt") {
      setCookie("viewGantt", val);
      // Sincronizar el valor entre el selector del panel lateral y del header
      const s1 = document.getElementById("filter-viewgantt");
      const s2 = document.getElementById("header-viewgantt");
      if (s1) s1.value = val;
      if (s2) s2.value = val;
    }
    // Redibujar el tablero con el filtro activo de planta/grupo
    dibujar();
  });
}

function populateDateSelect(selectEl, customDates = null) {
  const datesToUse = customDates || uniqueDates;
  const currentVal = selectEl.value;
  selectEl.innerHTML = "";
  datesToUse.forEach(date => {
    const opt = document.createElement("option");
    const styles = getDateStyles(date);
    opt.value = date;
    opt.textContent = (selectEl.id === "header-filter-fecha" ? "Despacho: " : "") + formatFecha(date) + styles.label;
    opt.style.backgroundColor = styles.bg;
    opt.style.color = styles.text;
    selectEl.appendChild(opt);
  });
  if (datesToUse.includes(currentVal)) {
    selectEl.value = currentVal;
  }
}

function updateSelectStyle(dateSelect, plantSelect) {
  const styles = getDateStyles(dateSelect.value);
  dateSelect.style.backgroundColor = styles.bg;
  dateSelect.style.color = styles.text;
  if (plantSelect) {
    plantSelect.style.backgroundColor = styles.bg;
    plantSelect.style.color = styles.text;
  }
}

function updateFiltersForDate() {
  const filterSelect = document.getElementById("filter-plantagrupo");
  const headerFilterSelect = document.getElementById("header-filter-plantagrupo");
  const reportDatePedidos = fullPedidos.filter(p => p["Fecha Pedido"] === rawReportDate);
  filterSelect.innerHTML = "";
  headerFilterSelect.innerHTML = "";
  const plantVolumes = {};
  let totalVolumen = 0;
  reportDatePedidos.forEach(p => {
    const vol = p.CantProgramada || 0;
    plantVolumes[p.Planta] = (plantVolumes[p.Planta] || 0) + vol;
    totalVolumen += vol;
  });
  const plantsWithVolume = Object.keys(plantVolumes).sort();
  const groupsWithVolume = new Set();
  plantsWithVolume.forEach(pCode => {
    const g = window.plantasData[pCode]?.grupo_despacho;
    if (g) groupsWithVolume.add(g);
  });
  const sortedGroups = Array.from(groupsWithVolume).sort();

  const addOption = (select, value, text) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    select.appendChild(opt);
  };

  [filterSelect, headerFilterSelect].forEach(select => {
    if (!select) return;
    
    const groupPlantsSet = new Set();

    sortedGroups.forEach(g => {
      const gPlants = window.grupos[g] || [];
      const activeGPlants = gPlants.filter(p => plantsWithVolume.includes(p)).sort();
      const gVol = d3.sum(activeGPlants, p => plantVolumes[p] || 0);
      
      addOption(select, `Grupo:${g}`, `Grupo ${g} (${formatM3(gVol)} m3)`);
      
      activeGPlants.forEach(pCode => {
        groupPlantsSet.add(pCode);
        const pVol = plantVolumes[pCode] || 0;
        const pName = window.plantasData[pCode]?.nombre || pCode;
        addOption(select, `Planta:${pCode}`, `\u00A0\u00A0\u00A0\u00A0${pName} (${formatM3(pVol)} m3)`);
      });
    });
    
    plantsWithVolume.forEach(pCode => {
      if (!groupPlantsSet.has(pCode)) {
        const pVol = plantVolumes[pCode] || 0;
        const pName = window.plantasData[pCode]?.nombre || pCode;
        addOption(select, `Planta:${pCode}`, `${pName} (${formatM3(pVol)} m3)`);
      }
    });
  });

  const saved = localStorage.getItem("filterPlantaGrupo");
  const optionExists = Array.from(filterSelect.options).some(o => o.value === saved);
  const finalVal = optionExists ? saved : (filterSelect.options[0]?.value || "Grupo:RM");
  filterSelect.value = finalVal;
  if (headerFilterSelect) headerFilterSelect.value = finalVal;
  localStorage.setItem("filterPlantaGrupo", finalVal);
  return finalVal;
}

const handleDateChange = (e) => {
  const val = e.target.value;
  filterFechaPanel.value = val;
  filterFechaHeader.value = val;
  updateSelectStyle(filterFechaHeader, filterPlantaHeader);
  updateFiltersForDate();
  dibujar();
};

const handlePlantaChange = (e) => {
  const val = e.target.value;
  filterSelect.value = val;
  filterPlantaHeader.value = val;
  localStorage.setItem("filterPlantaGrupo", val);
  if (codObraInput) codObraInput.value = "";
  if (headerCodObraInput) headerCodObraInput.value = "";
  const activeDate = filterFechaPanel.value;
  
  const allowedPlants = val.startsWith("Grupo:")
    ? (window.grupos[val.split(":")[1]] || Object.keys(window.plantasData))
    : [val.split(":")[1]];
  const hasOrdersCurrentDate = fullPedidos.some(p =>
    p["Fecha Pedido"] === activeDate && allowedPlants.includes(p.Planta)
  );

  if (!hasOrdersCurrentDate) {
    filterFechaPanel.value = rawReportDate;
    filterFechaHeader.value = rawReportDate;
    updateSelectStyle(filterFechaHeader, filterPlantaHeader);
  }

  dibujar();
};

const handleObraInput = (e) => {
  const val = e.target.value.split(" - ")[0].trim();
  codObraInput.value = val;
  if (headerCodObraInput) headerCodObraInput.value = val;

  if (val !== "") {
    // Limpiar filtro de camión para evitar conflictos
    const camionInput = document.getElementById("filter-camion");
    if (camionInput) {
      camionInput.value = "";
      if (window.selectedCamion) window.selectedCamion.current = null;
    }
  }

  if (val === "") {
    layers.style("opacity", CFG.opacity || 0.7);
    layers.each(function (d) {
      const group = d3.select(this);
      group.selectAll("path.area, path.carga").style("fill", getAreaColor(d));
      group.selectAll("path.line-top, path.carga")
        .attr("stroke", getColorSort(d))
        .attr("stroke-width", scales.yCamiones ? CFG.lineStrokeWidth : 1);
    });
    d3.selectAll("path.line-parent-envelope")
      .style("opacity", 1.0)
      .attr("stroke-width", CFG.lineStrokeWidth);

    if (window.currentBand) window.currentBand.clear();
    panel.html(`<div class="tooltip-card"></div>`);
    d3.selectAll(".gantt-row").style("opacity", 1);
    selectedPedido.current = null;
    return;
  }

  const matches = pedidos.filter(p => String(p.CodObra) === val);
  if (matches.length > 0) {
    const focus = matches[0];
    selectedPedido.current = focus;

    const parentId = focus.parentPedidoId || focus.id;
    layers.style("opacity", d => ((d.parentPedidoId || d.id) === parentId || d.CodObra === focus.CodObra) ? 1 : 0.5);

    layers.each(function (d) {
      const isSameParent = (d.parentPedidoId || d.id) === parentId;
      const isSameObra = d.CodObra === focus.CodObra;
      const isTarget = isSameParent || isSameObra;
      const group = d3.select(this);

      group.selectAll("path.area, path.carga")
        .style("fill", isTarget ? (isSameParent ? getColorOrigen(d) : "red") : getAreaColor(d));
      group.selectAll("path.line-top, path.carga")
        .attr("stroke", isTarget ? (isSameParent ? getColorSort(d) : "red") : getColorSort(d))
        .attr("stroke-width", isTarget ? (scales.yCamiones ? 2.5 : 1.5) : (scales.yCamiones ? CFG.lineStrokeWidth : 1));
    });

    d3.selectAll("path.line-parent-envelope")
      .style("opacity", d => (d.id === parentId) ? 1.0 : 0.2)
      .attr("stroke-width", d => (d.id === parentId) ? 2.5 : CFG.lineStrokeWidth);

    if (window.currentBand) {
      window.currentBand.show(focus, "red");
    }

    renderTooltip(panel, focus, focus.XG?.offset ?? 0, CFG.granularidadMin);
    scrollToGanttRow(focus.id);
  }
};

const handleCamionInput = (e) => {
  const val = e.target.value.trim();
  window.selectedCamion.current = val === "" ? null : val;

  if (val !== "") {
    // Limpiar filtro de obra
    if (codObraInput) codObraInput.value = "";
    if (headerCodObraInput) headerCodObraInput.value = "";
    selectedPedido.current = null;
  }

  if (window.highlightPedido) {
    window.highlightPedido(null);
  }
};

const handleFilterCheck = () => {
  const val = filterCheck.property("checked");
  if (headerFilterCheck) headerFilterCheck.property("checked", val);
  dibujar();
};

function renderDateOptionsForFilter(plantFilter) {
  const allowedPlants = plantFilter.startsWith("Grupo:")
    ? (window.grupos[plantFilter.split(":")[1]] || Object.keys(window.plantasData))
    : [plantFilter.split(":")[1]];

  const datesWithOrders = uniqueDates.filter(date =>
    fullPedidos.some(p => p["Fecha Pedido"] === date && allowedPlants.includes(p.Planta))
  );

  populateDateSelect(filterFechaPanel, datesWithOrders);
  populateDateSelect(filterFechaHeader, datesWithOrders);

}

function getDashboardData(selectedDate, filterKey, currentGraphView, currentGanttView) {
  const cacheKey = `${selectedDate}_${filterKey}_${currentGraphView}_${currentGanttView}`;

  if (window.appCache[cacheKey]) {
    const cached = window.appCache[cacheKey];
    return {
      subsetPedidos: cached.pedidos,
      currentMetrics: cached.metrics,
      curHoraMax: cached.horaMax,
      curOcupacionMax: cached.ocupacionMax,
      curOcupacionMaxCamiones: cached.ocupacionMaxCamiones || 0,
      curOcupacionMaxColas: cached.ocupacionMaxColas || 0,
      curOcupacionMaxAsignaciones: cached.ocupacionMaxAsignaciones || 0,
      globalMaxOcupacionCamiones: cached.globalMaxOcupacionCamiones || 0,
      totalBocas: cached.totalBocas || 0,
      stackResult: {
        isSplit: cached.isSplit,
        plants: cached.plants,
        plantStacks: cached.plantStacks,
        metrics: cached.metrics,
        horaMax: cached.horaMax,
        ocupacionMax: cached.ocupacionMax
      }
    };
  }

  let permitidas = [];
  if (filterKey.startsWith("Grupo:")) {
    permitidas = window.grupos[filterKey.split(":")[1]] || [];
  } else {
    permitidas = [filterKey.split(":")[1]];
  }

  let subsetPedidos = fullPedidos
    .filter(p => p["Fecha Pedido"] === selectedDate && permitidas.includes(p.Planta))
    .map(p => ({ ...p }));
  enrichPedidosForDate(subsetPedidos);

  const parentPlants = new Set(subsetPedidos.map(p => p.Planta));
  let totalBocas = 0;
  parentPlants.forEach(pCode => {
    if (window.plantasData && window.plantasData[pCode]) {
      totalBocas += window.plantasData[pCode].cant_bocas || 0;
    }
  });
  if (totalBocas <= 0) totalBocas = 1;

  const baseOrders = subsetPedidos.map(p => ({ ...p }));
  const stackPed = buildStack(baseOrders);
  const teoDesp = baseOrders.flatMap(p => (p.despachos || []).map(d => ({ ...d, parentPedido: p })));
  const stackTeo = buildStack(teoDesp);
  const realDesp = baseOrders.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
  const stackReal = buildStack(realDesp);
  const mixDesp = baseOrders.flatMap(p => calculateMixedDespachosForPedido(p, p.realDespachos || [], CFG.granularidadMin));
  const stackMix = buildStack(mixDesp);
  const disponiblesDesp = calculateDisponiblesDespachos(fullPedidos, selectedDate, permitidas, CFG.granularidadMin);
  const stackDisponibles = buildStack(disponiblesDesp);

  const globalMaxOcupacionCamiones = Math.max(
    stackPed.ocupacionMax || 0,
    stackTeo.ocupacionMax || 0,
    stackReal.ocupacionMax || 0,
    stackMix.ocupacionMax || 0,
    stackDisponibles.ocupacionMax || 0
  );

  let tempPedidos = [...subsetPedidos];
  if (currentGanttView === 'despachos' || currentGanttView === 'despachos_reales' || currentGanttView === 'despachos_mix' || currentGanttView === 'almuerzo' || currentGanttView === 'disponibles') {
    if (currentGanttView === 'despachos_reales') {
      tempPedidos = tempPedidos.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
    } else if (currentGanttView === 'despachos_mix') {
      tempPedidos = tempPedidos.flatMap(p => calculateMixedDespachosForPedido(p, p.realDespachos || [], CFG.granularidadMin));
    } else if (currentGanttView === 'almuerzo') {
      const pedidosDespachos = tempPedidos.flatMap(p => (p.despachos || []).map(d => ({ ...d, parentPedido: p })));
      const almuerzos = calculateAlmuerzoDespachos(fullPedidos, selectedDate, permitidas, CFG.granularidadMin, pedidosDespachos);
      tempPedidos = [...pedidosDespachos, ...almuerzos];
    } else if (currentGanttView === 'disponibles') {
      tempPedidos = disponiblesDesp;
    } else {
      tempPedidos = tempPedidos.flatMap(p => (p.despachos || []).map(d => ({ ...d, parentPedido: p })));
    }
  }

  let stackResult;
  if (currentGraphView === 'plantas') {
    if (filterKey.startsWith("Grupo:")) {
      const groupName = filterKey.split(":")[1];
      const permitidasGrupo = window.grupos[groupName] || [];
      const activePlants = permitidasGrupo.filter(pCode =>
        tempPedidos.some(p => p.Planta === pCode)
      ).sort();

      if (activePlants.length > 1) {
        const plantStacks = {};
        activePlants.forEach(pCode => {
          const plantPedidos = tempPedidos.filter(p => p.Planta === pCode);
          plantStacks[pCode] = buildPlantLoadStack(plantPedidos, CFG.granularidadMin);
        });

        stackResult = {
          isSplit: true,
          plants: activePlants,
          plantStacks: plantStacks,
          metrics: {
            volumenT: d3.sum(activePlants, p => plantStacks[p].metrics.volumenT),
            volConfirmado: d3.sum(activePlants, p => plantStacks[p].metrics.volConfirmado),
            volNoConfirmado: d3.sum(activePlants, p => plantStacks[p].metrics.volNoConfirmado),
            envolvente: []
          },
          horaMax: d3.max(activePlants, p => plantStacks[p].horaMax) || 0,
          ocupacionMax: d3.max(activePlants, p => plantStacks[p].ocupacionMax) || 0
        };
      } else {
        stackResult = buildPlantLoadStack(tempPedidos, CFG.granularidadMin);
        stackResult.isSplit = false;
      }
    } else {
      stackResult = buildPlantLoadStack(tempPedidos, CFG.granularidadMin);
      stackResult.isSplit = false;
    }
  } else if (currentGraphView === 'colas') {
    if (filterKey.startsWith("Grupo:")) {
      const groupName = filterKey.split(":")[1];
      const permitidasGrupo = window.grupos[groupName] || [];
      const activePlants = permitidasGrupo.filter(pCode =>
        tempPedidos.some(p => p.Planta === pCode)
      ).sort();

      if (activePlants.length > 1) {
        const plantStacks = {};
        activePlants.forEach(pCode => {
          const plantPedidos = tempPedidos.filter(p => p.Planta === pCode);
          const pCap = window.plantasData[pCode]?.cant_bocas || 1;
          plantStacks[pCode] = buildColasStack(plantPedidos, pCap, CFG.granularidadMin);
        });

        stackResult = {
          isSplit: true,
          plants: activePlants,
          plantStacks: plantStacks,
          metrics: {
            volumenT: d3.sum(activePlants, p => plantStacks[p].metrics.volumenT),
            volConfirmado: d3.sum(activePlants, p => plantStacks[p].metrics.volConfirmado),
            volNoConfirmado: d3.sum(activePlants, p => plantStacks[p].metrics.volNoConfirmado),
            envolvente: []
          },
          horaMax: d3.max(activePlants, p => plantStacks[p].horaMax) || 0,
          ocupacionMax: d3.max(activePlants, p => plantStacks[p].ocupacionMax) || 0
        };
      } else {
        stackResult = buildColasStack(tempPedidos, totalBocas, CFG.granularidadMin);
        stackResult.isSplit = false;
      }
    } else {
      stackResult = buildColasStack(tempPedidos, totalBocas, CFG.granularidadMin);
      stackResult.isSplit = false;
    }
  } else if (currentGraphView === 'recursos') {
    const stackRec = buildStack(tempPedidos);
    const stackAsig = buildPlantLoadStack(tempPedidos, CFG.granularidadMin);
    const stackCol = buildColasStack(tempPedidos, totalBocas, CFG.granularidadMin);

    stackResult = {
      isSplit: false,
      horaMax: Math.max(stackRec.horaMax || 0, stackAsig.horaMax || 0, stackCol.horaMax || 0),
      metrics: stackCol.metrics,
      ocupacionMax: 100
    };
    stackResult.metrics.envolventeCamiones = stackRec.metrics.envolvente;
    stackResult.metrics.envolventeAsignaciones = stackAsig.metrics.envolvente;
    stackResult.metrics.envolventeColas = stackCol.metrics.envolvente;

    stackResult.ocupacionMaxCamiones = stackRec.ocupacionMax || 0;
    stackResult.ocupacionMaxColas = stackCol.ocupacionMax || 0;
    stackResult.ocupacionMaxAsignaciones = stackAsig.ocupacionMax || 0;
  } else {
    stackResult = buildStack(tempPedidos);
    stackResult.isSplit = false;
  }

  const currentMetrics = stackResult.metrics;
  const curHoraMax = stackResult.horaMax || 0;
  const curOcupacionMax = stackResult.ocupacionMax || 0;
  const curOcupacionMaxCamiones = stackResult.ocupacionMaxCamiones || 0;
  const curOcupacionMaxColas = stackResult.ocupacionMaxColas || 0;
  const curOcupacionMaxAsignaciones = stackResult.ocupacionMaxAsignaciones || 0;

  window.appCache[cacheKey] = {
    pedidos: tempPedidos,
    metrics: currentMetrics,
    horaMax: curHoraMax,
    ocupacionMax: curOcupacionMax,
    ocupacionMaxCamiones: curOcupacionMaxCamiones,
    ocupacionMaxColas: curOcupacionMaxColas,
    ocupacionMaxAsignaciones: curOcupacionMaxAsignaciones,
    globalMaxOcupacionCamiones: globalMaxOcupacionCamiones,
    isSplit: stackResult.isSplit,
    plants: stackResult.plants,
    plantStacks: stackResult.plantStacks,
    totalBocas: totalBocas
  };

  return {
    subsetPedidos: tempPedidos,
    currentMetrics,
    curHoraMax,
    curOcupacionMax,
    curOcupacionMaxCamiones,
    curOcupacionMaxColas,
    curOcupacionMaxAsignaciones,
    globalMaxOcupacionCamiones,
    totalBocas,
    stackResult
  };
}

function renderDashboard(filterKey) {
  svg.selectAll(".chart-header").remove();
  g.selectAll("*").remove();
  if (window.currentGanttPanel) {
    d3.select("#gantt-chart").selectAll("*").remove();
  }
  const selectedDate = filterFechaPanel.value;
  window.selectedDate = selectedDate;
  meta.DiaDespacho = formatFecha(selectedDate);
  meta.styles = getDateStyles(selectedDate);

  const currentGraphView = getCurrentGraphView();
  const vg1 = document.getElementById("filter-viewgantt")?.value;
  const vg2 = document.getElementById("header-viewgantt")?.value;
  const currentGanttView = (vg2 || vg1 || getCookie("viewGantt") || 'pedidos').trim();

  const dashboardData = getDashboardData(selectedDate, filterKey, currentGraphView, currentGanttView);
  const {
    subsetPedidos,
    currentMetrics,
    curHoraMax,
    curOcupacionMax,
    curOcupacionMaxCamiones,
    curOcupacionMaxColas,
    curOcupacionMaxAsignaciones,
    globalMaxOcupacionCamiones,
    totalBocas,
    stackResult
  } = dashboardData;

  pedidos = subsetPedidos;

  let actualTotalBocas = totalBocas;
  if (actualTotalBocas === 0) {
    let permitidas = [];
    if (filterKey.startsWith("Grupo:")) {
      permitidas = window.grupos[filterKey.split(":")[1]] || [];
    } else {
      permitidas = [filterKey.split(":")[1]];
    }
    const baseOrders = fullPedidos.filter(p => p["Fecha Pedido"] === selectedDate && permitidas.includes(p.Planta));
    const plants = new Set(baseOrders.map(p => p.Planta));
    plants.forEach(pCode => {
      if (window.plantasData && window.plantasData[pCode]) {
        actualTotalBocas += window.plantasData[pCode].cant_bocas || 0;
      }
    });
    if (actualTotalBocas <= 0) actualTotalBocas = 1;
  }

  const xMin = CFG.horaInicio * (60 / CFG.granularidadMin);
  const xMax = CFG.horaFin * (60 / CFG.granularidadMin);

  const scalesSetup = setupDashboardScales(
    currentGraphView, currentMetrics, actualTotalBocas, globalMaxOcupacionCamiones,
    curOcupacionMax, curOcupacionMaxAsignaciones, curOcupacionMaxColas, stackResult, xMin, xMax
  );
  scales = scalesSetup.scales;
  const yMax = scalesSetup.yMax;

  const isSplitGraph = currentGraphView === 'recursos' ||
    (currentGraphView === 'plantas' && stackResult.isSplit) ||
    (currentGraphView === 'colas' && stackResult.isSplit);
  drawGrids(g, scales, curHoraMax, CFG.granularidadMin, innerW, innerH, yMax);
  drawAxes(g, scales, curHoraMax, CFG.granularidadMin, innerH, isSplitGraph);
  drawTopOverlay(svg, g, meta, scales, currentMetrics, width, filterKey);

  band = drawBand(g, scales, innerH, CFG.granularidadMin);
  ganttPanel = drawGanttPanel({ container: "#gantt-chart", scales, margin, rowHeight: 10 });
  window.currentBand = band;
  window.currentGanttPanel = ganttPanel;

  layers = drawGraphLayers(
    currentGraphView, currentGanttView, subsetPedidos, scales, currentMetrics, stackResult, yMax
  );

  let filteredForGantt = (filterCheck.property("checked") || (!headerFilterCheck.empty() && headerFilterCheck.property("checked")))
    ? pedidos.filter(p => {
      const ref = p.parentPedido || p;
      const maxCam = ref.MaxCamiones;
      return ref.Confirmado === "SI" && maxCam === 1;
    })
    : pedidos.slice();

  if (currentGanttView === 'despachos' || currentGanttView === 'despachos_reales' || currentGanttView === 'despachos_mix' || currentGanttView === 'almuerzo') {
    filteredForGantt = decomposePedidosIntoVoyages(filteredForGantt, CFG.granularidadMin);
  }

  filteredForGantt.sort((a, b) => {
    if (currentGanttView === 'disponibles') {
      const timeA = a.HoraInicioMin ?? 0;
      const timeB = b.HoraInicioMin ?? 0;
      if (timeA !== timeB) return timeA - timeB;
      return String(a.Camion).localeCompare(String(b.Camion));
    }

    const offsetA = a.XG?.offset ?? 0;
    const offsetB = b.XG?.offset ?? 0;
    if (offsetA !== offsetB) return offsetA - offsetB;

    const refA = a.parentPedido || a;
    const refB = b.parentPedido || b;
    return String(refA.id).localeCompare(String(refB.id));
  });

  ganttPanel.show(filteredForGantt);

  setupInteraction(
    svg, g, layers, () => pedidos, scales, band, CFG.granularidadMin,
    panel, innerW, innerH, ganttPanel, currentMetrics, margin, getColorSort
  );

  codObraList.innerHTML = "";
  const codObraMap = new Map();
  subsetPedidos.forEach(p => { if (p.CodObra) codObraMap.set(p.CodObra, p.Obra || ""); });
  Array.from(codObraMap.keys()).sort((a, b) => a - b).forEach(cod => {
    const opt = document.createElement("option");
    opt.value = codObraMap.get(cod) ? `${cod} - ${codObraMap.get(cod)}` : cod;
    codObraList.appendChild(opt);
  });
  codObraInput.dispatchEvent(new Event('input'));

  if (camionesList) {
    camionesList.innerHTML = "";
    const camionesSet = new Set();
    subsetPedidos.forEach(p => {
      if (p.Camion) {
        const base = String(p.Camion).replace(/\s+T\d+$/, "").trim();
        camionesSet.add(base);
      }
      if (p.despachos) {
        p.despachos.forEach(d => {
          if (d.Camion) {
            const base = String(d.Camion).replace(/\s+T\d+$/, "").trim();
            camionesSet.add(base);
          }
        });
      }
    });
    Array.from(camionesSet).sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true})).forEach(cam => {
      const opt = document.createElement("option");
      opt.value = cam;
      camionesList.appendChild(opt);
    });
  }
  if (camionInput) {
    camionInput.dispatchEvent(new Event('input'));
  }
}

/* ================== DOM INTERACTION / KEYBINDINGS / SLIDERS ================== */

function resetFilters() {
  const codObraInput = document.getElementById("filter-codobra");
  if (codObraInput && codObraInput.value !== "") {
    codObraInput.value = "";
    codObraInput.dispatchEvent(new Event("input"));
  }
  const camionInput = document.getElementById("filter-camion");
  if (camionInput && camionInput.value !== "") {
    camionInput.value = "";
    camionInput.dispatchEvent(new Event("input"));
  }
}

function startDrag(e, panel) {
  activeDragPanel = panel;
  const rect = panel.getBoundingClientRect();
  offsetX = e.clientX - rect.left;
  offsetY = e.clientY - rect.top;
  document.body.style.userSelect = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  const filterPanel = document.getElementById("filter-config-panel");
  const filterHeader = document.getElementById("filter-config-header");
  const filterCloseBtn = document.getElementById("filter-config-close");
  const settingsPanel = document.getElementById("settings-panel");
  const settingsHeader = document.getElementById("settings-header");
  const settingsCloseBtn = document.getElementById("settings-close");
  const helpModal = document.getElementById("help-modal");
  const helpCloseBtn = document.getElementById("help-modal-close");

  if (helpCloseBtn) { helpCloseBtn.addEventListener("click", () => helpModal.classList.add("hidden")); }

  let activeDragPanel = null;
  let offsetX = 0;
  let offsetY = 0;

  const strokeSlider = document.getElementById("range-stroke-width");
  const strokeVal = document.getElementById("val-stroke-width");
  if (strokeSlider) {
    strokeSlider.value = CFG.lineStrokeWidth;
    strokeVal.textContent = CFG.lineStrokeWidth;
    strokeSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      strokeVal.textContent = val;
      CFG.lineStrokeWidth = val;
      localStorage.setItem("lineStrokeWidth", val);
      if (typeof updateVisualStyles === "function") updateVisualStyles();
    });
  }

  const opacitySlider = document.getElementById("range-opacity");
  const opacityVal = document.getElementById("val-opacity");
  if (opacitySlider) {
    opacitySlider.value = CFG.lineOpacity;
    opacityVal.textContent = CFG.lineOpacity;
    opacitySlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      opacityVal.textContent = val;
      CFG.lineOpacity = val;
      localStorage.setItem("lineOpacity", val);
      if (typeof updateVisualStyles === "function") updateVisualStyles();
    });
  }

  const triangleOpacitySlider = document.getElementById("range-triangle-opacity");
  const triangleOpacityVal = document.getElementById("val-triangle-opacity");
  if (triangleOpacitySlider) {
    triangleOpacitySlider.value = CFG.triangleOpacity;
    triangleOpacityVal.textContent = CFG.triangleOpacity;
    triangleOpacitySlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      triangleOpacityVal.textContent = val;
      CFG.triangleOpacity = val;
      localStorage.setItem("triangleOpacity", val);
      if (typeof updateVisualStyles === "function") updateVisualStyles();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "L" || e.key === "l") {
      e.preventDefault();
      resetFilters();
      const codObraInput = document.getElementById("filter-codobra");
      if (codObraInput) codObraInput.focus();
      return;
    }
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "P" || e.key === "p") {
      if (filterPanel.classList.contains("hidden")) {
        const gantt = document.getElementById("gantt-scroll-container");
        if (gantt) {
          const rect = gantt.getBoundingClientRect();
          filterPanel.style.top = `${rect.top}px`;
          filterPanel.style.left = `${rect.left}px`;
        }
        filterPanel.classList.remove("hidden");
      }
    } else if (e.key === "C" || e.key === "c") {
      if (settingsPanel && settingsPanel.classList.contains("hidden")) {
        const gantt = document.getElementById("gantt-scroll-container");
        if (gantt) {
          const rect = gantt.getBoundingClientRect();
          settingsPanel.style.top = `${rect.top}px`;
          const panelWidth = settingsPanel.offsetWidth || 480;
          settingsPanel.style.left = `${rect.right - panelWidth}px`;
        }
        settingsPanel.classList.remove("hidden");
      }
    } else if (e.key === "H" || e.key === "h") {
      helpModal.classList.toggle("hidden");
    } else if (e.key === "S" || e.key === "s" || e.key === "Escape") {
      filterPanel.classList.add("hidden");
      if (settingsPanel) settingsPanel.classList.add("hidden");
      helpModal.classList.add("hidden");
      resetFilters();
    }
  });

  filterCloseBtn.addEventListener("click", () => {
    filterPanel.classList.add("hidden");
    resetFilters();
  });

  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener("click", () => {
      settingsPanel.classList.add("hidden");
    });
  }

  function startDragLocal(e, panel) {
    activeDragPanel = panel;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.body.style.userSelect = "none";
  }

  filterHeader.addEventListener("mousedown", (e) => startDragLocal(e, filterPanel));
  if (settingsHeader) {
    settingsHeader.addEventListener("mousedown", (e) => startDragLocal(e, settingsPanel));
  }

  document.addEventListener("mousemove", (e) => {
    if (!activeDragPanel) return;
    activeDragPanel.style.left = `${e.clientX - offsetX}px`;
    activeDragPanel.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener("mouseup", () => {
    activeDragPanel = null;
    document.body.style.userSelect = "";
  });
});

// Exposición explícita al objeto global window
window.inicializarControles = inicializarControles;
window.renderDashboard = renderDashboard;
window.getDashboardData = getDashboardData;
window.populateDateSelect = populateDateSelect;
window.updateSelectStyle = updateSelectStyle;
window.updateFiltersForDate = updateFiltersForDate;
