/**
 * Realiza una petición fetch segura limpiando posibles errores de formato del JSON.
 * Convierte formatos numéricos no válidos como .8 a 0.8 antes de parsear.
 * 
 * @param {string} url - Dirección del recurso JSON a consultar.
 * @returns {Promise<any>} Objeto parseado del JSON limpio.
 */
async function fetchSafeJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  let text = await response.text();
  // Limpiar decimales mal formados como .8 -> 0.8
  text = text.replace(/([:,\[\s])\.(\d+)/g, '$10.$2');
  return JSON.parse(text);
}

// Inicializar la aplicación con Alpine.js
document.addEventListener('alpine:init', () => {
  // Almacén de estado principal de la vista histórica
  Alpine.data('appState', () => ({
    loading: true, // Indica si la aplicación está procesando carga de datos o redibujando
    activeMode: localStorage.getItem("historiaFilterModo") || 'pedidos', // Filtro Modo: 'pedidos', 'tickets' (Despachos), o 'anulaciones'
    teoricoRealType: 'llegada_obra', // Tipo comparación Teórico vs Real ('llegada_obra', 'asignacion', etc)
    
    // Selectores del Encabezado
    selectedPedidosDate: '', // Fecha elegida para consulta (formato YYYYMMDD)
    selectedPlanta: localStorage.getItem("filterPlantaGrupo") || '', // Planta o Grupo seleccionado

    // Colecciones de Datos y Filtros
    capturaDates: [],      // Lista completa de sufijos YYMMDD disponibles en data/ (de index.json)
    orderDates: [],        // Fechas YYYYMMDD de Pedidos a nivel global
    ticketDates: [],       // Fechas YYYYMMDD de Tickets a nivel global
    activeSuffixes: [],    // Sufijos cargados activos (mismo día y 3 días anteriores en modo normal)
    plantasOptions: [],    // Opciones del dropdown de plantas (desglose por grupos despacho y plantas)
    
    // Memoria caché local para evitar descargas duplicadas de los archivos JSON en la sesión
    rawCapturas: {}, // Estructura: { YYMMDD: { pedidosRaw, ticketsRaw } }
    
    fullPedidos: [], // Pedidos completos cargados para la fecha elegida (sin filtrar por planta)
    metrics: {
      volumenT: 0, // Volumen total del día para la curva del día ($m^3$)
      volConfirmado: 0, // Volumen total confirmado en SAP ($m^3$)
      volDiferencia: 0 // Diferencia de volumen con el día anterior ($m^3$)
    },

    /**
     * Da formato legible a una fecha (Ej: "Vie 07 Ago") soportando formatos YYYYMMDD o YYMMDD.
     * 
     * @param {string|number} dateStr - Fecha de entrada.
     * @returns {string} Fecha formateada.
     */
    formatToDddDdMmm(dateStr) {
      if (!dateStr) return '';
      const dateVal = String(dateStr);
      let y, m, d;
      if (dateVal.length === 8) { // YYYYMMDD
        y = Number(dateVal.slice(0, 4));
        m = Number(dateVal.slice(4, 6)) - 1;
        d = Number(dateVal.slice(6, 8));
      } else if (dateVal.length === 6) { // YYMMDD
        y = Number('20' + dateVal.slice(0, 2));
        m = Number(dateVal.slice(2, 4)) - 1;
        d = Number(dateVal.slice(4, 6));
      } else {
        return dateStr;
      }
      
      const date = new Date(y, m, d);
      const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      
      return `${days[date.getDay()]} ${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]}`;
    },

    /**
     * Obtiene el nombre descriptivo de una Planta a partir de su código en plantas.json.
     * 
     * @param {string} pCode - Código de la planta.
     * @returns {string} Nombre descriptivo o código fallback.
     */
    getPlantName(pCode) {
      if (window.plantasData && window.plantasData[pCode]) {
        return window.plantasData[pCode].nombre || pCode;
      }
      return pCode;
    },

    /**
     * Comprueba si la memoria caché ya cuenta con los datos de un sufijo determinado.
     */
    hasDataForSuffix(suffix) {
      return !!this.rawCapturas[suffix];
    },

    /**
     * Calcula los 4 sufijos de fecha consecutivos hacia atrás a partir de una fecha YYYYMMDD de referencia.
     * 
     * @param {string} dateStr - Fecha YYYYMMDD de partida.
     * @returns {string[]} Lista de 4 sufijos en formato YYMMDD.
     */
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

    /**
     * Inicialización del estado de Alpine al cargar el sitio.
     * Carga catálogo de plantas, lista de capturas indexadas y activa el primer día y modo guardado.
     */
    async init() {
      this.loading = true;
      try {
        // 1. Cargar catálogo global de plantas de la aplicación
        window.plantasData = await fetchSafeJson(`../data/plantas.json?v=${Date.now()}`).catch(() => ({}));

        // 2. Cargar el index.json de capturas existentes
        const index = await fetchSafeJson(`data/index.json?v=${Date.now()}`);
        this.capturaDates = index.sort().reverse();

        if (this.capturaDates.length === 0) {
          this.loading = false;
          return;
        }

        // 3. Convertir sufijos YYMMDD a formato de fecha YYYYMMDD para selectores
        this.orderDates = this.capturaDates.map(suffix => `20${suffix.slice(0,2)}${suffix.slice(2,4)}${suffix.slice(4,6)}`).sort().reverse();
        this.ticketDates = [...this.orderDates];

        // Definir la última fecha disponible como seleccionada por defecto
        if (this.orderDates.length > 0) {
          this.selectedPedidosDate = this.orderDates[0];
        }

        // Recuperar modo preferido y definir sufijos activos de inicio
        this.activeMode = localStorage.getItem("historiaFilterModo") || 'pedidos';
        this.activeSuffixes = this.getPrecedingSuffixes(this.selectedPedidosDate);
        await this.filtrarYRedibujar();

      } catch (err) {
        console.error('Error al inicializar la aplicación:', err);
        this.loading = false;
      }
    },

    /**
     * Controlador ejecutado cuando el usuario cambia el día de despacho en el selector.
     */
    async cambiarDia() {
      this.activeSuffixes = this.getPrecedingSuffixes(this.selectedPedidosDate);
      await this.filtrarYRedibujar();
    },

    /**
     * Controlador ejecutado cuando el usuario cambia de modo (Pedidos / Despachos / Anulaciones).
     * Se encarga de validar la fecha actual para el nuevo modo y recargar los datos.
     */
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

    /**
     * Reconstruye dinámicamente las opciones del selector de plantas y grupos de despacho
     * basándose en la fecha consultada y los volúmenes de pedidos activos.
     * 
     * @param {string} date - Fecha YYYYMMDD activa.
     */
    updatePlantasOptions(date) {
      if (!date) return;
      
      // 1. Agrupar volumen programado acumulado por planta para la fecha dada
      const plantVolumes = {};
      this.fullPedidos
        .filter(p => p["Fecha Pedido"] === date)
        .forEach(p => {
          const vol = p.CantProgramada || 0;
          plantVolumes[p.Planta] = (plantVolumes[p.Planta] || 0) + vol;
        });

      // 2. Determinar qué plantas registraron actividad y a qué grupos pertenecen
      const activePlants = Object.keys(plantVolumes).sort();
      const groups = new Set();
      activePlants.forEach(pCode => {
        const g = window.plantasData[pCode]?.grupo_despacho;
        if (g) groups.add(g);
      });

      const options = [];
      
      // 3. Insertar los grupos de despacho y sus plantas asociadas jerárquicamente
      Array.from(groups).sort().forEach(g => {
        const gPlants = window.grupos[g] || [];
        const activeGPlants = gPlants.filter(p => activePlants.includes(p)).sort();
        const gVol = d3.sum(activeGPlants, p => plantVolumes[p] || 0);

        // Opción del grupo consolidador
        options.push({ id: `Grupo:${g}`, label: `Grupo ${g} (${Math.round(gVol)} m³)` });
        
        // Opciones de plantas anidadas (con sangría visual)
        activeGPlants.forEach(pCode => {
          const pVol = plantVolumes[pCode] || 0;
          const pName = this.getPlantName(pCode);
          options.push({ id: `Planta:${pCode}`, label: `    ${pName} (${Math.round(pVol)} m³)` });
        });
      });

      // 4. Insertar las plantas independientes sin grupo despacho asignado
      activePlants.forEach(pCode => {
        const g = window.plantasData[pCode]?.grupo_despacho;
        if (!g) {
          const pVol = plantVolumes[pCode] || 0;
          const pName = this.getPlantName(pCode);
          options.push({ id: `Planta:${pCode}`, label: `${pName} (${Math.round(pVol)} m³)` });
        }
      });

      this.plantasOptions = options;

      // 5. Validar que la planta o grupo seleccionado persista. De lo contrario, asignar la primera opción activa.
      if (options.length > 0) {
        const exists = options.some(o => o.id === this.selectedPlanta);
        if (!exists) {
          this.selectedPlanta = options[0].id;
        }
      } else {
        this.selectedPlanta = '';
      }
      // Guardar filtro de planta en localStorage para persistencia cruzada
      localStorage.setItem("filterPlantaGrupo", this.selectedPlanta);
    },

    /**
     * Función principal del ciclo de vida de los datos:
     * 1. Carga archivos JSON correspondientes a las fechas requeridas (usando caché si ya existen).
     * 2. Procesa y estructura la información asociando Pedidos con sus respectivos Tickets.
     * 3. Aplica los filtros de Planta o Grupo seleccionados.
     * 4. En modo Anulaciones: realiza la clasificación diferencial y cálculo de deltas de volumen.
     * 5. Calcula envolventes de ocupación de camiones y renderiza el gráfico SVG interactivo con D3.
     */
    async filtrarYRedibujar() {
      this.loading = true;
      // Sincronizar el filtro seleccionado en el almacenamiento persistente
      localStorage.setItem("filterPlantaGrupo", this.selectedPlanta);
      
      const date = this.selectedPedidosDate;
      if (!date) {
        this.metrics = { volumenT: 0, volConfirmado: 0 };
        this.loading = false;
        return;
      }

      try {
        const granularidadMin = 5; // Granularidad temporal de 5 minutos por slot de simulación

        if (this.activeMode === 'anulaciones') {
          // ==========================================
          // MODO ANULACIONES (COMPARACIÓN PEDIDO A PEDIDO)
          // ==========================================
          
          // Obtener sufijo del día seleccionado (Actual) y del día inmediatamente anterior (Anterior)
          const suffixA = this.activeSuffixes[0];
          const suffixB = this.activeSuffixes[1];
          const hasSuffixB = suffixB && this.capturaDates.includes(suffixB);

          const suffixesToLoad = [suffixA];
          if (hasSuffixB) suffixesToLoad.push(suffixB);

          // Cargar capturas bajo demanda si no se encuentran en la memoria caché rawCapturas
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

          // Recuperar datos desde caché
          const cacheA = this.rawCapturas[suffixA];
          const cacheB = hasSuffixB ? this.rawCapturas[suffixB] : null;

          const pDataA = cacheA ? cacheA.pedidosRaw : { pedidos: {} };
          const pDataB = cacheB ? cacheB.pedidosRaw : { pedidos: {} };

          const tDataA = cacheA ? cacheA.ticketsRaw.Ticket || {} : {};
          const tDataB = cacheB ? cacheB.ticketsRaw.Ticket || {} : {};

          // Función interna helper para estructurar pedidos y asociarles sus tickets (despachos reales)
          const processOrders = (pedidosObj, ticketsObj) => {
            return Object.entries(pedidosObj || {})
              .filter(([id]) => id !== "dummy")
              .map(([id, p]) => {
                // Extender datos de negocio y cronograma de simulación
                const pedidoNeg = extendPedidoNegocio(p, id, window.plantasData);
                const XG = extendPedidoXG(pedidoNeg, granularidadMin);
                const MaxCamiones = XG.demanda.length ? Math.max(...XG.demanda) : 0;
                const result = { ...pedidoNeg, id, XG, MaxCamiones };
                
                // Calcular despachos teóricos según la tasa de carga
                result.despachos = calculateDespachosForPedido(result, granularidadMin);

                // Filtrar y adjuntar tickets asociados a este pedido específico
                const orderTickets = Object.entries(ticketsObj)
                  .filter(([tId, t]) => String(t.Pedido) === id)
                  .map(([tId, t]) => ({ ...t, ticketId: tId }));
                
                // Calcular la asignación de despachos reales basados en tickets
                result.realDespachos = calculateRealDespachosForPedido(result, orderTickets, granularidadMin);
                result.CantRealDespachos = result.realDespachos.filter(d => !d.isAnulado).length;
                
                return result;
              });
          };

          // Procesar las colecciones completas de pedidos para el día actual y anterior
          const fullOrdersA = processOrders(pDataA.pedidos, tDataA);
          const fullOrdersB = processOrders(pDataB.pedidos, tDataB);

          // Enriquecer datos con duraciones de ciclos y tolerancias de sobretiempo
          enrichPedidosForDate(fullOrdersA);
          enrichPedidosForDate(fullOrdersB);

          // Construir mapa local de grupos despacho
          const localGrupos = {};
          Object.entries(window.plantasData).forEach(([code, p]) => {
            const g = p.grupo_despacho;
            if (g) {
              if (!localGrupos[g]) localGrupos[g] = [];
              localGrupos[g].push(code);
            }
          });

          // Determinar qué códigos de planta están permitidos según la selección del filtro
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

          // Filtrar las colecciones de pedidos aplicando el filtro de Planta / Grupo seleccionado
          const baseOrdersA = fullOrdersA.filter(p => p["Fecha Pedido"] === date && (permitidas.length === 0 || permitidas.includes(p.Planta)));
          const baseOrdersB = fullOrdersB.filter(p => p["Fecha Pedido"] === date && (permitidas.length === 0 || permitidas.includes(p.Planta)));

          const mapA = new Map(baseOrdersA.map(p => [p.id, p]));
          const mapB = new Map(baseOrdersB.map(p => [p.id, p]));

          // Clasificar y calcular deltas de volumen para construir las curvas diferenciales
          const nuevos = baseOrdersA.filter(p => !mapB.has(p.id)).map(p => ({ ...p, originalVol: 0, nuevoVol: p.CantProgramada }));
          const anulados = baseOrdersB.filter(p => !mapA.has(p.id)).map(p => ({ ...p, originalVol: p.CantProgramada, nuevoVol: 0 }));
          const iguales = baseOrdersA.filter(p => mapB.has(p.id) && mapB.get(p.id).CantProgramada === p.CantProgramada).map(p => ({ ...p, originalVol: p.CantProgramada, nuevoVol: p.CantProgramada }));

          // Mayor Volumen: representamos el incremento (VolA - VolB) y escalamos proporcionalmente la curva
          const mayor = baseOrdersA.filter(p => mapB.has(p.id) && p.CantProgramada > mapB.get(p.id).CantProgramada)
            .map(p => {
              const clone = { ...p };
              const pB = mapB.get(p.id);
              const deltaVol = (p.CantProgramada || 0) - (pB.CantProgramada || 0);
              const denom = p.CantProgramada || 1;
              const ratio = deltaVol / denom;
              clone.CantProgramada = deltaVol;
              clone.originalVol = pB.CantProgramada;
              clone.nuevoVol = p.CantProgramada;
              if (p.XG) {
                clone.XG = {
                  ...p.XG,
                  demanda: p.XG.demanda ? p.XG.demanda.map(v => (v || 0) * ratio) : []
                };
              }
              return clone;
            });

          // Menor Volumen: representamos el decremento (VolB - VolA) basándonos en la curva de B y escalándola
          const menor = baseOrdersA.filter(p => mapB.has(p.id) && p.CantProgramada < mapB.get(p.id).CantProgramada)
            .map(p => {
              const clone = { ...p };
              const pB = mapB.get(p.id);
              const deltaVol = (pB.CantProgramada || 0) - (p.CantProgramada || 0);
              const denom = pB.CantProgramada || 1;
              const ratio = deltaVol / denom;
              clone.CantProgramada = deltaVol;
              clone.originalVol = pB.CantProgramada;
              clone.nuevoVol = p.CantProgramada;
              // Usar la demanda de B como base y escalarla
              if (pB.XG) {
                clone.XG = {
                  ...pB.XG,
                  demanda: pB.XG.demanda ? pB.XG.demanda.map(v => (v || 0) * ratio) : []
                };
              }
              return clone;
            });

          // Generar los agregados de ocupación simulada (stacks) para cada una de las 7 curvas
          const stackActual = buildStack(baseOrdersA);
          const stackAnterior = buildStack(baseOrdersB);
          const stackNuevos = buildStack(nuevos);
          const stackAnulados = buildStack(anulados);
          const stackMayor = buildStack(mayor);
          const stackMenor = buildStack(menor);
          const stackIguales = buildStack(iguales);

          // Calcular la curva de diferencia neta en camiones (Actual - Anterior)
          const diffEnvolvente = [];
          const envActual = stackActual.metrics.envolvente || [];
          const envAnterior = stackAnterior.metrics.envolvente || [];
          const maxLen = Math.max(envActual.length, envAnterior.length);
          for (let t = 0; t < maxLen; t++) {
            const valA = envActual[t] || 0;
            const valB = envAnterior[t] || 0;
            diffEnvolvente[t] = valA - valB;
          }

          // Estructurar un objeto stackResult dummy para la curva de diferencia
          const stackDiferencia = {
            ocupacion: [],
            ocupacionMax: d3.max(diffEnvolvente.map(Math.abs)) || 0,
            metrics: { envolvente: diffEnvolvente }
          };

          const diffVol = d3.sum(baseOrdersA, p => p.CantProgramada || 0) - (hasSuffixB ? d3.sum(baseOrdersB, p => p.CantProgramada || 0) : 0);

          // Consolidar resultados, conteos y métricas de volumen para el renderizado
          const results = {
            'actual': { stackResult: stackActual, dataToStack: baseOrdersA, cantPedidos: baseOrdersA.length, volumenT: d3.sum(baseOrdersA, p => p.CantProgramada || 0), volConfirmado: d3.sum(baseOrdersA.filter(p => p.Confirmado === "SI"), p => p.CantProgramada || 0) },
            'anterior': { stackResult: stackAnterior, dataToStack: baseOrdersB, cantPedidos: baseOrdersB.length, volumenT: d3.sum(baseOrdersB, p => p.CantProgramada || 0) },
            'diferencia': { stackResult: stackDiferencia, dataToStack: [], cantPedidos: 0, volumenT: diffVol },
            'iguales': { stackResult: stackIguales, dataToStack: iguales, cantPedidos: iguales.length, volumenT: d3.sum(iguales, p => p.CantProgramada || 0) },
            'nuevos': { stackResult: stackNuevos, dataToStack: nuevos, cantPedidos: nuevos.length, volumenT: d3.sum(nuevos, p => p.CantProgramada || 0) },
            'mayor': { stackResult: stackMayor, dataToStack: mayor, cantPedidos: mayor.length, volumenT: d3.sum(mayor, p => p.CantProgramada || 0) },
            'anulados': { stackResult: stackAnulados, dataToStack: anulados, cantPedidos: anulados.length, volumenT: d3.sum(anulados, p => p.CantProgramada || 0) },
            'menor': { stackResult: stackMenor, dataToStack: menor, cantPedidos: menor.length, volumenT: d3.sum(menor, p => p.CantProgramada || 0) }
          };

          const keys = ['actual', 'anterior', 'diferencia', 'iguales', 'nuevos', 'mayor', 'anulados', 'menor'];
          const formattedLabels = [
            `Actual (${this.formatToDddDdMmm(suffixA)})`,
            hasSuffixB ? `Anterior (${this.formatToDddDdMmm(suffixB)})` : "Anterior (No disp.)",
            "Diferencia neta",
            "Pedidos Iguales",
            "Pedidos Nuevos",
            "Mayor Volumen",
            "Pedidos Anulados",
            "Menor Volumen"
          ];

          // Encontrar el valor máximo global en el eje Y para normalizar la escala vertical
          const allOcupaciones = keys.map(k => results[k]?.stackResult?.ocupacionMax || 0);
          const globalYMax = d3.max(allOcupaciones) || 5;

          this.metrics = {
            volumenT: Math.round(results.actual.volumenT),
            volConfirmado: Math.round(results.actual.volConfirmado),
            volDiferencia: Math.round(diffVol)
          };

          // Reconstruir mapeo global de grupos y plantas
          window.grupos = {};
          Object.entries(window.plantasData).forEach(([code, p]) => {
            const g = p.grupo_despacho;
            if (g) {
              if (!window.grupos[g]) window.grupos[g] = [];
              window.grupos[g].push(code);
            }
          });
          this.fullPedidos = fullOrdersA; // Aseguramos poblar con datos completos para evitar encogimiento del selector
          this.updatePlantasOptions(date);

          // Esperar al ciclo de actualización de Alpine para dibujar la gráfica
          this.$nextTick(() => {
            drawMultiTruckChart("#chart-global", "#chart-container-global", results, keys, formattedLabels, granularidadMin, 'anulaciones', globalYMax);
          });

        } else if (this.activeMode === 'tickets') {
          // ==========================================
          // MODO DESPACHOS (PEDIDOS ACTUAL, PEDIDOS ANTERIOR Y DESPACHOS REALES DEL MISMO DÍA)
          // ==========================================
          const suffixA = this.activeSuffixes[0];
          const suffixB = this.activeSuffixes[1];
          const hasSuffixB = suffixB && this.capturaDates.includes(suffixB);

          const suffixesToLoad = [suffixA];
          if (hasSuffixB) suffixesToLoad.push(suffixB);

          // Cargar capturas bajo demanda si no se encuentran en la memoria caché rawCapturas
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

          // Recuperar datos desde la caché
          const cacheA = this.rawCapturas[suffixA];
          const cacheB = hasSuffixB ? this.rawCapturas[suffixB] : null;

          const pDataA = cacheA ? cacheA.pedidosRaw : { pedidos: {} };
          const pDataB = cacheB ? cacheB.pedidosRaw : { pedidos: {} };
          const tDataA = cacheA ? cacheA.ticketsRaw.Ticket || {} : {};

          // Función helper para procesar pedidos con o sin asociación de tickets
          const processOrders = (pedidosObj, ticketsObj) => {
            return Object.entries(pedidosObj || {})
              .filter(([id]) => id !== "dummy")
              .map(([id, p]) => {
                const pedidoNeg = extendPedidoNegocio(p, id, window.plantasData);
                const XG = extendPedidoXG(pedidoNeg, granularidadMin);
                const MaxCamiones = XG.demanda.length ? Math.max(...XG.demanda) : 0;
                const result = { ...pedidoNeg, id, XG, MaxCamiones };
                
                result.despachos = calculateDespachosForPedido(result, granularidadMin);

                if (ticketsObj) {
                  const orderTickets = Object.entries(ticketsObj)
                    .filter(([tId, t]) => String(t.Pedido) === id)
                    .map(([tId, t]) => ({ ...t, ticketId: tId }));
                  
                  result.realDespachos = calculateRealDespachosForPedido(result, orderTickets, granularidadMin);
                  result.CantRealDespachos = result.realDespachos.filter(d => !d.isAnulado).length;
                } else {
                  result.realDespachos = [];
                  result.CantRealDespachos = 0;
                }
                
                return result;
              });
          };

          const fullOrdersA = processOrders(pDataA.pedidos, tDataA);
          const fullOrdersB = processOrders(pDataB.pedidos, null); // No necesitamos tickets para el día anterior

          enrichPedidosForDate(fullOrdersA);
          enrichPedidosForDate(fullOrdersB);

          // Construir mapa local de grupos despacho para filtrar
          const localGrupos = {};
          Object.entries(window.plantasData).forEach(([code, p]) => {
            const g = p.grupo_despacho;
            if (g) {
              if (!localGrupos[g]) localGrupos[g] = [];
              localGrupos[g].push(code);
            }
          });

          // Resolver códigos de plantas permitidos según el filtro de Planta / Grupo seleccionado
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

          // Filtrar colecciones de pedidos aplicando el filtro de Planta / Grupo
          const baseOrdersA = fullOrdersA.filter(p => p["Fecha Pedido"] === date && (permitidas.length === 0 || permitidas.includes(p.Planta)));
          const baseOrdersB = fullOrdersB.filter(p => p["Fecha Pedido"] === date && (permitidas.length === 0 || permitidas.includes(p.Planta)));

          // Clones separados para Pedidos (Programado) y Despachos (Real)
          const dataPedidosActual = baseOrdersA.map(p => ({ ...p }));
          const dataPedidosAnterior = baseOrdersB.map(p => ({ ...p }));
          const dataDespachos = baseOrdersA.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));

          // Generar los agregados de ocupación (stacks)
          const stackPedidosActual = buildStack(dataPedidosActual);
          const stackPedidosAnterior = buildStack(dataPedidosAnterior);
          const stackDespachos = buildStack(dataDespachos);

          const uniquePedidosInTickets = new Set(dataDespachos.map(d => d.Pedido || (d.parentPedido && d.parentPedido.id))).size;

          // Consolidar resultados en la misma estructura del gráfico
          const results = {
            'pedidos_actual': {
              stackResult: stackPedidosActual,
              dataToStack: dataPedidosActual,
              cantPedidos: dataPedidosActual.length,
              volumenT: d3.sum(dataPedidosActual, p => p.CantProgramada || 0),
              volConfirmado: d3.sum(dataPedidosActual.filter(p => p.Confirmado === "SI"), p => p.CantProgramada || 0)
            },
            'tickets': {
              stackResult: stackDespachos,
              dataToStack: dataDespachos,
              cantPedidos: uniquePedidosInTickets,
              volumenT: d3.sum(baseOrdersA, p => p.CantDespachada || 0)
            }
          };

          if (hasSuffixB) {
            results['pedidos_anterior'] = {
              stackResult: stackPedidosAnterior,
              dataToStack: dataPedidosAnterior,
              cantPedidos: dataPedidosAnterior.length,
              volumenT: d3.sum(dataPedidosAnterior, p => p.CantProgramada || 0)
            };
          }

          // Definir claves y etiquetas según la presencia del día anterior
          const keys = hasSuffixB 
            ? ['pedidos_actual', 'pedidos_anterior', 'tickets'] 
            : ['pedidos_actual', 'tickets'];

          const formattedLabels = hasSuffixB
            ? [
                `Pedidos día Actual (${this.formatToDddDdMmm(suffixA)})`,
                `Pedidos día Anterior (${this.formatToDddDdMmm(suffixB)})`,
                `Despachos Reales (${this.formatToDddDdMmm(suffixA)})`
              ]
            : [
                `Pedidos día Actual (${this.formatToDddDdMmm(suffixA)})`,
                `Despachos Reales (${this.formatToDddDdMmm(suffixA)})`
              ];

          // Determinar escala máxima en eje Y
          const allStacks = [stackPedidosActual.ocupacionMax || 0, stackDespachos.ocupacionMax || 0];
          if (hasSuffixB) allStacks.push(stackPedidosAnterior.ocupacionMax || 0);
          const globalYMax = d3.max(allStacks) || 5;

          // Asignar métricas de volumen totales
          this.metrics = {
            volumenT: Math.round(results.tickets.volumenT), // Volumen real despachado
            volConfirmado: Math.round(results.pedidos_actual.volumenT) // Volumen programado total (Pedidos)
          };

          // Reconstruir grupos y actualizar dropdown de plantas
          window.grupos = {};
          Object.entries(window.plantasData).forEach(([code, p]) => {
            const g = p.grupo_despacho;
            if (g) {
              if (!window.grupos[g]) window.grupos[g] = [];
              window.grupos[g].push(code);
            }
          });
          this.fullPedidos = fullOrdersA; // Usar pedidos completos del día actual para poblar opciones
          this.updatePlantasOptions(date);

          // Redibujar gráfico SVG con el tema 'tickets'
          this.$nextTick(() => {
            drawMultiTruckChart("#chart-global", "#chart-container-global", results, keys, formattedLabels, granularidadMin, 'tickets', globalYMax);
          });

        } else if (this.activeMode === 'teorico_real') {
          // ==========================================
          // MODO TEÓRICO VS REAL (PEDIDOS VS TICKETS DEL MISMO DÍA STACKEADOS INDIVIDUAMENTE)
          // ==========================================
          const suffixA = this.activeSuffixes[0];

          // Cargar la captura seleccionada bajo demanda si no está en la memoria caché
          if (!this.rawCapturas[suffixA]) {
            try {
              const [pedRaw, tickRaw] = await Promise.all([
                fetchSafeJson(`data/Pedidos_${suffixA}.json?v=${Date.now()}`).catch(() => ({ pedidos: {} })),
                fetchSafeJson(`data/Tickets_${suffixA}.json?v=${Date.now()}`).catch(() => ({ Ticket: {} }))
              ]);
              this.rawCapturas[suffixA] = { pedidosRaw: pedRaw, ticketsRaw: tickRaw };
            } catch (err) {
              console.error(`Error cargando captura ${suffixA}:`, err);
            }
          }

          const cacheItem = this.rawCapturas[suffixA];
          const pedidosData = cacheItem ? cacheItem.pedidosRaw : { pedidos: {} };
          const localTicketsData = cacheItem ? cacheItem.ticketsRaw.Ticket || {} : {};

          // Procesar y modelar pedidos con sus despachos teóricos e individuales reales
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

          // Construir mapa local de grupos despacho para filtrar
          const localGrupos = {};
          Object.entries(window.plantasData).forEach(([code, p]) => {
            const g = p.grupo_despacho;
            if (g) {
              if (!localGrupos[g]) localGrupos[g] = [];
              localGrupos[g].push(code);
            }
          });

          // Resolver códigos de plantas permitidos según el filtro de Planta / Grupo seleccionado
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

          // Filtrar colección de pedidos
          const baseOrders = fullPedidos.filter(p => p["Fecha Pedido"] === date && (permitidas.length === 0 || permitidas.includes(p.Planta)));

          // Construir parejas de despachos teóricos y reales para el scatter plot
          const pairedData = [];
          baseOrders.forEach(p => {
            const teos = p.despachos || [];
            const reals = p.realDespachos || [];
            reals.forEach(r => {
              if (r.isAnulado) return;
              const t = teos.find(td => td.despachoIndex === r.despachoIndex);
              if (t) {
                const rawT = r.rawTicket || {};
                const pImpreso = (rawT.Impreso && rawT.Impreso !== "0") ? safeHhmmssToMin(rawT.Impreso) : p.HoraAsignacionMin;
                const pInicioCarga = (rawT.InicioCarga && rawT.InicioCarga !== "0") ? safeHhmmssToMin(rawT.InicioCarga) : pImpreso;
                const pFinCarga = (rawT.FinCarga && rawT.FinCarga !== "0") ? safeHhmmssToMin(rawT.FinCarga) : (pInicioCarga + (p.TiempoCarga || 0));
                const pAObra = (rawT.AObra && rawT.AObra !== "0") ? safeHhmmssToMin(rawT.AObra) : pFinCarga;
                const pEnObra = (rawT.EnObra && rawT.EnObra !== "0") ? safeHhmmssToMin(rawT.EnObra) : (pAObra + (p.TiempoViaje || 0));
                const pInicioDescarga = (rawT.InicioDescarga && rawT.InicioDescarga !== "0") ? safeHhmmssToMin(rawT.InicioDescarga) : pEnObra;
                const pAplanta = (rawT.Aplanta && rawT.Aplanta !== "0") ? safeHhmmssToMin(rawT.Aplanta) : (pEnObra + (p.Frecuencia || 0));
                const pEnplanta = (rawT.Enplanta && rawT.Enplanta !== "0") ? safeHhmmssToMin(rawT.Enplanta) : (pAplanta + (p.TiempoViaje || 0));

                let xVal, teoVal, realVal;
                if (this.teoricoRealType === 'viaje_ida') {
                  xVal = t.HoraInicioMin; // Hora inicio viaje teórica
                  teoVal = Number(p.TiempoViaje) || 0;
                  realVal = pEnObra - pAObra;
                } else if (this.teoricoRealType === 'viaje_regreso') {
                  const teoTravelTime = Number(p.TiempoViaje) || 0;
                  xVal = t.HoraFinalMin - teoTravelTime; // Salida de Obra teórica
                  teoVal = teoTravelTime;
                  realVal = pEnplanta - pAplanta;
                } else if (this.teoricoRealType === 'estadia') {
                  xVal = t.HoraInicioMin; // Llegada a Obra teórica
                  teoVal = (t.HoraFinalMin - (Number(p.TiempoViaje) || 0)) - t.HoraInicioMin;
                  realVal = pAplanta - pEnObra;
                } else if (this.teoricoRealType === 'carga') {
                  xVal = t.HoraAsignacionMin; // Hora asignación teórica
                  teoVal = Number(p.TiempoCarga) || 0;
                  realVal = pAObra - pImpreso;
                } else if (this.teoricoRealType === 'llegada_obra') {
                  xVal = t.HoraInicioMin; // Hora teórica de descarga
                  teoVal = t.HoraInicioMin;
                  realVal = pEnObra;
                } else if (this.teoricoRealType === 'ciclo') {
                  xVal = t.HoraAsignacionMin; // Hora asignación teórica
                  teoVal = Number(p.TiempoCiclo) || 0;
                  realVal = pEnplanta - pImpreso;
                } else {
                  xVal = t.HoraAsignacionMin;
                  teoVal = t.HoraAsignacionMin;
                  realVal = pImpreso; // Hora real de asignación
                }

                pairedData.push({
                  pedido: p,
                  teo: t,
                  real: r,
                  x: xVal,
                  teoVal: teoVal,
                  realVal: realVal
                });
              }
            });
          });

          // Asignar métricas de volumen totales
          const totalVolTeorico = d3.sum(baseOrders, p => p.CantProgramada || 0);
          const totalVolReal = d3.sum(baseOrders, p => p.CantDespachada || 0);
          
          this.metrics = {
            volumenT: Math.round(totalVolReal), // Volumen real despachado
            volConfirmado: Math.round(totalVolTeorico) // Volumen programado total (Pedidos)
          };

          // Reconstruir grupos y actualizar dropdown de plantas
          window.grupos = {};
          Object.entries(window.plantasData).forEach(([code, p]) => {
            const g = p.grupo_despacho;
            if (g) {
              if (!window.grupos[g]) window.grupos[g] = [];
              window.grupos[g].push(code);
            }
          });
          this.fullPedidos = fullPedidos;
          this.updatePlantasOptions(date);

          // Redibujar gráfico SVG tipo Scatter Plot y gráfico de barras de atrasos
          this.$nextTick(() => {
            drawScatterTeoricoReal("#chart-global", "#chart-container-global", pairedData, granularidadMin, this.teoricoRealType);
            drawAtrasosBarChart("#chart-atrasos", "#chart-container-atrasos", pairedData, granularidadMin);
          });

        } else {
          // ==========================================
          // MODO PEDIDOS NORMAL (HISTORIAL 4 DÍAS DE PEDIDOS PROGRAMADOS)
          // ==========================================
          const resultsBySuffix = {};

          // Cargar secuencialmente los archivos correspondientes a los 4 sufijos bajo demanda
          const loadPromises = this.activeSuffixes.map(async (suffix) => {
            if (!this.capturaDates.includes(suffix)) return;

            // Verificar si el sufijo no está cargado ya en caché
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

            // Procesar y modelar el listado de pedidos cargados
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

            // Determinar plantas asociadas a cada grupo despacho
            const localGrupos = {};
            Object.entries(window.plantasData).forEach(([code, p]) => {
              const g = p.grupo_despacho;
              if (g) {
                if (!localGrupos[g]) localGrupos[g] = [];
                localGrupos[g].push(code);
              }
            });

            // Resolver códigos de plantas permitidos según el filtro de Planta / Grupo seleccionado
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

            // Filtrar pedidos según planta seleccionada
            const baseOrders = fullPedidos.filter(p => p["Fecha Pedido"] === date && (permitidas.length === 0 || permitidas.includes(p.Planta)));

            // Enrutar datos a stackear según el modo activo
            let dataToStack = [];
            if (this.activeMode === 'pedidos') {
              dataToStack = baseOrders.map(p => ({ ...p }));
            } else {
              // En modo despachos stackeamos los tickets reales asociados
              dataToStack = baseOrders.flatMap(p => (p.realDespachos || []).map(d => ({ ...d, parentPedido: p })));
            }

            const stackResult = buildStack(dataToStack);

            // Calcular acumulados de volumen y cantidad de pedidos activos
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

            // Almacenar el resultado consolidado del día histórico procesado
            resultsBySuffix[suffix] = {
              stackResult,
              dataToStack,
              cantPedidos,
              volumenT,
              volConfirmado: d3.sum(baseOrders.filter(p => p.Confirmado === "SI"), p => p.CantProgramada || 0)
            };
          });

          await Promise.all(loadPromises);

          // Encontrar escala máxima para eje Y
          const allOcupaciones = Object.values(resultsBySuffix).map(r => r.stackResult.ocupacionMax || 0);
          const globalYMax = d3.max(allOcupaciones) || 5;

          // Actualizar métricas del día actual
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

          // Inicializar dropdown con datos del primer día histórico representativo
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

          // Redibujar gráfico SVG normal
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
