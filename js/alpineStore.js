document.addEventListener('alpine:init', () => {
    Alpine.store('filtros', {
        // Valores iniciales
        fecha: localStorage.getItem("filterFecha") || "",
        planta: localStorage.getItem("filterPlantaGrupo") || "Grupo:RM",
        viewGraph: localStorage.getItem("filterViewGraph") || "camiones",
        viewGantt: localStorage.getItem("filterViewGantt") || "pedidos",
        
        // Filtros secundarios
        codObra: "",
        camion: "",
        soloVerde: false,

        // Estética (CFG overrides)
        strokeWidth: parseFloat(localStorage.getItem("lineStrokeWidth")) || 1.0,
        opacity: parseFloat(localStorage.getItem("lineOpacity")) || 0.8,
        triangleOpacity: parseFloat(localStorage.getItem("triangleOpacity")) || 0.8,

        // Listas disponibles que serán pobladas por dashboard.js
        availableDates: [],
        availablePlantas: [],
        
        // Controlamos si la inicialización ya terminó para no disparar renders prematuros
        isInitialized: false,

        init() {
            // Este método se llama cuando Alpine inicializa el store
            // Podemos hacer setup adicional aquí si es necesario
        },

        // Método para cargar opciones dinámicamente desde dashboard.js
        setAvailableOptions(dates, plantas) {
            this.availableDates = dates;
            this.availablePlantas = plantas;
            
            // Validar que la fecha actual existe
            if (!this.availableDates.includes(this.fecha) && this.availableDates.length > 0) {
                this.fecha = this.availableDates[0];
            }
            
            this.isInitialized = true;
        }
    });

    // Efecto reactivo: Observa cambios en las variables principales del store
    Alpine.effect(() => {
        const store = Alpine.store('filtros');
        
        // Registramos "lecturas" de las variables para que Alpine sepa que debe re-evaluar este effect si cambian
        const currentFecha = store.fecha;
        const currentPlanta = store.planta;
        const currentViewGraph = store.viewGraph;
        const currentViewGantt = store.viewGantt;

        const currentCodObra = store.codObra;
        const currentCamion = store.camion;
        const currentSoloVerde = store.soloVerde;
        
        const currentStroke = store.strokeWidth;
        const currentOp = store.opacity;
        const currentTri = store.triangleOpacity;

        if (store.isInitialized) {
            // Persistimos en localStorage
            localStorage.setItem("filterFecha", currentFecha);
            localStorage.setItem("filterPlantaGrupo", currentPlanta);
            localStorage.setItem("filterViewGraph", currentViewGraph);
            localStorage.setItem("filterViewGantt", currentViewGantt);
            
            localStorage.setItem("lineStrokeWidth", currentStroke);
            localStorage.setItem("lineOpacity", currentOp);
            localStorage.setItem("triangleOpacity", currentTri);
            
            // Actualizar la variable global CFG para que D3 la use inmediatamente
            let aestheticsChanged = false;
            if (window.CFG) {
                if (window.CFG.lineStrokeWidth !== currentStroke || 
                    window.CFG.lineOpacity !== currentOp || 
                    window.CFG.triangleOpacity !== currentTri) {
                    aestheticsChanged = true;
                }
                window.CFG.lineStrokeWidth = currentStroke;
                window.CFG.lineOpacity = currentOp;
                window.CFG.triangleOpacity = currentTri;
            }
            
            // Si hay funciones específicas disponibles para estos inputs, las usamos para que D3 optimice
            if (window.handleObraInput && store.codObra !== window._lastCodObra) {
                window._lastCodObra = store.codObra;
                window.handleObraInput({ target: { value: store.codObra } });
            }
            if (window.handleCamionInput && store.camion !== window._lastCamion) {
                window._lastCamion = store.camion;
                window.handleCamionInput({ target: { value: store.camion } });
            }
            if (window.handleFilterCheck && store.soloVerde !== window._lastSoloVerde) {
                window._lastSoloVerde = store.soloVerde;
                window.handleFilterCheck(); 
            }
            if (aestheticsChanged && typeof window.updateVisualStyles === 'function') {
                window.updateVisualStyles();
            }
            
            // Avisar a D3 que redibuje TODO el tablero si cambiaron filtros primarios (fecha, planta, vistas)
            if (currentFecha !== window._lastFecha || currentPlanta !== window._lastPlanta || 
                currentViewGraph !== window._lastViewGraph || currentViewGantt !== window._lastViewGantt) {
                
                window._lastFecha = currentFecha;
                window._lastPlanta = currentPlanta;
                window._lastViewGraph = currentViewGraph;
                window._lastViewGantt = currentViewGantt;
                
                if (typeof window.reRenderDashboard === 'function') {
                    clearTimeout(window._reRenderTimeout);
                    window._reRenderTimeout = setTimeout(() => {
                        window.reRenderDashboard();
                    }, 10);
                }
            }
        }
    });
});
