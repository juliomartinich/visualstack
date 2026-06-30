/* ==== * SVG base * ===================== */
function createSVG(container, width, height, margin) {
  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("border", "2px solid gray"); // debug visual

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  return {
    svg, g,
    innerW: width - margin.left - margin.right,
    innerH: height - margin.top - margin.bottom
  };
}

/* === * Escalas * ===================== */
function createScales({ xMin, xMax, yMax, innerW, innerH }) {
  return {
    x: d3.scaleLinear()
      .domain([xMin, xMax])
      .range([0, innerW]),

    y: d3.scaleLinear()
      .domain([0, yMax])
      .range([innerH, 0])
  };
}

/* === * Grillas * ===================== */
function drawGrids(g, scales, maxX, granularidad, innerW, innerH, yMax) {
  g.append("g")
    .attr("class", "grid grid-y")
    .call(
      d3.axisLeft(scales.y)
        .tickValues(d3.range(0, yMax + 1, CFG.yStep))
        .tickSize(-innerW)
        .tickFormat("")
    );

  g.append("g")
    .attr("class", "grid grid-x")
    .attr("transform", `translate(0,${innerH})`)
    .call(
      d3.axisBottom(scales.x)
        .tickValues(d3.range(0, maxX + 1, 60 / granularidad))
        .tickSize(-innerH)
        .tickFormat("")
    );

  // Draw vertical line for report time
  const vg1 = document.getElementById("filter-viewgantt")?.value;
  const vg2 = document.getElementById("header-viewgantt")?.value;
  const currentGanttView = (vg2 || vg1 || "pedidos").trim();

  const isSameDay = window.selectedDate && window.diaReporte && window.selectedDate.replace(/-/g, "") === window.diaReporte;

  if (isSameDay && (currentGanttView === "despachos_reales" || currentGanttView === "despachos_mix") && window.horaReporte) {
    const reportMin = safeHhmmssToMin(window.horaReporte);
    if (reportMin !== null) {
      const xPos = scales.x(reportMin / granularidad);
      g.append("line")
        .attr("class", "report-time-line")
        .attr("x1", xPos)
        .attr("x2", xPos)
        .attr("y1", 0)
        .attr("y2", innerH)
        .attr("stroke", "#d62728")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4,4")
        .style("pointer-events", "none");
    }
  }
}

/* ==== * Ejes * ===================== */
function drawAxes(g, scales, maxX, granularidad, innerH, skipY = false) {
  if (!skipY) {
    g.append("g").call(d3.axisLeft(scales.y).ticks(10));
  }

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(
      d3.axisBottom(scales.x)
        .tickValues(d3.range(0, maxX + 1, 60 / granularidad))
        .tickFormat(d => {
          const hh = Math.floor((d * granularidad) / 60);
          return String(hh).padStart(2, "0") + ":00";
        })
    );
}

function drawCapacityLine(g, capacity, scales, innerW, yScale) {
  const y = yScale || scales.y;
  const yPos = y(capacity);
  
  g.append("line")
    .attr("class", "capacity-line")
    .attr("x1", 0)
    .attr("x2", innerW)
    .attr("y1", yPos)
    .attr("y2", yPos)
    .attr("stroke", capacity === 0 ? "#ccc" : "#333")
    .attr("stroke-width", capacity === 0 ? 1 : 2)
    .attr("stroke-dasharray", capacity === 0 ? "none" : "5,5")
    .style("pointer-events", "none");

  if (capacity > 0) {
    g.append("text")
      .attr("class", "capacity-label")
      .attr("x", innerW - 5)
      .attr("y", yPos - 5)
      .attr("text-anchor", "end")
      .attr("fill", "#333")
      .attr("font-size", "10px")
      .text(`Capacidad: ${capacity} bocas`);
  }
}

function drawDelayCurve(g, data, scales, granularidadMin, yDelayScale, color = "red", className = "delay-curve", isMinutes = false) {
  const yD = yDelayScale || scales.yDelay;
  if (!data || data.length === 0 || !yD) return;

  const [xMin, xMax] = scales.x.domain();

  // Filtramos la data para que solo incluya los puntos dentro del rango visible
  const visibleData = data
    .map((v, i) => ({ v, i }))
    .filter(d => d.i >= xMin && d.i <= xMax);

  const factor = isMinutes ? 1 : granularidadMin;

  const line = d3.line()
    .x(d => scales.x(d.i))
    .y(d => yD(d.v * factor))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(visibleData)
    .attr("class", className)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 2)
    .attr("opacity", 0.8);

  // Área bajo la curva (solo si es roja)
  if (color === "red") {
    const area = d3.area()
      .x(d => scales.x(d.i))
      .y0(yD(0))
      .y1(d => yD(d.v * factor))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(visibleData)
      .attr("class", `${className}-area`)
      .attr("d", area)
      .attr("fill", color)
      .attr("opacity", 0.05);
  }
}

function drawLeftAxis(g, scale, label, customRange, color = "#333", offset = 0) {
  if (!scale) return;
  const axis = d3.axisLeft(scale).ticks(5);
  const axisG = g.append("g")
    .attr("class", "y-axis-left")
    .attr("transform", `translate(${offset}, 0)`)
    .call(axis);

  if (color !== "#333") {
    axisG.selectAll("line").attr("stroke", color);
    axisG.selectAll("path").attr("stroke", color);
    axisG.selectAll("text").attr("fill", color);
  }

  const rangeToUse = customRange || scale.range();
  const centerPos = -(rangeToUse[0] + rangeToUse[1]) / 2;

  const textEl = axisG.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", color === "#333" ? -35 : -10)
    .attr("x", centerPos)
    .attr("fill", color)
    .attr("text-anchor", "middle")
    .attr("font-size", color === "#333" ? "11px" : "9.5px")
    .attr("font-weight", "bold");

  const plantName = window.plantasData?.[label]?.nombre || "";
  if (plantName) {
    textEl.append("tspan")
      .attr("x", centerPos)
      .text(label);
    
    textEl.append("tspan")
      .attr("x", centerPos)
      .attr("dy", "1.1em") // Desplazar hacia la derecha para el nombre de la planta
      .attr("font-size", "8.5px")
      .attr("font-weight", "normal")
      .attr("fill", color === "#333" ? "#666" : color)
      .text(plantName);
  } else {
    textEl.text(label);
  }
}

function drawRightAxis(g, scale, innerW, label, color = "#666") {
  if (!scale) return;
  const axis = d3.axisRight(scale).ticks(5);
  const axisG = g.append("g")
    .attr("class", "y-axis-right")
    .attr("transform", `translate(${innerW}, 0)`)
    .call(axis);

  if (color !== "#666") {
    axisG.selectAll("line").attr("stroke", color);
    axisG.selectAll("path").attr("stroke", color);
    axisG.selectAll("text").attr("fill", color);
  }

  axisG.append("text")
    .attr("x", -10) // Hacia el interior
    .attr("y", scale.range()[1] + 15) // Bajamos un poco más (15px) del tope del sector
    .attr("fill", color)
    .attr("text-anchor", "end") // Alineado al eje pero desde adentro
    .attr("font-size", "10px")
    .attr("font-weight", "bold")
    .text(label);
}

/* ==== * Área stack * ===================== */
function createArea(scales, yScale) {
  const y = yScale || scales.y;
  return d3.area()
    .defined(d => d.v > 0)
    .x(d => scales.x(d.x))
    .y0(d => y(d.y0))
    .y1(d => y(d.y1));
}

function getColorSort(pedido) {
  if (pedido.isAnulado) {
    return "#e63946";
  }
  const ref = pedido.isDespacho ? pedido.parentPedido : pedido;
  const maxCam = ref.MaxCamiones;

  if (ref.CantProgramada > 100) {
    return COLORS.multi;
  }
  if (ref.ColorPedido == 11 || ref.ColorPedido == 12) {
    return COLORS.color11_12;
  }
  if (ref.Confirmado !== "SI") {
    return COLORS.unconfirmed;
  }
  // Si tiene más de 1 camión en simultáneo, siempre es AZUL
  if (maxCam > 1) {
    return COLORS.multi;
  }
  // Solo los de 1 camión pueden ser verdes
  if (ref.CantPedidosObra === 1) {
    return COLORS.singleOrder;
  }
  return COLORS.mono;
}

/* ==== * Color de Área * ===================== */
function getColorOrigen(pedido) {
  if (pedido.isAnulado) {
    return "#e63946";
  }
  const ref = pedido.isDespacho ? pedido.parentPedido : pedido;
  if (!window.pedidoColorsMap) return getColorSort(ref);
  // ColorPedido suele ser el ID en el mapa
  const color = window.pedidoColorsMap.get(Number(ref.ColorPedido));
  return color || getColorSort(ref);
}

function getAreaColor(pedido) {
  if (pedido.isAnulado) {
    return "#e63946";
  }
  const ref = pedido.isDespacho ? pedido.parentPedido : pedido;
  const maxCam = ref.MaxCamiones;

  if (ref.CantProgramada > 100) return AREACOLORS.masivo;
  if (ref.ColorPedido == 11 || ref.ColorPedido == 12) return AREACOLORS.color11_12;
  if (ref.Confirmado !== "SI") return AREACOLORS.unconfirmed;
  if (maxCam === 1 && ref.CantPedidosObra === 1) return AREACOLORS.singleOrder;
  return "none";
}

/* ==== dibuja parte superior del area con los bordes verticales =====*/
function lineTopClosed(segmentos, scales, yScale) {
  const x = scales.x;
  const y = yScale || scales.y;
  const pts = [];

  const first = segmentos.find(d => d.v > 0);
  if (!first) return null;

  pts.push({ x: first.x, y: first.y0 });
  pts.push({ x: first.x, y: first.y1 });

  segmentos.forEach(d => {
    if (d.v > 0) {
      pts.push({ x: d.x, y: d.y1 });
    }
  });

  const last = [...segmentos].reverse().find(d => d.v > 0);
  pts.push({ x: last.x, y: last.y1 });
  pts.push({ x: last.x, y: last.y0 });

  return d3.line()
    .x(d => x(d.x))
    .y(d => y(d.y))(pts);
}

/* ==== * Dibujo de pedidos (stack) * ===================== */
function computeCombinedSegmentos(dispatches) {
  const segmentsByX = {};
  dispatches.forEach(d => {
    const segments = d.STK?.segmentosXY || [];
    segments.forEach(seg => {
      if (seg.v <= 0) return;
      if (!segmentsByX[seg.x]) {
        segmentsByX[seg.x] = [];
      }
      segmentsByX[seg.x].push(seg);
    });
  });

  const combined = [];
  const xKeys = Object.keys(segmentsByX).map(Number).sort((a, b) => a - b);
  xKeys.forEach(x => {
    const list = segmentsByX[x];
    const y0 = d3.min(list, s => s.y0);
    const y1 = d3.max(list, s => s.y1);
    combined.push({ x, y0, y1, v: y1 - y0 });
  });

  return combined;
}

/* ==== * Dibujo de pedidos (stack) * ===================== */
function drawLayers(g, pedidos, area, scales, yScale) {
  const x = scales.x;
  const y = yScale || scales.y;

  // Limpiar cualquier envolvente de pedidos anterior
  g.selectAll("path.line-parent-envelope").remove();

  const isDespachoMode = pedidos.some(d => d.isDespacho);

  const layers = g.selectAll("g.pedido")
    .data(pedidos)
    .enter()
    .append("g")
    .attr("class", "pedido");

  layers.append("path")
    .attr("class", "area")
    .attr("d", d => area(d.STK?.segmentosXY || []))
    .style("fill", d => getAreaColor(d))
    .style("stroke", "none");

  layers.append("path")
    .attr("class", "line-top")
    .attr("d", d => lineTopClosed(d.STK?.segmentosXY || [], scales, y))
    .attr("fill", "none")
    .attr("stroke", d => getColorSort(d))
    .attr("stroke-width", isDespachoMode ? CFG.lineStrokeWidth * 0.4 : CFG.lineStrokeWidth)
    .attr("stroke-opacity", isDespachoMode ? CFG.lineOpacity * 0.4 : CFG.lineOpacity);

  // Si estamos en modo despachos, dibujar la envolvente para el pedido unificado
  if (isDespachoMode) {
    const groups = d3.group(pedidos, d => d.parentPedidoId);
    const parentEnvelopesData = Array.from(groups.entries()).map(([parentId, dispatches]) => {
      const parentPedido = dispatches[0].parentPedido;
      const combinedSegmentos = computeCombinedSegmentos(dispatches);
      return {
        id: parentId,
        parentPedido,
        segmentosXY: combinedSegmentos
      };
    });

    g.selectAll("path.line-parent-envelope")
      .data(parentEnvelopesData, d => d.id)
      .enter()
      .append("path")
      .attr("class", "line-parent-envelope")
      .attr("d", d => lineTopClosed(d.segmentosXY, scales, y))
      .attr("fill", "none")
      .attr("stroke", d => getColorSort(d.parentPedido))
      .attr("stroke-width", CFG.lineStrokeWidth)
      .attr("stroke-opacity", CFG.lineOpacity)
      .style("pointer-events", "none");
  }

  window.updateVisualStyles = () => {
    d3.selectAll(".pedido path.line-top")
      .attr("stroke-width", isDespachoMode ? CFG.lineStrokeWidth * 0.4 : CFG.lineStrokeWidth)
      .attr("stroke-opacity", isDespachoMode ? CFG.lineOpacity * 0.4 : CFG.lineOpacity);

    if (isDespachoMode) {
      d3.selectAll("path.line-parent-envelope")
        .attr("stroke-width", CFG.lineStrokeWidth)
        .attr("stroke-opacity", CFG.lineOpacity);
    }

    d3.selectAll(".pedido path.descarga")
      .attr("fill-opacity", CFG.triangleOpacity);
  };

  layers.each(function (pedido) {
    const descs = pedido.STK?.descargasXY || [];
    if (!Array.isArray(descs) || descs.length === 0) return;

    d3.select(this)
      .selectAll("path.descarga")
      .data(descs, d => d.key)
      .enter()
      .append("path")
      .attr("class", "descarga")
      .attr("d", d3.symbol().type(d3.symbolTriangle).size(20))
      .attr("transform", d => `
        translate(${x(d.x)}, ${y(d.y)})
        rotate(180)
      `)
      .attr("fill", getColorSort(pedido))
      .attr("fill-opacity", CFG.triangleOpacity)
      .style("pointer-events", "none");
  });

  return layers;
}

/* ==== * Dibujo de Cargas de Plantas (rectángulos) * ====*/
function drawPlantLoads(g, pedidos, scales, granularidadMin, yScale) {
  const x = scales.x;
  const y = yScale || scales.y;

  const layers = g.selectAll("g.pedido")
    .data(pedidos)
    .enter()
    .append("g")
    .attr("class", "pedido");

  layers.each(function (pedido) {
    const bloques = pedido.STK_PLANTAS?.bloquesXY || [];
    if (bloques.length === 0) return;

    d3.select(this)
      .selectAll("path.carga")
      .data(bloques)
      .enter()
      .append("path")
      .attr("class", "carga")
      .attr("d", d => {
        const px = x(d.x);
        const py = y(d.y1);
        const pw = Math.max(1, x(d.x + 1) - x(d.x));
        const ph = Math.max(1, y(d.y0) - y(d.y1));
        const pr = Math.min(4, pw * 0.1, ph * 0.5);

        const p = d3.path();
        p.moveTo(px, py + ph); // BL
        p.lineTo(px + pw, py + ph); // BR
        p.arcTo(px + pw * 0.8, py, px, py, pr); // TR
        p.arcTo(px, py, px, py + ph, pr); // TL
        p.closePath();
        return p.toString();
      })
      .attr("fill", getAreaColor(pedido))
      .attr("stroke", getColorSort(pedido))
      .attr("stroke-width", 1)
      .attr("opacity", 0.9);
  });

  return layers;
}



/* ==== * Panel Gantt inferior (Scrollable) * ===================== */
function drawGanttPanel({ container, scales, margin, rowHeight = 12 }) {
  const width = scales.x.range()[1] + margin.left + margin.right;

  // No creamos el SVG acá todavia, lo creamos en show
  const ganttDiv = d3.select(container);

  return {
    clear() {
      ganttDiv.selectAll("*").remove();
    },
    show(pedidos, activo) {
      const totalHeight = pedidos.length * rowHeight + 20;

      let svg = ganttDiv.select("svg");
      if (svg.empty()) {
        svg = ganttDiv.append("svg")
          .attr("width", width)
          .attr("height", totalHeight);
      } else {
        svg.attr("height", totalHeight);
      }

      let g = svg.select("g.gantt-main");
      if (g.empty()) {
        g = svg.append("g")
          .attr("class", "gantt-main")
          .attr("transform", `translate(${margin.left}, 10)`);
      }

      const rowsG = g.selectAll("g.gantt-row")
        .data(pedidos, d => d.id)
        .join("g")
        .attr("class", d => `gantt-row ${activo && d.id === activo.id ? "active" : ""}`)
        .attr("id", d => `gantt-row-${d.id}`)
        .attr("transform", (_, i) => `translate(0, ${i * rowHeight})`);

      // Barras
      rowsG.selectAll("rect.gantt-bar")
        .data(d => [d])
        .join("rect")
        .attr("class", "gantt-bar")
        .attr("x", d => scales.x(d.XG.offset))
        .attr("y", 1)
        .attr("width", d => {
          const { offset, finrel } = d.XG ?? {};
          if (typeof offset !== "number" || typeof finrel !== "number" || finrel <= 0) return 0;
          return Math.max(0, scales.x(offset + finrel) - scales.x(offset));
        })
        .attr("height", rowHeight - 3)
        .attr("rx", 3)
        .attr("fill", d => getColorSort(d))
        .attr("opacity", 0.8);

      // Descargas
      rowsG.each(function (pedido) {
        const offset = pedido.XG?.offset ?? 0;
        const descargasX = (pedido.isAnulado || !pedido.XG?.descargarel) ? [] : (pedido.XG.descargarel ?? []).map((rel, i) => ({
          key: i,
          x: offset + rel
        }));

        d3.select(this)
          .selectAll("path.gantt-descarga")
          .data(descargasX, d => d.key)
          .join("path")
          .attr("class", "gantt-descarga")
          .attr("d", d3.symbol().type(d3.symbolTriangle).size(20))
          .attr("transform", d => `translate(${scales.x(d.x)}, ${rowHeight * 0.7})`)
          .attr("fill", "white")
          .style("pointer-events", "none");
      });

      // Etiquetas
      rowsG.selectAll("text.gantt-label")
        .data(d => [d])
        .join("text")
        .attr("class", "gantt-label")
        .attr("y", rowHeight - 2)
        .attr("fill", d => d.isAnulado ? "#ffffff" : "#444")
        .attr("font-size", 11)
        .text(d => {
          const parentId = d.parentPedido ? d.parentPedido.id : d.id;
          const isFirst = pedidos.find(x => (x.parentPedido ? x.parentPedido.id : x.id) === parentId) === d;

          const isRealItem = d.isRealDespacho || (d.isMixedDespacho && (d.mixedType === "real" || d.mixedType === "en_curso" || d.mixedType === "anulado"));

          if (isRealItem) {
            const isAnulado = d.isAnulado || d.mixedType === "anulado";
            const isEnCurso = d.isEnCursoDespacho || d.mixedType === "en_curso";
            const totalCount = d.parentPedido ? (d.parentPedido.despachos ? Math.max(d.parentPedido.despachos.length, d.parentPedido.CantRealDespachos) : (d.parentPedido.CantRealDespachos || 1)) : 1;

            let descTime = "-";
            if (d.isStepReal && d.isStepReal.InicioDescarga) {
              descTime = d.HoraInicio;
            } else if (isEnCurso) {
              descTime = d.HoraInicio + "*";
            }

            const baseLabel = isAnulado 
              ? `Ticket #${d.ticketId} (ANULADO, Camión ${d.Camion}) - ${d.CantProgramada} m3 - Descarga ${descTime}`
              : `Despacho ${d.despachoIndex} de ${totalCount} (Ticket #${d.ticketId}, Camión ${d.Camion}) - ${d.CantProgramada} m3 - Descarga ${descTime}`;
            
            if (isFirst) {
              return `Ped #${d.parentPedido.id} - ${d.parentPedido.Cliente} - ${d.Obra} - ${d.parentPedido.CantProgramada} m3 / ${baseLabel}`;
            }
            return baseLabel;
          }

          if (d.isDespacho) {
            const totalTeo = d.parentPedido ? (d.parentPedido.despachos ? Math.max(d.parentPedido.despachos.length, d.parentPedido.CantRealDespachos) : (d.parentPedido.CantCargas || 1)) : 1;
            const baseLabel = `Despacho ${d.despachoIndex} de ${totalTeo} - ${d.CantProgramada} m3 - Descarga ${d.HoraInicio}`;
            if (isFirst) {
              return `Ped #${d.parentPedido.id} - ${d.parentPedido.Cliente} - ${d.Obra} - ${d.parentPedido.CantProgramada} m3 / ${baseLabel}`;
            }
            return baseLabel;
          }

          return `${d.id} - ${d.Obra} - ${d.CantProgramada} m3 - ${d.HoraInicio}`;
        })
        .each(function (d) {
          const self = d3.select(this);
          const labelWidth = this.getComputedTextLength();
          const start = scales.x(d.XG.offset);
          const end = scales.x(d.XG.offset + d.XG.finrel);
          const totalWidth = scales.x.range()[1];

          const spaceRight = totalWidth - (end + 8);
          const spaceLeft = start - 8;

          // Side based on start position initially
          let side = (start > totalWidth / 2) ? "left" : "right";

          // If it doesn't fit in preferred side, check if it fits better in the other
          if (side === "right" && labelWidth > spaceRight && spaceLeft > spaceRight) {
            side = "left";
          } else if (side === "left" && labelWidth > spaceLeft && spaceRight > spaceLeft) {
            side = "right";
          }

          if (side === "left") {
            self.attr("x", start - 8).attr("text-anchor", "end");
          } else {
            self.attr("x", end + 8).attr("text-anchor", "start");
          }
        });

      // Interacción bidireccional: Hover en Gantt -> Highlight en Stack
      rowsG
        .on("mouseenter", (ev, d) => {
          window.highlightFromGantt(d);
        })
        .on("mouseleave", () => {
          window.highlightFromGantt(null);
        })
        .on("click", (ev, d) => {
          window.selectPedido(d, true);
        });

      // Overlay para capturar mouse en el fondo del Gantt (para sincronización de cursor)
      let interactionRect = svg.select("rect.gantt-interaction");
      if (interactionRect.empty()) {
        interactionRect = svg.append("rect")
          .attr("class", "gantt-interaction")
          .attr("width", width)
          .attr("height", "100%")
          .style("fill", "none")
          .style("pointer-events", "all")
          .lower(); // Mandar al fondo para no bloquear clics en filas
      } else {
        interactionRect.attr("height", "100%");
      }

      // Draw vertical line for report time in Gantt panel
      g.selectAll(".report-time-line-gantt").remove();
      g.selectAll(".report-time-label-gantt").remove();

      const vg1 = document.getElementById("filter-viewgantt")?.value;
      const vg2 = document.getElementById("header-viewgantt")?.value;
      const currentGanttView = (vg2 || vg1 || "pedidos").trim();

      const isSameDay = window.selectedDate && window.diaReporte && window.selectedDate.replace(/-/g, "") === window.diaReporte;

      if (isSameDay && (currentGanttView === "despachos_reales" || currentGanttView === "despachos_mix") && window.horaReporte) {
        const reportMin = safeHhmmssToMin(window.horaReporte);
        if (reportMin !== null) {
          const configGran = window.CFG ? window.CFG.granularidadMin : 5;
          const xPos = scales.x(reportMin / configGran);
          const ganttHeight = totalHeight - 20;

          g.append("line")
            .attr("class", "report-time-line-gantt")
            .attr("x1", xPos)
            .attr("x2", xPos)
            .attr("y1", 0)
            .attr("y2", ganttHeight)
            .attr("stroke", "#d62728")
            .attr("stroke-width", 1.5)
            .attr("stroke-dasharray", "4,4")
            .style("pointer-events", "none");
        }
      }

      return { svg, g, interactionRect };
    }
  };
}

/* ===== Tooltip position helper ===== */
function positionTooltip(panel, margin, mx, my, innerW, innerH) {
  const isRight = mx > innerW * 0.5;
  if (isRight) {
    panel
      .style("bottom", "auto")
      .style("left", `${margin.left}px`)
      .style("top", `${margin.top}px`)
      .style("right", "auto");
  } else {
    panel
      .style("bottom", "auto")
      .style("left", `${innerW * 0.65}px`)
      .style("top", `${margin.top}px`)
      .style("right", "auto");
  }
}

/* ==== * Dibujo de Colas (descenso progresivo como cinta continua) * ====*/
function drawColasLoads(g, pedidos, scales, granularidadMin, yScale) {
  const x = scales.x;
  const y = yScale || scales.y;

  const layers = g.selectAll("g.pedido")
    .data(pedidos)
    .enter()
    .append("g")
    .attr("class", "pedido");

  layers.each(function (pedido) {
    const bloques = pedido.STK_COLAS?.bloquesXY || [];
    if (bloques.length === 0) return;

    // Agrupar por viaje para dibujar cintas continuas
    const grouped = d3.group(bloques, d => d.voyageId);

    d3.select(this)
      .selectAll("path.carga")
      .data(Array.from(grouped.values()))
      .enter()
      .append("path")
      .attr("class", "carga")
      .attr("d", pts => {
        pts.sort((a, b) => a.x - b.x);
        const path = d3.path();
        const pw = x(pts[0].x + 1) - x(pts[0].x);
        const pr = Math.min(5, pw * 0.2); // Radio de redondeo

        // --- BORDE SUPERIOR ---
        pts.forEach((p, i) => {
          const x0 = x(p.x);
          const y1 = y(p.y1);
          const x30 = x0 + 0.3 * pw;
          const x70 = x0 + 0.7 * pw;

          if (i === 0) {
            // Inicio: Vertical y redondeado
            path.moveTo(x0, y(p.y0));
            path.lineTo(x0, y1 + pr);
            path.arcTo(x0, y1, x0 + pr, y1, pr);
          } else {
            // Entrada a la meseta desde rampa anterior (redondeada)
            path.arcTo(x30, y1, x30 + pr, y1, pr);
          }

          // Meseta hasta el 70%
          path.lineTo(x70 - pr, y1);

          // Salida (Rampa o Punta Final)
          if (i < pts.length - 1) {
            const nextP = pts[i + 1];
            const xNext30 = x(nextP.x) + 0.3 * pw;
            const yNext = y(nextP.y1);
            path.arcTo(x70, y1, xNext30, yNext, pr);
          } else {
            // Punta final diagonal hasta la base (100% y0)
            const xEnd = x0 + pw;
            const yBot = y(p.y0);
            path.arcTo(x70, y1, xEnd, yBot, pr);
            path.lineTo(xEnd, yBot); // Asegurar que llegue al 100% de la base
          }
        });

        // --- BORDE INFERIOR (Retorno) ---
        for (let i = pts.length - 1; i >= 0; i--) {
          const p = pts[i];
          const x0 = x(p.x);
          const y0 = y(p.y0);
          const x30 = x0 + 0.3 * pw;
          const x70 = x0 + 0.7 * pw;

          if (i === pts.length - 1) {
            // El último recorre toda la base plana hasta x0
            path.lineTo(x0, y0);
          } else {
            // Rampa inferior regresando
            path.lineTo(x70, y0);
            path.lineTo(x30, y0);
          }
          
          if (i === 0) {
            // Cierre vertical final
            path.lineTo(x0, y0);
          }
        }

        path.closePath();
        return path.toString();
      })
      .attr("fill", getAreaColor(pedido))
      .attr("stroke", getColorSort(pedido))
      .attr("stroke-width", 1)
      .attr("opacity", 0.8);
  });

  return layers;
} 
