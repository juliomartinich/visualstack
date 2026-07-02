# Diagrama de Llamados de Funciones (Call Hierarchy)

Este diagrama representa el flujo de ejecución, inicialización de datos y el renderizado del tablero interactivo, detallando la interacción entre los distintos módulos de scripts de la aplicación.

```mermaid
flowchart TD
    %% Estilo de nodos
    classDef init fill:#d4ebf2,stroke:#333,stroke-width:2px;
    classDef helpers fill:#f9f9f9,stroke:#666,stroke-width:1px;
    classDef db fill:#ffe8d6,stroke:#ff8c00,stroke-width:2px;
    classDef lib fill:#e2e2e2,stroke:#999,stroke-width:1px;

    %% Flujo de Inicialización
    Start([Carga Inicial de Página]) --> loader[dataLoader.js: loadAppData]
    loader -->|Promise.all| files[(Pedidos.json<br>colores.json<br>plantas.json<br>Tick.json)]
    
    %% Mapeo inicial
    loader -.-> extNeg[dataUtils: extendPedidoNegocio]
    loader -.-> extXG[dataUtils: extendPedidoXG]
    loader -.-> calcTeo[dataUtils: calculateDespachosForPedido]
    loader -.-> calcReal[dataUtils: calculateRealDespachosForPedido]
    
    loader -->|Resuelve Promesa| thenBlock{Callback .then}:::init
    thenBlock -->|Almacena variables globales y llama| initApp[main.js: initApp]:::init
    
    %% initApp setup
    initApp --> popDates[main.js: populateDateSelect]:::helpers
    initApp --> updStyles[main.js: updateSelectStyle]:::helpers
    initApp --> updFilters[main.js: updateFiltersForDate]:::helpers
    initApp --> dateOpts[main.js: renderDateOptionsForFilter]:::helpers
    initApp --> renderDb[main.js: renderDashboard]:::db
    
    %% Manejadores de Eventos
    subgraph Eventos [Escuchadores de Eventos y Handlers]
        evtDate[Cambio de Fecha] --> handleDate[main.js: handleDateChange]:::helpers
        evtPlant[Cambio de Planta] --> handlePlanta[Manejador Planta Change]:::helpers
        evtObra[Input Código Obra] --> handleObra[main.js: handleObraInput]:::helpers
        evtFilter[Checkbox Filtro Verde] --> handleFltGreen[main.js: handleFilterCheck]:::helpers
    end

    handleDate --> updFilters
    handleDate --> dateOpts
    handleDate --> renderDb

    handlePlanta --> dateOpts
    handlePlanta --> renderDb
    
    handleObra -.-> highlight[d3.selectAll.style area]
    handleObra -.-> selPed[interaction.js: selectPedido]
    handleObra -.-> movCur[interaction.js: moveCursorTo]
    
    handleFltGreen --> ganttShow[ganttPanel.show]
    
    %% renderDashboard Rendering Engine
    subgraph RenderEngine [Tablero: renderDashboard]:::db
        checkCache{¿Existe en appCache?}
        checkCache -->|Sí| draw[Proceso de Dibujo]
        checkCache -->|No| runSims[Ejecutar Simulaciones de Stack]
        
        %% Stacking
        runSims --> enrich[main.js: enrichPedidosForDate]:::helpers
        runSims --> bStack[stackUtils: buildStack]:::lib
        runSims --> bPlant[stackUtils: buildPlantLoadStack]:::lib
        runSims --> bColas[stackUtils: buildColasStack]:::lib
        
        %% Layout
        runSims --> saveCache[Guardar en appCache]
        saveCache --> draw
        
        %% Dibujo D3
        draw --> cScales[chartUtils: createScales]:::lib
        draw --> cAxes[chartUtils: drawAxes]:::lib
        draw --> cOverlay[main.js: drawTopOverlay]:::helpers
        
        %% Vistas condicionales
        draw --> viewCheck{Tipo de Gráfico}
        
        viewCheck -->|plantas / Asignaciones| drawPlant[chartUtils: drawPlantLoads]:::lib
        viewCheck -->|colas / Plantas| drawColas[chartUtils: drawColasLoads / drawPlantLoads]:::lib
        viewCheck -->|recursos| drawRec[Dibujar Camiones + Asignaciones + Colas]:::lib
        
        drawPlant --> drawCap[chartUtils: drawCapacityLine]
        drawPlant --> drawLftAx[chartUtils: drawLeftAxis]
        drawPlant --> drawDelC[chartUtils: drawDelayCurve]
        drawPlant --> drawRgtAx[chartUtils: drawRightAxis]
        
        drawColas --> drawCap
        drawColas --> drawLftAx
        drawColas --> drawDelC
        drawColas --> drawRgtAx
        
        %% Gantt Panel
        draw --> drawGantt[chartUtils: drawGanttPanel]:::lib
        drawGantt --> ganttShow2[ganttPanel.show]:::lib
    end
```
