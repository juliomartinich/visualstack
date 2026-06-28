/* ================== MAIN ================== */
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
const width = 1260;
const height = 490;
const margin = { top: 20, right: 20, bottom: 40, left: 50 };

const panel = d3.select("#panel");
const { svg, g, innerW, innerH } = createSVG("#chart", width, height, margin);

svg.on("mouseleave", () => resetInteraction({
  cursor: d3.select(".cursor"),
  layers: d3.selectAll("g.pedido"),
  overlay: d3.select(".overlay"),
  panel,
  band: window.currentBand
}));

let pedidos, layers, area, scales, band, ganttPanel;
window.appCache = {};

Promise.all([
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

    // Helpers for dynamic styling based on date
    function getTomorrow(yyyymmdd) {
      if (!yyyymmdd || yyyymmdd.length !== 8) return null;
      const y = Number(yyyymmdd.slice(0, 4));
      const m = Number(yyyymmdd.slice(4, 6)) - 1;
      const d = Number(yyyymmdd.slice(6, 8));
      const dt = new Date(y, m, d);
      dt.setDate(dt.getDate() + 1);
      return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
    }

    const tomorrowStr = getTomorrow(rawReportDate);

    function getDateStyles(dateStr) {
      if (dateStr === rawReportDate) return { bg: "#ff8c00", text: "#fff", label: " (Hoy)" };
      if (dateStr === tomorrowStr) return { bg: "#28a745", text: "#fff", label: " (Mañana)" };
      if (dateStr > tomorrowStr) return { bg: "#add8e6", text: "#000", label: "" };
      return { bg: "#eee", text: "#555", label: "" };
    }

    // Populate Date Filter (Synchronized pair)
    const uniqueDates = [...new Set(fullPedidos.map(p => p["Fecha Pedido"]))].sort();
    const filterFechaPanel = document.getElementById("filter-fecha");

    // Create header selects transparent container
    const dateContainer = document.getElementById("header-date-container");
    dateContainer.innerHTML = `
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

        <!-- Grupo Vista -->
        <div style="display: flex; align-items: center; gap: 4px;">
          <label for="header-viewgraph" style="font-weight: 600; color: #555;">Gráfico:</label>
          <select id="header-viewgraph" name="headerViewGraph" style="font-size: 11px; padding: 1px 3px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: pointer;">
            <option value="camiones">Camiones</option>
            <option value="plantas">Asignaciones</option>
            <option value="colas">Plantas</option>
            <option value="recursos">Recursos</option>
          </select>
        </div>

        <!-- Grupo Gantt -->
        <div style="display: flex; align-items: center; gap: 4px;">
          <label for="header-viewgantt" style="font-weight: 600; color: #555;">Gantt:</label>
          <select id="header-viewgantt" name="headerViewGantt" style="font-size: 11px; padding: 1px 3px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: pointer;">
            <option value="pedidos">Pedidos</option>
            <option value="despachos">Despachos</option>
            <option value="despachos_reales">Despachos reales</option>
            <option value="despachos_mix">Despachos Mix</option>
          </select>
        </div>
      </div>
    `;
    const filterFechaHeader = document.getElementById("header-filter-fecha");
    const filterPlantaHeader = document.getElementById("header-filter-plantagrupo");

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
      // Restore value if still valid
      if (datesToUse.includes(currentVal)) {
        selectEl.value = currentVal;
      }
    }

    populateDateSelect(filterFechaPanel);
    populateDateSelect(filterFechaHeader);

    const initialDate = uniqueDates.includes(rawReportDate) ? rawReportDate : (uniqueDates[0] || "");
    filterFechaPanel.value = initialDate;
    filterFechaHeader.value = initialDate;

    function updateSelectStyle(dateSelect, plantSelect) {
      const styles = getDateStyles(dateSelect.value);
      dateSelect.style.backgroundColor = styles.bg;
      dateSelect.style.color = styles.text;
      if (plantSelect) {
        plantSelect.style.backgroundColor = styles.bg;
        plantSelect.style.color = styles.text;
      }
    }
    updateSelectStyle(filterFechaHeader, filterPlantaHeader);

    function enrichPedidosForDate(pedidosForDay) {
      const plantToScope = {};
      Object.entries(plantasData).forEach(([code, p]) => {
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

        // Derivar posiciones de tiempo para la banda inferior (común a todas las vistas)
        p.descargasBandXY = (p.XG?.descargarel ?? []).map(idx => ({
          key: idx,
          x: (p.XG?.offset ?? 0) + idx
        }));
      });
    }

    const grupos = {};
    Object.entries(plantasData).forEach(([code, p]) => {
      const g = p.grupo_despacho;
      if (g) {
        if (!grupos[g]) grupos[g] = [];
        grupos[g].push(code);
      }
    });

    function updateFiltersForDate() {
      const filterSelect = document.getElementById("filter-plantagrupo");
      const headerFilterSelect = document.getElementById("header-filter-plantagrupo");
      // Always populate the plant list based on "Hoy" (Report Date)
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
      const totalHeader = document.createElement("optgroup");
      totalHeader.label = `TOTAL GENERAL (${formatM3(totalVolumen)} m³)`;
      filterSelect.appendChild(totalHeader);

      const groupVolumes = {};
      Object.keys(grupos).forEach(gName => {
        groupVolumes[gName] = grupos[gName].reduce((acc, pCode) => acc + (plantVolumes[pCode] || 0), 0);
      });

      const uniquePlantas = [...new Set(reportDatePedidos.map(p => p.Planta))].sort();
      const ungrouped = uniquePlantas.filter(p => !plantasData[p]?.grupo_despacho);

      Object.keys(grupos).sort().forEach(gName => {
        const plantsInGroup = grupos[gName].filter(p => uniquePlantas.includes(p));
        if (plantsInGroup.length === 0) return;
        const gOpt = document.createElement("option");
        gOpt.value = `Grupo:${gName}`;
        gOpt.textContent = `Grupo: ${gName} (${formatM3(groupVolumes[gName])} m³)`;
        gOpt.style.fontWeight = "bold";
        filterSelect.appendChild(gOpt);
        plantsInGroup.sort().forEach(p => {
          const opt = document.createElement("option");
          opt.value = `Planta:${p}`;
          const name = plantasData[p]?.nombre || "";
          const pVol = plantVolumes[p] || 0;
          opt.textContent = `\u00A0\u00A0\u00A0${name ? `${p} - ${name} (${formatM3(pVol)} m³)` : `${p} (${formatM3(pVol)} m³)`}`;
          filterSelect.appendChild(opt);
        });
      });

      if (ungrouped.length > 0) {
        const otherGroup = document.createElement("optgroup");
        const otherVol = ungrouped.reduce((acc, p) => acc + (plantVolumes[p] || 0), 0);
        otherGroup.label = `Otras Plantas (${formatM3(otherVol)} m³)`;
        ungrouped.forEach(p => {
          const opt = document.createElement("option");
          opt.value = `Planta:${p}`;
          const name = plantasData[p]?.nombre || "";
          opt.textContent = name ? `${p} - ${name} (${formatM3(plantVolumes[p] || 0)} m³)` : `${p} (${formatM3(plantVolumes[p] || 0)} m³)`;
          otherGroup.appendChild(opt);
        });
        filterSelect.appendChild(otherGroup);
      }

      // Sync header filter with the same options (simple version for header)
      headerFilterSelect.innerHTML = filterSelect.innerHTML;
      // Clean up header filter labels for better space usage if needed
      [...headerFilterSelect.options].forEach(opt => {
        // Remove indentation and volume info like (123 m³)
        opt.textContent = opt.textContent
          .replace(/^\u00A0\u00A0\u00A0/, "")
          .replace(/\s*\([^)]+m³\)/, "");
      });

      let savedFilter = localStorage.getItem("filterPlantaGrupo");
      if (!savedFilter || ![...filterSelect.options].some(o => o.value === savedFilter)) {
        const rmExists = Object.keys(grupos).includes("RM") && grupos["RM"].some(p => uniquePlantas.includes(p));
        savedFilter = rmExists ? "Grupo:RM" : (filterSelect.options[0]?.value || "");
      }
      filterSelect.value = savedFilter;
      headerFilterSelect.value = savedFilter;
      return savedFilter;
    }

    const filterSelect = document.getElementById("filter-plantagrupo");
    const codObraInput = document.getElementById("filter-codobra");
    const headerCodObraInput = document.getElementById("header-filter-codobra");
    const codObraList = document.getElementById("codobras-list");
    const filterCheck = d3.select("#filter-green");
    const headerFilterCheck = d3.select("#header-filter-green");

    function renderDateOptionsForFilter(filterKey) {
      let allowedPlants = [];
      if (filterKey.startsWith("Grupo:")) {
        allowedPlants = grupos[filterKey.split(":")[1]] || [];
      } else {
        allowedPlants = [filterKey.split(":")[1]];
      }

      const datesForFilter = [...new Set(
        fullPedidos
          .filter(p => allowedPlants.includes(p.Planta))
          .map(p => p["Fecha Pedido"])
      )].sort();

      const currentDate = filterFechaPanel.value;
      populateDateSelect(filterFechaPanel, datesForFilter);
      populateDateSelect(filterFechaHeader, datesForFilter);

      // If current date is gone, pick report date or first
      if (!datesForFilter.includes(currentDate)) {
        const fallback = datesForFilter.includes(rawReportDate) ? rawReportDate : (datesForFilter[0] || "");
        filterFechaPanel.value = fallback;
        filterFechaHeader.value = fallback;
      }
      updateSelectStyle(filterFechaHeader, filterPlantaHeader);
    }

    function handleDateChange(e) {
      const newDate = e.target.value;
      filterFechaPanel.value = newDate;
      filterFechaHeader.value = newDate;
      updateSelectStyle(filterFechaHeader, filterPlantaHeader);
      window.appCache = {};
      const newSaved = updateFiltersForDate();
      renderDateOptionsForFilter(newSaved);
      renderDashboard(newSaved);
    }
    filterFechaPanel.addEventListener("change", handleDateChange);
    filterFechaHeader.addEventListener("change", handleDateChange);

    filterSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      filterPlantaHeader.value = val;
      localStorage.setItem("filterPlantaGrupo", val);
      if (codObraInput) codObraInput.value = "";
      if (headerCodObraInput) headerCodObraInput.value = "";

      const currentDate = filterFechaPanel.value;
      let allowedPlants = [];
      if (val.startsWith("Grupo:")) {
        allowedPlants = grupos[val.split(":")[1]] || [];
      } else {
        allowedPlants = [val.split(":")[1]];
      }

      // Check if the NEW plant has orders on the CURRENT date
      const hasOrdersCurrentDate = fullPedidos.some(p =>
        p["Fecha Pedido"] === currentDate && allowedPlants.includes(p.Planta)
      );

      if (!hasOrdersCurrentDate) {
        // Only force back to Today if the new selection is inactive on the current date
        filterFechaPanel.value = rawReportDate;
        filterFechaHeader.value = rawReportDate;
        updateSelectStyle(filterFechaHeader, filterPlantaHeader);
      }

      renderDateOptionsForFilter(val);
      renderDashboard(val);
    });

    filterPlantaHeader.addEventListener("change", (e) => {
      const val = e.target.value;
      filterSelect.value = val;
      localStorage.setItem("filterPlantaGrupo", val);
      if (codObraInput) codObraInput.value = "";
      if (headerCodObraInput) headerCodObraInput.value = "";

      const currentDate = filterFechaPanel.value;
      let allowedPlants = [];
      if (val.startsWith("Grupo:")) {
        allowedPlants = grupos[val.split(":")[1]] || [];
      } else {
        allowedPlants = [val.split(":")[1]];
      }

      // Check if the NEW plant has orders on the CURRENT date
      const hasOrdersCurrentDate = fullPedidos.some(p =>
        p["Fecha Pedido"] === currentDate && allowedPlants.includes(p.Planta)
      );

      if (!hasOrdersCurrentDate) {
        // Only force back to Today if the new selection is inactive on the current date
        filterFechaPanel.value = rawReportDate;
        filterFechaHeader.value = rawReportDate;
        updateSelectStyle(filterFechaHeader, filterPlantaHeader);
      }

      renderDateOptionsForFilter(val);
      renderDashboard(val);
    });

    function handleObraInput(e) {
      const val = e.target.value;
      codObraInput.value = val;
      if (headerCodObraInput) headerCodObraInput.value = val;

      const selectedId = val ? val.split(" - ")[0].trim() : "";
      d3.selectAll(".pedido").select("path.area").style("fill", d => {
        if (selectedId && String(d.CodObra) === selectedId) return "red";
        return getAreaColor(d);
      });
      if (selectedId) {
        const matchingPedidos = pedidos.filter(p => String(p.CodObra) === selectedId).sort((a, b) => a.XG.offset - b.XG.offset);
        if (matchingPedidos.length > 0) {
          const current = window.selectedPedido.current;
          // Si ya tenemos un pedido seleccionado que pertenece a esta obra, no lo sobreescribimos.
          // Esto evita que al pinchar un pedido, se salte automáticamente al primero de la obra.
          const alreadySelected = current && String(current.CodObra) === selectedId;
          
          if (!alreadySelected) {
            const first = matchingPedidos[0];
            window.selectPedido(first, false, true);
            if (window.moveCursorTo) {
              const midT = first.XG.offset + Math.floor(first.XG.finrel / 2);
              window.moveCursorTo(midT);
            }
          }
        }
      } else {
        // Solo limpiamos si es una acción directa del usuario (isTrusted)
        // para evitar que los refrescos automáticos limpien la selección persistente
        if (e.isTrusted) {
          window.selectPedido(null, false, true);
          if (window.moveCursorTo) window.moveCursorTo(null);
        }
      }
    }

    codObraInput.addEventListener("input", handleObraInput);
    if (headerCodObraInput) headerCodObraInput.addEventListener("input", handleObraInput);

    function handleFilterCheck() {
      const isChecked = d3.select(this).property("checked");
      filterCheck.property("checked", isChecked);
      if (!headerFilterCheck.empty()) headerFilterCheck.property("checked", isChecked);

      const filtered = isChecked
        ? pedidos.filter(p => {
            const ref = p.parentPedido || p;
            const maxCam = ref.MaxCamiones;
            return ref.Confirmado === "SI" && maxCam === 1;
          })
        : pedidos;
      ganttPanel.show(filtered);
    }

    filterCheck.on("change", handleFilterCheck);
    if (!headerFilterCheck.empty()) headerFilterCheck.on("change", handleFilterCheck);

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
      const cacheKey = `${selectedDate}_${filterKey}_${currentGraphView}_${currentGanttView}`;
      let subsetPedidos = [];
      let stackResult;
      let currentMetrics, curHoraMax, curOcupacionMax, curOcupacionMaxCamiones = 0, curOcupacionMaxColas = 0, curOcupacionMaxAsignaciones = 0, totalBocas = 0, globalMaxOcupacionCamiones = 0;

      if (window.appCache[cacheKey]) {
        const cached = window.appCache[cacheKey];
        subsetPedidos = cached.pedidos;
        currentMetrics = cached.metrics;
        curHoraMax = cached.horaMax;
        curOcupacionMax = cached.ocupacionMax;
        curOcupacionMaxCamiones = cached.ocupacionMaxCamiones || 0;
        curOcupacionMaxColas = cached.ocupacionMaxColas || 0;
        curOcupacionMaxAsignaciones = cached.ocupacionMaxAsignaciones || 0;
        globalMaxOcupacionCamiones = cached.globalMaxOcupacionCamiones || 0;
        stackResult = {
          isSplit: cached.isSplit,
          plants: cached.plants,
          plantStacks: cached.plantStacks,
          metrics: currentMetrics,
          horaMax: curHoraMax,
          ocupacionMax: curOcupacionMax
        };
      } else {
        let permitidas = [];
        if (filterKey.startsWith("Grupo:")) {
          permitidas = grupos[filterKey.split(":")[1]] || [];
        } else {
          permitidas = [filterKey.split(":")[1]];
        }
        subsetPedidos = fullPedidos
          .filter(p => p["Fecha Pedido"] === selectedDate && permitidas.includes(p.Planta))
          .map(p => ({ ...p }));
        enrichPedidosForDate(subsetPedidos);

        // Precompute maximum truck occupancy across the four Gantt views (pedidos, despachos, despachos_reales, despachos_mix)
        const baseOrders = subsetPedidos.map(p => ({ ...p }));
        const stackPed = buildStack(baseOrders);
        const teoDesp = baseOrders.flatMap(p => (p.despachos || []).map(d => ({ ...d, parentPedido: p })));
        const stackTeo = buildStack(teoDesp);
        const realDesp = baseOrders.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
        const stackReal = buildStack(realDesp);
        const mixDesp = baseOrders.flatMap(p => calculateMixedDespachosForPedido(p, p.realDespachos || [], CFG.granularidadMin));
        const stackMix = buildStack(mixDesp);
        globalMaxOcupacionCamiones = Math.max(
          stackPed.ocupacionMax || 0,
          stackTeo.ocupacionMax || 0,
          stackReal.ocupacionMax || 0,
          stackMix.ocupacionMax || 0
        );

        if (currentGanttView === 'despachos' || currentGanttView === 'despachos_reales' || currentGanttView === 'despachos_mix') {
          if (currentGanttView === 'despachos_reales') {
            subsetPedidos = subsetPedidos.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
          } else if (currentGanttView === 'despachos_mix') {
            subsetPedidos = subsetPedidos.flatMap(p => calculateMixedDespachosForPedido(p, p.realDespachos || [], CFG.granularidadMin));
          } else {
            subsetPedidos = subsetPedidos.flatMap(p => (p.despachos || []).map(d => ({ ...d, parentPedido: p })));
          }
        }

        // Calcular totalBocas para la simulación
        const plantsInView = new Set(subsetPedidos.map(p => p.Planta));
        totalBocas = 0;
        plantsInView.forEach(pCode => {
          if (window.plantasData && window.plantasData[pCode]) {
            totalBocas += window.plantasData[pCode].cant_bocas || 0;
          }
        });
        if (totalBocas <= 0) totalBocas = 1;

        if (currentGraphView === 'plantas') {
          if (filterKey.startsWith("Grupo:")) {
            const groupName = filterKey.split(":")[1];
            const permitidasGrupo = grupos[groupName] || [];
            const activePlants = permitidasGrupo.filter(pCode =>
              subsetPedidos.some(p => p.Planta === pCode)
            ).sort(); // ordenadas alfabéticamente
            
            if (activePlants.length > 1) {
              const plantStacks = {};
              activePlants.forEach(pCode => {
                const plantPedidos = subsetPedidos.filter(p => p.Planta === pCode);
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
                  envolvente: [], // dummy
                  plantStacks: plantStacks
                },
                horaMax: d3.max(activePlants, p => plantStacks[p].horaMax) || 0,
                ocupacionMax: d3.max(activePlants, p => plantStacks[p].ocupacionMax) || 0
              };
            }
          }
          
          if (!stackResult) {
            stackResult = buildPlantLoadStack(subsetPedidos, CFG.granularidadMin);
            stackResult.isSplit = false;
          }
        } else if (currentGraphView === 'colas') {
          if (filterKey.startsWith("Grupo:")) {
            const groupName = filterKey.split(":")[1];
            const permitidasGrupo = grupos[groupName] || [];
            const activePlants = permitidasGrupo.filter(pCode =>
              subsetPedidos.some(p => p.Planta === pCode)
            ).sort(); // ordenadas alfabéticamente
            
            if (activePlants.length > 1) {
              const plantStacks = {};
              activePlants.forEach(pCode => {
                const plantPedidos = subsetPedidos.filter(p => p.Planta === pCode);
                const plantBocas = window.plantasData[pCode]?.cant_bocas || 1;
                plantStacks[pCode] = buildColasStack(plantPedidos, plantBocas, CFG.granularidadMin);
              });
              
              stackResult = {
                isSplit: true,
                plants: activePlants,
                plantStacks: plantStacks,
                metrics: {
                  volumenT: d3.sum(activePlants, p => plantStacks[p].metrics.volumenT),
                  volConfirmado: d3.sum(activePlants, p => plantStacks[p].metrics.volConfirmado),
                  volNoConfirmado: d3.sum(activePlants, p => plantStacks[p].metrics.volNoConfirmado),
                  envolvente: [], // dummy
                  plantStacks: plantStacks
                },
                horaMax: d3.max(activePlants, p => plantStacks[p].horaMax) || 0,
                ocupacionMax: d3.max(activePlants, p => plantStacks[p].ocupacionMax) || 0
              };
            }
          }
          
          if (!stackResult) {
            stackResult = buildColasStack(subsetPedidos, totalBocas, CFG.granularidadMin);
            stackResult.isSplit = false;
          }
        } else if (currentGraphView === 'recursos') {
          // Ejecutar las tres simulaciones (Camiones, Colas, Asignaciones)
          const resCamiones = buildStack(subsetPedidos);
          const resColas = buildColasStack(subsetPedidos, totalBocas, CFG.granularidadMin);
          const resAsignaciones = buildPlantLoadStack(subsetPedidos, CFG.granularidadMin);
          stackResult = {
            isSplit: false,
            metrics: { 
              ...resColas.metrics, 
              envolventeColas: resColas.metrics.envolvente, 
              envolventeCamiones: resCamiones.metrics.envolvente,
              envolventeAsignaciones: resAsignaciones.metrics.envolvente
            },
            horaMax: Math.max(resCamiones.horaMax, resColas.horaMax, resAsignaciones.horaMax),
            ocupacionMaxCamiones: resCamiones.ocupacionMax,
            ocupacionMaxColas: resColas.ocupacionMax,
            ocupacionMaxAsignaciones: resAsignaciones.ocupacionMax,
            ocupacionMax: 100 // dummy
          };
        } else {
          stackResult = buildStack(subsetPedidos);
          stackResult.isSplit = false;
        }
        currentMetrics = stackResult.metrics;
        curHoraMax = stackResult.horaMax || 0;
        curOcupacionMax = stackResult.ocupacionMax || 0;
        curOcupacionMaxCamiones = stackResult.ocupacionMaxCamiones || 0;
        curOcupacionMaxColas = stackResult.ocupacionMaxColas || 0;
        curOcupacionMaxAsignaciones = stackResult.ocupacionMaxAsignaciones || 0;
        window.appCache[cacheKey] = { 
          pedidos: subsetPedidos, 
          metrics: currentMetrics, 
          horaMax: curHoraMax, 
          ocupacionMax: curOcupacionMax,
          ocupacionMaxCamiones: curOcupacionMaxCamiones,
          ocupacionMaxColas: curOcupacionMaxColas,
          ocupacionMaxAsignaciones: curOcupacionMaxAsignaciones,
          globalMaxOcupacionCamiones: globalMaxOcupacionCamiones,
          isSplit: stackResult.isSplit,
          plants: stackResult.plants,
          plantStacks: stackResult.plantStacks
        };
      }

      pedidos = subsetPedidos;
      // Asegurar totalBocas para las escalas (útil si viene de caché)
      if (totalBocas === 0) {
        const plants = new Set(pedidos.map(p => p.Planta));
        plants.forEach(pCode => {
          if (window.plantasData && window.plantasData[pCode]) {
            totalBocas += window.plantasData[pCode].cant_bocas || 0;
          }
        });
        if (totalBocas <= 0) totalBocas = 1;
      }
      const xMin = CFG.horaInicio * (60 / CFG.granularidadMin);
      const xMax = CFG.horaFin * (60 / CFG.granularidadMin);
      let yMax;
      if (currentGraphView === 'recursos') {
        // En modo recursos creamos 4 escalas específicas (Camiones, Asignaciones, Colas, Delay)
        scales = createScales({ xMin, xMax, yMax: 1, innerW, innerH }); // x global
        
        // Zona Inferior: Camiones (de 0.55 a 1.0 de innerH)
        scales.yCamiones = d3.scaleLinear()
          .domain([0, Math.max(CFG.yStep, Math.ceil(globalMaxOcupacionCamiones / CFG.yStep) * CFG.yStep)])
          .range([innerH, innerH * 0.55]);
          
        // Zona Media-Baja: Asignaciones (de 0.35 a 0.55 de innerH)
        scales.yAsignaciones = d3.scaleLinear()
          .domain([0, Math.max(totalBocas + 2, Math.ceil(curOcupacionMaxAsignaciones / 2) * 2 + 2)])
          .range([innerH * 0.55, innerH * 0.35]);

        // Zona Media-Alta: Plantas (de 0.12 a 0.35 de innerH)
        scales.yColas = d3.scaleLinear()
          .domain([0, Math.max(totalBocas + 2, Math.ceil(curOcupacionMaxColas / 2) * 2 + 2)])
          .range([innerH * 0.35, innerH * 0.12]);
          
        // Zona Superior: Delay (de 0.02 a 0.12 de innerH)
        const maxDelayMin = Math.max(d3.max(currentMetrics.delay2ByTime) || 0, 10 / CFG.granularidadMin) * CFG.granularidadMin;
        scales.yDelay = d3.scaleLinear()
          .domain([0, maxDelayMin])
          .range([innerH * 0.12 - 5, innerH * 0.02]);

        yMax = 0; // para evitar ejes extra
      } else if (currentGraphView === "plantas" && stackResult.isSplit) {
        // En modo plantas dividido creamos una escala y por cada planta en el grupo
        scales = createScales({ xMin, xMax, yMax: 1, innerW, innerH }); // x global
        scales.yPlants = {};

        const N = stackResult.plants.length;
        const gap = 15;
        const availableHeightForPlots = innerH - (N - 1) * gap;
        const plotH = availableHeightForPlots / N;

        // Calcular el máximo de escala compartido para todas las plantas
        let maxScaleVal = 0;
        stackResult.plants.forEach(pCode => {
          const capacity = window.plantasData[pCode]?.cant_bocas || 0;
          const curOcupacionMax_pCode = stackResult.plantStacks[pCode].ocupacionMax;
          let yMax_p = Math.max(capacity + 2, Math.ceil(curOcupacionMax_pCode / 2) * 2 + 2);
          if (yMax_p < 5) yMax_p = 5;
          if (yMax_p > maxScaleVal) maxScaleVal = yMax_p;
        });

        stackResult.plants.forEach((pCode, i) => {
          const yTop = i * (plotH + gap);
          const yBottom = yTop + plotH;

          scales.yPlants[pCode] = d3.scaleLinear()
            .domain([0, maxScaleVal])
            .range([yBottom, yTop]);
        });
        
        yMax = 0; // evitar eje global
      } else if (currentGraphView === "colas" && stackResult.isSplit) {
        // En modo colas dividido creamos escalas y de colas y de delay por cada planta
        scales = createScales({ xMin, xMax, yMax: 1, innerW, innerH }); // x global
        scales.yColasPlants = {};
        scales.yDelayPlants = {};

        const N = stackResult.plants.length;
        const gap = 20; // un poco más de gap para que no se encimen los textos/ejes de delay
        const availableHeightForPlots = innerH - (N - 1) * gap;
        const plotH = availableHeightForPlots / N;

        // Compartir el máximo de cola/bocas de todas las plantas para visualización comparable
        let maxColasVal = 0;
        stackResult.plants.forEach(pCode => {
          const cap = window.plantasData[pCode]?.cant_bocas || 1;
          const occ = stackResult.plantStacks[pCode].ocupacionMax || 0;
          const val = Math.max(cap + 2, Math.ceil(occ / 2) * 2 + 2);
          if (val > maxColasVal) maxColasVal = val;
        });
        if (maxColasVal < 10) maxColasVal = 10;

        // Compartir el máximo de delay en minutos de todas las plantas
        let maxDelayVal = 0;
        stackResult.plants.forEach(pCode => {
          const delay2ByTime = stackResult.plantStacks[pCode].metrics.delay2ByTime || [];
          const maxDelayMin = Math.max(d3.max(delay2ByTime) || 0, 10 / CFG.granularidadMin) * CFG.granularidadMin;
          if (maxDelayMin > maxDelayVal) maxDelayVal = maxDelayMin;
        });

        stackResult.plants.forEach((pCode, i) => {
          const yTop = i * (plotH + gap);
          const yBottom = yTop + plotH;

          // Escala de colas (ocupa todo el sub-plot vertical)
          scales.yColasPlants[pCode] = d3.scaleLinear()
            .domain([0, maxColasVal])
            .range([yBottom, yTop]);

          // Escala de delay (ocupa el 75% superior de cada sub-plot)
          scales.yDelayPlants[pCode] = d3.scaleLinear()
            .domain([0, maxDelayVal])
            .range([yTop + plotH * 0.75, yTop + plotH * 0.05]);
        });

        yMax = 0; // evitar eje global
      } else if (currentGraphView === "plantas" || currentGraphView === "colas") {
        const uniquePlantas = new Set(pedidos.map(p => p.Planta));
        let capacity = 0;
        uniquePlantas.forEach(pCode => {
          if (window.plantasData && window.plantasData[pCode]) {
            capacity += window.plantasData[pCode].cant_bocas || 0;
          }
        });
        yMax = Math.max(capacity + 2, Math.ceil(curOcupacionMax / 2) * 2 + 2);
        if (yMax < 10) yMax = 10;
        scales = createScales({ xMin, xMax, yMax, innerW, innerH });
      } else {
        if (currentGraphView === 'camiones' || currentGraphView === 'camionesd' || currentGraphView === 'camiones_cd' || currentGraphView === 'camiones_mix') {
          yMax = Math.ceil(globalMaxOcupacionCamiones / CFG.yStep) * CFG.yStep;
        } else {
          yMax = Math.ceil(curOcupacionMax / CFG.yStep) * CFG.yStep;
        }
        if (yMax < CFG.yStep) yMax = CFG.yStep; // safety minimum
        scales = createScales({ xMin, xMax, yMax, innerW, innerH });
      }

      drawGrids(g, scales, curHoraMax, CFG.granularidadMin, innerW, innerH, yMax);
      drawAxes(g, scales, curHoraMax, CFG.granularidadMin, innerH, currentGraphView === 'recursos' || (currentGraphView === 'plantas' && stackResult.isSplit) || (currentGraphView === 'colas' && stackResult.isSplit));
      drawTopOverlay(svg, g, meta, scales, currentMetrics, width, filterKey);

      band = drawBand(g, scales, innerH, CFG.granularidadMin);
      ganttPanel = drawGanttPanel({ container: "#gantt-chart", scales, margin, rowHeight: 10 });
      window.currentBand = band;
      window.currentGanttPanel = ganttPanel;

      if (currentGraphView === 'plantas') {
        if (stackResult.isSplit) {
          stackResult.plants.forEach(pCode => {
            const plantPedidos = pedidos.filter(p => p.Planta === pCode);
            const gPlant = g.append("g").attr("class", `zona-planta-${pCode}`);
            drawPlantLoads(gPlant, plantPedidos, scales, CFG.granularidadMin, scales.yPlants[pCode]);
            
            const capacity = window.plantasData[pCode]?.cant_bocas || 0;
            drawCapacityLine(gPlant, 0, scales, innerW, scales.yPlants[pCode]);
            drawCapacityLine(gPlant, capacity, scales, innerW, scales.yPlants[pCode]);
            drawLeftAxis(gPlant, scales.yPlants[pCode], pCode);
          });
          layers = g.selectAll(".pedido");
        } else {
          layers = drawPlantLoads(g, pedidos, scales, CFG.granularidadMin);
          
          const uniquePlantas = new Set(pedidos.map(p => p.Planta));
          let capacity = 0;
          uniquePlantas.forEach(pCode => {
            if (window.plantasData && window.plantasData[pCode]) {
              capacity += window.plantasData[pCode].cant_bocas || 0;
            }
          });
          drawCapacityLine(g, capacity, scales, innerW);
        }
      } else if (currentGraphView === 'colas') {
        if (stackResult.isSplit) {
          stackResult.plants.forEach(pCode => {
            const plantPedidos = pedidos.filter(p => p.Planta === pCode);
            const gPlant = g.append("g").attr("class", `zona-planta-colas-${pCode}`);
            const yScale = scales.yColasPlants[pCode];
            const yDelayScale = scales.yDelayPlants[pCode];

            // 1. Dibujar cargas/colas
            drawColasLoads(gPlant, plantPedidos, scales, CFG.granularidadMin, yScale);
            
            // 2. Líneas de capacidad
            const capacity = window.plantasData[pCode]?.cant_bocas || 0;
            drawCapacityLine(gPlant, 0, scales, innerW, yScale);
            drawCapacityLine(gPlant, capacity, scales, innerW, yScale);

            // 3. Eje izquierdo de la planta
            drawLeftAxis(gPlant, yScale, pCode);

            // 4. Delay curve de la planta
            const plantMetrics = stackResult.plantStacks[pCode].metrics;
            if (plantMetrics.delay2ByTime) {
              drawDelayCurve(gPlant, plantMetrics.delay2ByTime, scales, CFG.granularidadMin, yDelayScale);
              drawRightAxis(gPlant, yDelayScale, innerW, "Delay Max [min]", "red");
            }
          });
          layers = g.selectAll(".pedido");
        } else {
          // Fallback a vista normal de colas
          layers = drawColasLoads(g, pedidos, scales, CFG.granularidadMin);
          
          const uniquePlantas = new Set(pedidos.map(p => p.Planta));
          let capacity = 0;
          uniquePlantas.forEach(pCode => {
            if (window.plantasData && window.plantasData[pCode]) {
              capacity += window.plantasData[pCode].cant_bocas || 0;
            }
          });
          drawCapacityLine(g, capacity, scales, innerW);

          if (currentMetrics.delay2ByTime) {
            const maxDelayMin = Math.max(d3.max(currentMetrics.delay2ByTime) || 0, 10 / CFG.granularidadMin) * CFG.granularidadMin;
            scales.yDelay = d3.scaleLinear()
              .domain([0, maxDelayMin])
              .range([innerH * 0.75, innerH * 0.05]); 
            
            drawDelayCurve(g, currentMetrics.delay2ByTime, scales, CFG.granularidadMin);
            drawRightAxis(g, scales.yDelay, innerW, "Delay Max [min]", "red");
          }
        }
      } else if (currentGraphView === 'recursos') {
        // 1. Dibujar Camiones (Abajo: 55% - 100% of innerH)
        const gCamiones = g.append("g").attr("class", "zona-camiones");
        const areaCamiones = createArea(scales, scales.yCamiones);
        drawLayers(gCamiones, pedidos, areaCamiones, scales, scales.yCamiones);
        drawLeftAxis(gCamiones, scales.yCamiones, "Camiones");

        // Obtenemos capacidad para las líneas de capacidad
        const uniquePlantas = new Set(pedidos.map(p => p.Planta));
        let capacity = 0;
        uniquePlantas.forEach(pCode => {
          if (window.plantasData && window.plantasData[pCode]) {
            capacity += window.plantasData[pCode].cant_bocas || 0;
          }
        });

        // 2. Dibujar Asignaciones (Medio-Bajo: 35% - 55% of innerH)
        const gAsignaciones = g.append("g").attr("class", "zona-asignaciones");
        drawPlantLoads(gAsignaciones, pedidos, scales, CFG.granularidadMin, scales.yAsignaciones);
        drawCapacityLine(gAsignaciones, 0, scales, innerW, scales.yAsignaciones);
        drawCapacityLine(gAsignaciones, capacity, scales, innerW, scales.yAsignaciones);
        drawLeftAxis(gAsignaciones, scales.yAsignaciones, "Asignaciones");

        // 3. Dibujar Plantas (Medio-Alta: 12% - 35% of innerH)
        const gColas = g.append("g").attr("class", "zona-colas");
        drawColasLoads(gColas, pedidos, scales, CFG.granularidadMin, scales.yColas);
        drawCapacityLine(gColas, 0, scales, innerW, scales.yColas);
        drawCapacityLine(gColas, capacity, scales, innerW, scales.yColas);

        // 4. Dibujar Delay (Arriba: 2% - 12% of innerH)
        const gDelay = g.append("g").attr("class", "zona-delay");
        drawDelayCurve(gDelay, currentMetrics.delay2ByTime, scales, CFG.granularidadMin);
        drawRightAxis(gDelay, scales.yDelay, innerW, "Delay Max [min]", "red");

        // Eje izquierdo de Plantas centrado ocupando el espacio de Plantas y Delay Max
        drawLeftAxis(gColas, scales.yColas, "Plantas", [scales.yColas.range()[0], scales.yDelay.range()[1]]);

        // Capturar todas las capas para el highlight de interacción
        layers = g.selectAll(".pedido"); 
      } else {
        area = createArea(scales);
        layers = drawLayers(g, pedidos, area, scales);
      }

      let filteredForGantt = (filterCheck.property("checked") || (!headerFilterCheck.empty() && headerFilterCheck.property("checked")))
        ? pedidos.filter(p => {
            const ref = p.parentPedido || p;
            const maxCam = ref.MaxCamiones;
            return ref.Confirmado === "SI" && maxCam === 1;
          })
        : pedidos.slice(); // Create a shallow copy before sorting

      if (currentGanttView === 'despachos' || currentGanttView === 'despachos_reales' || currentGanttView === 'despachos_mix') {
        filteredForGantt = decomposePedidosIntoVoyages(filteredForGantt, CFG.granularidadMin);
      }

      // Sort using stack priority to maintain visual order consistency across views
      filteredForGantt.sort((a, b) => {
        const refA = a.parentPedido || a;
        const refB = b.parentPedido || b;

        const getPriority = (p) => {
          if ((p.CantProgramada ?? 0) > 100) return 0;
          if (p.ColorPedido == 11 || p.ColorPedido == 12) return 1;
          if (p.Confirmado !== "SI") return 5;
          const maxCam = p.MaxCamiones;
          if (maxCam > 1) return 2;
          if (p.CantPedidosObra === 1) return 4;
          return 3;
        };

        const prioA = getPriority(refA);
        const prioB = getPriority(refB);
        if (prioA !== prioB) return prioA - prioB;

        const offsetA = refA.XG?.offset ?? 0;
        const offsetB = refB.XG?.offset ?? 0;
        if (offsetA !== offsetB) return offsetA - offsetB;

        if (refA.id === refB.id) {
          const timeA = a.HoraAsignacionMin ?? 0;
          const timeB = b.HoraAsignacionMin ?? 0;
          return timeA - timeB;
        }

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
    }

    const initialSaved = updateFiltersForDate(filterFechaPanel.value);

    // View Mode Selects
    let savedGraphView = getCookie("viewGraph") || "camiones";
    if (savedGraphView === "camionesd" || savedGraphView === "camiones_cd" || savedGraphView === "camiones_mix") {
      savedGraphView = "camiones";
      setCookie("viewGraph", "camiones");
    } else if (savedGraphView === "recursos2") {
      savedGraphView = "recursos";
      setCookie("viewGraph", "recursos");
    }
    let savedGanttView = getCookie("viewGantt") || "pedidos";
    
    const selectViewGraph = document.getElementById("filter-viewgraph");
    const headerViewGraph = document.getElementById("header-viewgraph");
    const selectViewGantt = document.getElementById("filter-viewgantt");
    const headerViewGantt = document.getElementById("header-viewgantt");
    
    if (selectViewGraph) selectViewGraph.value = savedGraphView;
    if (headerViewGraph) headerViewGraph.value = savedGraphView;
    if (selectViewGantt) selectViewGantt.value = savedGanttView;
    if (headerViewGantt) headerViewGantt.value = savedGanttView;

    // Event delegation for header and panel controls
    document.addEventListener("change", (e) => {
      const ctrl = e.target;
      const name = ctrl.name;
      if (!["viewGraph", "headerViewGraph", "viewGantt", "headerViewGantt"].includes(name)) return;

      const val = ctrl.value;
      if (name === "viewGraph" || name === "headerViewGraph") {
        setCookie("viewGraph", val);
        const s1 = document.getElementById("filter-viewgraph");
        const s2 = document.getElementById("header-viewgraph");
        if (s1) s1.value = val;
        if (s2) s2.value = val;
      } else if (name === "viewGantt" || name === "headerViewGantt") {
        setCookie("viewGantt", val);
        const s1 = document.getElementById("filter-viewgantt");
        const s2 = document.getElementById("header-viewgantt");
        if (s1) s1.value = val;
        if (s2) s2.value = val;
      }
      renderDashboard(localStorage.getItem("filterPlantaGrupo") || initialSaved);
    });

    renderDateOptionsForFilter(initialSaved);
    renderDashboard(initialSaved);
  });

function drawTopOverlay(svg, g, meta, scales, metrics, width, filterKey = "") {
  const TRI_Y = 2;   // Pegado al borde superior (adentro)
  const TEXT_Y = 11; // Alineación vertical para el texto
  const HORA_X = 8;  // Offset a la derecha
  const VAL_X = -8;  // Offset a la izquierda

  const headerG = svg.append("g").attr("class", "chart-header").attr("transform", "translate(10,14)");
  headerG.append("text").attr("x", margin.left - 50).attr("y", 0).attr("font-size", 10).attr("fill", "#000")
    .text(`@ ${meta.DiaReporte} ${meta.HoraReporte}`);

  const txt = headerG.append("text").attr("x", width - margin.right).attr("y", 0).attr("text-anchor", "end");

  txt.append("tspan").attr("font-size", 12).attr("fill", "#333").attr("font-weight", 600).text(`Volumen: ${formatM3(metrics.volumenT)} m3`);
  txt.append("tspan").attr("font-size", 10).attr("fill", "#000").text(`, Confirmado: ${formatM3(metrics.volConfirmado)}`);

  if (typeof getCurrentGraphView === "function" && getCurrentGraphView() === "recursos") {
    return;
  }

  const markerG = g.append("g").attr("class", "markers-top").style("pointer-events", "none");
  const items = [{ key: "maxGlobal", color: "#d62728" }, { key: "maxAM", color: "#1f77b4" }, { key: "min12_14", color: "#2ca02c" }, { key: "maxPM14", color: "#1f77b4" }];
  const data = items.map(d => ({ ...d, ...metrics[d.key] })).filter(d => d.slot != null);

  markerG.selectAll("path.top-marker").data(data).enter().append("path").attr("class", "top-marker")
    .attr("d", d3.symbol().type(d3.symbolTriangle).size(45))
    .attr("transform", d => `translate(${scales.x(d.slot)}, ${TRI_Y}) rotate(180)`)
    .attr("fill", d => d.color);

  markerG.selectAll("text.top-marker-hour").data(data).enter().append("text").attr("class", "top-marker-hour")
    .attr("x", d => scales.x(d.slot) + HORA_X).attr("y", TEXT_Y).attr("text-anchor", "start").attr("font-size", 10)
    .attr("font-weight", 600).attr("fill", d => d.color).text(d => d.hora);

  markerG.selectAll("text.top-marker-value").data(data).enter().append("text").attr("class", "top-marker-value")
    .attr("x", d => scales.x(d.slot) + VAL_X).attr("y", TEXT_Y).attr("text-anchor", "end").attr("font-size", 11)
    .attr("font-weight", 700).attr("fill", d => d.color).text(d => d.value);
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

  // Initialize sliders
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

  // Listener para la tecla Escape para limpiar selección
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.selectPedido(null, false, true);
      if (window.moveCursorTo) window.moveCursorTo(null);
      
      const codObraInput = document.getElementById("filter-codobra");
      if (codObraInput) {
        codObraInput.value = "";
        codObraInput.dispatchEvent(new Event("input"));
      }
    }
  });

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

  function resetFilters() {
    const codObraInput = document.getElementById("filter-codobra");
    if (codObraInput && codObraInput.value !== "") {
      codObraInput.value = "";
      codObraInput.dispatchEvent(new Event("input"));
    }
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

  function startDrag(e, panel) {
    activeDragPanel = panel;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.body.style.userSelect = "none";
  }

  filterHeader.addEventListener("mousedown", (e) => startDrag(e, filterPanel));
  if (settingsHeader) {
    settingsHeader.addEventListener("mousedown", (e) => startDrag(e, settingsPanel));
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