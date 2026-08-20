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
    activeMode: localStorage.getItem("historiaFilterModo") || 'pedidos', // 'pedidos', 'tickets', o 'anulaciones'
    
    // Selectores
    selectedPedidosDate: '',
    selectedPlanta: localStorage.getItem("filterPlantaGrupo") || '',

    // Colecciones de datos
    capturaDates: [],      // Todos los sufijos disponibles en index.json
    orderDates: [],        // Todas las fechas únicas de Pedidos a nivel global
    ticketDates: [],       // Todas las fechas únicas de Tickets a nivel global
    activeSuffixes: [],    // Los 4 sufijos (Día y 3 días anteriores)
    plantasOptions: [],
    
    // Memoria caché de datos en bruto cargados bajo demanda
    rawCapturas: {}, // { suffix: { pedidosRaw, ticketsRaw } }
    
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

        // 3. Generar listas de fechas basándose en las capturas disponibles
        this.orderDates = this.capturaDates.map(suffix => `20${suffix.slice(0,2)}${suffix.slice(2,4)}${suffix.slice(4,6)}`).sort().reverse();
        this.ticketDates = [...this.orderDates];

        // Valores por defecto
        if (this.orderDates.length > 0) {
          this.selectedPedidosDate = this.orderDates[0];
        }

        // Inicializar en modo pedidos
        // Inicializar modo desde persistencia
        this.activeMode = localStorage.getItem("historiaFilterModo") || 'pedidos';
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
      localStorage.setItem("historiaFilterModo", this.activeMode);
      const targetDate = this.selectedPedidosDate;
      const validDates = this.activeMode === 'tickets' ? this.ticketDates : this.orderDates;
      
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
      localStorage.setItem("filterPlantaGrupo", this.selectedPlanta);
    },

    async filtrarYRedibujar() {
      this.loading = true;
      localStorage.setItem("filterPlantaGrupo", this.selectedPlanta);
      
      const date = this.selectedPedidosDate;
      if (!date) {
        this.metrics = { volumenT: 0, volConfirmado: 0 };
        this.loading = false;
        return;
      }

      try {
        const granularidadMin = 5;

        if (this.activeMode === 'anulaciones') {
          // ==========================================
          // MODO ANULACIONES (COMPARACIÓN PEDIDO A PEDIDO)
          // ==========================================
          const suffixA = this.activeSuffixes[0];
          const suffixB = this.activeSuffixes[1];
          const hasSuffixB = suffixB && this.capturaDates.includes(suffixB);

          const suffixesToLoad = [suffixA];
          if (hasSuffixB) suffixesToLoad.push(suffixB);

          const loadPromises = suffixesToLoad.map(async (suffix) => {
            if (!this.rawCapturas[suffix]) {
              try {
                const [pedRaw, tickRaw] = await Promise.all([
                  fetchSafeJson(`data/Pedidos_${suffix}.json?v=${Date.now()}`).catch(() => ({ pedidos: {} })),
                  fetchSafeJson(`data/Tickets_${suffix}.json?v=${Date.now()}`).catch(() => ({ Ticket: {} }))
                ]);
                this.rawCapturas[suffix] = { pedidosRaw: pedRaw, ticketsRaw: tickRaw };
              } catch (err) {
                console.error(`Error cargando captura ${suffix}:`, err);
              }
            }
          });

          await Promise.all(loadPromises);

          const cacheA = this.rawCapturas[suffixA];
          const cacheB = hasSuffixB ? this.rawCapturas[suffixB] : null;

          const pDataA = cacheA ? cacheA.pedidosRaw : { pedidos: {} };
          const pDataB = cacheB ? cacheB.pedidosRaw : { pedidos: {} };

          const tDataA = cacheA ? cacheA.ticketsRaw.Ticket || {} : {};
          const tDataB = cacheB ? cacheB.ticketsRaw.Ticket || {} : {};

          const processOrders = (pedidosObj, ticketsObj) => {
            return Object.entries(pedidosObj || {})
              .filter(([id]) => id !== "dummy")
              .map(([id, p]) => {
                const pedidoNeg = extendPedidoNegocio(p, id, window.plantasData);
                const XG = extendPedidoXG(pedidoNeg, granularidadMin);
                const MaxCamiones = XG.demanda.length ? Math.max(...XG.demanda) : 0;
                const result = { ...pedidoNeg, id, XG, MaxCamiones };
                
                result.despachos = calculateDespachosForPedido(result, granularidadMin);

                const orderTickets = Object.entries(ticketsObj)
                  .filter(([tId, t]) => String(t.Pedido) === id)
                  .map(([tId, t]) => ({ ...t, ticketId: tId }));
                
                result.realDespachos = calculateRealDespachosForPedido(result, orderTickets, granularidadMin);
                result.CantRealDespachos = result.realDespachos.filter(d => !d.isAnulado).length;
                
                return result;
              });
          };

          const fullOrdersA = processOrders(pDataA.pedidos, tDataA);
          const fullOrdersB = processOrders(pDataB.pedidos, tDataB);

          enrichPedidosForDate(fullOrdersA);
          enrichPedidosForDate(fullOrdersB);

          const localGrupos = {};
          Object.entries(window.plantasData).forEach(([code, p]) => {
            const g = p.grupo_despacho;
            if (g) {
              if (!localGrupos[g]) localGrupos[g] = [];
              localGrupos[g].push(code);
            }
          });

          let permitidas = [];
          if (this.selectedPlanta) {
            const filterParts = this.selectedPlanta.split(':');
            const filterType = filterParts[0];
            const filterVal = filterParts[1];
            if (filterType === 'Grupo') {
              permitidas = localGrupos[filterVal] || [];
            } else {
              permitidas = [filterVal];
            }
          }

          const baseOrdersA = fullOrdersA.filter(p => p["Fecha Pedido"] === date && (permitidas.length === 0 || permitidas.includes(p.Planta)));
          const baseOrdersB = fullOrdersB.filter(p => p["Fecha Pedido"] === date && (permitidas.length === 0 || permitidas.includes(p.Planta)));

          const mapA = new Map(baseOrdersA.map(p => [p.id, p]));
          const mapB = new Map(baseOrdersB.map(p => [p.id, p]));

          // Clasificar y calcular deltas para curvas
          const nuevos = baseOrdersA.filter(p => !mapB.has(p.id)).map(p => ({ ...p }));
          const anulados = baseOrdersB.filter(p => !mapA.has(p.id)).map(p => ({ ...p }));
          const iguales = baseOrdersA.filter(p => mapB.has(p.id) && mapB.get(p.id).CantProgramada === p.CantProgramada).map(p => ({ ...p }));

          // Mayor Volumen: representamos el incremento (VolA - VolB)
          const mayor = baseOrdersA.filter(p => mapB.has(p.id) && p.CantProgramada > mapB.get(p.id).CantProgramada)
            .map(p => {
              const clone = { ...p };
              const pB = mapB.get(p.id);
              const deltaVol = (p.CantProgramada || 0) - (pB.CantProgramada || 0);
              const denom = p.CantProgramada || 1;
              const ratio = deltaVol / denom;
              clone.CantProgramada = deltaVol;
              if (p.XG) {
                clone.XG = {
                  ...p.XG,
                  demanda: p.XG.demanda ? p.XG.demanda.map(v => (v || 0) * ratio) : []
                };
              }
              return clone;
            });

          // Menor Volumen: representamos el decremento (VolB - VolA) basado en la curva de B
          const menor = baseOrdersA.filter(p => mapB.has(p.id) && p.CantProgramada < mapB.get(p.id).CantProgramada)
            .map(p => {
              const clone = { ...p };
              const pB = mapB.get(p.id);
              const deltaVol = (pB.CantProgramada || 0) - (p.CantProgramada || 0);
              const denom = pB.CantProgramada || 1;
              const ratio = deltaVol / denom;
              clone.CantProgramada = deltaVol;
              // Usar la demanda de B como base y escalarla
              if (pB.XG) {
                clone.XG = {
                  ...pB.XG,
                  demanda: pB.XG.demanda ? pB.XG.demanda.map(v => (v || 0) * ratio) : []
                };
              }
              return clone;
            });

          const stackActual = buildStack(baseOrdersA);
          const stackAnterior = buildStack(baseOrdersB);
          const stackNuevos = buildStack(nuevos);
          const stackAnulados = buildStack(anulados);
          const stackMayor = buildStack(mayor);
          const stackMenor = buildStack(menor);
          const stackIguales = buildStack(iguales);

          const results = {
            'actual': { stackResult: stackActual, dataToStack: baseOrdersA, cantPedidos: baseOrdersA.length, volumenT: d3.sum(baseOrdersA, p => p.CantProgramada || 0), volConfirmado: d3.sum(baseOrdersA.filter(p => p.Confirmado === "SI"), p => p.CantProgramada || 0) },
            'anterior': { stackResult: stackAnterior, dataToStack: baseOrdersB, cantPedidos: baseOrdersB.length, volumenT: d3.sum(baseOrdersB, p => p.CantProgramada || 0) },
            'nuevos': { stackResult: stackNuevos, dataToStack: nuevos, cantPedidos: nuevos.length, volumenT: d3.sum(nuevos, p => p.CantProgramada || 0) },
            'anulados': { stackResult: stackAnulados, dataToStack: anulados, cantPedidos: anulados.length, volumenT: d3.sum(anulados, p => p.CantProgramada || 0) },
            'mayor': { stackResult: stackMayor, dataToStack: mayor, cantPedidos: mayor.length, volumenT: d3.sum(mayor, p => p.CantProgramada || 0) },
            'menor': { stackResult: stackMenor, dataToStack: menor, cantPedidos: menor.length, volumenT: d3.sum(menor, p => p.CantProgramada || 0) },
            'iguales': { stackResult: stackIguales, dataToStack: iguales, cantPedidos: iguales.length, volumenT: d3.sum(iguales, p => p.CantProgramada || 0) }
          };

          const keys = ['actual', 'anterior', 'iguales', 'nuevos', 'mayor', 'anulados', 'menor'];
          const formattedLabels = [
            `Actual (${this.formatToDddDdMmm(suffixA)})`,
            hasSuffixB ? `Anterior (${this.formatToDddDdMmm(suffixB)})` : "Anterior (No disp.)",
            "Pedidos Iguales",
            "Pedidos Nuevos",
            "Mayor Volumen",
            "Pedidos Anulados",
            "Menor Volumen"
          ];

          const allOcupaciones = keys.map(k => results[k]?.stackResult?.ocupacionMax || 0);
          const globalYMax = d3.max(allOcupaciones) || 5;

          this.metrics = {
            volumenT: Math.round(results.actual.volumenT),
            volConfirmado: Math.round(results.actual.volConfirmado)
          };

          // Planta dropdown
          window.grupos = {};
          Object.entries(window.plantasData).forEach(([code, p]) => {
            const g = p.grupo_despacho;
            if (g) {
              if (!window.grupos[g]) window.grupos[g] = [];
              window.grupos[g].push(code);
            }
          });
          this.fullPedidos = fullOrdersA;
          this.updatePlantasOptions(date);

          this.$nextTick(() => {
            drawMultiTruckChart("#chart-global", "#chart-container-global", results, keys, formattedLabels, granularidadMin, 'anulaciones', globalYMax);
          });

        } else {
          // ==========================================
          // MODO PEDIDOS / TICKETS NORMAL
          // ==========================================
          const resultsBySuffix = {};

          // Cargar los archivos correspondientes a los 4 sufijos bajo demanda
          const loadPromises = this.activeSuffixes.map(async (suffix) => {
            if (!this.capturaDates.includes(suffix)) return;

            if (!this.rawCapturas[suffix]) {
              try {
                const [pedRaw, tickRaw] = await Promise.all([
                  fetchSafeJson(`data/Pedidos_${suffix}.json?v=${Date.now()}`).catch(() => ({ pedidos: {} })),
                  fetchSafeJson(`data/Tickets_${suffix}.json?v=${Date.now()}`).catch(() => ({ Ticket: {} }))
                ]);
                this.rawCapturas[suffix] = { pedidosRaw: pedRaw, ticketsRaw: tickRaw };
              } catch (err) {
                console.error(`Error cargando captura ${suffix}:`, err);
                return;
              }
            }

            const cacheItem = this.rawCapturas[suffix];
            const pedidosData = cacheItem.pedidosRaw;
            const localTicketsData = cacheItem.ticketsRaw.Ticket || {};

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

            const localGrupos = {};
            Object.entries(window.plantasData).forEach(([code, p]) => {
              const g = p.grupo_despacho;
              if (g) {
                if (!localGrupos[g]) localGrupos[g] = [];
                localGrupos[g].push(code);
              }
            });

            let permitidas = [];
            if (this.selectedPlanta) {
              const filterParts = this.selectedPlanta.split(':');
              const filterType = filterParts[0];
              const filterVal = filterParts[1];
              if (filterType === 'Grupo') {
                permitidas = localGrupos[filterVal] || [];
              } else {
                permitidas = [filterVal];
              }
            }

            const baseOrders = fullPedidos.filter(p => p["Fecha Pedido"] === date && (permitidas.length === 0 || permitidas.includes(p.Planta)));

            let dataToStack = [];
            if (this.activeMode === 'pedidos') {
              dataToStack = baseOrders.map(p => ({ ...p }));
            } else {
              dataToStack = baseOrders.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
            }

            const stackResult = buildStack(dataToStack);

            let cantPedidos = 0;
            let volumenT = 0;
            if (this.activeMode === 'pedidos') {
              cantPedidos = baseOrders.length;
              volumenT = d3.sum(baseOrders, p => p.CantProgramada || 0);
            } else {
              const uniquePedidos = new Set(dataToStack.map(d => d.Pedido || (d.parentPedido && d.parentPedido.id)));
              cantPedidos = uniquePedidos.has(undefined) ? dataToStack.length : uniquePedidos.size;
              volumenT = d3.sum(dataToStack, d => d.Volumen || 0);
            }

            resultsBySuffix[suffix] = {
              stackResult,
              dataToStack,
              cantPedidos,
              volumenT,
              volConfirmado: d3.sum(baseOrders.filter(p => p.Confirmado === "SI"), p => p.CantProgramada || 0)
            };
          });

          await Promise.all(loadPromises);

          const allOcupaciones = Object.values(resultsBySuffix).map(r => r.stackResult.ocupacionMax || 0);
          const globalYMax = d3.max(allOcupaciones) || 5;

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

          const representativeSuffix = this.activeSuffixes.find(s => resultsBySuffix[s]);
          if (representativeSuffix) {
            const cacheItem = this.rawCapturas[representativeSuffix];
            const pedidosData = cacheItem.pedidosRaw;

            window.grupos = {};
            Object.entries(window.plantasData).forEach(([code, p]) => {
              const g = p.grupo_despacho;
              if (g) {
                if (!window.grupos[g]) window.grupos[g] = [];
                window.grupos[g].push(code);
              }
            });

            this.fullPedidos = Object.entries(pedidosData.pedidos || {})
              .filter(([id]) => id !== "dummy")
              .map(([id, p]) => ({ ...p, id, Planta: p.Planta || '', CantProgramada: p.CantProgramada || 0, "Fecha Pedido": p["Fecha Pedido"] }));
            this.updatePlantasOptions(date);
          }

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
        }

        this.loading = false;
      } catch (err) {
        console.error('Error al filtrar y renderizar:', err);
        this.loading = false;
      }
    }
  }));
});
