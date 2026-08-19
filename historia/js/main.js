async function fetchSafeJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  let text = await response.text();
  // Limpiar decimales mal formados como .8 -> 0.8
  text = text.replace(/([:,\[\s])\.(\d+)/g, '$10.$2');
  return JSON.parse(text);
}

document.addEventListener('alpine:init', () => {
  Alpine.data('appState', () => ({
    loading: true,
    activeMode: 'pedidos', // 'pedidos' o 'tickets'
    
    // Selectores
    selectedPedidosDate: '',
    selectedPlanta: '',

    // Colecciones de datos
    capturaDates: [],      // Todos los sufijos disponibles en index.json
    orderDates: [],        // Todas las fechas únicas de Pedidos a nivel global
    ticketDates: [],       // Todas las fechas únicas de Tickets a nivel global
    activeSuffixes: [],    // Los 4 sufijos (Día y 3 días anteriores)
    plantasOptions: [],
    
    // Memoria caché de datos en bruto cargados al inicio
    rawCapturas: {}, // { suffix: { pedidosRaw, ticketsRaw, orderDates, ticketDates } }
    
    fullPedidos: [],
    metrics: {
      volumenT: 0,
      volConfirmado: 0
    },

    formatToDddDdMmm(dateStr) {
      if (!dateStr) return '';
      const dateVal = String(dateStr);
      let y, m, d;
      if (dateVal.length === 8) { // YYYYMMDD
        y = Number(dateVal.slice(0, 4));
        m = Number(dateVal.slice(4, 6)) - 1;
        d = Number(dateVal.slice(6, 8));
      } else if (dateVal.length === 6) { // YYMMDD
        y = 2000 + Number(dateVal.slice(0, 2));
        m = Number(dateVal.slice(2, 4)) - 1;
        d = Number(dateVal.slice(4, 6));
      } else {
        return dateVal;
      }
      const date = new Date(y, m, d);
      const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      
      const ddd = dias[date.getDay()] || '';
      const dd = String(d).padStart(2, "0");
      const mmm = meses[date.getMonth()] || '';
      
      return `${ddd} ${dd} ${mmm}`;
    },

    getPlantName(pCode) {
      if (window.plantasData && window.plantasData[pCode]) {
        return window.plantasData[pCode].nombre || pCode;
      }
      return pCode;
    },

    hasDataForSuffix(suffix) {
      return !!this.rawCapturas[suffix];
    },

    getLegendLineStyle(index) {
      const isBlue = this.activeMode === 'pedidos';
      const colors = isBlue 
        ? ["#0066cc", "#3b82f6", "#60a5fa", "#93c5fd"]
        : ["#2e7d32", "#4caf50", "#81c784", "#a5d6a7"];
      
      const color = colors[index] || "#999";
      const borderStyle = index === 2 ? "dashed" : index === 3 ? "dotted" : "solid";
      
      return `display: inline-block; width: 25px; height: 0; border-top: 2px ${borderStyle} ${color}; vertical-align: middle;`;
    },

    getPrecedingSuffixes(dateStr) {
      if (!dateStr) return [];
      const suffixes = [];
      for (let i = 0; i < 4; i++) {
        const y = Number(dateStr.slice(0, 4));
        const m = Number(dateStr.slice(4, 6)) - 1;
        const d = Number(dateStr.slice(6, 8));
        const date = new Date(y, m, d);
        date.setDate(date.getDate() - i);
        
        const yy = String(date.getFullYear()).slice(2, 4);
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        suffixes.push(`${yy}${mm}${dd}`);
      }
      return suffixes;
    },

    async init() {
      this.loading = true;
      try {
        // 1. Cargar configuración de plantas compartida
        window.plantasData = await fetchSafeJson(`../data/plantas.json?v=${Date.now()}`).catch(() => ({}));

        // 2. Cargar el index de capturas disponibles
        const index = await fetchSafeJson(`data/index.json?v=${Date.now()}`);
        this.capturaDates = index.sort().reverse();

        if (this.capturaDates.length === 0) {
          this.loading = false;
          return;
        }

        // 3. Cargar TODOS los archivos de Pedidos y Tickets en paralelo
        const loadPromises = this.capturaDates.map(async (suffix) => {
          try {
            const [pedRaw, tickRaw] = await Promise.all([
              fetchSafeJson(`data/Pedidos_${suffix}.json?v=${Date.now()}`).catch(() => ({ pedidos: {} })),
              fetchSafeJson(`data/Tickets_${suffix}.json?v=${Date.now()}`).catch(() => ({ Ticket: {} }))
            ]);
            
            // Extraer fechas únicas para esta captura
            const pDates = [...new Set(
              Object.values(pedRaw.pedidos || {})
                .filter(p => p !== "dummy" && p["Fecha Pedido"])
                .map(p => String(p["Fecha Pedido"]))
            )];

            // Extraer fechas únicas de tickets para esta captura
            const tDatesSet = new Set();
            Object.values(tickRaw.Ticket || {}).forEach(t => {
              const ped = pedRaw.pedidos && pedRaw.pedidos[t.Pedido];
              if (ped && ped["Fecha Pedido"]) {
                tDatesSet.add(String(ped["Fecha Pedido"]));
              } else {
                tDatesSet.add(`20${suffix}`);
              }
            });

            return {
              suffix,
              pedidosRaw: pedRaw,
              ticketsRaw: tickRaw,
              orderDates: pDates,
              ticketDates: [...tDatesSet]
            };
          } catch (err) {
            console.error(`Error al cargar datos del sufijo ${suffix}:`, err);
            return null;
          }
        });

        const loaded = await Promise.all(loadPromises);
        
        // Almacenar en caché y extraer colecciones globales
        const globalOrderDatesSet = new Set();
        const globalTicketDatesSet = new Set();

        loaded.forEach(item => {
          if (item) {
            this.rawCapturas[item.suffix] = item;
            item.orderDates.forEach(d => globalOrderDatesSet.add(d));
            item.ticketDates.forEach(d => globalTicketDatesSet.add(d));
          }
        });

        this.orderDates = [...globalOrderDatesSet].sort().reverse();
        this.ticketDates = [...globalTicketDatesSet].sort().reverse();

        // Valores por defecto
        if (this.orderDates.length > 0) {
          this.selectedPedidosDate = this.orderDates[0];
        }

        // Inicializar en modo pedidos
        this.activeMode = 'pedidos';
        this.activeSuffixes = this.getPrecedingSuffixes(this.selectedPedidosDate);
        await this.filtrarYRedibujar();

      } catch (err) {
        console.error('Error al inicializar la aplicación:', err);
        this.loading = false;
      }
    },

    async cambiarDia() {
      this.activeSuffixes = this.getPrecedingSuffixes(this.selectedPedidosDate);
      await this.filtrarYRedibujar();
    },

    async cambiarModo() {
      const targetDate = this.selectedPedidosDate;
      const validDates = this.activeMode === 'pedidos' ? this.orderDates : this.ticketDates;
      
      if (!validDates.includes(targetDate)) {
        this.selectedPedidosDate = validDates[0] || '';
      }
      
      this.activeSuffixes = this.getPrecedingSuffixes(this.selectedPedidosDate);
      await this.filtrarYRedibujar();
    },

    updatePlantasOptions(date) {
      if (!date) return;
      
      const plantVolumes = {};
      this.fullPedidos
        .filter(p => p["Fecha Pedido"] === date)
        .forEach(p => {
          const vol = p.CantProgramada || 0;
          plantVolumes[p.Planta] = (plantVolumes[p.Planta] || 0) + vol;
        });

      const activePlants = Object.keys(plantVolumes).sort();
      const groups = new Set();
      activePlants.forEach(pCode => {
        const g = window.plantasData[pCode]?.grupo_despacho;
        if (g) groups.add(g);
      });

      const options = [];
      
      Array.from(groups).sort().forEach(g => {
        const gPlants = window.grupos[g] || [];
        const activeGPlants = gPlants.filter(p => activePlants.includes(p)).sort();
        const gVol = d3.sum(activeGPlants, p => plantVolumes[p] || 0);

        options.push({ id: `Grupo:${g}`, label: `Grupo ${g} (${Math.round(gVol)} m³)` });
        
        activeGPlants.forEach(pCode => {
          const pVol = plantVolumes[pCode] || 0;
          const pName = this.getPlantName(pCode);
          options.push({ id: `Planta:${pCode}`, label: `    ${pName} (${Math.round(pVol)} m³)` });
        });
      });

      activePlants.forEach(pCode => {
        const g = window.plantasData[pCode]?.grupo_despacho;
        if (!g) {
          const pVol = plantVolumes[pCode] || 0;
          const pName = this.getPlantName(pCode);
          options.push({ id: `Planta:${pCode}`, label: `${pName} (${Math.round(pVol)} m³)` });
        }
      });

      this.plantasOptions = options;

      if (options.length > 0) {
        const exists = options.some(o => o.id === this.selectedPlanta);
        if (!exists) {
          this.selectedPlanta = options[0].id;
        }
      } else {
        this.selectedPlanta = '';
      }
    },

    async filtrarYRedibujar() {
      this.loading = true;
      
      const date = this.selectedPedidosDate;
      if (!date) {
        this.metrics = { volumenT: 0, volConfirmado: 0 };
        this.loading = false;
        return;
      }

      try {
        const granularidadMin = 5;
        const resultsBySuffix = {};

        this.activeSuffixes.forEach(suffix => {
          const cacheItem = this.rawCapturas[suffix];
          if (!cacheItem) return;

          const pedidosData = cacheItem.pedidosRaw;
          const localTicketsData = cacheItem.ticketsRaw.Ticket || {};

          // Procesar y enriquecer la captura seleccionada en memoria
          const fullPedidos = Object.entries(pedidosData.pedidos || {})
            .filter(([id]) => id !== "dummy")
            .map(([id, p]) => {
              const pedidoNeg = extendPedidoNegocio(p, id, window.plantasData);
              const XG = extendPedidoXG(pedidoNeg, granularidadMin);
              const MaxCamiones = XG.demanda.length ? Math.max(...XG.demanda) : 0;
              const result = { ...pedidoNeg, id, XG, MaxCamiones };
              
              result.despachos = calculateDespachosForPedido(result, granularidadMin);

              const orderTickets = Object.entries(localTicketsData)
                .filter(([tId, t]) => String(t.Pedido) === id)
                .map(([tId, t]) => ({ ...t, ticketId: tId }));
              
              result.realDespachos = calculateRealDespachosForPedido(result, orderTickets, granularidadMin);
              result.CantRealDespachos = result.realDespachos.filter(d => !d.isAnulado).length;
              
              return result;
            });

          enrichPedidosForDate(fullPedidos);

          // Actualizar window.grupos
          window.grupos = {};
          Object.entries(window.plantasData).forEach(([code, p]) => {
            const g = p.grupo_despacho;
            if (g) {
              if (!window.grupos[g]) window.grupos[g] = [];
              window.grupos[g].push(code);
            }
          });

          // Obtener plantas permitidas
          let permitidas = [];
          if (this.selectedPlanta) {
            const filterParts = this.selectedPlanta.split(':');
            const filterType = filterParts[0];
            const filterVal = filterParts[1];
            if (filterType === 'Grupo') {
              permitidas = window.grupos[filterVal] || [];
            } else {
              permitidas = [filterVal];
            }
          }

          const baseOrders = fullPedidos.filter(p => p["Fecha Pedido"] === date && permitidas.includes(p.Planta));

          let dataToStack = [];
          if (this.activeMode === 'pedidos') {
            dataToStack = baseOrders.map(p => ({ ...p }));
          } else {
            dataToStack = baseOrders.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
          }

          const stackResult = buildStack(dataToStack);

          resultsBySuffix[suffix] = {
            stackResult,
            dataToStack,
            volumenT: d3.sum(baseOrders, p => p.CantProgramada || 0),
            volConfirmado: d3.sum(baseOrders.filter(p => p.Confirmado === "SI"), p => p.CantProgramada || 0)
          };
        });

        // 2. Calcular la escala Y global (máximo global de ocupación de camiones)
        const allOcupaciones = Object.values(resultsBySuffix).map(r => r.stackResult.ocupacionMax || 0);
        const globalYMax = d3.max(allOcupaciones) || 5;

        // 3. Calcular métricas para el gráfico principal (el del mismo día de despacho, index 0, si existe)
        const primarySuffix = this.activeSuffixes[0];
        const primaryResult = resultsBySuffix[primarySuffix];
        if (primaryResult) {
          this.metrics = {
            volumenT: Math.round(primaryResult.volumenT),
            volConfirmado: Math.round(primaryResult.volConfirmado)
          };
        } else {
          const firstAvailable = Object.values(resultsBySuffix)[0];
          if (firstAvailable) {
            this.metrics = {
              volumenT: Math.round(firstAvailable.volumenT),
              volConfirmado: Math.round(firstAvailable.volConfirmado)
            };
          } else {
            this.metrics = { volumenT: 0, volConfirmado: 0 };
          }
        }

        // 4. Actualizar las opciones del combo box de plantas usando los datos de la captura principal (u otra disponible)
        const representativeSuffix = this.activeSuffixes.find(s => resultsBySuffix[s]);
        if (representativeSuffix) {
          const cacheItem = this.rawCapturas[representativeSuffix];
          const pedidosData = cacheItem.pedidosRaw;
          this.fullPedidos = Object.entries(pedidosData.pedidos || {})
            .filter(([id]) => id !== "dummy")
            .map(([id, p]) => ({ ...p, id, Planta: p.Planta || '', CantProgramada: p.CantProgramada || 0, "Fecha Pedido": p["Fecha Pedido"] }));
          this.updatePlantasOptions(date);
        }

        // 5. Redibujar D3 en el único gráfico global superpuesto
        this.$nextTick(() => {
          const colorTheme = this.activeMode === 'pedidos' ? 'blue' : 'green';
          const formattedLabels = this.activeSuffixes.map((suffix, index) => {
            const formatted = this.formatToDddDdMmm(suffix);
            const label = index === 0 ? " (Mismo día)" : ` (-${index} día/s)`;
            const disp = this.hasDataForSuffix(suffix) ? "" : " (No disp.)";
            return `${formatted}${label}${disp}`;
          });
          drawMultiTruckChart("#chart-global", "#chart-container-global", resultsBySuffix, this.activeSuffixes, formattedLabels, granularidadMin, colorTheme, globalYMax);
        });

        this.loading = false;
      } catch (err) {
        console.error('Error al filtrar y renderizar:', err);
        this.loading = false;
      }
    }
  }));
});
