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
    const optSlots = selectEl.querySelector('option[value="slots"]');
    
    if (currentGraphVal === "camiones") {
      if (!optAlmuerzo) {
        const newOpt = document.createElement("option");
        newOpt.value = "almuerzo";
        newOpt.textContent = "Almuerzo";
        const refOpt = selectEl.querySelector('option[value="despachos_reales"]');
        if (refOpt) {
          selectEl.insertBefore(newOpt, refOpt);
        } else {
          selectEl.appendChild(newOpt);
        }
      }
      if (!optSlots) {
        const newOpt = document.createElement("option");
        newOpt.value = "slots";
        newOpt.textContent = "Slots";
        const refOpt = selectEl.querySelector('option[value="disponibles"]');
        if (refOpt) {
          selectEl.insertBefore(newOpt, refOpt);
        } else {
          selectEl.appendChild(newOpt);
        }
      }
      if (!optDisponibles) {
        const newOpt = document.createElement("option");
        newOpt.value = "disponibles";
        newOpt.textContent = "Disponibles";
        selectEl.appendChild(newOpt);
      }
    } else {
      // Si existe la opción "disponibles", la eliminamos
      if (optDisponibles) {
        // Si estaba seleccionada la opción "disponibles" o "almuerzo", cambiamos la selección a "pedidos"
        if (selectEl.value === "disponibles" || selectEl.value === "almuerzo" || selectEl.value === "slots") {
          selectEl.value = "pedidos";
          setCookie("viewGantt", "pedidos");
        }
        optDisponibles.remove();
      }
      if (optAlmuerzo) {
        optAlmuerzo.remove();
      }
      if (optSlots) {
        optSlots.remove();
      }
    }
  };

  updateDropdown(selectViewGantt);
  updateDropdown(headerViewGantt);
}

function inicializarControles() {
  if (Alpine && Alpine.store('filtros')) {
    const store = Alpine.store('filtros');
    // Ensure availableDates are rendered in the DOM before we set the selected value
    setTimeout(() => {
      if (!store.fecha || !uniqueDates.includes(store.fecha)) {
        store.fecha = uniqueDates.includes(rawReportDate) ? rawReportDate : (uniqueDates[0] || "");
      }
    }, 50);
  }

  updateFiltersForDate();
  actualizarOpcionesGantt();

  window.reRenderDashboard = () => {
      const store = Alpine?.store('filtros');
      if (!store) return;
      
      if (rawReportDate !== store.fecha) {
          rawReportDate = store.fecha;
          updateFiltersForDate();
      }
      
      setCookie("viewGraph", store.viewGraph);
      setCookie("viewGantt", store.viewGantt);
      
      actualizarOpcionesGantt();
      dibujar();
  };
  
  if (Alpine && Alpine.store('filtros')) {
      Alpine.store('filtros').isInitialized = true;
  }
}



function updateFiltersForDate() {
  const reportDatePedidos = fullPedidos.filter(p => p["Fecha Pedido"] === rawReportDate);
  const plantVolumes = {};
  reportDatePedidos.forEach(p => {
    const vol = p.CantProgramada || 0;
    plantVolumes[p.Planta] = (plantVolumes[p.Planta] || 0) + vol;
  });
  const plantsWithVolume = Object.keys(plantVolumes).sort();
  const groupsWithVolume = new Set();
  plantsWithVolume.forEach(pCode => {
    const g = window.plantasData[pCode]?.grupo_despacho;
    if (g) groupsWithVolume.add(g);
  });
  const sortedGroups = Array.from(groupsWithVolume).sort();

  const plantasActualizadas = [];

  const groupPlantsSet = new Set();
  sortedGroups.forEach(g => {
    const gPlants = window.grupos[g] || [];
    const activeGPlants = gPlants.filter(p => plantsWithVolume.includes(p)).sort();
    const gVol = d3.sum(activeGPlants, p => plantVolumes[p] || 0);
    
    plantasActualizadas.push({ id: `Grupo:${g}`, label: `Grupo ${g} (${formatM3(gVol)} m3)` });
    
    activeGPlants.forEach(pCode => {
      groupPlantsSet.add(pCode);
      const pVol = plantVolumes[pCode] || 0;
      const pName = window.plantasData[pCode]?.nombre || pCode;
      plantasActualizadas.push({ id: `Planta:${pCode}`, label: `\u00A0\u00A0\u00A0\u00A0${pName} (${formatM3(pVol)} m3)` });
    });
  });
  
  plantsWithVolume.forEach(pCode => {
    if (!groupPlantsSet.has(pCode)) {
      const pVol = plantVolumes[pCode] || 0;
      const pName = window.plantasData[pCode]?.nombre || pCode;
      plantasActualizadas.push({ id: `Planta:${pCode}`, label: `${pName} (${formatM3(pVol)} m3)` });
    }
  });

  if (Alpine && Alpine.store('filtros')) {
    Alpine.store('filtros').setPlantasDisponibles(plantasActualizadas);
    const store = Alpine.store('filtros');
    localStorage.setItem("filterPlantaGrupo", store.planta);
    return store.planta;
  }
  
  return "Grupo:RM";
}



const handleObraInput = (e) => {
  const val = String(e.target?.value || "").split(" - ")[0].trim();

  if (val !== "") {
    // Limpiar filtro de camión para evitar conflictos usando el store
    if (Alpine && Alpine.store('filtros').camion !== "") {
      Alpine.store('filtros').camion = "";
      if (window.selectedCamion) window.selectedCamion.current = null;
    }
  }

  if (val === "") {
    if (layers) {
      layers.style("opacity", CFG.opacity || 0.7);
      layers.each(function (d) {
        const group = d3.select(this);
        group.selectAll("path.area, path.carga").style("fill", getAreaColor(d));
        group.selectAll("path.line-top, path.carga")
          .attr("stroke", getColorSort(d))
          .attr("stroke-width", scales.yCamiones ? CFG.lineStrokeWidth : 1);
      });
    }
    d3.selectAll("path.line-parent-envelope")
      .style("opacity", 1.0)
      .attr("stroke-width", CFG.lineStrokeWidth);

    if (window.currentBand) window.currentBand.clear();
    if (Alpine && Alpine.store('filtros')) Alpine.store('filtros').setTooltipData(null);
    const d3Content = panel.select('#d3-content-tooltip');
    if (!d3Content.empty()) d3Content.style("display", "none");
    d3.selectAll(".gantt-row").style("opacity", 1);
    selectedPedido.current = null;
    return;
  }

  if (!layers) return;

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
  const val = String(e.target?.value || "").trim();
  window.selectedCamion.current = val === "" ? null : val;

  if (val !== "") {
    // Limpiar filtro de obra usando el store
    if (Alpine && Alpine.store('filtros').codObra !== "") {
      Alpine.store('filtros').codObra = "";
      selectedPedido.current = null;
    }
  }

  if (window.highlightPedido) {
    window.highlightPedido(null);
  }
};

const handleFilterCheck = () => {
  dibujar();
};

function renderDateOptionsForFilter(plantFilter) {
  const allowedPlants = plantFilter.startsWith("Grupo:")
    ? (window.grupos[plantFilter.split(":")[1]] || Object.keys(window.plantasData))
    : [plantFilter.split(":")[1]];

  const datesWithOrders = uniqueDates.filter(date =>
    fullPedidos.some(p => p["Fecha Pedido"] === date && allowedPlants.includes(p.Planta))
  );

  if (Alpine && Alpine.store('filtros')) {
    Alpine.store('filtros').availableDates = datesWithOrders;
  }
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
  if (currentGanttView === 'despachos' || currentGanttView === 'despachos_reales' || currentGanttView === 'despachos_mix' || currentGanttView === 'almuerzo' || currentGanttView === 'disponibles' || currentGanttView === 'slots') {
    if (currentGanttView === 'despachos_reales') {
      tempPedidos = tempPedidos.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
    } else if (currentGanttView === 'despachos_mix') {
      tempPedidos = tempPedidos.flatMap(p => calculateMixedDespachosForPedido(p, p.realDespachos || [], CFG.granularidadMin));
    } else if (currentGanttView === 'almuerzo' || currentGanttView === 'slots') {
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
    
    // Calcular asignaciones por planta individualmente para mantener consistencia con la vista Asignaciones
    const activePlantsAsig = [...new Set(tempPedidos.map(p => p.Planta))].filter(Boolean).sort();
    let stackAsig;
    if (activePlantsAsig.length > 1) {
      const plantStacks = {};
      let horaMaxAsig = 0;
      activePlantsAsig.forEach(pCode => {
        const plantPedidos = tempPedidos.filter(p => p.Planta === pCode);
        const st = buildPlantLoadStack(plantPedidos, CFG.granularidadMin);
        plantStacks[pCode] = st;
        if (st.horaMax > horaMaxAsig) horaMaxAsig = st.horaMax;
      });

      const xMaxAsig = horaMaxAsig || (CFG.horaFin * (60 / CFG.granularidadMin));
      const envolventeAsig = Array(xMaxAsig + 1).fill(0);
      for (let t = 0; t <= xMaxAsig; t++) {
        envolventeAsig[t] = d3.max(activePlantsAsig, pCode => plantStacks[pCode].metrics.envolvente[t] || 0) || 0;
      }
      const ocupacionMaxAsig = d3.max(activePlantsAsig, pCode => plantStacks[pCode].ocupacionMax) || 0;

      stackAsig = {
        horaMax: horaMaxAsig,
        ocupacionMax: ocupacionMaxAsig,
        metrics: {
          envolvente: envolventeAsig
        }
      };
    } else {
      stackAsig = buildPlantLoadStack(tempPedidos, CFG.granularidadMin);
    }

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
  if (currentMetrics && stackResult.plantStacks) {
    currentMetrics.plantStacks = stackResult.plantStacks;
  }
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

function renderDashboard() {
  const store = Alpine?.store('filtros');
  if (store) {
    store.resetFilters();
    store.setTooltipData(null);
  }
  if (window.selectedPedido) window.selectedPedido.current = null;
  if (window.selectedCamion) window.selectedCamion.current = null;
  if (window.lastActivePedido) window.lastActivePedido.current = null;
  if (window.highlightFromGantt) window.highlightFromGantt(null);
  if (window.highlightPedidoGlobal) window.highlightPedidoGlobal(null);
  if (window.handleObraInput && typeof window.handleObraInput === 'function') {
    window.handleObraInput({ target: { value: "" } });
  }

  svg.selectAll(".chart-header").remove();
  
  // Limpiar capas específicas en lugar de borrar la estructura estática
  d3.select("#chart-grid-layer").selectAll("*").remove();
  d3.select("#chart-axes-layer").selectAll("*").remove();
  d3.select("#chart-data-layer").selectAll("*").remove();
  d3.select("#chart-overlay-layer").selectAll("*").remove();
  
  if (window.currentGanttPanel) {
    window.currentGanttPanel.clear();
  }

  const filterKey = store?.planta || "Grupo:RM";
  renderDateOptionsForFilter(filterKey);

  const selectedDate = store?.fecha || rawReportDate;
  window.selectedDate = selectedDate;
  meta.DiaDespacho = formatFecha(selectedDate);
  meta.styles = getDateStyles(selectedDate);

  const currentGraphView = store?.viewGraph || "camiones";
  const currentGanttView = store?.viewGantt || "pedidos";

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
  drawGrids(d3.select("#chart-grid-layer"), scales, curHoraMax, CFG.granularidadMin, innerW, innerH, yMax);
  drawAxes(d3.select("#chart-axes-layer"), scales, curHoraMax, CFG.granularidadMin, innerH, isSplitGraph);
  if (Alpine && Alpine.store('filtros')) {
    Alpine.store('filtros').setReportData(
      { DiaReporte: meta.DiaReporte, HoraReporte: meta.HoraReporte },
      { 
        volumenT: formatM3(currentMetrics.volumenT), 
        volConfirmado: formatM3(currentMetrics.volConfirmado) 
      }
    );
  }

  drawTopOverlay(svg, d3.select("#chart-overlay-layer"), meta, scales, currentMetrics, width, filterKey);

  band = drawBand(g, scales, innerH, CFG.granularidadMin);
  ganttPanel = drawGanttPanel({ container: "#gantt-chart", scales, margin, rowHeight: 10 });
  window.currentBand = band;
  window.currentGanttPanel = ganttPanel;

  layers = drawGraphLayers(
    currentGraphView, currentGanttView, subsetPedidos, scales, currentMetrics, stackResult, yMax, innerW, innerH
  );

  let filteredForGantt = (Alpine && Alpine.store('filtros').soloVerde)
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

  // Forzar limpieza final del estado del gráfico recién creado
  if (window.highlightFromGantt) window.highlightFromGantt(null);
  if (window.highlightPedidoGlobal) window.highlightPedidoGlobal(null);
  if (window.handleObraInput && typeof window.handleObraInput === 'function') {
    window.handleObraInput({ target: { value: "" } });
  }

  const codObraMap = new Map();
  subsetPedidos.forEach(p => { if (p.CodObra) codObraMap.set(p.CodObra, p.Obra || ""); });
  const obras = Array.from(codObraMap.keys()).sort((a, b) => a - b).map(cod => {
    return codObraMap.get(cod) ? `${cod} - ${codObraMap.get(cod)}` : cod;
  });

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
  const camiones = Array.from(camionesSet).sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true}));

  if (Alpine && Alpine.store('filtros')) {
    Alpine.store('filtros').setAutocompleteOptions(obras, camiones);
  }
}



/* ================== DOM INTERACTION / KEYBINDINGS / SLIDERS ================== */



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
  const settingsPanel = document.getElementById("settings-panel");
  const settingsHeader = document.getElementById("settings-header");

  let activeDragPanel = null;
  let offsetX = 0;
  let offsetY = 0;

  // (Los event listeners de los sliders de estética fueron migrados a Alpine.js)

  // Los listeners de teclado (P, C, H, S, Esc) y los botones de cierre 
  // fueron migrados a Alpine.js en index.html (@keydown.window, @click, etc.)

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
window.updateFiltersForDate = updateFiltersForDate;
window.handleObraInput = handleObraInput;
window.handleCamionInput = handleCamionInput;
window.handleFilterCheck = handleFilterCheck;
