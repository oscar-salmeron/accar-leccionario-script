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

async function extraerLecturasDelDia(fechaStr) {
    const url = `https://www.ewtn.com/es/lecturas/${fechaStr}`;

    try {
        console.log(`Buscando lecturas del: ${fechaStr}...`);
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        const $ = cheerio.load(response.data);
        
        let datosDia = { fecha: fechaStr, fiesta: "", color: "VERDE", lecturas: {} };
        let currentType = null;
        let lecturasEncontradas = {};
        
        // Leemos todo el documento secuencialmente de arriba hacia abajo
        $('*').each((i, el) => {
            const tagName = el.tagName.toLowerCase();
            const rawText = $(el).text().trim().replace(/\s+/g, ' ');
            if (!rawText) return;
            
            const upper = rawText.toUpperCase();

            // 1. Atrapar Color y Fiesta (solo si aún no hemos llegado a las lecturas)
            if (!currentType && i < 150) {
                if (upper.includes("COLOR: MORADO") || upper.includes("COLOR MORADO")) datosDia.color = "MORADO";
                else if (upper.includes("COLOR: ROJO") || upper.includes("COLOR ROJO")) datosDia.color = "ROJO";
                else if (upper.includes("COLOR: BLANCO") || upper.includes("COLOR BLANCO")) datosDia.color = "BLANCO";
                else if (upper.includes("COLOR: ROSADO") || upper.includes("COLOR ROSADO")) datosDia.color = "ROSADO";

                if (!datosDia.fiesta && rawText.length > 5 && rawText.length < 90 && (upper.includes("FIESTA") || upper.includes("MEMORIA") || upper.includes("DOMINGO") || upper.includes("SOLEMNIDAD"))) {
                    datosDia.fiesta = rawText; 
                }
            }

            // 2. Detectar cambios de sección (Títulos de lectura)
            if (['h2', 'h3', 'h4', 'h5', 'div'].includes(tagName)) {
                if (upper === "PRIMERA LECTURA" || upper === "LECTURA I") { currentType = 'primera'; lecturasEncontradas[currentType] = { titulo: "Primera Lectura", referencia: "", texto: [] }; return; }
                if (upper === "SALMO RESPONSORIAL" || (upper.includes("SALMO") && rawText.length < 25)) { currentType = 'salmo'; lecturasEncontradas[currentType] = { titulo: "Salmo", referencia: "", texto: [] }; return; }
                if (upper === "SEGUNDA LECTURA" || upper === "LECTURA II") { currentType = 'segunda'; lecturasEncontradas[currentType] = { titulo: "Segunda Lectura", referencia: "", texto: [] }; return; }
                if (upper === "EVANGELIO" || upper === "SANTO EVANGELIO") { currentType = 'evangelio'; lecturasEncontradas[currentType] = { titulo: "Evangelio", referencia: "", texto: [] }; return; }
            }

            // 3. Extraer Referencia y Texto para la sección actual
            if (currentType) {
                // Filtramos basura de EWTN (copyright, links de email, footer)
                const isGarbage = upper.includes("EWTN") || upper.includes("DERECHOS RESERVADOS") || upper.includes("MADRE ANGELICA") || rawText.includes("@") || upper === "CATOLICISMO" || upper === "MÁS INFORMACIÓN";
                if (isGarbage) return;

                // Si es un texto corto con números, probablemente es la referencia bíblica
                if (!lecturasEncontradas[currentType].referencia && rawText.length < 100 && (rawText.match(/\d+/) || rawText.toLowerCase().includes("según"))) {
                    lecturasEncontradas[currentType].referencia = rawText.replace(/:\s*$/, "");
                    return;
                }

                // Si es texto de párrafo (nos aseguramos que sea un elemento final sin hijos estructurales)
                if (['p', 'div', 'span'].includes(tagName) && $(el).children('p, div, h2, h3').length === 0) {
                    if (rawText.length > 10 || (currentType === 'salmo' && rawText.length > 3)) {
                        
                        // LIMPIEZA QUIRÚRGICA DE VERSÍCULOS
                        let txtLimpio = rawText
                            .replace(/\b\d+[a-z]?([A-ZÁÉÍÓÚÑ¿¡])/g, '$1') 
                            .replace(/(^|\s)\d+[a-z]?\s+/g, ' ') 
                            .replace(/\[\d+\]/g, '') 
                            .trim();
                        
                        // Evitar duplicados consecutivos
                        const currentArray = lecturasEncontradas[currentType].texto;
                        if (txtLimpio && (currentArray.length === 0 || currentArray[currentArray.length - 1] !== txtLimpio)) {
                             currentArray.push(txtLimpio);
                        }
                    }
                }
            }
        });

        datosDia.lecturas = lecturasEncontradas;

        if (Object.keys(datosDia.lecturas).length === 0) {
            console.log(`⚠️ Advertencia: No se encontraron lecturas para ${fechaStr}.`);
        } else {
            const rutaArchivo = path.join(CARPETA_DATOS, `${fechaStr}.json`);
            fs.writeFileSync(rutaArchivo, JSON.stringify(datosDia, null, 2), 'utf8');
            console.log(`✅ Guardado perfecto y limpio: ${fechaStr}.json`);
        }

    } catch (error) {
        console.error(`❌ Error extrayendo ${fechaStr}: Status ${error.response ? error.response.status : error.message}`);
    }
}

async function iniciarRobot() {
    let fechaActual = new Date('2026-11-02T12:00:00Z');
    const fechaFin = new Date('2027-11-27T12:00:00Z'); 

    console.log("🚀 Iniciando extracción SECUENCIAL E INTELIGENTE del Leccionario...");

    while (fechaActual <= fechaFin) {
        const fechaStr = formatearFecha(fechaActual);
        await extraerLecturasDelDia(fechaStr);
        await sleep(1500); 
        fechaActual.setDate(fechaActual.getDate() + 1); 
    }
    
    console.log("🎉 ¡PROCESO COMPLETADO! Base de datos de alta calidad lista.");
}

iniciarRobot();