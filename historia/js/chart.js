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
  const slotMin = (6 * 60) / granularidadMin; // 06:00
  const slotMax = (20 * 60) / granularidadMin; // 20:00
  const xDomain = [slotMin, slotMax];

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
  const yTicks = yScale.ticks(5).filter(d => Number.isInteger(d));
  g.append("g")
    .attr("class", "grid grid-y")
    .call(d3.axisLeft(yScale).tickValues(yTicks).tickSize(-innerW).tickFormat(""))
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
    .call(d3.axisLeft(yScale).tickValues(yTicks).tickFormat(d3.format("d")))
    .selectAll("text")
    .style("fill", "#555")
    .style("font-size", "11px");



  // 5. Dibujar cada una de las curvas envolventes superpuestas
  const colors = colorTheme === 'anulaciones'
    ? ["#0066cc", "#777777", "#9c27b0", "#0066cc", "#2e7d32", "#2e7d32", "#d32f2f", "#d32f2f"]
    : (colorTheme === 'tickets'
      ? (activeSuffixes.length === 3
        ? ["#0066cc", "#475569", "#2e7d32"] // Pedidos Actual (Blue), Pedidos Anterior (Slate), Despachos Reales (Green)
        : ["#0066cc", "#2e7d32"]) // Pedidos (Blue), Despachos (Green)
      : (colorTheme === 'blue'
        ? ["#0066cc", "#3b82f6", "#60a5fa", "#93c5fd"]
        : ["#2e7d32", "#4caf50", "#81c784", "#a5d6a7"]));
  const strokeWidths = colorTheme === 'anulaciones'
    ? [2.5, 1.8, 2.5, 1.5, 2.0, 1.5, 2.0, 1.5]
    : (colorTheme === 'tickets'
      ? (activeSuffixes.length === 3 ? [2.5, 1.8, 2.5] : [2.5, 2.5])
      : [2.5, 1.8, 1.5, 1.2]);
  const dashArrays = colorTheme === 'anulaciones'
    ? [null, null, null, "4,4", null, "4,4", null, "4,4"]
    : (colorTheme === 'tickets'
      ? (activeSuffixes.length === 3 ? [null, "4,4", null] : [null, null])
      : [null, null, "4,4", "2,2"]);

  // Relleno suave bajo la curva principal (Mismo día - index 0, o Despachos si estamos en Modo Despachos)
  const fillSuffix = colorTheme === 'tickets' ? 'tickets' : activeSuffixes[0];
  const primaryRes = resultsBySuffix[fillSuffix];
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
      .attr("fill", (colorTheme === 'blue' || colorTheme === 'anulaciones') 
        ? "rgba(59, 130, 246, 0.12)" // Azul para pedidos del día actual
        : "rgba(46, 125, 50, 0.12)") // Verde para tickets / despachos
      .attr("d", areaGenerator);
  }

  // Relleno suave violeta bajo la curva de diferencia (solo en modo anulaciones)
  if (colorTheme === 'anulaciones' && resultsBySuffix['diferencia']) {
    const diffRes = resultsBySuffix['diferencia'];
    if (diffRes.stackResult) {
      const envColas = diffRes.stackResult.metrics.envolvente || [];
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
        .attr("fill", "rgba(156, 39, 176, 0.12)") // Violeta suave
        .attr("d", areaGenerator);
    }
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
  const isMultiLine = colorTheme !== 'anulaciones';
  
  let legendHeight = 175; // Default for anulaciones (8 items)
  if (isMultiLine) {
    if (colorTheme === 'tickets') {
      legendHeight = activeSuffixes.length === 3 ? 92 : 64;
    } else {
      legendHeight = 120; // 4 items in blue/green
    }
  }

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
    const yStep = isMultiLine ? 28 : 18;
    let yPos = 16 + index * yStep;
    if (colorTheme === 'anulaciones' && index >= 3) {
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

      if (suffix === 'diferencia') {
        const sign = totVol > 0 ? '+' : '';
        labelSuffix = `(${sign}${totVol} m³)`;
      } else {
        const unitStr = (suffix === 'tickets' || colorTheme === 'green') ? 'tck.' : 'ped.';
        if (totOrders !== 0 || totVol !== 0) {
          labelSuffix = `(${totOrders} ${unitStr}, ${totVol} m³)`;
        }
      }
    }

    // Dibujar línea divisoria horizontal antes del index 3 en modo anulaciones
    if (colorTheme === 'anulaciones' && index === 3) {
      legendG.append("line")
        .attr("x1", 8)
        .attr("x2", legendWidth - 8)
        .attr("y1", yPos - 7)
        .attr("y2", yPos - 7)
        .attr("stroke", "#e2e8f0")
        .attr("stroke-width", 1);
    }

    // Muestra de línea
    const lineY = isMultiLine ? (yPos + 5) : yPos;
    legendG.append("line")
      .attr("x1", 12)
      .attr("x2", 37)
      .attr("y1", lineY)
      .attr("y2", lineY)
      .attr("stroke", colors[index] || "#999")
      .attr("stroke-width", strokeWidths[index] || 1)
      .attr("stroke-dasharray", dashArrays[index] || null);

    // Texto de leyenda
    const textNode = legendG.append("text")
      .attr("x", 44)
      .attr("y", yPos + 3.5)
      .attr("fill", label.includes("(No disp.)") ? "#ef4444" : "#334155")
      .attr("font-family", "sans-serif")
      .attr("font-size", "10px");

    if (index === 0) {
      textNode.attr("font-weight", "bold");
    }

    if (isMultiLine && labelSuffix) {
      textNode.text(label);
      legendG.append("text")
        .attr("x", 44)
        .attr("y", yPos + 14.5)
        .attr("fill", "#64748b")
        .attr("font-family", "sans-serif")
        .attr("font-size", "9px")
        .text(labelSuffix);
    } else {
      textNode.text(`${label}${labelSuffix ? ' ' + labelSuffix : ''}`);
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

          // Determinar si el mouse está cerca de esta curva verticalmente (tolerancia de +-5px)
          const isCloseToCurve = Math.abs(my - yPos) <= 5;

          if (res && res.stackResult) {
            // Expandir círculo si el cursor está sobre la curva específica
            circles[index]
              .attr("cx", xPos)
              .attr("cy", yPos)
              .attr("r", isCloseToCurve ? 7.0 : 4.5)
              .style("opacity", isCloseToCurve ? 1.0 : (yVal > 0 ? 0.9 : 0.2))
              .attr("stroke-width", isCloseToCurve ? 2.5 : 1.5);

            const captureLabel = formattedLabels[index] || suffix;
            
            // Destacar texto de la curva activa (Focus)
            const labelStyle = colorTheme === 'anulaciones'
              ? `font-weight: ${isCloseToCurve ? '700' : '500'}; color: ${colors[index]};`
              : (index === 0 ? `font-weight: bold; color: ${colors[index]};` : `color: #555;`);
            
            const cantStr = (suffix === 'tickets' || colorTheme === 'green') ? 'tck.' : 'ped.';
            
            // Calcular cantidad de pedidos y volumen activos en el slot t
            let activeCount = 0;
            let activeVolume = 0;
            const items = res.dataToStack || [];
            const activeOrdersInfo = [];

            // Solo mostrar detalle de pedidos si el mouse está físicamente encima de esta curva
            const showOrderDetails = isCloseToCurve && colorTheme === 'anulaciones' && (suffix === 'nuevos' || suffix === 'mayor' || suffix === 'anulados' || suffix === 'menor');

            items.forEach(d => {
              const seg = d.STK && d.STK.segmentosXY ? d.STK.segmentosXY.find(s => s.x === t) : null;
              if (seg && seg.v > 0) {
                activeCount++;
                if (colorTheme === 'green') {
                  activeVolume += (d.Volumen || 0);
                } else {
                  activeVolume += (d.CantProgramada || 0);
                }

                if (showOrderDetails) {
                  const origVol = d.originalVol ?? 0;
                  const newVol = d.nuevoVol ?? 0;
                  const diff = Math.abs(origVol - newVol);
                  activeOrdersInfo.push({
                    id: d.id,
                    obra: d.Obra || '',
                    producto: d.Producto || '',
                    origVol,
                    newVol,
                    diff
                  });
                }
              }
            });

            // Ordenar pedidos en forma descendente según el cambio de volumen absoluto
            if (activeOrdersInfo.length > 0) {
              activeOrdersInfo.sort((a, b) => b.diff - a.diff);
            }

            // Downward negative values for tooltip
            let displayYVal = yVal;
            if (isDownward) {
              if (displayYVal > 0) displayYVal = -displayYVal;
              if (activeCount > 0) activeCount = -activeCount;
              if (activeVolume > 0) activeVolume = -activeVolume;
            }
            displayYVal = Math.round(displayYVal);

            const volM3 = Math.round(activeVolume);

            // Agregar divisor en tooltip antes de index 3 (Iguales) en modo anulaciones
            if (colorTheme === 'anulaciones' && index === 3) {
              html += `<hr style="border: 0; border-top: 1px solid #eee; margin: 4px 0;"/>`;
            }

            if (suffix === 'diferencia') {
              const sign = yVal > 0 ? '+' : '';
              const roundedVal = Math.round(yVal);
              html += `<span style="${labelStyle}">${captureLabel}: <strong>${sign}${roundedVal} cam.</strong></span><br/>`;
            } else {
              html += `<span style="${labelStyle}">${captureLabel}: <strong>${displayYVal} cam.</strong> <span style="font-size: 9px; color: #666; font-weight: normal;">(${activeCount} ${cantStr}, ${volM3} m³)</span></span><br/>`;
            }

            // Agregar listado de pedidos si corresponde
            if (activeOrdersInfo.length > 0) {
              activeOrdersInfo.forEach(info => {
                const text = `• #${info.id} (${info.origVol} → ${info.newVol} m³) | ${info.obra} | ${info.producto}`;
                html += `<span style="font-size: 9px; color: #64748b; padding-left: 10px; display: block; font-family: system-ui, sans-serif; line-height: 1.3; white-space: nowrap;">${text}</span>`;
              });
            }
            valuesCount++;
          } else {
            circles[index].style("opacity", 0);
          }
        });



        // Posicionar tooltip dinámicamente
        const containerBounds = container.node().getBoundingClientRect();
        const mouseX = ev.clientX - containerBounds.left;
        const mouseY = ev.clientY - containerBounds.top;

        const isPastHalf = mouseX > (containerBounds.width / 2);
        const isLowerHalf = mouseY > (containerBounds.height / 2);

        // Primero mostramos y seteamos el contenido del tooltip para calcular sus dimensiones reales
        tooltip
          .html(html)
          .style("display", "block");

        const tooltipNode = tooltip.node();
        const tooltipW = tooltipNode.offsetWidth;
        const tooltipH = tooltipNode.offsetHeight;

        let finalLeft = isPastHalf ? (mouseX - 15 - tooltipW) : (mouseX + 15);
        let finalTop = isLowerHalf ? (mouseY - 15 - tooltipH) : (mouseY + 15);

        // Controlar límites para evitar que salga del contenedor por arriba (y = 0)
        if (finalTop < 0) {
          finalTop = 0;
        }
        // Evitar que salga del contenedor por abajo
        if (finalTop + tooltipH > containerBounds.height) {
          finalTop = Math.max(0, containerBounds.height - tooltipH);
        }

        // Evitar que salga por la izquierda (x = 0)
        if (finalLeft < 0) {
          finalLeft = 0;
        }
        // Evitar que salga por la derecha
        if (finalLeft + tooltipW > containerBounds.width) {
          finalLeft = Math.max(0, containerBounds.width - tooltipW);
        }

        tooltip
          .style("left", `${finalLeft}px`)
          .style("top", `${finalTop}px`)
          .style("transform", "none");
      }
    })
    .on("mouseleave", () => {
      cursorLine.style("opacity", 0);
      circles.forEach(c => c.style("opacity", 0));
      tooltip.style("display", "none");
    });
}
