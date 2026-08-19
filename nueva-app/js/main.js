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
    selectedCaptura: '',
    selectedPedidosDate: '',
    selectedTicketsDate: '',
    selectedPlanta: '',

    // Colecciones de datos
    capturaDates: [],
    orderDates: [],
    ticketDates: [],
    plantasOptions: [],
    activePlants: [],
    isSplit: false,
    
    fullPedidos: [],
    metrics: {
      volumenT: 0,
      volConfirmado: 0
    },

    // Formateadores
    formatToDddDdMmm(dateStr) {
      if (!dateStr) return '';
      let y, m, d;
      if (dateStr.length === 8) { // YYYYMMDD
        y = Number(dateStr.slice(0, 4));
        m = Number(dateStr.slice(4, 6)) - 1;
        d = Number(dateStr.slice(6, 8));
      } else if (dateStr.length === 6) { // YYMMDD
        y = 2000 + Number(dateStr.slice(0, 2));
        m = Number(dateStr.slice(2, 4)) - 1;
        d = Number(dateStr.slice(4, 6));
      } else {
        return dateStr;
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

    async init() {
      this.loading = true;
      try {
        // 1. Cargar el index de archivos json disponibles
        const index = await fetchSafeJson(`data/index.json?v=${Date.now()}`);
        this.capturaDates = index.sort().reverse(); // De más reciente a más antiguo
        
        if (this.capturaDates.length > 0) {
          this.selectedCaptura = this.capturaDates[0];
          await this.cambiarCaptura();
        } else {
          this.loading = false;
        }
      } catch (err) {
        console.error('Error al cargar index.json:', err);
        this.loading = false;
      }
    },

    async cambiarCaptura() {
      this.loading = true;
      try {
        // 2. Cargar Pedidos, Tickets y Plantas correspondientes
        const suffix = this.selectedCaptura;
        const [pedidosData, ticketsData, plantasData] = await Promise.all([
          fetchSafeJson(`data/Pedidos_${suffix}.json?v=${Date.now()}`).catch(err => { console.error("Error cargando Pedidos:", err); return { pedidos: {} }; }),
          fetchSafeJson(`data/Tickets_${suffix}.json?v=${Date.now()}`).catch(err => { console.error("Error cargando Tickets:", err); return { Ticket: {} }; }),
          fetchSafeJson(`../data/plantas.json?v=${Date.now()}`).catch(err => { console.error("Error cargando Plantas:", err); return {}; })
        ]);

        console.log("--- Depuración de carga ---");
        console.log("Sufijo captura:", suffix);
        console.log("Pedidos cargados:", Object.keys(pedidosData.pedidos || {}).length);
        console.log("Tickets cargados:", Object.keys(ticketsData.Ticket || {}).length);
        console.log("Plantas cargadas:", Object.keys(plantasData).length);

        window.ticketsData = ticketsData.Ticket || {};
        window.plantasData = plantasData;

        // Configuración de granularidad por defecto
        const granularidadMin = 5;

        // 3. Procesar y enriquecer Pedidos con la lógica core de dataUtils.js
        this.fullPedidos = Object.entries(pedidosData.pedidos || {})
          .filter(([id]) => id !== "dummy")
          .map(([id, p]) => {
            const pedidoNeg = extendPedidoNegocio(p, id, plantasData);
            const XG = extendPedidoXG(pedidoNeg, granularidadMin);
            const MaxCamiones = XG.demanda.length ? Math.max(...XG.demanda) : 0;
            const result = { ...pedidoNeg, id, XG, MaxCamiones };
            
            // Despachos teóricos
            result.despachos = calculateDespachosForPedido(result, granularidadMin);

            // Despachos reales
            const orderTickets = Object.entries(window.ticketsData)
              .filter(([tId, t]) => String(t.Pedido) === id)
              .map(([tId, t]) => ({ ...t, ticketId: tId }));
            
            result.realDespachos = calculateRealDespachosForPedido(result, orderTickets, granularidadMin);
            result.CantRealDespachos = result.realDespachos.filter(d => !d.isAnulado).length;
            
            return result;
          });

        // Enriquecimiento para la fecha
        enrichPedidosForDate(this.fullPedidos);

        // Agrupar plantas por grupo de despacho (window.grupos)
        window.grupos = {};
        Object.entries(plantasData).forEach(([code, p]) => {
          const g = p.grupo_despacho;
          if (g) {
            if (!window.grupos[g]) window.grupos[g] = [];
            window.grupos[g].push(code);
          }
        });

        // 4. Extraer fechas únicas de Pedidos
        this.orderDates = [...new Set(this.fullPedidos.map(p => p["Fecha Pedido"]))].sort().reverse();
        console.log("Fechas de Pedidos extraídas:", this.orderDates);

        // 5. Extraer fechas únicas de Tickets/Despachos
        const ticketDatesSet = new Set();
        Object.values(window.ticketsData).forEach(t => {
          const ped = this.fullPedidos.find(p => String(p.id) === String(t.Pedido));
          if (ped && ped["Fecha Pedido"]) {
            ticketDatesSet.add(ped["Fecha Pedido"]);
          } else {
            // Fallback: usar fecha de captura
            const captureYYYYMMDD = `20${suffix.slice(0,2)}${suffix.slice(2,4)}${suffix.slice(4,6)}`;
            ticketDatesSet.add(captureYYYYMMDD);
          }
        });
        this.ticketDates = [...ticketDatesSet].sort().reverse();
        console.log("Fechas de Tickets extraídas:", this.ticketDates);

        // Definir valores por defecto para fechas
        const expectedDate = `20${suffix.slice(0,2)}${suffix.slice(2,4)}${suffix.slice(4,6)}`;
        
        this.selectedPedidosDate = this.orderDates.includes(expectedDate) 
          ? expectedDate 
          : (this.orderDates[0] || '');

        this.selectedTicketsDate = this.ticketDates.includes(expectedDate) 
          ? expectedDate 
          : (this.ticketDates[0] || '');

        // Seleccionar modo por defecto
        if (this.activeMode === 'pedidos') {
          await this.selectPedidosMode();
        } else {
          await this.selectTicketsMode();
        }
      } catch (err) {
        console.error('Error al procesar los datos de captura:', err);
        this.loading = false;
      }
    },

    async selectPedidosMode() {
      this.activeMode = 'pedidos';
      if (!this.selectedPedidosDate && this.orderDates.length > 0) {
        this.selectedPedidosDate = this.orderDates[0];
      }
      this.updatePlantasOptions(this.selectedPedidosDate);
      await this.filtrarYRedibujar();
    },

    async selectTicketsMode() {
      this.activeMode = 'tickets';
      if (!this.selectedTicketsDate && this.ticketDates.length > 0) {
        this.selectedTicketsDate = this.ticketDates[0];
      }
      this.updatePlantasOptions(this.selectedTicketsDate);
      await this.filtrarYRedibujar();
    },

    updatePlantasOptions(date) {
      if (!date) return;
      
      // Calcular volumen por planta para esta fecha
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
      
      // Agregar Grupos y sus Plantas
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

      // Plantas sin grupo
      activePlants.forEach(pCode => {
        const g = window.plantasData[pCode]?.grupo_despacho;
        if (!g) {
          const pVol = plantVolumes[pCode] || 0;
          const pName = this.getPlantName(pCode);
          options.push({ id: `Planta:${pCode}`, label: `${pName} (${Math.round(pVol)} m³)` });
        }
      });

      this.plantasOptions = options;

      // Seleccionar opción por defecto si la actual no es válida
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
      await new Promise(r => setTimeout(r, 100)); // animación de carga

      try {
        const date = this.activeMode === 'pedidos' ? this.selectedPedidosDate : this.selectedTicketsDate;
        if (!date || !this.selectedPlanta) {
          this.loading = false;
          return;
        }

        // Obtener plantas permitidas
        let permitidas = [];
        const filterParts = this.selectedPlanta.split(':');
        const filterType = filterParts[0];
        const filterVal = filterParts[1];

        if (filterType === 'Grupo') {
          permitidas = window.grupos[filterVal] || [];
        } else {
          permitidas = [filterVal];
        }

        // Filtrar pedidos base
        const baseOrders = this.fullPedidos.filter(p => p["Fecha Pedido"] === date && permitidas.includes(p.Planta));

        // Calcular volumen total y volumen confirmado en base a los pedidos
        this.metrics = {
          volumenT: Math.round(d3.sum(baseOrders, p => p.CantProgramada || 0)),
          volConfirmado: Math.round(d3.sum(baseOrders.filter(p => p.Confirmado === "SI"), p => p.CantProgramada || 0))
        };

        // Identificar si debemos usar Split (Grupo con más de 1 planta con pedidos/tickets activos)
        const activePlantsWithData = permitidas.filter(pCode => 
          baseOrders.some(p => p.Planta === pCode)
        );

        if (filterType === 'Grupo' && activePlantsWithData.length > 1) {
          this.isSplit = true;
          this.activePlants = activePlantsWithData;
        } else {
          this.isSplit = false;
          this.activePlants = [];
        }

        // Dibujar en el próximo ciclo de render de Alpine
        this.$nextTick(() => {
          const granularidadMin = 5;
          const colorTheme = this.activeMode === 'pedidos' ? 'blue' : 'green';

          if (this.isSplit) {
            this.activePlants.forEach(pCode => {
              const plantOrders = baseOrders.filter(p => p.Planta === pCode);
              
              let dataToStack = [];
              if (this.activeMode === 'pedidos') {
                dataToStack = plantOrders.map(p => ({ ...p }));
              } else {
                dataToStack = plantOrders.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
              }

              // Calcular la simulación de camiones
              const stackResult = buildStack(dataToStack);

              // Dibujar gráfico individual por planta
              drawTruckChart(`#chart-${pCode}`, `#chart-container-${pCode}`, stackResult, dataToStack, granularidadMin, colorTheme);
            });
          } else {
            let dataToStack = [];
            if (this.activeMode === 'pedidos') {
              dataToStack = baseOrders.map(p => ({ ...p }));
            } else {
              dataToStack = baseOrders.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
            }

            // Calcular simulación global
            const stackResult = buildStack(dataToStack);

            // Dibujar gráfico global
            drawTruckChart("#chart-global", "#chart-container-global", stackResult, dataToStack, granularidadMin, colorTheme);
          }
        });

        this.loading = false;
      } catch (err) {
        console.error('Error al filtrar y renderizar:', err);
        this.loading = false;
      }
    }
  }));
});
