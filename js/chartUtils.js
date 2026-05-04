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
}

/* ==== * Ejes * ===================== */
function drawAxes(g, scales, maxX, granularidad, innerH) {
  g.append("g").call(d3.axisLeft(scales.y));

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

/* ==== * Área stack * ===================== */
function createArea(scales) {
  return d3.area()
    .defined(d => d.v > 0)
    .x(d => scales.x(d.x))
    .y0(d => scales.y(d.y0))
    .y1(d => scales.y(d.y1));
}

/* ==== * Color por pedido * ===================== */
function colorPedido(pedido) {
  if (pedido.Confirmado !== "SI") {
    return COLORS.unconfirmed;
  }
  // Si tiene más de 1 camión en simultáneo, siempre es AZUL
  if (pedido.MaxCamiones > 1) {
    return COLORS.multi;
  }
  // Solo los de 1 camión pueden ser verdes
  if (pedido.CantPedidosObra === 1) {
    return COLORS.singleOrder;
  }
  return COLORS.mono;
}

/* ==== dibuja parte superior del area con los bordes verticales =====*/
function lineTopClosed(segmentos, scales) {
  const { x, y } = scales;
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
function drawLayers(g, pedidos, area, scales) {
  const { x, y } = scales;

  const layers = g.selectAll("g.pedido")
    .data(pedidos)
    .enter()
    .append("g")
    .attr("class", "pedido");

  layers.append("path")
    .attr("class", "area")
    .attr("d", d => area(d.STK.segmentosXY))
    .style("fill", d => {
      const col = colorPedido(d);
      if (d.Confirmado !== "SI") return AREACOLORS.unconfirmed;
      if (d.MaxCamiones === 1 && d.CantPedidosObra === 1) return AREACOLORS.singleOrder;
      return "none";
    })
    .style("stroke", "none");

  layers.append("path")
    .attr("class", "line-top")
    .attr("d", d => lineTopClosed(d.STK.segmentosXY, scales))
    .attr("fill", "none")
    .attr("stroke", d => colorPedido(d))
    .attr("stroke-width", CFG.lineStrokeWidth)
    .attr("stroke-opacity", CFG.lineOpacity);

  window.updateVisualStyles = () => {
    d3.selectAll(".pedido path.line-top")
      .attr("stroke-width", CFG.lineStrokeWidth)
      .attr("stroke-opacity", CFG.lineOpacity);
    d3.selectAll(".pedido path.descarga")
      .attr("fill-opacity", CFG.triangleOpacity);
  };

  layers.each(function (pedido) {
    const descs = pedido.STK.descargasXY;
    if (!Array.isArray(descs) || descs.length === 0) return;

    d3.select(this)
      .selectAll("path.descarga")
      .data(descs, d => d.key)
      .enter()
      .append("path")
      .attr("class", "descarga")
      .attr("d", d3.symbol().type(d3.symbolTriangle).size(15))
      .attr("transform", d => `
        translate(${x(d.x)}, ${y(d.y)})
        rotate(180)
      `)
      .attr("fill", colorPedido(pedido))
      .attr("fill-opacity", CFG.triangleOpacity)
      .style("pointer-events", "none");
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
        .attr("fill", d => colorPedido(d))
        .attr("opacity", 0.8);

      // Descargas
      rowsG.each(function (pedido) {
        d3.select(this)
          .selectAll("path.gantt-descarga")
          .data(pedido.STK.descargasXY ?? [], d => d.key)
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
        .attr("fill", "#444")
        .attr("font-size", 11)
        .text(d => `${d.id} - ${d.Obra} - ${d.CantProgramada} m3 - ${d.HoraInicio}`)
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
