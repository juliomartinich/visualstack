/* ==== * SVG base * ===================== */
function initSVG(svgSelector, groupSelector, width, height, margin) {
  const svg = d3.select(svgSelector);
  const g = d3.select(groupSelector);
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
  const store = Alpine?.store('filtros');
  const currentGanttView = store?.viewGantt || getCookie("viewGantt") || 'pedidos';

  const isSameDay = window.selectedDate && window.diaReporte && window.selectedDate.replace(/-/g, "") === window.diaReporte;

  if (isSameDay && (currentGanttView === "despachos_reales" || currentGanttView === "despachos_mix" || currentGanttView === "almuerzo") && window.horaReporte) {
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
  
  g.append("path")
    .attr("class", "capacity-line")
    .attr("d", `M0,${yPos} L${innerW},${yPos}`)
    .style("stroke", capacity === 0 ? "#ccc" : "red")
    .style("stroke-width", capacity === 0 ? "1px" : "2px")
    .style("stroke-dasharray", capacity === 0 ? "none" : "5,5")
    .style("fill", "none")
    .style("pointer-events", "none");

  if (capacity > 0) {
    g.append("text")
      .attr("class", "capacity-label")
      .attr("x", 5)
      .attr("y", yPos - 5)
      .attr("text-anchor", "start")
      .style("fill", "red")
      .style("font-size", "10px")
      .style("font-weight", "bold")
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

  return axisG;
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

function getSlotState(slotMin, startMin, ticketsTimes, granularidad) {
  let isReal = false;
  let isProjected = false;
  let maxTicketEnd = startMin;
  
  ticketsTimes.forEach(tk => {
    if (slotMin >= tk.startMin && slotMin < tk.endMin) {
      isReal = true;
    }
    if (slotMin >= tk.endMin && slotMin < tk.projectedEndMin) {
      isProjected = true;
    }
    if (tk.projectedEndMin > maxTicketEnd) {
      maxTicketEnd = tk.projectedEndMin;
    }
  });
  
  if (isReal) return "real";
  if (isProjected) return "projected";
  if (slotMin >= maxTicketEnd && slotMin < startMin + 480) {
    return "jornada";
  }
  return "normal";
}

function getPedidoObj(d) {
  if (Array.isArray(d) && d.key) {
    return window.fullPedidos.find(p => String(p.id) === String(d.key)) || {};
  }
  return d || {};
}

function getColorSort(pedidoRaw) {
  const pedido = getPedidoObj(pedidoRaw);
  if (pedido.isAlmuerzo) {
    return "rgba(255, 140, 0, 0.8)"; // Borde naranja fuerte
  }
  if (pedido.isDisponibles) {
    return "orange";
  }
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
  if (pedido.isAlmuerzo) {
    return "rgba(255, 140, 0, 0.6)"; // Naranja semi-transparente para la línea
  }
  if (pedido.isDisponibles) {
    return "orange";
  }
  if (pedido.isAnulado) {
    return "#e63946";
  }
  const ref = pedido.isDespacho ? pedido.parentPedido : pedido;
  if (!window.pedidoColorsMap) return getColorSort(ref);
  // ColorPedido suele ser el ID en el mapa
  const color = window.pedidoColorsMap.get(Number(ref.ColorPedido));
  return color || getColorSort(ref);
}

function getAreaColor(pedidoRaw) {
  const pedido = getPedidoObj(pedidoRaw);
  if (pedido.isAlmuerzo) {
    return "rgba(255, 140, 0, 0.4)"; // Naranja más transparente para el área
  }
  if (pedido.isDisponibles) {
    return "orange";
  }
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

  // Dibuja sub-áreas de sobretiempo y tickets para camiones disponibles
  layers.each(function(d) {
    if (d.isDisponibles && d.STK?.segmentosXY) {
      const gSelf = d3.select(this);
      
      const offset = d.XG?.offset ?? 0;
      const finrel = d.XG?.finrel ?? 0;
      const startMin = d.HoraAsignacionMin;
      
      const ticketsTimes = (d.allTickets || []).map(tk => {
        const ped = window.fullPedidos.find(o => String(o.id) === String(tk.Pedido) && o["Fecha Pedido"] === window.selectedDate) || {};
        return getTicketTimesAndProjection(tk, ped);
      });
      
      const segments = [];
      let currentSegment = null;
      
      for (let i = 0; i < finrel; i++) {
        const slot = offset + i;
        const slotMin = slot * CFG.granularidadMin;
        const state = getSlotState(slotMin, startMin, ticketsTimes, CFG.granularidadMin);
        
        if (!currentSegment || currentSegment.state !== state) {
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = {
            state,
            startSlot: slot,
            endSlot: slot + 1
          };
        } else {
          currentSegment.endSlot = slot + 1;
        }
      }
      if (currentSegment) {
        segments.push(currentSegment);
      }
      
      const colorMap = {
        real: "#c2410c",
        projected: "#7c2d12",
        jornada: "#fed7aa"
      };
      
      segments.forEach(seg => {
        if (seg.state === "normal") return;
        
        const subSegmentos = d.STK.segmentosXY.filter(s => s.x >= seg.startSlot && s.x < seg.endSlot);
        if (subSegmentos.length > 0) {
          gSelf.append("path")
            .attr("class", `disponibles-subarea-${seg.state}`)
            .attr("d", area(subSegmentos))
            .style("fill", colorMap[seg.state])
            .style("stroke", "none")
            .style("pointer-events", "none");
        }
      });
    }
  });

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
  const ganttDiv = d3.select(container);

  return {
    clear() {
      // no limpiamos todo el SVG, solo las filas de la capa
      d3.select("#gantt-data-layer").selectAll("*").remove();
      d3.select("#gantt-svg").selectAll(".report-time-line-gantt, .report-time-label-gantt, .gantt-interaction").remove();
    },
    show(pedidos, activo) {
      const totalHeight = pedidos.length * rowHeight + 20;

      let svg = d3.select("#gantt-svg");
      svg.attr("height", totalHeight); // Aún ajustamos la altura dinámicamente

      let g = d3.select("#gantt-data-layer");

      const rowsG = g.selectAll("g.gantt-row")
        .data(pedidos, d => d.id)
        .join("g")
        .attr("class", d => `gantt-row ${activo && d.id === activo.id ? "active" : ""}`)
        .attr("id", d => `gantt-row-${d.id}`)
        .attr("transform", (_, i) => `translate(0, ${i * rowHeight})`);

      // Barras
      rowsG.selectAll("rect.gantt-bar")
        .data(d => {
          const { offset, finrel } = d.XG ?? {};
          if (typeof offset !== "number" || typeof finrel !== "number" || finrel <= 0) return [];
          
          const rects = [];
          const baseColor = getColorSort(d);
          
          if (d.isDisponibles) {
            const startMin = d.HoraAsignacionMin;
            const ticketsTimes = (d.allTickets || []).map(tk => {
              const ped = window.fullPedidos.find(o => String(o.id) === String(tk.Pedido) && o["Fecha Pedido"] === window.selectedDate) || {};
              return getTicketTimesAndProjection(tk, ped);
            });
            
            const segments = [];
            let currentSegment = null;
            
            for (let i = 0; i < finrel; i++) {
              const slot = offset + i;
              const slotMin = slot * CFG.granularidadMin;
              const state = getSlotState(slotMin, startMin, ticketsTimes, CFG.granularidadMin);
              
              if (!currentSegment || currentSegment.state !== state) {
                if (currentSegment) {
                  segments.push(currentSegment);
                }
                currentSegment = {
                  state,
                  startSlot: slot,
                  endSlot: slot + 1
                };
              } else {
                currentSegment.endSlot = slot + 1;
              }
            }
            if (currentSegment) {
              segments.push(currentSegment);
            }
            
            const colorMap = {
              normal: "orange",
              real: "#c2410c",
              projected: "#7c2d12",
              jornada: "#fed7aa"
            };
            
            segments.forEach(seg => {
              rects.push({
                x: scales.x(seg.startSlot),
                width: Math.max(0, scales.x(seg.endSlot) - scales.x(seg.startSlot)),
                fill: colorMap[seg.state]
              });
            });
          } else {
            rects.push({
              x: scales.x(offset),
              width: Math.max(0, scales.x(offset + finrel) - scales.x(offset)),
              fill: baseColor
            });
          }
          return rects;
        })
        .join("rect")
        .attr("class", "gantt-bar")
        .attr("x", r => r.x)
        .attr("y", 1)
        .attr("width", r => r.width)
        .attr("height", rowHeight - 3)
        .attr("rx", 3)
        .attr("fill", r => r.fill)
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
          if (d.isDisponibles) {
            return `Camión #${d.Camion} - Disponible - Desde ${d.HoraInicio} hasta ${d.HoraFinalHhmm} (Ticket #${d.ticketId})`;
          }
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

      const currentGanttView = Alpine?.store('filtros')?.viewGantt || getCookie("viewGantt") || 'pedidos';

      const isSameDay = window.selectedDate && window.diaReporte && window.selectedDate.replace(/-/g, "") === window.diaReporte;

      if (isSameDay && (currentGanttView === "despachos_reales" || currentGanttView === "despachos_mix" || currentGanttView === "almuerzo") && window.horaReporte) {
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

function getDateStyles(dateStr, hStr, tStr) {
  const h = hStr || window.Alpine?.store('filtros')?.hoyStr;
  const t = tStr || window.Alpine?.store('filtros')?.tomorrowStr;
  if (dateStr === h) return { bg: "#ff8c00", text: "#fff", label: " (Hoy)" };
  if (dateStr === t) return { bg: "#28a745", text: "#fff", label: " (Mañana)" };
  if (dateStr > t && t) return { bg: "#add8e6", text: "#000", label: "" };
  return { bg: "#eee", text: "#555", label: "" };
}

function setupDashboardScales(currentGraphView, currentMetrics, totalBocas, globalMaxOcupacionCamiones, curOcupacionMax, curOcupacionMaxAsignaciones, curOcupacionMaxColas, stackResult, xMin, xMax) {
  let scales;
  let yMax;

  if (currentGraphView === 'recursos') {
    scales = createScales({ xMin, xMax, yMax: 1, innerW, innerH });
    
    scales.yCamiones = d3.scaleLinear()
      .domain([0, Math.max(CFG.yStep, Math.ceil(globalMaxOcupacionCamiones / CFG.yStep) * CFG.yStep)])
      .range([innerH, innerH * 0.55]);
      
    scales.yAsignaciones = d3.scaleLinear()
      .domain([0, Math.max(totalBocas + 2, Math.ceil(curOcupacionMaxAsignaciones / 2) * 2 + 2)])
      .range([innerH * 0.55, innerH * 0.35]);

    scales.yColas = d3.scaleLinear()
      .domain([0, Math.max(totalBocas + 2, Math.ceil(curOcupacionMaxColas / 2) * 2 + 2)])
      .range([innerH * 0.35, innerH * 0.12]);
      
    const maxDelayMin = Math.max(
      (d3.max(currentMetrics.delay2ByTime) || 0) * CFG.granularidadMin,
      d3.max(currentMetrics.waitCargaByTime || []) || 0,
      10
    );
    scales.yDelay = d3.scaleLinear()
      .domain([0, maxDelayMin])
      .range([innerH * 0.12 - 5, innerH * 0.02]);

    yMax = 0;
  } else if (currentGraphView === "plantas" && stackResult.isSplit) {
    scales = createScales({ xMin, xMax, yMax: 1, innerW, innerH });
    scales.yPlants = {};

    const N = stackResult.plants.length;
    const gap = 15;
    const availableHeightForPlots = innerH - (N - 1) * gap;
    const plotH = availableHeightForPlots / N;

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
    
    yMax = 0;
  } else if (currentGraphView === "colas" && stackResult.isSplit) {
    scales = createScales({ xMin, xMax, yMax: 1, innerW, innerH });
    scales.yColasPlants = {};
    scales.yDelayPlants = {};

    const N = stackResult.plants.length;
    const gap = 20;
    const availableHeightForPlots = innerH - (N - 1) * gap;
    const plotH = availableHeightForPlots / N;

    let maxColasVal = 0;
    stackResult.plants.forEach(pCode => {
      const cap = window.plantasData[pCode]?.cant_bocas || 1;
      const occ = stackResult.plantStacks[pCode].ocupacionMax || 0;
      const val = Math.max(cap + 2, Math.ceil(occ / 2) * 2 + 2);
      if (val > maxColasVal) maxColasVal = val;
    });
    if (maxColasVal < 10) maxColasVal = 10;

    let maxDelayVal = 0;
    stackResult.plants.forEach(pCode => {
      const delay2ByTime = stackResult.plantStacks[pCode].metrics.delay2ByTime || [];
      const waitCargaByTime = stackResult.plantStacks[pCode].metrics.waitCargaByTime || [];
      const maxDelayMin = Math.max(
        (d3.max(delay2ByTime) || 0) * CFG.granularidadMin,
        d3.max(waitCargaByTime) || 0,
        10
      );
      if (maxDelayMin > maxDelayVal) maxDelayVal = maxDelayMin;
    });

    stackResult.plants.forEach((pCode, i) => {
      const yTop = i * (plotH + gap);
      const yBottom = yTop + plotH;

      scales.yColasPlants[pCode] = d3.scaleLinear()
        .domain([0, maxColasVal])
        .range([yBottom, yTop]);

      scales.yDelayPlants[pCode] = d3.scaleLinear()
        .domain([0, maxDelayVal])
        .range([yTop + plotH * 0.75, yTop + plotH * 0.05]);
    });

    yMax = 0;
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
    if (yMax < CFG.yStep) yMax = CFG.yStep;
    scales = createScales({ xMin, xMax, yMax, innerW, innerH });
  }

  return { scales, yMax };
}

function drawGraphLayers(currentGraphView, currentGanttView, subsetPedidos, scales, currentMetrics, stackResult, yMax, innerW, innerH) {
  let layers;
  const g = d3.select("#chart-data-layer");

  if (currentGraphView === 'plantas') {
    if (stackResult.isSplit) {
      stackResult.plants.forEach(pCode => {
        const plantPedidos = subsetPedidos.filter(p => p.Planta === pCode);
        const gPlant = g.append("g").attr("class", `zona-planta-${pCode}`);
        drawPlantLoads(gPlant, plantPedidos, scales, CFG.granularidadMin, scales.yPlants[pCode]);
        
        const capacity = window.plantasData[pCode]?.cant_bocas || 0;
        drawCapacityLine(gPlant, 0, scales, innerW, scales.yPlants[pCode]);
        drawCapacityLine(gPlant, capacity, scales, innerW, scales.yPlants[pCode]);
        drawLeftAxis(gPlant, scales.yPlants[pCode], pCode);
      });
      layers = g.selectAll(".pedido");
    } else {
      layers = drawPlantLoads(g, subsetPedidos, scales, CFG.granularidadMin);
      
      const uniquePlantas = new Set(subsetPedidos.map(p => p.Planta));
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
        const plantPedidos = subsetPedidos.filter(p => p.Planta === pCode);
        const gPlant = g.append("g").attr("class", `zona-planta-colas-${pCode}`);
        const yScale = scales.yColasPlants[pCode];
        const yDelayScale = scales.yDelayPlants[pCode];

        if (currentGanttView === 'despachos_reales') {
          drawPlantLoads(gPlant, plantPedidos, scales, CFG.granularidadMin, yScale);
        } else {
          drawColasLoads(gPlant, plantPedidos, scales, CFG.granularidadMin, yScale);
        }
        
        const capacity = window.plantasData[pCode]?.cant_bocas || 0;
        drawCapacityLine(gPlant, 0, scales, innerW, yScale);
        drawCapacityLine(gPlant, capacity, scales, innerW, yScale);

        drawLeftAxis(gPlant, yScale, pCode);

        const plantMetrics = stackResult.plantStacks[pCode].metrics;
        const isColasAndReal = currentGraphView === 'colas' && currentGanttView === 'despachos_reales';
        const isColasAndMix = currentGraphView === 'colas' && (currentGanttView === 'despachos_mix' || currentGanttView === 'almuerzo');
        if (plantMetrics.delay2ByTime && !isColasAndReal) {
          drawDelayCurve(gPlant, plantMetrics.delay2ByTime, scales, CFG.granularidadMin, yDelayScale);
          const rightAxisG = drawRightAxis(gPlant, yDelayScale, innerW, "Delay Max [min]", "red");
          if (isColasAndMix) {
            rightAxisG.append("text")
              .attr("x", -10)
              .attr("y", yDelayScale.range()[1] + 27)
              .attr("fill", "blue")
              .attr("text-anchor", "end")
              .attr("font-size", "10px")
              .attr("font-weight", "bold")
              .text("Espera Carga [min]");
          }
        }
        if (plantMetrics.waitCargaByTime && d3.max(plantMetrics.waitCargaByTime) > 0) {
          drawDelayCurve(gPlant, plantMetrics.waitCargaByTime, scales, CFG.granularidadMin, yDelayScale, "blue", "wait-carga-curve", true);
          if (isColasAndReal) {
            drawRightAxis(gPlant, yDelayScale, innerW, "Espera Carga [min]", "blue");
          } else if (!isColasAndMix) {
            drawLeftAxis(gPlant, yDelayScale, "Espera Carga [min]", null, "blue", -30);
          }
        }
      });
      layers = g.selectAll(".pedido");
    } else {
      if (currentGanttView === 'despachos_reales') {
        layers = drawPlantLoads(g, subsetPedidos, scales, CFG.granularidadMin);
      } else {
        layers = drawColasLoads(g, subsetPedidos, scales, CFG.granularidadMin);
      }
      
      const uniquePlantas = new Set(subsetPedidos.map(p => p.Planta));
      let capacity = 0;
      uniquePlantas.forEach(pCode => {
        if (window.plantasData && window.plantasData[pCode]) {
          capacity += window.plantasData[pCode].cant_bocas || 0;
        }
      });
      drawCapacityLine(g, capacity, scales, innerW);

      if (currentMetrics.delay2ByTime) {
        const maxDelayMin = Math.max(
          (d3.max(currentMetrics.delay2ByTime) || 0) * CFG.granularidadMin,
          d3.max(currentMetrics.waitCargaByTime || []) || 0,
          10
        );
        scales.yDelay = d3.scaleLinear()
          .domain([0, maxDelayMin])
          .range([innerH * 0.75, innerH * 0.05]); 
        
        const isColasAndReal = currentGraphView === 'colas' && currentGanttView === 'despachos_reales';
        const isColasAndMix = currentGraphView === 'colas' && (currentGanttView === 'despachos_mix' || currentGanttView === 'almuerzo');
        if (!isColasAndReal) {
          drawDelayCurve(g, currentMetrics.delay2ByTime, scales, CFG.granularidadMin);
          const rightAxisG = drawRightAxis(g, scales.yDelay, innerW, "Delay Max [min]", "red");
          if (isColasAndMix) {
            rightAxisG.append("text")
              .attr("x", -10)
              .attr("y", scales.yDelay.range()[1] + 27)
              .attr("fill", "blue")
              .attr("text-anchor", "end")
              .attr("font-size", "10px")
              .attr("font-weight", "bold")
              .text("Espera Carga [min]");
          }
        }

        if (currentMetrics.waitCargaByTime && d3.max(currentMetrics.waitCargaByTime) > 0) {
          drawDelayCurve(g, currentMetrics.waitCargaByTime, scales, CFG.granularidadMin, null, "blue", "wait-carga-curve", true);
          if (isColasAndReal) {
            drawRightAxis(g, scales.yDelay, innerW, "Espera Carga [min]", "blue");
          } else if (!isColasAndMix) {
            drawLeftAxis(g, scales.yDelay, "Espera Carga [min]", null, "blue", -30);
          }
        }
      }
    }
  } else if (currentGraphView === 'recursos') {
    const gCamiones = g.append("g").attr("class", "zona-camiones");
    const areaCamiones = createArea(scales, scales.yCamiones);
    drawLayers(gCamiones, subsetPedidos, areaCamiones, scales, scales.yCamiones);
    drawLeftAxis(gCamiones, scales.yCamiones, "Camiones");
    
    if (currentGanttView === 'despachos_mix' || currentGanttView === 'almuerzo') {
      drawOrangeCurve(gCamiones, subsetPedidos, scales, scales.yCamiones);
    }

    const uniquePlantas = new Set(subsetPedidos.map(p => p.Planta));
    let capacity = 0;
    uniquePlantas.forEach(pCode => {
      if (window.plantasData && window.plantasData[pCode]) {
        capacity += window.plantasData[pCode].cant_bocas || 0;
      }
    });

    const gAsignaciones = g.append("g").attr("class", "zona-asignaciones");
    drawPlantLoads(gAsignaciones, subsetPedidos, scales, CFG.granularidadMin, scales.yAsignaciones);
    drawCapacityLine(gAsignaciones, 0, scales, innerW, scales.yAsignaciones);
    drawCapacityLine(gAsignaciones, capacity, scales, innerW, scales.yAsignaciones);
    drawLeftAxis(gAsignaciones, scales.yAsignaciones, "Asignaciones");

    const gColas = g.append("g").attr("class", "zona-colas");
    if (currentGanttView === 'despachos_reales') {
      drawPlantLoads(gColas, subsetPedidos, scales, CFG.granularidadMin, scales.yColas);
    } else {
      drawColasLoads(gColas, subsetPedidos, scales, CFG.granularidadMin, scales.yColas);
    }
    drawCapacityLine(gColas, 0, scales, innerW, scales.yColas);
    drawCapacityLine(gColas, capacity, scales, innerW, scales.yColas);

    const gDelay = g.append("g").attr("class", "zona-delay");
    drawDelayCurve(gDelay, currentMetrics.delay2ByTime, scales, CFG.granularidadMin);
    const rightAxisG = drawRightAxis(gDelay, scales.yDelay, innerW, "Delay Max [min]", "red");
    if ((currentGanttView === 'despachos_reales' || currentGanttView === 'despachos_mix') && currentMetrics.waitCargaByTime && d3.max(currentMetrics.waitCargaByTime) > 0) {
      drawDelayCurve(gDelay, currentMetrics.waitCargaByTime, scales, CFG.granularidadMin, null, "blue", "wait-carga-curve", true);
      rightAxisG.append("text")
        .attr("x", -10)
        .attr("y", scales.yDelay.range()[1] + 27)
        .attr("fill", "blue")
        .attr("text-anchor", "end")
        .attr("font-size", "10px")
        .attr("font-weight", "bold")
        .text("Espera Carga [min]");
    }

    drawLeftAxis(gColas, scales.yColas, "Cargas", [scales.yColas.range()[0], scales.yDelay.range()[1]]);

    layers = g.selectAll(".pedido"); 
  } else {
    if (currentGanttView === 'slots') {
      layers = g.selectAll(".pedido"); // No dibujamos los polígonos
      
      const orangeData = getAvailableTrucksCurveData(subsetPedidos);
      window.currentOrangeData = orangeData; // Expose for interaction tooltip
      if (orangeData && orangeData.length > 0) {
        const blueData = orangeData.map(d => ({
          slot: d.slot,
          value: (currentMetrics.envolvente && currentMetrics.envolvente[d.slot]) ? currentMetrics.envolvente[d.slot] : 0
        }));
        
        const diffData = orangeData.map(d => {
          const rawValue = d.value - ((currentMetrics.envolvente && currentMetrics.envolvente[d.slot]) ? currentMetrics.envolvente[d.slot] : 0);
          return {
            slot: d.slot,
            value: Math.abs(rawValue),
            isNegative: rawValue < 0
          };
        });
        
        const lineGen = d3.line()
          .x(d => scales.x(d.slot))
          .y(d => scales.y(d.value))
          .curve(d3.curveMonotoneX);
          
        // Línea Naranja (Disponibles)
        g.append("path")
          .datum(orangeData)
          .attr("class", "slots-orange-curve")
          .attr("d", lineGen)
          .attr("fill", "none")
          .attr("stroke", "orange")
          .attr("stroke-width", 3.5)
          .style("pointer-events", "none");
          
        // Línea Azul (Demanda + Almuerzos)
        g.append("path")
          .datum(blueData)
          .attr("class", "slots-blue-curve")
          .attr("d", lineGen)
          .attr("fill", "none")
          .attr("stroke", "blue")
          .attr("stroke-width", 2.5)
          .style("pointer-events", "none");
          
        // Línea Verde/Roja (Diferencia Absoluta segmentada)
        const segments = [];
        let currentSeg = [];
        let currentIsNegative = diffData.length > 0 ? diffData[0].isNegative : false;

        diffData.forEach(d => {
          if (d.isNegative !== currentIsNegative) {
            currentSeg.push(d); // Agregar punto actual al tramo anterior para conectarlos visualmente sin cortes
            segments.push({ isNegative: currentIsNegative, data: currentSeg });
            currentSeg = [d];
            currentIsNegative = d.isNegative;
          } else {
            currentSeg.push(d);
          }
        });
        if (currentSeg.length > 0) {
          segments.push({ isNegative: currentIsNegative, data: currentSeg });
        }

        // Definir patrón de achurado rojo para el área
        let defs = g.select("defs");
        if (defs.empty()) {
          defs = g.append("defs");
        }
        if (defs.select("#red-hatch").empty()) {
          const pattern = defs.append("pattern")
            .attr("id", "red-hatch")
            .attr("patternUnits", "userSpaceOnUse")
            .attr("width", 8)
            .attr("height", 8);
            
          pattern.append("rect")
            .attr("width", 8)
            .attr("height", 8)
            .attr("fill", "rgba(255, 0, 0, 0.15)"); // Fondo rojo claro
            
          pattern.append("path")
            .attr("d", "M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4") // Líneas diagonales
            .attr("stroke", "rgba(255, 0, 0, 0.4)")
            .attr("stroke-width", 1);
        }

        const areaGen = d3.area()
          .x(d => scales.x(d.slot))
          .y0(scales.y(0)) // La base es 0
          .y1(d => scales.y(d.value))
          .curve(d3.curveMonotoneX);

        segments.forEach((seg, i) => {
          // Dibujar sombreado achurado si es negativo
          if (seg.isNegative) {
            g.append("path")
              .datum(seg.data)
              .attr("class", `slots-diff-area-${i}`)
              .attr("d", areaGen)
              .attr("fill", "url(#red-hatch)")
              .style("pointer-events", "none");
          }

          // Dibujar la línea encima
          g.append("path")
            .datum(seg.data)
            .attr("class", `slots-diff-curve-${i}`)
            .attr("d", lineGen)
            .attr("fill", "none")
            .attr("stroke", seg.isNegative ? "red" : "green")
            .attr("stroke-width", 4.5)
            .style("pointer-events", "none");
        });

        // Leyenda
        const legendG = g.append("g")
          .attr("class", "slots-legend")
          .attr("transform", "translate(20, 20)"); 
          
        legendG.append("rect")
          .attr("fill", "rgba(255, 255, 255, 0.95)")
          .attr("stroke", "#ccc")
          .attr("stroke-width", 1)
          .attr("rx", 6)
          .attr("x", 0)
          .attr("y", 0)
          .attr("width", 190)
          .attr("height", 90);
          
        const legendItems = [
          { color: "orange", label: "Camiones", isLine: true },
          { color: "blue", label: "Pedidos incluye Almuerzos", isLine: true },
          { color: "green", label: "Disponibilidad", isLine: true },
          { color: "url(#red-hatch)", stroke: "red", label: "Sobreprogramación", isLine: false }
        ];
        
        let yOffset = 18;
        legendItems.forEach(item => {
          if (!item.isLine) {
            legendG.append("rect")
              .attr("x", 10)
              .attr("y", yOffset - 7)
              .attr("width", 16)
              .attr("height", 8)
              .attr("fill", item.color)
              .attr("stroke", item.stroke)
              .attr("stroke-width", 2);
          } else {
            legendG.append("line")
              .attr("x1", 10)
              .attr("x2", 26)
              .attr("y1", yOffset - 3)
              .attr("y2", yOffset - 3)
              .attr("stroke", item.color)
              .attr("stroke-width", 3.5);
          }
          
          legendG.append("text")
            .attr("x", 34)
            .attr("y", yOffset)
            .attr("font-size", "11px")
            .attr("fill", "#333")
            .text(item.label);
            
          yOffset += 20;
        });
      }
    } else {
      window.currentOrangeData = null;
      const area = createArea(scales);
      layers = drawLayers(g, subsetPedidos, area, scales);
      
      if (currentGanttView === 'despachos_mix' || currentGanttView === 'almuerzo') {
        drawOrangeCurve(g, subsetPedidos, scales, scales.y);
      }
    }
  }

  return layers;
}

function drawTopOverlay(svg, g, meta, scales, metrics, width, filterKey = "") {
  const TRI_Y = 2;   // Pegado al borde superior (adentro)
  const TEXT_Y = 11; // Alineación vertical para el texto
  const HORA_X = 8;  // Offset a la derecha
  const VAL_X = -8;  // Offset a la izquierda

  // Se ha movido la inyección de los textos (Fecha y Volúmenes) hacia Alpine.js en index.html

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

function getAvailableTrucksCurveData(subsetPedidos) {
  const selectedDate = window.selectedDate;
  if (!selectedDate) return [];
  
  // Obtener las plantas permitidas en base a los pedidos de la vista
  const permitidas = Array.from(new Set(subsetPedidos.map(p => p.Planta)));
  
  const datePedidos = (window.fullPedidos || []).filter(p => p["Fecha Pedido"] === selectedDate);
  const datePedidoIds = new Set(datePedidos.map(p => p.id));
  
  const dateTickets = Object.entries(window.ticketsData || {})
    .map(([tId, t]) => ({ ...t, ticketId: tId }))
    .filter(t => datePedidoIds.has(String(t.Pedido)));
  
  // Filtrar los tickets activos basándonos en la planta del pedido correspondiente
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
    const times = getTicketTimesAndProjection(t, ped);
    
    if (!trucksMap[camion]) {
      trucksMap[camion] = {
        impresoMin: times.startMin,
        tickets: []
      };
    } else if (times.startMin < trucksMap[camion].impresoMin) {
      trucksMap[camion].impresoMin = times.startMin;
    }
    
    trucksMap[camion].tickets.push(times);
  });
  
  // Calcular la curva basándose EXACTAMENTE en los mismos slots que la envolvente de Disponibles
  const xMin = CFG.horaInicio * (60 / CFG.granularidadMin);
  const xMax = CFG.horaFin * (60 / CFG.granularidadMin);
  const curveData = [];
  
  const shifts = Object.entries(trucksMap).map(([camion, info]) => {
    const startMin = info.impresoMin;
    
    let maxTicketEndMin = startMin;
    let maxProjectedEndMin = startMin;
    info.tickets.forEach(tk => {
      if (tk.endMin > maxTicketEndMin) {
        maxTicketEndMin = tk.endMin;
      }
      if (tk.projectedEndMin > maxProjectedEndMin) {
        maxProjectedEndMin = tk.projectedEndMin;
      }
    });
    
    const overallEndMin = Math.max(maxTicketEndMin, maxProjectedEndMin, startMin + 480);
    
    const offset = Math.floor(startMin / CFG.granularidadMin);
    const finrel = Math.ceil((overallEndMin - startMin) / CFG.granularidadMin);
    return { startSlot: offset, endSlot: offset + finrel };
  });

  for (let s = xMin; s <= xMax; s++) {
    let activeCount = 0;
    shifts.forEach(shift => {
      if (s >= shift.startSlot && s < shift.endSlot) {
        activeCount++;
      }
    });
    curveData.push({ slot: s, value: activeCount });
  }
  return curveData;
}

function drawOrangeCurve(gElement, subsetPedidos, scales, yScale) {
  const y = yScale || scales.y;
  const curveData = getAvailableTrucksCurveData(subsetPedidos);
  if (!curveData || curveData.length === 0) return;

  
  // Dibujar la curva naranja gruesa
  const lineGen = d3.line()
    .x(d => scales.x(d.slot))
    .y(d => y(d.value))
    .curve(d3.curveMonotoneX);
    
  gElement.selectAll(".orange-trucks-curve").remove(); // Limpiar previas
  
  gElement.append("path")
    .datum(curveData)
    .attr("class", "orange-trucks-curve")
    .attr("d", lineGen)
    .attr("fill", "none")
    .attr("stroke", "orange")
    .attr("stroke-width", 3.5)
    .style("pointer-events", "none");
}
