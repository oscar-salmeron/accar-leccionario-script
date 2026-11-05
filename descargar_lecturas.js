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

// Limpieza agresiva de basura y números
const limpiarTexto = (texto) => {
    const basura = ["ACI Prensa", "ChurchPOP", "EnglishEspaña", "PolskaMagyar", "Svenska", "@", "VerEscuchar", "BibliaTienda", "© EWTN", "Madre Angelica", "Sitios de noticias", "Más información", "Catolicismo"];
    
    for (const b of basura) {
        if (texto.toLowerCase().includes(b.toLowerCase())) return null; 
    }

    let limpio = texto
        .replace(/(?:^|\s)\d+[a-z]?\s+/g, ' ') // Borra números sueltos (ej. " 1 ")
        .replace(/(?:^|\s)\d+[a-z]?([A-ZÁÉÍÓÚÑ¿¡—«"'-])/g, ' $1') // Borra números pegados a palabras (ej. "26—Si alguno")
        .replace(/\[\d+\]/g, '') // Borra estilo [1]
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
        
        // Destruir basura estructural desde el principio
        $('footer, nav, header, script, style, form, button, .social').remove();
        
        let datosDia = { fecha: fechaStr, fiesta: "", color: "VERDE", lecturas: {} };
        
        // 1. Atrapar Color y Fiesta (excluyendo fechas como "domingo 8")
        $('span, p, h1, h2, h3, h4, h5, div').each((i, el) => {
            if (i > 100) return;
            const text = $(el).text().trim();
            const upper = text.toUpperCase();
            
            if (upper.includes("COLOR: MORADO") || upper.includes("COLOR MORADO")) datosDia.color = "MORADO";
            else if (upper.includes("COLOR: ROJO") || upper.includes("COLOR ROJO")) datosDia.color = "ROJO";
            else if (upper.includes("COLOR: BLANCO") || upper.includes("COLOR BLANCO")) datosDia.color = "BLANCO";
            else if (upper.includes("COLOR: ROSADO") || upper.includes("COLOR ROSADO")) datosDia.color = "ROSADO";

            if (!datosDia.fiesta && text.length > 5 && text.length < 80) {
                if ((upper.includes("FIESTA") || upper.includes("MEMORIA") || upper.includes("SOLEMNIDAD") || upper.includes("FERIA")) && !upper.match(/\d{4}/)) {
                    datosDia.fiesta = text;
                }
            }
        });

        // 2. Extraer lecturas bloque por bloque
        let lecturas = {
            primera: { titulo: "Primera Lectura", referencia: "", texto: [] },
            salmo: { titulo: "Salmo", referencia: "", texto: [] },
            segunda: { titulo: "Segunda Lectura", referencia: "", texto: [] },
            evangelio: { titulo: "Evangelio", referencia: "", texto: [] }
        };
        
        let seccionActual = null;

        $('h2, h3, h4, h5, p, cite, .reference').each((i, el) => {
            const rawText = $(el).text().trim().replace(/\s+/g, ' ');
            if (rawText.length < 2) return;
            
            const upper = rawText.toUpperCase();

            // Encontrar qué lectura estamos escaneando
            if (upper === "PRIMERA LECTURA" || upper === "LECTURA I") { seccionActual = "primera"; return; }
            if (upper === "SALMO RESPONSORIAL" || (upper.includes("SALMO") && rawText.length < 25)) { seccionActual = "salmo"; return; }
            if (upper === "SEGUNDA LECTURA" || upper === "LECTURA II") { seccionActual = "segunda"; return; }
            if (upper === "EVANGELIO" || upper === "SANTO EVANGELIO") { seccionActual = "evangelio"; return; }

            if (seccionActual) {
                // Atrapar la cita bíblica (ej. Lucas 14:25-33)
                if (!lecturas[seccionActual].referencia && rawText.length < 100 && (rawText.match(/\d+/) || rawText.toLowerCase().includes("según"))) {
                    if (upper !== "ALELUYA") {
                        lecturas[seccionActual].referencia = rawText.replace(/:\s*$/, "");
                        return;
                    }
                }

                // Atrapar y limpiar los párrafos
                const textoFinal = limpiarTexto(rawText);
                if (textoFinal && textoFinal.length > 5) {
                     const currentArray = lecturas[seccionActual].texto;
                     // Evitar que EWTN nos meta párrafos duplicados
                     if (currentArray.length === 0 || currentArray[currentArray.length - 1] !== textoFinal) {
                         if (textoFinal.length < 1500) { // Ignorar bloques contenedores gigantes
                             currentArray.push(textoFinal);
                         }
                     }
                }
            }
        });

        // Eliminar lecturas que no aparecieron hoy (ej. si no hay Segunda Lectura)
        for (const key in lecturas) {
            if (lecturas[key].texto.length === 0) {
                delete lecturas[key];
            }
        }
        
        datosDia.lecturas = lecturas;

        const rutaArchivo = path.join(CARPETA_DATOS, `${fechaStr}.json`);
        fs.writeFileSync(rutaArchivo, JSON.stringify(datosDia, null, 2), 'utf8');
        console.log(`✅ Guardado perfecto y limpio: ${fechaStr}.json`);

    } catch (error) {
        console.error(`❌ Error: ${fechaStr} - ${error.message}`);
    }
}

async function iniciarRobot() {
    let fechaActual = new Date('2026-11-04T12:00:00Z'); 
    const fechaFin = new Date('2026-11-10T12:00:00Z');  // PRUEBA DE 7 DÍAS

    console.log("🚀 Iniciando PRUEBA DE 7 DÍAS ABSOLUTA...");

    while (fechaActual <= fechaFin) {
        const fechaStr = formatearFecha(fechaActual);
        await extraerLecturasDelDia(fechaStr);
        await sleep(1500); 
        fechaActual.setDate(fechaActual.getDate() + 1); 
    }
    
    console.log("🎉 PRUEBA COMPLETADA. Revisa los archivos.");
}

iniciarRobot();