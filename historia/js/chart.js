function drawMultiTruckChart(svgSelector, containerSelector, resultsBySuffix, activeSuffixes, formattedLabels, granularidadMin, colorTheme, globalYMax) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove(); // Limpiar gráfico anterior del contenedor
  const svg = container.append("svg")
    .attr("id", svgSelector.replace("#", ""))
    .attr("width", 1260)
    .attr("height", 490);

  const margin = { top: 25, right: 20, bottom: 40, left: 50 };
  const innerW = 1260 - margin.left - margin.right;
  const innerH = 490 - margin.top - margin.bottom;

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
    : (colorTheme === 'tickets' || colorTheme === 'teorico_real'
      ? (activeSuffixes.length === 3
        ? ["#0066cc", "#475569", "#2e7d32"] // Pedidos Actual (Blue), Pedidos Anterior (Slate), Despachos Reales (Green)
        : ["#0066cc", "#2e7d32"]) // Pedidos (Blue), Despachos (Green)
      : (colorTheme === 'blue'
        ? ["#0066cc", "#3b82f6", "#60a5fa", "#93c5fd"]
        : ["#2e7d32", "#4caf50", "#81c784", "#a5d6a7"]));
  const strokeWidths = colorTheme === 'anulaciones'
    ? [2.5, 1.8, 2.5, 1.5, 2.0, 1.5, 2.0, 1.5]
    : (colorTheme === 'tickets' || colorTheme === 'teorico_real'
      ? (activeSuffixes.length === 3 ? [2.5, 1.8, 2.5] : [2.5, 2.5])
      : [2.5, 1.8, 1.5, 1.2]);
  const dashArrays = colorTheme === 'anulaciones'
    ? [null, null, null, "4,4", null, "4,4", null, "4,4"]
    : (colorTheme === 'tickets' || colorTheme === 'teorico_real'
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
        const unitStr = (suffix === 'tickets' || suffix === 'real' || suffix === 'teorico' || colorTheme === 'green') ? 'tck.' : 'ped.';
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
            
            const cantStr = (suffix === 'tickets' || suffix === 'real' || suffix === 'teorico' || colorTheme === 'green') ? 'tck.' : 'ped.';
            
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

/**
 * Dibuja un gráfico de dispersión (Scatter Plot) amplio que compara:
 * - Eje X: Hora de Asignación Teórica (Pedidos) de 06:00 a 20:00.
 * - Eje Y: Retraso / Adelanto en minutos (fijo entre -60 y +60, con outliers acotados arriba/abajo).
 */
function drawScatterTeoricoReal(containerId, containerParentId, pairedData, granularidadMin, type = 'asignacion') {
  const container = d3.select(containerParentId);
  container.selectAll("*").remove(); // Limpiar todo

  const width = 1260;
  const height = 430;
  const margin = { top: 55, right: 30, bottom: 45, left: 60 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("id", containerId.replace("#", ""))
    .attr("width", width)
    .attr("height", height)
    .style("display", "block")
    .style("margin", "0 auto");

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Escalas de hora del día (X) y desviación (Y) unificadas para todos los modos
  const xScale = d3.scaleLinear().domain([360, 1200]).range([0, innerW]);
  const yScale = d3.scaleLinear().domain([-65, 65]).range([innerH, 0]);

  const ticks = [360, 420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200];
  const yTicks = [-60, -45, -30, -15, 0, 15, 30, 45, 60];

  const formatTime = min => {
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  // Bandas de puntualidad de fondo (para todos los gráficos)
  const bandG = g.append("g").attr("class", "punctuality-bands");
  
  // Adelanto / A tiempo (y >= 0): verde muy suave
  bandG.append("rect")
    .attr("x", 0).attr("width", innerW)
    .attr("y", yScale(65)).attr("height", yScale(0) - yScale(65))
    .attr("fill", "rgba(22, 163, 74, 0.02)");

  // Atraso <= 5 min (y entre 0 y -5): azul/gris suave
  bandG.append("rect")
    .attr("x", 0).attr("width", innerW)
    .attr("y", yScale(0)).attr("height", yScale(-5) - yScale(0))
    .attr("fill", "rgba(100, 116, 139, 0.05)");

  // Atraso entre 5 y 30 min (y entre -5 y -30): amarillo suave
  bandG.append("rect")
    .attr("x", 0).attr("width", innerW)
    .attr("y", yScale(-5)).attr("height", yScale(-30) - yScale(-5))
    .attr("fill", "rgba(234, 179, 8, 0.04)");

  // Atraso > 30 min (y entre -30 y -65): rojo suave
  bandG.append("rect")
    .attr("x", 0).attr("width", innerW)
    .attr("y", yScale(-30)).attr("height", yScale(-65) - yScale(-30))
    .attr("fill", "rgba(220, 38, 38, 0.03)");

  // Cuadrícula y líneas de guía
  const gridG = g.append("g").attr("class", "grid");
  ticks.forEach(t => {
    gridG.append("line")
      .attr("x1", xScale(t)).attr("x2", xScale(t)).attr("y1", 0).attr("y2", innerH)
      .attr("stroke", "#eee").attr("stroke-dasharray", "2,2");
  });
  
  yTicks.forEach(val => {
    gridG.append("line")
      .attr("x1", 0).attr("x2", innerW).attr("y1", yScale(val)).attr("y2", yScale(val))
      .attr("stroke", val === 0 ? "#94a3b8" : "#eee")
      .attr("stroke-width", val === 0 ? 1.5 : 1)
      .attr("stroke-dasharray", val === 0 ? null : "2,2");
  });

  // Ejes
  g.append("g")
    .attr("transform", `translate(0, ${innerH})`)
    .call(d3.axisBottom(xScale).tickValues(ticks).tickFormat(formatTime))
    .style("font-family", "sans-serif").style("font-size", "10px");

  g.append("g")
    .call(d3.axisLeft(yScale).tickValues(yTicks).tickFormat(d => {
      if (d > 0) return `-${d}`;
      if (d < 0) return `+${Math.abs(d)}`;
      return "0";
    }))
    .style("font-family", "sans-serif").style("font-size", "10px");

  // Etiquetas de los ejes
  const xLabel = type === 'viaje_ida' 
    ? "Hora de Inicio del Viaje Teórica (Pedidos)" 
    : (type === 'viaje_regreso' ? "Hora de Salida de Obra Teórica (Pedidos)" : (type === 'estadia' ? "Hora de Llegada a Obra Teórica (Pedidos)" : (type === 'llegada_obra' ? "Hora Teórica de Descarga (Pedidos)" : (type === 'carga' || type === 'ciclo' ? "Hora de Asignación Teórica (Pedidos)" : "Hora de Asignación Teórica (Pedidos)"))));

  const yLabel = type === 'viaje_ida'
    ? "Adelanto / Atraso en Tiempo de Viaje (Minutos)"
    : (type === 'viaje_regreso' ? "Adelanto / Atraso en Tiempo de Regreso (Minutos)" : (type === 'estadia' ? "Adelanto / Atraso en Estadía (Minutos)" : (type === 'llegada_obra' ? "Adelanto / Atraso en Llegada a Obra (Minutos)" : (type === 'carga' ? "Adelanto / Atraso en Tiempo de Carga (Minutos)" : (type === 'ciclo' ? "Adelanto / Atraso en Tiempo de Ciclo (Minutos)" : "Adelanto / Atraso (Minutos)")))));

  const chartTitleText = type === 'viaje_ida'
    ? "Desviación de Tiempo de Viaje (Ida): Adelanto (arriba) / Atraso (abajo)"
    : (type === 'viaje_regreso' ? "Desviación de Tiempo de Regreso (Retorno): Adelanto (arriba) / Atraso (abajo)" : (type === 'estadia' ? "Desviación de Estadía (En Obra): Adelanto (arriba) / Atraso (abajo)" : (type === 'llegada_obra' ? "Desviación de Llegada a Obra: Adelanto (arriba) / Atraso (abajo)" : (type === 'carga' ? "Desviación de Tiempo de Carga: Adelanto (arriba) / Atraso (abajo)" : (type === 'ciclo' ? "Desviación de Tiempo de Ciclo Completo: Adelanto (arriba) / Atraso (abajo)" : "Desviación de Asignaciones: Adelanto (arriba) / Atraso (abajo)")))));

  svg.append("text")
    .attr("x", margin.left + innerW / 2).attr("y", height - 15)
    .attr("text-anchor", "middle").attr("fill", "#334155")
    .style("font-size", "12px").style("font-weight", "600").style("font-family", "sans-serif")
    .text(xLabel);

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(margin.top + innerH / 2)).attr("y", 20)
    .attr("text-anchor", "middle").attr("fill", "#334155")
    .style("font-size", "12px").style("font-weight", "600").style("font-family", "sans-serif")
    .text(yLabel);

  // Título del gráfico
  svg.append("text")
    .attr("x", margin.left + innerW / 2).attr("y", 42)
    .attr("text-anchor", "middle").attr("fill", "#1e293b")
    .style("font-size", "14px").style("font-weight", "bold").style("font-family", "sans-serif")
    .text(chartTitleText);

  // Tooltip flotante global
  let tooltip = d3.select(".tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("display", "none");
  }

  // Dibujar puntos del scatter plot
  const dots = g.selectAll(".dot")
    .data(pairedData)
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("cx", d => xScale(d.x))
    .attr("cy", d => {
      const dev = d.teoVal - d.realVal;
      const clampedDev = dev > 60 ? 62 : (dev < -60 ? -62 : dev);
      return yScale(clampedDev);
    })
    .attr("r", 6)
    .attr("fill", d => {
      const dev = d.teoVal - d.realVal;
      if (dev === 0) return "rgba(100, 116, 139, 0.55)";
      if (dev > 0) return "rgba(22, 163, 74, 0.55)"; // Adelanto (verde)
      const atraso = -dev;
      if (atraso <= 5) return "rgba(100, 116, 139, 0.55)"; // Atraso <= 5 (azul/gris cero diferencia)
      if (atraso <= 30) return "rgba(254, 240, 138, 0.7)"; // Atraso 5 a 30 (amarillo)
      return "rgba(220, 38, 38, 0.55)"; // Atraso > 30 (rojo)
    })
    .attr("stroke", d => {
      const dev = d.teoVal - d.realVal;
      if (dev === 0) return "#64748b";
      if (dev > 0) return "#16a34a"; // verde
      const atraso = -dev;
      if (atraso <= 5) return "#64748b"; // Atraso <= 5 (azul/gris cero diferencia)
      if (atraso <= 30) return "#f97316"; // naranja (borde para amarillo)
      return "#dc2626"; // rojo
    })
    .attr("stroke-width", 1.5)
    .style("cursor", "pointer")
    .style("transition", "all 0.15s ease");

  dots.on("mouseover", function(ev, d) {
    const dev = d.teoVal - d.realVal;
    let mFill, mStroke;

    if (dev === 0) {
      mFill = "#475569"; mStroke = "#475569";
    } else if (dev > 0) {
      mFill = "#22c55e"; mStroke = "#22c55e";
    } else {
      const atraso = -dev;
      if (atraso <= 5) {
        mFill = "#475569"; mStroke = "#475569";
      } else if (atraso <= 30) {
        mFill = "#fef08a"; mStroke = "#f97316";
      } else {
        mFill = "#ef4444"; mStroke = "#ef4444";
      }
    }

    d3.select(this)
      .attr("r", 9)
      .attr("fill", mFill)
      .attr("stroke", mStroke)
      .attr("stroke-width", 2.5);

    const rawT = d.real.rawTicket || {};
    const pImpreso = (rawT.Impreso && rawT.Impreso !== "0") ? safeHhmmssToMin(rawT.Impreso) : d.pedido.HoraAsignacionMin;
    const pInicioCarga = (rawT.InicioCarga && rawT.InicioCarga !== "0") ? safeHhmmssToMin(rawT.InicioCarga) : pImpreso;
    const pFinCarga = (rawT.FinCarga && rawT.FinCarga !== "0") ? safeHhmmssToMin(rawT.FinCarga) : (pInicioCarga + (d.pedido.TiempoCarga || 0));
    const pAObra = (rawT.AObra && rawT.AObra !== "0") ? safeHhmmssToMin(rawT.AObra) : pFinCarga;
    const pEnObra = (rawT.EnObra && rawT.EnObra !== "0") ? safeHhmmssToMin(rawT.EnObra) : (pAObra + (d.pedido.TiempoViaje || 0));
    const pInicioDescarga = (rawT.InicioDescarga && rawT.InicioDescarga !== "0") ? safeHhmmssToMin(rawT.InicioDescarga) : pEnObra;
    const pAplanta = (rawT.Aplanta && rawT.Aplanta !== "0") ? safeHhmmssToMin(rawT.Aplanta) : (pEnObra + (d.pedido.Frecuencia || 0));
    const pEnplanta = (rawT.Enplanta && rawT.Enplanta !== "0") ? safeHhmmssToMin(rawT.Enplanta) : (pAplanta + (d.pedido.TiempoViaje || 0));

    let timeDetailsHtml = "";
    let diffText = "";
    let diffColor = "#333";

    if (type === 'viaje_ida') {
      const teoDuration = d.pedido.TiempoViaje || 0;
      const realDuration = pEnObra - pFinCarga;
      const diffMin = realDuration - teoDuration; // positivo = atrasado, negativo = adelantado

      if (diffMin > 0) {
        diffText = `+${diffMin} min. (Atrasado)`;
        diffColor = "#d32f2f";
      } else if (diffMin < 0) {
        diffText = `${diffMin} min. (Adelantado)`;
        diffColor = "#2e7d32";
      } else {
        diffText = "Sin desviación";
        diffColor = "#4b5563";
      }

      timeDetailsHtml = `
        <strong>Salida Teórica (Inicio):</strong> ${formatTime(d.teo.HoraInicioMin)}<br/>
        <strong>Salida Real (Inicio):</strong> ${formatTime(pFinCarga)}<br/>
        <strong>Duración Teórica:</strong> ${teoDuration} min.<br/>
        <strong>Duración Real:</strong> ${realDuration} min.<br/>
      `;
    } else if (type === 'viaje_regreso') {
      const teoDuration = d.pedido.TiempoViaje || 0;
      const realDuration = pEnplanta - pAplanta;
      const diffMin = realDuration - teoDuration; // positivo = atrasado, negativo = adelantado

      if (diffMin > 0) {
        diffText = `+${diffMin} min. (Atrasado)`;
        diffColor = "#d32f2f";
      } else if (diffMin < 0) {
        diffText = `${diffMin} min. (Adelantado)`;
        diffColor = "#2e7d32";
      } else {
        diffText = "Sin desviación";
        diffColor = "#4b5563";
      }

      const teoStart = d.teo.HoraFinalMin - teoDuration;

      timeDetailsHtml = `
        <strong>Salida Obra Teórica (Regreso):</strong> ${formatTime(teoStart)}<br/>
        <strong>Salida Obra Real (Regreso):</strong> ${formatTime(pAplanta)}<br/>
        <strong>Duración Teórica:</strong> ${teoDuration} min.<br/>
        <strong>Duración Real:</strong> ${realDuration} min.<br/>
      `;
    } else if (type === 'estadia') {
      const teoDuration = (d.teo.HoraFinalMin - (d.pedido.TiempoViaje || 0)) - d.teo.HoraInicioMin;
      const realDuration = pAplanta - pEnObra;
      const diffMin = realDuration - teoDuration; // positivo = atrasado, negativo = adelantado

      if (diffMin > 0) {
        diffText = `+${diffMin} min. (Atrasado)`;
        diffColor = "#d32f2f";
      } else if (diffMin < 0) {
        diffText = `${diffMin} min. (Adelantado)`;
        diffColor = "#2e7d32";
      } else {
        diffText = "Sin desviación";
        diffColor = "#4b5563";
      }

      timeDetailsHtml = `
        <strong>Llegada Obra Teórica (Estadía):</strong> ${formatTime(d.teo.HoraInicioMin)}<br/>
        <strong>Llegada Obra Real (Estadía):</strong> ${formatTime(pEnObra)}<br/>
        <strong>Duración Estadía Teórica:</strong> ${teoDuration} min.<br/>
        <strong>Duración Estadía Real:</strong> ${realDuration} min.<br/>
      `;
    } else if (type === 'carga') {
      const teoDuration = d.pedido.TiempoCarga || 0;
      const realDuration = pAObra - pImpreso;
      const diffMin = realDuration - teoDuration; // positivo = atrasado, negativo = adelantado

      if (diffMin > 0) {
        diffText = `+${diffMin} min. (Atrasado)`;
        diffColor = "#d32f2f";
      } else if (diffMin < 0) {
        diffText = `${diffMin} min. (Adelantado)`;
        diffColor = "#2e7d32";
      } else {
        diffText = "Sin desviación";
        diffColor = "#4b5563";
      }

      timeDetailsHtml = `
        <strong>Asignación Teórica (Impreso):</strong> ${formatTime(d.teo.HoraAsignacionMin)}<br/>
        <strong>Asignación Real (Impreso):</strong> ${formatTime(pImpreso)}<br/>
        <strong>Duración Carga Teórica:</strong> ${teoDuration} min.<br/>
        <strong>Duración Carga Real:</strong> ${realDuration} min.<br/>
      `;
    } else if (type === 'llegada_obra') {
      const teoLlegada = d.teo.HoraInicioMin;
      const realLlegada = pEnObra;
      const diffMin = realLlegada - teoLlegada; // positivo = atrasado, negativo = adelantado

      if (diffMin > 0) {
        diffText = `+${diffMin} min. (Atrasado)`;
        diffColor = "#d32f2f";
      } else if (diffMin < 0) {
        diffText = `${diffMin} min. (Adelantado)`;
        diffColor = "#2e7d32";
      } else {
        diffText = "Sin desviación";
        diffColor = "#4b5563";
      }

      timeDetailsHtml = `
        <strong>Descarga Teórica (Inicio):</strong> ${formatTime(teoLlegada)}<br/>
        <strong>Llegada Obra Real:</strong> ${formatTime(realLlegada)}<br/>
      `;
    } else if (type === 'ciclo') {
      const teoDuration = d.pedido.TiempoCiclo || 0;
      const realDuration = pEnplanta - pImpreso;
      const diffMin = realDuration - teoDuration; // positivo = atrasado, negativo = adelantado

      if (diffMin > 0) {
        diffText = `+${diffMin} min. (Atrasado)`;
        diffColor = "#d32f2f";
      } else if (diffMin < 0) {
        diffText = `${diffMin} min. (Adelantado)`;
        diffColor = "#2e7d32";
      } else {
        diffText = "Sin desviación";
        diffColor = "#4b5563";
      }

      timeDetailsHtml = `
        <strong>Asignación Teórica (Impreso):</strong> ${formatTime(d.teo.HoraAsignacionMin)}<br/>
        <strong>Asignación Real (Impreso):</strong> ${formatTime(pImpreso)}<br/>
        <strong>Duración Ciclo Teórica:</strong> ${teoDuration} min.<br/>
        <strong>Duración Ciclo Real:</strong> ${realDuration} min.<br/>
      `;
    } else {
      const diffMin = d.real.HoraAsignacionMin - d.teo.HoraAsignacionMin; // positivo = atrasado, negativo = adelantado

      if (diffMin > 0) {
        diffText = `+${diffMin} min. (Atrasado)`;
        diffColor = "#d32f2f";
      } else if (diffMin < 0) {
        diffText = `${diffMin} min. (Adelantado)`;
        diffColor = "#2e7d32";
      } else {
        diffText = "Sin desviación";
        diffColor = "#4b5563";
      }

      timeDetailsHtml = `
        <strong>Hora Teórica (Asignación):</strong> ${formatTime(d.teo.HoraAsignacionMin)}<br/>
        <strong>Hora Real (Asignación):</strong> ${formatTime(d.real.HoraAsignacionMin)}<br/>
      `;
    }

    const teoCarga = d.pedido.TiempoCarga || 0;
    const realCarga = pAObra - pImpreso;
    const teoEstadia = (d.teo.HoraFinalMin - (d.pedido.TiempoViaje || 0)) - d.teo.HoraInicioMin;
    const realEstadia = pAplanta - pEnObra;
    const teoIda = d.pedido.TiempoViaje || 0;
    const realIda = pEnObra - pAObra;
    const teoRegreso = d.pedido.TiempoViaje || 0;
    const realRegreso = pEnplanta - pAplanta;
    const teoCiclo = d.pedido.TiempoCiclo || 0;
    const realCiclo = pEnplanta - pImpreso;

    const diffAsignacion = d.real.HoraAsignacionMin - d.teo.HoraAsignacionMin;
    const diffCarga = realCarga - teoCarga;
    const diffIda = realIda - teoIda;
    const diffPuntualidad = pEnObra - d.teo.HoraInicioMin;
    const diffEstadia = realEstadia - teoEstadia;
    const diffRegreso = realRegreso - teoRegreso;
    const diffCiclo = realCiclo - teoCiclo;

    const formatDiffVal = (diff) => {
      if (diff > 0) return `<span style="color: #dc2626; font-weight: bold;">+${diff}</span>`;
      if (diff < 0) return `<span style="color: #16a34a; font-weight: bold;">${diff}</span>`;
      return `<span style="color: #64748b;">0</span>`;
    };

    const tableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10.5px; border-top: 1.5px solid #cbd5e1; padding-top: 4px;">
        <thead>
          <tr style="color: #334155; font-weight: bold; text-align: left; font-size: 11.5px;">
            <th style="padding: 4px 0 2px 0;">Etapa</th>
            <th style="padding: 4px 0 2px 0; text-align: right;">Teórico</th>
            <th style="padding: 4px 0 2px 0; text-align: right;">Real</th>
            <th style="padding: 4px 0 2px 0; text-align: right;">Dif.</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 3px 0; color: #334155;">Hora Asignación</td>
            <td style="padding: 3px 0; text-align: right; color: #64748b;">${formatTime(d.teo.HoraAsignacionMin)}</td>
            <td style="padding: 3px 0; text-align: right; color: #1e293b;">${formatTime(d.real.HoraAsignacionMin)}</td>
            <td style="padding: 3px 0; text-align: right;">${formatDiffVal(diffAsignacion)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 3px 0; color: #334155;">Carga [min]</td>
            <td style="padding: 3px 0; text-align: right; color: #64748b;">${teoCarga}</td>
            <td style="padding: 3px 0; text-align: right; color: #1e293b;">${realCarga}</td>
            <td style="padding: 3px 0; text-align: right;">${formatDiffVal(diffCarga)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 3px 0; color: #334155;">Viaje Ida [min]</td>
            <td style="padding: 3px 0; text-align: right; color: #64748b;">${teoIda}</td>
            <td style="padding: 3px 0; text-align: right; color: #1e293b;">${realIda}</td>
            <td style="padding: 3px 0; text-align: right;">${formatDiffVal(diffIda)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9; font-weight: bold;">
            <td style="padding: 3px 0; color: #1e293b; font-weight: bold;">Puntualidad</td>
            <td style="padding: 3px 0; text-align: right; color: #1e293b; font-weight: bold;">${formatTime(d.teo.HoraInicioMin)}</td>
            <td style="padding: 3px 0; text-align: right; color: #1e293b; font-weight: bold;">${formatTime(pEnObra)}</td>
            <td style="padding: 3px 0; text-align: right;">${formatDiffVal(diffPuntualidad)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 3px 0; color: #334155;">Estadía [min]</td>
            <td style="padding: 3px 0; text-align: right; color: #64748b;">${teoEstadia}</td>
            <td style="padding: 3px 0; text-align: right; color: #1e293b;">${realEstadia}</td>
            <td style="padding: 3px 0; text-align: right;">${formatDiffVal(diffEstadia)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 3px 0; color: #334155;">Regreso [min]</td>
            <td style="padding: 3px 0; text-align: right; color: #64748b;">${teoRegreso}</td>
            <td style="padding: 3px 0; text-align: right; color: #1e293b;">${realRegreso}</td>
            <td style="padding: 3px 0; text-align: right;">${formatDiffVal(diffRegreso)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9; font-weight: bold;">
            <td style="padding: 3px 0; color: #1e293b; font-weight: bold;">Ciclo Completo [min]</td>
            <td style="padding: 3px 0; text-align: right; color: #1e293b; font-weight: bold;">${teoCiclo}</td>
            <td style="padding: 3px 0; text-align: right; color: #1e293b; font-weight: bold;">${realCiclo}</td>
            <td style="padding: 3px 0; text-align: right;">${formatDiffVal(diffCiclo)}</td>
          </tr>
        </tbody>
      </table>
    `;

    let rawTicketHtml = "";
    if (rawT && Object.keys(rawT).length > 0) {
      rawTicketHtml = `
        <div style="margin-top: 8px; border-top: 1px dashed #cbd5e1; padding-top: 6px; text-align: left;">
          <span style="font-size: 10px; font-weight: 700; color: #475569;">Datos Ticket Real Originales:</span>
          <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px; margin-top: 4px; overflow-x: auto;">
            <table style="width: 320px; border-collapse: collapse; font-size: 8.5px; color: #64748b; text-align: center; table-layout: fixed;">
              <thead>
                <tr style="border-bottom: 1px solid #f1f5f9; background-color: #f8fafc;">
                  <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Impreso">Impreso</th>
                  <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="InicioCarga">Ini.Carga</th>
                  <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="FinCarga">FinCarga</th>
                  <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="AObra">AObra</th>
                  <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="EnObra">EnObra</th>
                  <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="InicioDescarga">Ini.Des.</th>
                  <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Aplanta">APlanta</th>
                  <th style="font-weight: 600; padding: 3px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Enplanta">EnPlanta</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: 3px 1px; border-bottom: 1px solid #f1f5f9;">${rawT.Impreso || '-'}</td>
                  <td style="padding: 3px 1px; border-bottom: 1px solid #f1f5f9;">${rawT.InicioCarga || '-'}</td>
                  <td style="padding: 3px 1px; border-bottom: 1px solid #f1f5f9;">${rawT.FinCarga || '-'}</td>
                  <td style="padding: 3px 1px; border-bottom: 1px solid #f1f5f9;">${rawT.AObra || '-'}</td>
                  <td style="padding: 3px 1px; border-bottom: 1px solid #f1f5f9;">${rawT.EnObra || '-'}</td>
                  <td style="padding: 3px 1px; border-bottom: 1px solid #f1f5f9;">${rawT.InicioDescarga || '-'}</td>
                  <td style="padding: 3px 1px; border-bottom: 1px solid #f1f5f9;">${rawT.Aplanta || '-'}</td>
                  <td style="padding: 3px 1px; border-bottom: 1px solid #f1f5f9;">${rawT.Enplanta || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    const html = `
      <div style="font-family: system-ui, sans-serif; font-size: 11px; line-height: 1.4; color: #1e293b; padding: 4px; min-width: 285px; max-width: 330px;">
        <div style="font-weight: bold; font-size: 12px; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
          ${d.pedido.Obra || 'Obra no especificada'}
        </div>
        <strong>Obra:</strong> ${d.pedido.Obra || ''}<br/>
        <strong>Producto:</strong> ${d.pedido.Producto || ''}<br/>
        <strong>Volumen:</strong> ${d.pedido.CantProgramada || 0} m³<br/>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 4px 0;"/>
        <strong>Despacho:</strong> Viaje #${d.real.despachoIndex}<br/>
        <strong>Camión:</strong> #${rawT.Camion || 'N/A'}<br/>
        ${tableHtml}
        ${rawTicketHtml}
      </div>
    `;

    tooltip.html(html).style("display", "block");

    // Posicionar tooltip con límites relativos al viewport y al contenedor padre (#chart-container)
    const container = d3.select("#chart-container");
    const containerBounds = container.node().getBoundingClientRect();

    const tooltipNode = tooltip.node();
    const tooltipW = tooltipNode.offsetWidth;
    const tooltipH = tooltipNode.offsetHeight;

    const pageW = window.innerWidth;
    const pageH = window.innerHeight;

    // Calcular posición óptima en viewport (clientX / clientY)
    let leftPos = ev.clientX + 15;
    let topPos = ev.clientY - 15;

    if (leftPos + tooltipW > pageW) {
      leftPos = ev.clientX - tooltipW - 15;
    }
    if (leftPos < 10) {
      leftPos = 10;
    }

    if (topPos + tooltipH > pageH) {
      topPos = ev.clientY - tooltipH - 15;
    }
    if (topPos < 10) {
      topPos = 10;
    }

    // Convertir de coordenadas viewport a relativas del contenedor parent
    const leftPosRelative = leftPos - containerBounds.left;
    const topPosRelative = topPos - containerBounds.top;

    tooltip
      .style("left", `${leftPosRelative}px`)
      .style("top", `${topPosRelative}px`)
      .style("transform", "none");
  })
  .on("mousemove", function(ev) {
    const container = d3.select("#chart-container");
    const containerBounds = container.node().getBoundingClientRect();

    const tooltipNode = tooltip.node();
    const tooltipW = tooltipNode.offsetWidth;
    const tooltipH = tooltipNode.offsetHeight;

    const pageW = window.innerWidth;
    const pageH = window.innerHeight;

    let leftPos = ev.clientX + 15;
    let topPos = ev.clientY - 15;

    if (leftPos + tooltipW > pageW) {
      leftPos = ev.clientX - tooltipW - 15;
    }
    if (leftPos < 10) {
      leftPos = 10;
    }

    if (topPos + tooltipH > pageH) {
      topPos = ev.clientY - tooltipH - 15;
    }
    if (topPos < 10) {
      topPos = 10;
    }

    const leftPosRelative = leftPos - containerBounds.left;
    const topPosRelative = topPos - containerBounds.top;

    tooltip
      .style("left", `${leftPosRelative}px`)
      .style("top", `${topPosRelative}px`);
  })
  .on("mouseleave", function(ev, d) {
    const dev = d.teoVal - d.realVal;
    let mFill, mStroke;

    if (dev === 0) {
      mFill = "rgba(100, 116, 139, 0.55)"; mStroke = "#64748b";
    } else if (dev > 0) {
      mFill = "rgba(22, 163, 74, 0.55)"; mStroke = "#16a34a";
    } else {
      const atraso = -dev;
      if (atraso <= 5) {
        mFill = "rgba(100, 116, 139, 0.55)"; mStroke = "#64748b";
      } else if (atraso <= 30) {
        mFill = "rgba(254, 240, 138, 0.7)"; mStroke = "#f97316";
      } else {
        mFill = "rgba(220, 38, 38, 0.55)"; mStroke = "#dc2626";
      }
    }

    d3.select(this)
      .attr("r", 6)
      .attr("fill", mFill)
      .attr("stroke", mStroke)
      .attr("stroke-width", 1.5);

    tooltip.style("display", "none");
  });
}

function drawAtrasosBarChart(svgSelector, containerSelector, pairedData, granularidadMin) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove(); // Limpiar anterior

  const width = 1260;
  const height = 190;
  const margin = { top: 20, right: 30, bottom: 35, left: 60 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("id", svgSelector.replace("#", ""))
    .attr("width", width)
    .attr("height", height)
    .style("display", "block")
    .style("margin", "0 auto");

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Escalas
  const xScale = d3.scaleLinear().domain([360, 1200]).range([0, innerW]);
  const yScale = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

  // Generar bins de 30 minutos (media hora) de 06:00 (360) a 20:00 (1200)
  const bins = [];
  for (let min = 360; min < 1200; min += 30) {
    const nextMin = min + 30;
    
    // Filtrar puntos en este intervalo
    const pointsInBin = pairedData.filter(d => d.x >= min && d.x < nextMin);
    const totalCount = pointsInBin.length;
    
    // Clasificar atrasos
    const redCount = pointsInBin.filter(d => {
      const atraso = d.realVal - d.teoVal;
      return atraso > 30;
    }).length;

    const yellowCount = pointsInBin.filter(d => {
      const atraso = d.realVal - d.teoVal;
      return atraso > 5 && atraso <= 30;
    }).length;

    const redPercentage = totalCount > 0 ? (redCount / totalCount) * 100 : 0;
    const yellowPercentage = totalCount > 0 ? (yellowCount / totalCount) * 100 : 0;

    bins.push({
      startMin: min,
      endMin: nextMin,
      totalCount,
      redCount,
      yellowCount,
      redPercentage,
      yellowPercentage
    });
  }

  // Cuadrícula y guías
  const ticks = [360, 420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200];
  const yTicks = [0, 25, 50, 75, 100];

  const gridG = g.append("g").attr("class", "grid");
  ticks.forEach(t => {
    gridG.append("line")
      .attr("x1", xScale(t)).attr("x2", xScale(t)).attr("y1", 0).attr("y2", innerH)
      .attr("stroke", "#eee").attr("stroke-dasharray", "2,2");
  });

  yTicks.forEach(val => {
    gridG.append("line")
      .attr("x1", 0).attr("x2", innerW).attr("y1", yScale(val)).attr("y2", yScale(val))
      .attr("stroke", "#eee").attr("stroke-dasharray", "2,2");
  });

  const formatTime = min => {
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  // Ejes
  g.append("g")
    .attr("transform", `translate(0, ${innerH})`)
    .call(d3.axisBottom(xScale).tickValues(ticks).tickFormat(formatTime))
    .style("font-family", "sans-serif").style("font-size", "10px");

  g.append("g")
    .call(d3.axisLeft(yScale).tickValues(yTicks).tickFormat(d => `${d}%`))
    .style("font-family", "sans-serif").style("font-size", "10px");

  // Etiquetas
  svg.append("text")
    .attr("x", margin.left + innerW / 2).attr("y", height - 5)
    .attr("text-anchor", "middle").attr("fill", "#475569")
    .style("font-size", "11px").style("font-weight", "600").style("font-family", "sans-serif")
    .text("Intervalo de Tiempo (Hora de Inicio)");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(margin.top + innerH / 2)).attr("y", 15)
    .attr("text-anchor", "middle").attr("fill", "#475569")
    .style("font-size", "11px").style("font-weight", "600").style("font-family", "sans-serif")
    .text("% Atrasados (>5 min)");

  // Título secundario
  svg.append("text")
    .attr("x", margin.left + innerW / 2).attr("y", 12)
    .attr("text-anchor", "middle").attr("fill", "#334155")
    .style("font-size", "12px").style("font-weight", "bold").style("font-family", "sans-serif")
    .text("Distribución de Atrasos Críticos (>30 min) y Moderados (5-30 min) cada Media Hora");

  // Tooltip flotante global
  let tooltip = d3.select(".tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("display", "none");
  }

  // Dibujar las barras apiladas mediante grupos por bin
  const binGroups = g.selectAll(".bin-group")
    .data(bins)
    .enter()
    .append("g")
    .attr("class", "bin-group")
    .style("cursor", "pointer")
    .on("mouseover", function(ev, d) {
      d3.select(this).selectAll("rect").attr("opacity", 1.0);
      
      const html = `
        <div style="font-family: system-ui, sans-serif; font-size: 11px; line-height: 1.4; color: #1e293b; padding: 4px; min-width: 180px;">
          <div style="font-weight: bold; font-size: 12px; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
            Intervalo: ${formatTime(d.startMin)} - ${formatTime(d.endMin)}
          </div>
          <strong>Total Despachos:</strong> ${d.totalCount}<br/>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 4px 0;"/>
          <span style="display:inline-block; width:8px; height:8px; background:#dc2626; margin-right:4px; border-radius:2px;"></span>
          <strong>Crítico (>30 min):</strong> ${d.redCount} (${d.redPercentage.toFixed(1)}%)<br/>
          <span style="display:inline-block; width:8px; height:8px; background:#f59e0b; margin-right:4px; border-radius:2px;"></span>
          <strong>Moderado (5-30 min):</strong> ${d.yellowCount} (${d.yellowPercentage.toFixed(1)}%)<br/>
          <strong>Total Atrasos (>5 min):</strong> ${(d.redCount + d.yellowCount)} (${(d.redPercentage + d.yellowPercentage).toFixed(1)}%)
        </div>
      `;
      tooltip.html(html).style("display", "block");

      const tooltipNode = tooltip.node();
      const tooltipW = tooltipNode.offsetWidth;
      const tooltipH = tooltipNode.offsetHeight;

      tooltip
        .style("left", `${ev.pageX - tooltipW / 2}px`)
        .style("top", `${ev.pageY - tooltipH - 15}px`)
        .style("transform", "none");
    })
    .on("mousemove", function(ev) {
      const tooltipNode = tooltip.node();
      const tooltipW = tooltipNode.offsetWidth;
      const tooltipH = tooltipNode.offsetHeight;
      tooltip
        .style("left", `${ev.pageX - tooltipW / 2}px`)
        .style("top", `${ev.pageY - tooltipH - 15}px`);
    })
    .on("mouseleave", function() {
      d3.select(this).selectAll("rect").attr("opacity", 0.75);
      tooltip.style("display", "none");
    });

  // 1. Segmento Rojo (Atraso Crítico >30 min) en la parte inferior de la pila
  binGroups.append("rect")
    .attr("x", d => xScale(d.startMin) + 1)
    .attr("y", d => yScale(d.redPercentage))
    .attr("width", d => Math.max(1, xScale(d.endMin) - xScale(d.startMin) - 2))
    .attr("height", d => innerH - yScale(d.redPercentage))
    .attr("fill", "#dc2626")
    .attr("opacity", 0.75)
    .attr("rx", 1);

  // 2. Segmento Amarillo/Naranja (Atraso Moderado 5-30 min) en la parte superior de la pila
  binGroups.append("rect")
    .attr("x", d => xScale(d.startMin) + 1)
    .attr("y", d => yScale(d.redPercentage + d.yellowPercentage))
    .attr("width", d => Math.max(1, xScale(d.endMin) - xScale(d.startMin) - 2))
    .attr("height", d => yScale(d.redPercentage) - yScale(d.redPercentage + d.yellowPercentage))
    .attr("fill", "#f59e0b")
    .attr("stroke", "#d97706")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0.75)
    .attr("rx", 1);
}
