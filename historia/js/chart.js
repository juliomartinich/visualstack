function drawMultiTruckChart(svgSelector, containerSelector, resultsBySuffix, activeSuffixes, formattedLabels, granularidadMin, colorTheme, globalYMax) {
  const container = d3.select(containerSelector);
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove(); // Limpiar gráfico anterior

  // Obtener dimensiones reales del SVG o contenedor
  const width = +svg.attr("width") || container.node()?.clientWidth || 1260;
  const height = +svg.attr("height") || container.node()?.clientHeight || 490;

  const margin = { top: 25, right: 20, bottom: 40, left: 50 };
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
  let yDomain = [0, Math.max(5, Math.ceil(globalYMax / 5) * 5)];
  if (colorTheme === 'anulaciones') {
    const downwardKeys = ['anulados', 'menor'];
    let maxDownward = 0;
    downwardKeys.forEach(k => {
      const res = resultsBySuffix[k];
      if (res && res.stackResult && res.stackResult.metrics.envolvente) {
        const localMax = d3.max(res.stackResult.metrics.envolvente) || 0;
        if (localMax > maxDownward) maxDownward = localMax;
      }
    });
    const ceilMaxPositive = Math.max(5, Math.ceil(globalYMax / 5) * 5);
    const ceilMaxNegative = Math.ceil(maxDownward / 5) * 5;
    yDomain = [-ceilMaxNegative, ceilMaxPositive];
  }

  const yScale = d3.scaleLinear()
    .domain(yDomain)
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

  // Línea base en y = 0
  if (colorTheme === 'anulaciones') {
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", yScale(0))
      .attr("y2", yScale(0))
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,2");
  }

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



  // 5. Dibujar cada una de las curvas envolventes superpuestas
  const colors = colorTheme === 'anulaciones'
    ? ["#0066cc", "#777777", "#9c27b0", "#2e7d32", "#009688", "#d32f2f", "#ef6c00"]
    : (colorTheme === 'blue'
      ? ["#0066cc", "#3b82f6", "#60a5fa", "#93c5fd"]
      : ["#2e7d32", "#4caf50", "#81c784", "#a5d6a7"]);
  const strokeWidths = colorTheme === 'anulaciones'
    ? [2.5, 1.8, 1.2, 1.8, 1.5, 1.8, 1.5]
    : [2.5, 1.8, 1.5, 1.2];
  const dashArrays = colorTheme === 'anulaciones'
    ? [null, null, "2,2", null, "4,4", null, "4,4"]
    : [null, null, "4,4", "2,2"];

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
      .y0(yScale(0))
      .y1(d => yScale(d.y))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(envData)
      .attr("fill", colorTheme === 'blue' ? "rgba(59, 130, 246, 0.12)" : (colorTheme === 'green' ? "rgba(46, 125, 50, 0.12)" : "rgba(0, 102, 204, 0.08)"))
      .attr("d", areaGenerator);
  }

  // Dibujar las líneas de las envolventes en orden inverso (capas delgadas atrás, gruesa adelante)
  for (let index = activeSuffixes.length - 1; index >= 0; index--) {
    const suffix = activeSuffixes[index];
    const res = resultsBySuffix[suffix];
    if (!res || !res.stackResult) continue;

    const envColas = res.stackResult.metrics.envolvente || [];
    const isDownward = colorTheme === 'anulaciones' && (suffix === 'anulados' || suffix === 'menor');
    const envData = envColas
      .map((v, t) => ({ x: t, y: isDownward ? -v : v }))
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
  const legendWidth = 240;
  const legendHeight = colorTheme === 'anulaciones' ? 157 : 85;
  const legendG = g.append("g")
    .attr("class", "chart-legend")
    .attr("transform", `translate(${innerW - (legendWidth + 15)}, 10)`);

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
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .attr("fill", "rgba(255, 255, 255, 0.90)")
    .attr("stroke", "#e2e8f0") // gris suave
    .attr("stroke-width", 1)
    .attr("rx", 4)
    .attr("filter", "url(#legend-shadow)");

  activeSuffixes.forEach((suffix, index) => {
    let yPos = 16 + index * 18;
    if (colorTheme === 'anulaciones' && index >= 2) {
      yPos += 12; // Shift down for divider space
    }
    const label = formattedLabels[index] || "";

    // Obtener valores consolidados totales para la leyenda
    const res = resultsBySuffix[suffix];
    let labelSuffix = "";
    if (res) {
      let totOrders = res.cantPedidos || 0;
      let totVol = Math.round(res.volumenT || 0);

      // Downward negative values for legend
      const isDownward = colorTheme === 'anulaciones' && (suffix === 'anulados' || suffix === 'menor');
      if (isDownward) {
        if (totOrders > 0) totOrders = -totOrders;
        if (totVol > 0) totVol = -totVol;
      }

      const unitStr = colorTheme === 'green' ? 'tck.' : 'ped.';
      if (totOrders !== 0 || totVol !== 0) {
        labelSuffix = ` (${totOrders} ${unitStr}, ${totVol} m³)`;
      }
    }

    // Dibujar línea divisoria horizontal antes del index 2 en modo anulaciones
    if (colorTheme === 'anulaciones' && index === 2) {
      legendG.append("line")
        .attr("x1", 8)
        .attr("x2", legendWidth - 8)
        .attr("y1", yPos - 7)
        .attr("y2", yPos - 7)
        .attr("stroke", "#e2e8f0")
        .attr("stroke-width", 1);
    }

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
      .text(`${label}${labelSuffix}`);

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

        // Tracear cada una de las curvas en el punto t
        activeSuffixes.forEach((suffix, index) => {
          const res = resultsBySuffix[suffix];
          const envColas = res && res.stackResult ? res.stackResult.metrics.envolvente || [] : [];
          const yVal = envColas[t] || 0;
          const isDownward = colorTheme === 'anulaciones' && (suffix === 'anulados' || suffix === 'menor');
          const plotYVal = isDownward ? -yVal : yVal;
          const yPos = yScale(plotYVal);

          if (res && res.stackResult) {
            circles[index]
              .attr("cx", xPos)
              .attr("cy", yPos)
              .style("opacity", yVal > 0 ? 1 : 0.2);

            const captureLabel = formattedLabels[index] || suffix;
            const labelStyle = colorTheme === 'anulaciones'
              ? `font-weight: 500; color: ${colors[index]};`
              : (index === 0 ? `font-weight: bold; color: ${colors[index]};` : `color: #555;`);
            const cantStr = colorTheme === 'green' ? 'tck.' : 'ped.';
            
            // Calcular cantidad de pedidos y volumen activos en el slot t
            let activeCount = 0;
            let activeVolume = 0;
            const items = res.dataToStack || [];

            items.forEach(d => {
              const seg = d.STK && d.STK.segmentosXY ? d.STK.segmentosXY.find(s => s.x === t) : null;
              if (seg && seg.v > 0) {
                activeCount++;
                if (colorTheme === 'green') {
                  activeVolume += (d.Volumen || 0);
                } else {
                  activeVolume += (d.CantProgramada || 0);
                }
              }
            });

            // Downward negative values for tooltip
            const isDownward = colorTheme === 'anulaciones' && (suffix === 'anulados' || suffix === 'menor');
            let displayYVal = yVal;
            if (isDownward) {
              if (displayYVal > 0) displayYVal = -displayYVal;
              if (activeCount > 0) activeCount = -activeCount;
              if (activeVolume > 0) activeVolume = -activeVolume;
            }
            displayYVal = Math.round(displayYVal * 10) / 10;

            const volM3 = Math.round(activeVolume);

            // Agregar divisor en tooltip antes de index 2 (Nuevos) en modo anulaciones
            if (colorTheme === 'anulaciones' && index === 2) {
              html += `<hr style="border: 0; border-top: 1px solid #eee; margin: 4px 0;"/>`;
            }

            html += `<span style="${labelStyle}">${captureLabel}: <strong>${displayYVal} cam.</strong> <span style="font-size: 9px; color: #666; font-weight: normal;">(${activeCount} ${cantStr}, ${volM3} m³)</span></span><br/>`;
            valuesCount++;
          } else {
            circles[index].style("opacity", 0);
          }
        });



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
