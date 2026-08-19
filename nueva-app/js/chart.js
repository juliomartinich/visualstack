function drawTruckChart(svgSelector, containerSelector, stackResult, dataToStack, granularidadMin, colorTheme) {
  const container = d3.select(containerSelector);
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove(); // Limpiar gráfico anterior

  // Obtener dimensiones reales del SVG o contenedor
  const width = +svg.attr("width") || container.node()?.clientWidth || 1260;
  const height = +svg.attr("height") || container.node()?.clientHeight || 490;

  const margin = { top: 30, right: 30, bottom: 40, left: 45 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // 1. Configurar Rango de Tiempo (X)
  const slotMin = (8 * 60) / granularidadMin; // 08:00
  const slotMax = (20 * 60) / granularidadMin; // 20:00
  const maxSimSlot = stackResult.horaMax || slotMax;
  const xDomain = [slotMin, Math.max(slotMax, maxSimSlot)];

  const xScale = d3.scaleLinear()
    .domain(xDomain)
    .range([0, innerW]);

  // 2. Configurar Rango de Camiones Activos (Y)
  const maxActiveTrucks = stackResult.ocupacionMax || 1;
  const yScale = d3.scaleLinear()
    .domain([0, Math.max(5, Math.ceil(maxActiveTrucks / 5) * 5)])
    .range([innerH, 0]);

  // 3. Dibujar Grillas de Fondo
  g.append("g")
    .attr("class", "grid grid-y")
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-innerW).tickFormat(""))
    .selectAll("line")
    .style("stroke", "#eee")
    .style("stroke-dasharray", "4,4");

  const hourlyValues = d3.range(xDomain[0], xDomain[1] + 1, 60 / granularidadMin);
  g.append("g")
    .attr("class", "grid grid-x")
    .attr("transform", `translate(0, ${innerH})`)
    .call(d3.axisBottom(xScale).tickValues(hourlyValues).tickSize(-innerH).tickFormat(""))
    .selectAll("line")
    .style("stroke", "#eee")
    .style("stroke-dasharray", "4,4");

  // 4. Dibujar Ejes
  g.append("g")
    .attr("transform", `translate(0, ${innerH})`)
    .call(d3.axisBottom(xScale).tickValues(hourlyValues).tickFormat(d => {
      const hh = Math.floor((d * granularidadMin) / 60);
      return String(hh).padStart(2, "0") + ":00";
    }))
    .selectAll("text")
    .style("fill", "#555")
    .style("font-size", "11px");

  g.append("g")
    .call(d3.axisLeft(yScale).ticks(5))
    .selectAll("text")
    .style("fill", "#555")
    .style("font-size", "11px");

  // Título del Eje Y
  g.append("text")
    .attr("x", 10)
    .attr("y", -10)
    .attr("fill", "#555")
    .attr("font-size", "10px")
    .attr("font-weight", "bold")
    .text("Camiones Activos");

  // 5. Generador de Áreas del Stack
  const areaGenerator = d3.area()
    .x(d => xScale(d.x))
    .y0(d => yScale(d.y0))
    .y1(d => yScale(d.y1))
    .curve(d3.curveMonotoneX);

  // Paleta de colores para las capas apiladas
  const bluePalette = ["#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#1d4ed8", "#3b82f6"];
  const greenPalette = ["#065f46", "#059669", "#10b981", "#34d399", "#6ee7b7", "#047857", "#10b981"];
  const palette = colorTheme === 'blue' ? bluePalette : greenPalette;

  // Dibujar cada capa (Pedido o Despacho individual)
  const layers = g.selectAll("g.pedido")
    .data(dataToStack)
    .enter()
    .append("g")
    .attr("class", "pedido");

  layers.append("path")
    .attr("class", "area")
    .attr("d", d => {
      const segments = d.STK?.segmentosXY || d.STK_COLAS?.bloquesXY || d.STK_PLANTAS?.bloquesXY || [];
      return areaGenerator(segments);
    })
    .style("fill", (d, i) => palette[i % palette.length])
    .style("opacity", 0.75)
    .style("stroke", "#ffffff")
    .style("stroke-width", 0.5);

  // 6. Dibujar Curva Envolvente (Línea Amarilla de Máximo)
  const envColas = stackResult.metrics.envolvente || [];
  const envData = envColas
    .map((v, t) => ({ x: t, y: v }))
    .filter(d => d.x >= xDomain[0] && d.x <= xDomain[1]);

  const envelopeLine = d3.line()
    .x(d => xScale(d.x))
    .y(d => yScale(d.y))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(envData)
    .attr("fill", "none")
    .attr("stroke", "#f59e0b")
    .attr("stroke-width", 2)
    .attr("d", envelopeLine);

  // 7. Capa de Interacción y Cursor
  const interactionG = g.append("g").attr("class", "interaction-layer");

  const cursorLine = interactionG.append("line")
    .attr("y1", 0).attr("y2", innerH)
    .attr("stroke", "#999")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "3,3")
    .style("opacity", 0);

  const cursorCircle = interactionG.append("circle")
    .attr("r", 5)
    .attr("fill", "#f59e0b")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .style("opacity", 0);

  // Selección de Tooltip
  const tooltip = d3.select("#chart-tooltip");

  g.append("rect")
    .attr("width", innerW)
    .attr("height", innerH)
    .style("fill", "none")
    .style("pointer-events", "all")
    .on("mousemove", function(ev) {
      const [mx, my] = d3.pointer(ev);
      const t = Math.round(xScale.invert(mx));

      if (t >= xDomain[0] && t <= xDomain[1]) {
        const xPos = xScale(t);
        const yVal = envColas[t] || 0;
        const yPos = yScale(yVal);

        // Actualizar línea y círculo del cursor
        cursorLine.attr("x1", xPos).attr("x2", xPos).style("opacity", 1);
        cursorCircle.attr("cx", xPos).attr("cy", yPos).style("opacity", yVal > 0 ? 1 : 0);

        // Calcular hora
        const totalMinutes = t * granularidadMin;
        const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
        const mm = String(totalMinutes % 60).padStart(2, "0");

        // Construir contenido del tooltip
        let html = `<strong>Hora: ${hh}:${mm}</strong><br/>`;
        html += `<span>Total Camiones: <strong>${yVal}</strong></span><br/>`;
        
        // Agregar desglose por pedidos/despachos activos
        let detailsHtml = "";
        let activeCount = 0;

        dataToStack.forEach(d => {
          const segments = d.STK?.segmentosXY || d.STK_COLAS?.bloquesXY || d.STK_PLANTAS?.bloquesXY || [];
          const seg = segments.find(s => s.x === t);
          if (seg && seg.v > 0) {
            const client = d.Cliente || d.Obra || d.parentPedido?.Cliente || 'Pedido';
            const plant = d.Planta || d.parentPedido?.Planta || '';
            detailsHtml += `<div style="font-size:11px; margin-top:2px; color:#555;">
              • [${plant}] ${client.slice(0,20)}: <strong>${seg.v} cam.</strong>
            </div>`;
            activeCount++;
          }
        });

        if (activeCount > 0) {
          html += `<div style="border-top:1px solid #eee; margin-top:5px; padding-top:5px;">${detailsHtml}</div>`;
        }

        // Posicionar tooltip
        const containerBounds = container.node().getBoundingClientRect();
        const tooltipX = ev.clientX - containerBounds.left + 15;
        const tooltipY = ev.clientY - containerBounds.top + 15;

        tooltip
          .style("left", `${tooltipX}px`)
          .style("top", `${tooltipY}px`)
          .html(html)
          .style("display", "block");
      }
    })
    .on("mouseleave", () => {
      cursorLine.style("opacity", 0);
      cursorCircle.style("opacity", 0);
      tooltip.style("display", "none");
    });
}
