/* ========================= INTERACTION ========================= */

/* ==== DETECCIÓN DE PEDIDO EXTENDIDO ACTIVO =====*/
function findActiveLayer(capasReversa, t, my, scales) {
  const currentGraphView = document.getElementById("filter-viewgraph")?.value || 'camiones';

  for (const capa of capasReversa) {
    if (currentGraphView === 'camiones' && capa.STK && capa.STK.segmentosXY) {
      const seg = capa.STK.segmentosXY.find(s => s.x === t);
      if (seg && seg.v > 0) {
        if (my >= scales.y(seg.y1) && my <= scales.y(seg.y0)) {
          return capa;
        }
      }
    } else if (currentGraphView === 'plantas' && capa.STK_PLANTAS && capa.STK_PLANTAS.bloquesXY) {
      const found = capa.STK_PLANTAS.bloquesXY.some(seg => 
        seg.x === t && seg.v > 0 && my >= scales.y(seg.y1) && my <= scales.y(seg.y0)
      );
      if (found) return capa;
    } else if (currentGraphView === 'colas' && capa.STK_COLAS && capa.STK_COLAS.bloquesXY) {
      const found = capa.STK_COLAS.bloquesXY.some(seg => 
        seg.x === t && seg.v > 0 && my >= scales.y(seg.y1) && my <= scales.y(seg.y0)
      );
      if (found) return capa;
    } else if (currentGraphView === 'colas2' && capa.STK_COLAS2 && capa.STK_COLAS2.bloquesXY) {
      const found = capa.STK_COLAS2.bloquesXY.some(seg => 
        seg.x === t && seg.v > 0 && my >= scales.y(seg.y1) && my <= scales.y(seg.y0)
      );
      if (found) return capa;
    }
  }
  return null;
}

function scrollToGanttRow(pedidoId) {
  let row = d3.select(`#gantt-row-${pedidoId}`);
  // Si no se encuentra (posiblemente en modo despachos), buscar el primer viaje (_v0)
  if (row.empty()) {
    row = d3.select(`#gantt-row-${pedidoId}_v0`);
  }
  if (row.empty()) return;

  const gContainer = document.getElementById("gantt-scroll-container");
  const element = row.node();
  const elementTop = element.getBoundingClientRect().top;
  const containerTop = gContainer.getBoundingClientRect().top;

  gContainer.scrollTo({
    top: gContainer.scrollTop + (elementTop - containerTop) - 20,
    behavior: "smooth"
  });
}

/* ==== HIGHLIGHT DEL ÁREA ACTIVA ====*/
function drawActiveArea({ overlay, layers, getCapas, activa, scales, strokeColor }) {
  const capas = getCapas();
  const idx = capas.indexOf(activa);
  if (idx < 0) return;

  const baseArea = d3
    .select(layers.nodes()[idx])
    .select("path.area");

  const paletteColor = window.pedidoColorsMap?.get(activa.ColorPedido) || strokeColor;

  if (!baseArea.empty()) {
    const main = overlay.selectAll("path.main").data([null]);

    main.enter()
      .append("path")
      .attr("class", "main")
      .merge(main)
      .attr("d", baseArea.attr("d"))
      .attr("fill", paletteColor)
      .attr("fill-opacity", 0.45)
      .attr("stroke", strokeColor)
      .attr("stroke-width", 1.3)
      .attr("stroke-linecap", "round");
  } else {
    overlay.selectAll("path.main").remove();
  }

  const baseRects = d3.select(layers.nodes()[idx]).selectAll("path.carga");
  if (!baseRects.empty()) {
    const activeRects = overlay.selectAll("path.main-carga").data(baseRects.data());
    
    activeRects.enter()
      .append("path")
      .attr("class", "main-carga")
      .merge(activeRects)
      .attr("d", (d, i) => baseRects.nodes()[i].getAttribute("d"))
      .attr("fill", d => d.delayed ? "saddlebrown" : paletteColor)
      .attr("fill-opacity", d => d.delayed ? 0.5 : 0.7)
      .attr("stroke", strokeColor)
      .attr("stroke-width", 1.5);
      
    activeRects.exit().remove();
  } else {
    overlay.selectAll("path.main-carga").remove();
  }

  const baseConexiones = d3.select(layers.nodes()[idx]).selectAll("path.conexion");
  if (!baseConexiones.empty()) {
    const activeConexiones = overlay.selectAll("path.main-conexion").data(baseConexiones.data());
    
    activeConexiones.enter()
      .append("path")
      .attr("class", "main-conexion")
      .merge(activeConexiones)
      .attr("d", (d, i) => baseConexiones.nodes()[i].getAttribute("d"))
      .attr("fill", "none")
      .attr("stroke", "saddlebrown")
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0.5);
      
    activeConexiones.exit().remove();
  } else {
    overlay.selectAll("path.main-conexion").remove();
  }

  /* ==== DESCARGAS – OVERLAY =====*/
  const currentGraphView = document.getElementById("filter-viewgraph")?.value || 'camiones';
  const descargas = (currentGraphView === 'camiones' && activa.STK && activa.STK.descargasXY) ? activa.STK.descargasXY : [];
  const tris = overlay
    .selectAll("path.descarga-activa")
    .data(descargas, d => d.key);

  tris.enter()
    .append("path")
    .attr("class", "descarga-activa")
    .attr("d", d3.symbol().type(d3.symbolTriangle).size(170))
    .merge(tris)
    .attr("transform", d => `
      translate(${scales.x(d.x)}, ${scales.y(d.y)})
      rotate(180)
    `)
    .attr("fill", strokeColor)
    .attr("stroke", "white")
    .attr("stroke-width", 1.5)
    .style("pointer-events", "none");

  tris.exit().remove();
}

/* ==== TOOLTIP ====*/
function renderTooltip(panel, activa, t, granularidad) {
  const p = activa;
  const totalMin = t * granularidad;
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;

  panel.html(`
    <div class="tooltip-card">
      <div class="tooltip-header">
        <div class="pedido">Pedido #${p.id}</div>
        <div><b>${p.CantProgramada} m³</b></div>
        <div class="planta">Planta ${p.Planta}${window.plantasData && window.plantasData[p.Planta] ? ` - ${window.plantasData[p.Planta].nombre}` : ''}</div>
      </div>

      <div class="tooltip-grid">
        <div class="full-row product-row"><span>Producto</span><b>${p.Producto}</b></div>
        <span>Hora requerida cliente</span><b>${p.HoraInicio}</b>
        <span>Tiempo de Carga + Prep</span><b>${p.TiempoCarga} min</b>
        <span>Tiempo de Viaje</span><b>${p.TiempoViaje} min</b>
        <span>Frecuencia / Estadía</span><b>${p.Frecuencia} min</b>

        <div class="cycle-time-box">
          <div class="cycle-time-label">Tiempo de Ciclo</div>
          <div class="cycle-time-value">${(p.TiempoCarga || 0) + (p.Frecuencia || 0) + 2 * (p.TiempoViaje || 0)} min</div>
        </div>

        <span>Viajes / Camiones</span><b>${p.CantCargas} / ${p.MaxCamiones}</b>
        <span>Confirmado</span><b>${p.Confirmado}</b>
        <span>Pedidos de la Obra</span><b>${p.CantPedidosObra}</b>
      </div>

      <div class="tooltip-footer">
        <div><b>Cliente:</b> ${p.Cliente}</div>
        <div><b>Obra:</b> ${p.Obra}</div>
        <div class="muted" style="display: flex; align-items: center;">
          <span>Cursor: ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} &middot; Color: ${p.ColorPedido}</span>
          <span style="flex-grow: 1; margin-left: 10px; margin-right: 10px; height: 12px; background-color: ${window.pedidoColorsMap ? window.pedidoColorsMap.get(p.ColorPedido) : '#ccc'}; border: 1px solid #ccc; border-radius: 2px;"></span>
        </div>
      </div>
    </div>
  `);
}

/* ==== RESET ====*/
function resetInteraction({ cursor, layers, overlay, panel, band }) {
  layers.classed("inactive", false).classed("active", false);
  overlay.selectAll("*").remove();
  if (band) band.clear();
  panel.html(`<div class="tooltip-card"></div>`);
}

/* ========================= INTERACCIÓN PRINCIPAL =========================*/
const lastActivePedido = { current: null };
window.selectedPedido = { current: null };
const selectedPedido = window.selectedPedido;
const lastWasHovering = { current: false };

function setupInteraction(
  svg, g, layers, getCapas, scales, band,
  granularidad, panel, innerW, innerH,
  ganttPanel, metrics, margin, colorPedido
) {
  // Cursors
  const cursor = g.append("line")
    .attr("class", "cursor")
    .attr("y1", 0)
    .attr("y2", innerH)
    .style("opacity", 0);

  function syncCursor(t) {
    if (t === null) {
      cursor.style("opacity", 0);
      envCircle.style("opacity", 0);
      envLabel.style("opacity", 0);
      if (typeof delayLabel !== 'undefined') delayLabel.style("opacity", 0);
      d3.select("#gantt-chart svg line.cursor").style("opacity", 0);
      return;
    }

    const xPos = scales.x(t);
    cursor.attr("x1", xPos).attr("x2", xPos).style("opacity", 1);

    // Dynamic Gantt Cursor
    const ganttSvg = d3.select("#gantt-chart svg");
    if (!ganttSvg.empty()) {
      const ganttG = ganttSvg.select("g.gantt-main");
      if (!ganttG.empty()) {
        let gc = ganttG.select("line.cursor");
        if (gc.empty()) {
          gc = ganttG.append("line")
            .attr("class", "cursor")
            .attr("y1", 0)
            .attr("y2", 2000) // tall enough
            .style("pointer-events", "none");
        }
        gc.attr("x1", xPos).attr("x2", xPos).style("opacity", 1);
      }
    }

    // Always show metadata (trucks amount)
    envCircle
      .attr("cx", xPos)
      .attr("cy", scales.y(metrics.envolvente[t]))
      .style("opacity", 1);

    envLabel
      .attr("x", xPos)
      .attr("y", scales.y(metrics.envolvente[t]))
      .text(metrics.envolvente[t])
      .style("opacity", 1);

    // Etiqueta de Delay (Roja) para vistas Colas o Colas 2
    const delayVal = (metrics.combinedDelayByTime ? metrics.combinedDelayByTime[t] : 0) || 
                     (metrics.delay2ByTime ? metrics.delay2ByTime[t] : 0);

    if (scales.yDelay && delayVal > 0) {
      const delayMin = delayVal * granularidad;
      delayLabel
        .attr("x", xPos)
        .attr("y", scales.yDelay(delayMin))
        .text(`${delayMin}`)
        .style("opacity", 1);
    } else {
      delayLabel.style("opacity", 0);
    }
  }
  window.moveCursorTo = syncCursor;

  // Interacción desde Stack -> Gantt
  function handlePointer(ev) {
    const [mx, my] = d3.pointer(ev);
    const t = Math.round(scales.x.invert(mx));

    syncCursor(t);

    const capasReversa = [...getCapas()].reverse();
    const activa = findActiveLayer(capasReversa, t, my, scales);

    highlightPedido(activa, mx, my, t);

    return activa;
  }

  function highlightPedido(activa, mx, my, t) {
    const focus = activa || selectedPedido.current;

    // 1. Identify state changes
    const isFocusChange = focus !== lastActivePedido.current;
    const isHoverTransition = (!!activa) !== lastWasHovering.current;

    // If nothing changed and we are in a static state (not hovering), skip
    if (!isFocusChange && !isHoverTransition && !activa) {
      return;
    }

    lastActivePedido.current = focus;
    lastWasHovering.current = !!activa;

    if (!focus) {
      // For reset, we don't clear the cursors here if highlightPedido(null) is called from a mousemove that still has t
      // but if it's a mouseleave, we want to clear.
      // We'll manage cursor visibility in the event handlers instead of here to be more precise.
      layers.classed("inactive", false).classed("active", false);
      overlay.selectAll("*").remove();
      if (band) band.clear();
      panel.html(`<div class="tooltip-card"></div>`);

      d3.selectAll(".gantt-row").classed("inactive", false).classed("active", false);
      return;
    }

    // 2. Highlighting (Area & Band)
    if (isFocusChange) {
      const parentId = focus.parentPedidoId || focus.id;

      layers.classed("inactive", d => d.id !== parentId)
        .classed("active", d => d.id === parentId);

      const strokeColor = colorPedido(focus);
      drawActiveArea({ overlay, layers, getCapas, activa: focus, scales, strokeColor });
      band.show(focus, strokeColor);

      // Highlight en Gantt (highlight all voyages of the same parent)
      d3.selectAll(".gantt-row").classed("inactive", d => (d.parentPedidoId || d.id) !== parentId)
        .classed("active", d => (d.parentPedidoId || d.id) === parentId);
    }

    // 3. Tooltip logic (Render & Position)
    let refT = t;
    let refMX = mx;
    let refMY = my;

    // If we don't have coordinates (Gantt hover or selection without hover), fallback to bar center
    if (refT === undefined || refMX === undefined) {
      refT = focus.XG.offset + focus.XG.finrel / 2;
      refMX = scales.x(refT);
      refMY = innerH * 0.5;
    }

    renderTooltip(panel, focus, refT, granularidad);
    positionTooltip(panel, margin, refMX, refMY, innerW, innerH);
  }

  window.selectPedido = (p, fromGantt = false, forceSelect = false) => {
    if (forceSelect && p) {
      selectedPedido.current = p;
    } else {
      selectedPedido.current = (selectedPedido.current?.id === p?.id) ? null : p;
    }
    highlightPedido(null);
    if (selectedPedido.current && !fromGantt) {
      scrollToGanttRow(selectedPedido.current.id);
    }
  };

  // Interacción desde Gantt -> Stack
  window.highlightFromGantt = (activa) => {
    // When highlighting from Gantt (hover on row), we don't necessarily update the cursor line position
    // unless we want it to snap to the row's time. 
    // But the user asked for the dashed line to continue in Gantt following the mouse.
    highlightPedido(activa);
  };

  const overlay = g.append("g")
    .attr("class", "overlay");

  const interactionRect = g.append("rect")
    .attr("width", innerW)
    .attr("height", innerH)
    .style("fill", "none")
    .style("pointer-events", "all");

  const envG = g.append("g")
    .attr("class", "envolvente-cursor")
    .style("pointer-events", "none");

  const envCircle = envG.append("circle")
    .attr("r", 3)
    .attr("fill", "darkblue")
    .style("opacity", 0);

  const envLabel = envG.append("text")
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", "darkblue")
    .attr("dy", "-6")
    .style("opacity", 0);

  const delayLabel = envG.append("text")
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", "red")
    .attr("dy", "-6")
    .style("opacity", 0);

  interactionRect
    .on("mousemove", ev => {
      handlePointer(ev);
    })
    .on("click", ev => {
      const p = handlePointer(ev);
      window.selectPedido(p);

      // Synchronize with CodObra filter panel
      const codObraInput = document.getElementById("filter-codobra");
      if (codObraInput) {
        if (p && p.CodObra) {
          codObraInput.value = p.Obra ? `${p.CodObra} - ${p.Obra}` : String(p.CodObra);
        } else {
          // Clear if clicked background or order with no CodObra
          codObraInput.value = "";
        }
        codObraInput.dispatchEvent(new Event("input"));
      }
    })
    .on("mouseleave", () => {
      highlightPedido(null);
      syncCursor(null);
    });

  // Listener en el SVG del Gantt para que no se bloquee con las barras
  d3.select("#gantt-chart").on("mousemove", ev => {
    const [mx] = d3.pointer(ev);
    // Ajustar por el margen izquierdo del grupo gantt-main
    const t = Math.round(scales.x.invert(mx - margin.left));
    // Solo si el mouse está dentro del rango horizontal del gráfico
    if (t >= scales.x.domain()[0] && t <= scales.x.domain()[1]) {
      syncCursor(t);
    } else {
      syncCursor(null);
    }
  }).on("mouseleave", () => {
    syncCursor(null);
  });

  // Re-apply selection if it exists (correspondence between views)
  if (window.selectedPedido.current) {
    const parentId = window.selectedPedido.current.id;
    const freshPedido = getCapas().find(p => p.id === parentId);
    if (freshPedido) {
      window.selectedPedido.current = freshPedido;
      lastActivePedido.current = null; // Force refresh
      highlightPedido(null);
    }
  }
}

/* ==== BANDA INFERIOR ==== */
function drawBand(g, scales, innerH, granularidad) {
  const bandHeight = 8;
  const bandY = innerH + 18;
  const labelOffset = 12;

  const bandG = g.append("g")
    .attr("class", "pedido-band")
    .attr("transform", `translate(0,${bandY})`)
    .style("pointer-events", "none");

  const bgG = bandG.append("g").attr("class", "band-bg");
  const fgG = bandG.append("g").attr("class", "band-fg");

  const labelsG = bandG.append("g")
    .attr("class", "band-labels");

  return {
    g: fgG,
    height: bandHeight,
    show(pedido, color) {
      const ext = pedido.XG;
      if (!ext) {
        this.clear();
        return;
      }

      const { offset, finrel } = ext;

      bgG.selectAll("rect")
        .data([pedido])
        .join("rect")
        .attr("x", scales.x(offset))
        .attr("width", scales.x(offset + finrel) - scales.x(offset))
        .attr("y", 0)
        .attr("height", bandHeight)
        .attr("rx", 2)
        .attr("fill", color)
        .attr("opacity", 0.8);

      const descargasXY = pedido.descargasBandXY || [];
      const tris = fgG
        .selectAll("path.descarga-activa")
        .data(descargasXY, d => d.key);

      tris.enter()
        .append("path")
        .attr("class", "descarga-activa")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(40))
        .merge(tris)
        .attr("transform", d => `translate(${scales.x(d.x)}, ${bandHeight * 0.75})`)
        .attr("fill", "white")
        .style("pointer-events", "none");

      tris.exit().remove();

      const labels = [
        { x: offset, anchor: "start" },
        { x: offset + finrel, anchor: "end" }
      ];

      labelsG.selectAll("text.band-label")
        .data(labels)
        .join("text")
        .attr("class", "band-label")
        .attr("x", d => scales.x(d.x))
        .attr("y", bandHeight + labelOffset)
        .attr("text-anchor", d => d.anchor)
        .attr("fill", "#666")
        .attr("font-size", 10)
        .text(d => slotToHHMM(d.x, granularidad));
    },
    clear() {
      bgG.selectAll("*").remove();
      fgG.selectAll("*").remove();
      labelsG.selectAll("*").remove();
    }
  };
}
