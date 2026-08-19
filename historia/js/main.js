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
    selectedTicketsDate: '',
    selectedCaptura: '',
    selectedPlanta: '',

    // Colecciones de datos
    capturaDates: [],      // Todos los sufijos disponibles en index.json
    orderDates: [],        // Todas las fechas únicas de Pedidos a nivel global
    ticketDates: [],       // Todas las fechas únicas de Tickets a nivel global
    availableCapturas: [], // Sufijos válidos para la fecha seleccionada y modo activo
    plantasOptions: [],
    activePlants: [],
    isSplit: false,
    
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
        if (this.orderDates.length > 0) this.selectedPedidosDate = this.orderDates[0];
        if (this.ticketDates.length > 0) this.selectedTicketsDate = this.ticketDates[0];

        // Inicializar en modo pedidos
        await this.selectPedidosMode();

      } catch (err) {
        console.error('Error al inicializar la aplicación:', err);
        this.loading = false;
      }
    },

    async selectPedidosMode() {
      this.activeMode = 'pedidos';
      
      // Filtrar capturas disponibles que contienen la fecha de pedidos elegida
      const targetDate = this.selectedPedidosDate;
      this.availableCapturas = this.capturaDates.filter(suffix => {
        const item = this.rawCapturas[suffix];
        return item && item.orderDates.includes(targetDate);
      });

      // Seleccionar captura más reciente por defecto
      if (this.availableCapturas.length > 0) {
        if (!this.availableCapturas.includes(this.selectedCaptura)) {
          this.selectedCaptura = this.availableCapturas[0];
        }
      } else {
        this.selectedCaptura = '';
      }

      await this.filtrarYRedibujar();
    },

    async selectTicketsMode() {
      this.activeMode = 'tickets';
      
      // Filtrar capturas disponibles que contienen la fecha de tickets elegida
      const targetDate = this.selectedTicketsDate;
      this.availableCapturas = this.capturaDates.filter(suffix => {
        const item = this.rawCapturas[suffix];
        return item && item.ticketDates.includes(targetDate);
      });

      // Seleccionar captura más reciente por defecto
      if (this.availableCapturas.length > 0) {
        if (!this.availableCapturas.includes(this.selectedCaptura)) {
          this.selectedCaptura = this.availableCapturas[0];
        }
      } else {
        this.selectedCaptura = '';
      }

      await this.filtrarYRedibujar();
    },

    async cambiarCaptura() {
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
      
      const date = this.activeMode === 'pedidos' ? this.selectedPedidosDate : this.selectedTicketsDate;
      const suffix = this.selectedCaptura;

      if (!date || !suffix || !this.rawCapturas[suffix]) {
        this.fullPedidos = [];
        this.metrics = { volumenT: 0, volConfirmado: 0 };
        this.isSplit = false;
        this.loading = false;
        return;
      }

      try {
        const cacheItem = this.rawCapturas[suffix];
        const pedidosData = cacheItem.pedidosRaw;
        window.ticketsData = cacheItem.ticketsRaw.Ticket || {};

        const granularidadMin = 5;

        // Procesar y enriquecer la captura seleccionada en memoria
        this.fullPedidos = Object.entries(pedidosData.pedidos || {})
          .filter(([id]) => id !== "dummy")
          .map(([id, p]) => {
            const pedidoNeg = extendPedidoNegocio(p, id, window.plantasData);
            const XG = extendPedidoXG(pedidoNeg, granularidadMin);
            const MaxCamiones = XG.demanda.length ? Math.max(...XG.demanda) : 0;
            const result = { ...pedidoNeg, id, XG, MaxCamiones };
            
            result.despachos = calculateDespachosForPedido(result, granularidadMin);

            const orderTickets = Object.entries(window.ticketsData)
              .filter(([tId, t]) => String(t.Pedido) === id)
              .map(([tId, t]) => ({ ...t, ticketId: tId }));
            
            result.realDespachos = calculateRealDespachosForPedido(result, orderTickets, granularidadMin);
            result.CantRealDespachos = result.realDespachos.filter(d => !d.isAnulado).length;
            
            return result;
          });

        enrichPedidosForDate(this.fullPedidos);

        // Actualizar window.grupos
        window.grupos = {};
        Object.entries(window.plantasData).forEach(([code, p]) => {
          const g = p.grupo_despacho;
          if (g) {
            if (!window.grupos[g]) window.grupos[g] = [];
            window.grupos[g].push(code);
          }
        });

        // Actualizar plantas dropdown
        this.updatePlantasOptions(date);

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

        const baseOrders = this.fullPedidos.filter(p => p["Fecha Pedido"] === date && permitidas.includes(p.Planta));

        // Calcular volumenes
        this.metrics = {
          volumenT: Math.round(d3.sum(baseOrders, p => p.CantProgramada || 0)),
          volConfirmado: Math.round(d3.sum(baseOrders.filter(p => p.Confirmado === "SI"), p => p.CantProgramada || 0))
        };

        const activePlantsWithData = permitidas.filter(pCode => 
          baseOrders.some(p => p.Planta === pCode)
        );

        const isGroup = this.selectedPlanta && this.selectedPlanta.startsWith("Grupo:");
        if (isGroup && activePlantsWithData.length > 1) {
          this.isSplit = true;
          this.activePlants = activePlantsWithData;
        } else {
          this.isSplit = false;
          this.activePlants = [];
        }

        // Redibujar D3
        this.$nextTick(() => {
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

              const stackResult = buildStack(dataToStack);
              drawTruckChart(`#chart-${pCode}`, `#chart-container-${pCode}`, stackResult, dataToStack, granularidadMin, colorTheme);
            });
          } else {
            let dataToStack = [];
            if (this.activeMode === 'pedidos') {
              dataToStack = baseOrders.map(p => ({ ...p }));
            } else {
              dataToStack = baseOrders.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
            }

            const stackResult = buildStack(dataToStack);
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
