const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const CARPETA_DATOS = path.join(__dirname, 'datos');
if (!fs.existsSync(CARPETA_DATOS)) {
    fs.mkdirSync(CARPETA_DATOS);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatearFecha = (fecha) => {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// Función para limpiar texto de basura conocida y versículos
const limpiarTexto = (texto) => {
    // Lista negra estricta
    const basura = ["ACI Prensa", "ChurchPOP", "EnglishEspaña", "PolskaMagyar", "SvenskaУкраїнськаDeutsch", "[email protected]", "VerEscucharBibliaTienda", "© EWTN", "Madre Angelica", "Sitios de noticias", "Más información", "Catolicismo"];
    
    for (const b of basura) {
        if (texto.includes(b)) return null; 
    }

    // Limpieza de versículos (ej. "1", "26", "22pero")
    let limpio = texto
        .replace(/\b\d+[a-z]?([A-ZÁÉÍÓÚÑ¿¡])/g, '$1') 
        .replace(/(^|\s)\d+[a-z]?\s+/g, ' ') 
        .replace(/\[\d+\]/g, '')
        .trim();

    return limpio;
};

async function extraerLecturasDelDia(fechaStr) {
    const url = `https://www.ewtn.com/es/lecturas/${fechaStr}`;

    try {
        console.log(`Buscando lecturas del: ${fechaStr}...`);
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        const $ = cheerio.load(response.data);
        
        let datosDia = { fecha: fechaStr, fiesta: "", color: "VERDE", lecturas: {} };
        
        // 1. Color y Fiesta
        $('div, span').each((i, el) => {
            if (i > 80) return;
            const text = $(el).text().trim().toUpperCase();
            
            if (text.includes("COLOR: MORADO") || text.includes("COLOR MORADO")) datosDia.color = "MORADO";
            else if (text.includes("COLOR: ROJO") || text.includes("COLOR ROJO")) datosDia.color = "ROJO";
            else if (text.includes("COLOR: BLANCO") || text.includes("COLOR BLANCO")) datosDia.color = "BLANCO";
            else if (text.includes("COLOR: ROSADO") || text.includes("COLOR ROSADO")) datosDia.color = "ROSADO";

            if (!datosDia.fiesta && text.length > 5 && text.length < 90 && (text.includes("FIESTA") || text.includes("MEMORIA") || text.includes("DOMINGO") || text.includes("SOLEMNIDAD") || text.includes("FERIA"))) {
                datosDia.fiesta = $(el).text().trim();
            }
        });

        // 2. Extracción Agresiva (Extrayendo todo el texto visible y dividiéndolo)
        let textoCompleto = "";
        $('.reading, .lecture, .content').each((i, el) => {
            textoCompleto += $(el).text() + "\n";
        });

        // Limpiar espacios múltiples y separar por líneas
        const lineas = textoCompleto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        let lecturas = {
            primera: { titulo: "Primera Lectura", referencia: "", texto: [] },
            salmo: { titulo: "Salmo", referencia: "", texto: [] },
            segunda: { titulo: "Segunda Lectura", referencia: "", texto: [] },
            evangelio: { titulo: "Evangelio", referencia: "", texto: [] }
        };
        let seccionActual = null;

        for (let i = 0; i < lineas.length; i++) {
            let linea = lineas[i];
            let upper = linea.toUpperCase();

            // Detectar secciones
            if (upper === "PRIMERA LECTURA" || upper === "LECTURA I") { seccionActual = "primera"; continue; }
            if (upper === "SALMO RESPONSORIAL" || (upper.includes("SALMO") && linea.length < 25)) { seccionActual = "salmo"; continue; }
            if (upper === "SEGUNDA LECTURA" || upper === "LECTURA II") { seccionActual = "segunda"; continue; }
            if (upper === "EVANGELIO" || upper === "SANTO EVANGELIO") { seccionActual = "evangelio"; continue; }

            if (seccionActual) {
                // Posible referencia bíblica
                if (!lecturas[seccionActual].referencia && linea.length < 100 && (linea.match(/\d+/) || linea.toLowerCase().includes("según"))) {
                    lecturas[seccionActual].referencia = linea.replace(/:\s*$/, "");
                    continue;
                }

                // Filtrar basura y agregar texto
                const textoFinal = limpiarTexto(linea);
                if (textoFinal && textoFinal.length > 5) {
                     // Evitar duplicados (un problema común en EWTN)
                     const ultimoPárrafo = lecturas[seccionActual].texto[lecturas[seccionActual].texto.length - 1];
                     if (textoFinal !== ultimoPárrafo) {
                         // Evitar agregar el párrafo gigante (a veces EWTN duplica todo el bloque antes de separarlo)
                         if (textoFinal.length < 1500) { 
                             lecturas[seccionActual].texto.push(textoFinal);
                         }
                     }
                }
            }
        }

        // Limpiar objetos vacíos
        for (const key in lecturas) {
            if (lecturas[key].texto.length === 0) {
                delete lecturas[key];
            }
        }
        
        datosDia.lecturas = lecturas;

        const rutaArchivo = path.join(CARPETA_DATOS, `${fechaStr}.json`);
        fs.writeFileSync(rutaArchivo, JSON.stringify(datosDia, null, 2), 'utf8');
        console.log(`✅ Guardado: ${fechaStr}.json`);

    } catch (error) {
        console.error(`❌ Error: ${fechaStr} - ${error.message}`);
    }
}

async function iniciarRobot() {
    let fechaActual = new Date('2026-11-04T12:00:00Z'); // EMPIEZA HOY
    const fechaFin = new Date('2026-11-10T12:00:00Z');  // PRUEBA DE 7 DÍAS

    console.log("🚀 Iniciando PRUEBA DE 7 DÍAS...");

    while (fechaActual <= fechaFin) {
        const fechaStr = formatearFecha(fechaActual);
        await extraerLecturasDelDia(fechaStr);
        await sleep(1500); 
        fechaActual.setDate(fechaActual.getDate() + 1); 
    }
    
    console.log("🎉 PRUEBA COMPLETADA. Revisa los archivos.");
}

iniciarRobot();