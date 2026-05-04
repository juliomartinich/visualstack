/* ================== CONFIGURATION ================== */
const CFG = {
    granularidadMin: 5, // minutos por slot
    horaInicio: 6,      // 6 AM
    horaFin: 20,        // 8 PM
    yStep: 20,          // grilla eje Y cuadricula en 20 camiones
    lineStrokeWidth: parseFloat(localStorage.getItem("lineStrokeWidth")) || 0.5,
    lineOpacity: parseFloat(localStorage.getItem("lineOpacity")) || 0.8,
    triangleOpacity: parseFloat(localStorage.getItem("triangleOpacity")) || 1.0
};

const COLORS = {
    active: "rgba(255,140,0,0.8)",
    mono: "rgba(40,167,69,0.7)",         // Verde estándar
    multi: "rgba(0,0,139,0.7)",        // Azul dark
    singleOrder: "rgba(0,100,0,0.8)",   // Verde oscuro
    unconfirmed: "purple"
};

const AREACOLORS = {
    singleOrder: "rgba(0,100,0,0.2)",
    unconfirmed: "rgba(128, 0, 128, 0.2)"
};
