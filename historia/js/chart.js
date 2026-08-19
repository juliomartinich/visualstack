function drawMultiTruckChart(svgSelector, containerSelector, resultsBySuffix, activeSuffixes, formattedLabels, granularidadMin, colorTheme, globalYMax) {
  const container = d3.select(containerSelector);
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove(); // Limpiar gráfico anterior

  // Obtener dimensiones reales del SVG o contenedor
  const width = +svg.attr("width") || container.node()?.clientWidth || 1260;
  const height = +svg.attr("height") || container.node()?.clientHeight || 450;

  const margin = { top: 30, right: 30, bottom: 40, left: 45 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // 1. Configurar Rango de Tiempo (X)
  const slotMin = (8 * 60) / granularidadMin; // 08:00
  const slotMax = (20 * 60) / granularidadMin; // 20:00
  
  let maxSimSlot = slotMax;
  activeSuffixes.forEach(s => {
    const res = resultsBySuffix[s];
    if (res && res.stackResult && res.stackResult.horaMax) {
      maxSimSlot = Math.max(maxSimSlot, res.stackResult.horaMax);
    }
  });
  const xDomain = [slotMin, maxSimSlot];

  const xScale = d3.scaleLinear()
    .domain(xDomain)
    .range([0, innerW]);

  // 2. Configurar Rango de Camiones Activos (Y)
  const yScale = d3.scaleLinear()
    .domain([0, Math.max(5, Math.ceil(globalYMax / 5) * 5)])
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
    .attr("fill", "#333")
    .attr("font-family", "sans-serif")
    .attr("font-size", "10px")
    .attr("font-weight", "bold")
    .text("Camiones Activos");

  // 5. Dibujar cada una de las 4 curvas envolventes superpuestas
  const colors = colorTheme === 'blue'
    ? ["#0066cc", "#3b82f6", "#60a5fa", "#93c5fd"]
    : ["#2e7d32", "#4caf50", "#81c784", "#a5d6a7"];
  const strokeWidths = [2.5, 1.8, 1.5, 1.2];
  const dashArrays = [null, null, "4,4", "2,2"];

  // Relleno suave bajo la curva principal (Mismo día - index 0)
  const primarySuffix = activeSuffixes[0];
  const primaryRes = resultsBySuffix[primarySuffix];
  if (primaryRes && primaryRes.stackResult) {
    const envColas = primaryRes.stackResult.metrics.envolvente || [];
    const envData = envColas
      .map((v, t) => ({ x: t, y: v }))
      .filter(d => d.x >= xDomain[0] && d.x <= xDomain[1]);

    const areaGenerator = d3.area()
      .x(d => xScale(d.x))
      .y0(innerH)
      .y1(d => yScale(d.y))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(envData)
      .attr("fill", colorTheme === 'blue' ? "rgba(59, 130, 246, 0.12)" : "rgba(46, 125, 50, 0.12)")
      .attr("d", areaGenerator);
  }

  // Dibujar las 4 líneas de las envolventes en orden inverso (capas delgadas atrás, gruesa adelante)
  for (let index = activeSuffixes.length - 1; index >= 0; index--) {
    const suffix = activeSuffixes[index];
    const res = resultsBySuffix[suffix];
    if (!res || !res.stackResult) continue;

    const envColas = res.stackResult.metrics.envolvente || [];
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
      .attr("stroke", colors[index] || "#999")
      .attr("stroke-width", strokeWidths[index] || 1)
      .attr("stroke-dasharray", dashArrays[index] || null)
      .attr("d", envelopeLine);
  }
  // 5.5. Dibujar Leyenda dentro del Gráfico (Superior Derecha)
  const legendG = g.append("g")
    .attr("class", "chart-legend")
    .attr("transform", `translate(${innerW - 215}, 10)`);

  // Filtro de Sombra para el cuadro de leyenda
  const defs = svg.append("defs");
  const filter = defs.append("filter")
    .attr("id", "legend-shadow")
    .attr("x", "-15%")
    .attr("y", "-15%")
    .attr("width", "130%")
    .attr("height", "130%");

  filter.append("feDropShadow")
    .attr("dx", 1.5)
    .attr("dy", 1.5)
    .attr("stdDeviation", 2)
    .attr("flood-opacity", 0.15)
    .attr("flood-color", "#000000");

  legendG.append("rect")
    .attr("width", 200)
    .attr("height", 85)
    .attr("fill", "rgba(255, 255, 255, 0.90)")
    .attr("stroke", "#e2e8f0") // gris suave
    .attr("stroke-width", 1)
    .attr("rx", 4)
    .attr("filter", "url(#legend-shadow)");

  activeSuffixes.forEach((suffix, index) => {
    const yPos = 16 + index * 18;
    const label = formattedLabels[index] || "";

    // Muestra de línea
    legendG.append("line")
      .attr("x1", 12)
      .attr("x2", 37)
      .attr("y1", yPos)
      .attr("y2", yPos)
      .attr("stroke", colors[index] || "#999")
      .attr("stroke-width", strokeWidths[index] || 1)
      .attr("stroke-dasharray", dashArrays[index] || null);

    // Texto de leyenda
    const textNode = legendG.append("text")
      .attr("x", 44)
      .attr("y", yPos + 3.5)
      .attr("fill", label.includes("(No disp.)") ? "#ef4444" : "#334155")
      .attr("font-family", "sans-serif")
      .attr("font-size", "10px")
      .text(label);

    if (index === 0) {
      textNode.attr("font-weight", "bold");
    }
  });
  // 6. Capa de Interacción y Cursor Multicapa
  const interactionG = g.append("g").attr("class", "interaction-layer");

  const cursorLine = interactionG.append("line")
    .attr("y1", 0).attr("y2", innerH)
    .attr("stroke", "#999")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "3,3")
    .style("opacity", 0);

  // Crear círculos trazadores para cada curva
  const circles = [];
  activeSuffixes.forEach((suffix, index) => {
    const c = interactionG.append("circle")
      .attr("r", 4.5)
      .attr("fill", colors[index] || "#999")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .style("opacity", 0);
    circles.push(c);
  });

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
        cursorLine.attr("x1", xPos).attr("x2", xPos).style("opacity", 1);

        // Calcular hora
        const totalMinutes = t * granularidadMin;
        const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
        const mm = String(totalMinutes % 60).padStart(2, "0");

        let html = `<strong>Hora: ${hh}:${mm}</strong><br/>`;
        let valuesCount = 0;

        // Tracear cada una de las 4 curvas en el punto t
        activeSuffixes.forEach((suffix, index) => {
          const res = resultsBySuffix[suffix];
          const envColas = res && res.stackResult ? res.stackResult.metrics.envolvente || [] : [];
          const yVal = envColas[t] || 0;
          const yPos = yScale(yVal);

          if (res && res.stackResult) {
            circles[index]
              .attr("cx", xPos)
              .attr("cy", yPos)
              .style("opacity", yVal > 0 ? 1 : 0.2);

            const captureLabel = index === 0 ? "Mismo día" : `-${index} día/s`;
            const labelStyle = index === 0 ? `font-weight: bold; color: ${colors[index]};` : `color: #555;`;
            html += `<span style="${labelStyle}">${captureLabel}: <strong>${yVal} cam.</strong></span><br/>`;
            valuesCount++;
          } else {
            circles[index].style("opacity", 0);
          }
        });

        // Detalle de pedidos activos para la versión principal (index 0)
        if (primaryRes && primaryRes.dataToStack) {
          let detailsHtml = "";
          let activeCount = 0;

          primaryRes.dataToStack.forEach(d => {
            const segments = d.STK?.segmentosXY || d.STK_COLAS?.bloquesXY || d.STK_PLANTAS?.bloquesXY || [];
            const seg = segments.find(s => s.x === t);
            if (seg && seg.v > 0) {
              const client = d.Cliente || d.Obra || d.parentPedido?.Cliente || 'Pedido';
              const plant = d.Planta || d.parentPedido?.Planta || '';
              detailsHtml += `<div style="font-size:10px; margin-top:2px; color:#555;">
                • [${plant}] ${client.slice(0,22)}: <strong>${seg.v} cam.</strong>
              </div>`;
              activeCount++;
            }
          });

          if (activeCount > 0) {
            html += `<div style="border-top:1px solid #eee; margin-top:5px; padding-top:5px;">`;
            html += `<div style="font-size:9px; font-weight:bold; color:#777; margin-bottom:2px;">Detalle Mismo día:</div>`;
            html += `${detailsHtml}</div>`;
          }
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
      circles.forEach(c => c.style("opacity", 0));
      tooltip.style("display", "none");
    });
}
