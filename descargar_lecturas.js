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
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        const $ = cheerio.load(response.data);
        let datosDia = { fecha: fechaStr, fiesta: "", color: "VERDE", lecturas: {} };
        
        let currentReading = null;
        let readingData = {
            primera: { ref: "", text: [] },
            salmo: { ref: "", text: [] },
            segunda: { ref: "", text: [] },
            evangelio: { ref: "", text: [] }
        };

        let allTexts = [];
        
        // Extracción profunda para atrapar citas y párrafos separados
        $('h1, h2, h3, h4, h5, p, cite, span, div.title, div.reference, div.text').each((i, el) => {
            if ($(el).children('p, div, h2, h3').length === 0) {
                let txt = $(el).text().trim().replace(/\s+/g, ' ');
                if (txt.length > 3) allTexts.push(txt);
            }
        });

        for (let i = 0; i < allTexts.length; i++) {
            let txt = allTexts[i];
            let upper = txt.toUpperCase();

            // Detectar Colores
            if (upper.includes("COLOR: MORADO") || upper.includes("COLOR MORADO")) datosDia.color = "MORADO";
            else if (upper.includes("COLOR: ROJO") || upper.includes("COLOR ROJO")) datosDia.color = "ROJO";
            else if (upper.includes("COLOR: BLANCO") || upper.includes("COLOR BLANCO")) datosDia.color = "BLANCO";
            else if (upper.includes("COLOR: ROSADO") || upper.includes("COLOR ROSADO")) datosDia.color = "ROSADO";

            // Detectar Fiestas
            if (i < 15 && !datosDia.fiesta && (upper.includes("FIESTA") || upper.includes("MEMORIA") || upper.includes("DOMINGO") || upper.includes("SOLEMNIDAD"))) {
                if (txt.length < 100) datosDia.fiesta = txt;
            }

            // Detectar Encabezados
            let matchedHeader = false;
            if (upper === "PRIMERA LECTURA" || upper === "LECTURA I") { currentReading = "primera"; matchedHeader = true; }
            else if (upper === "SALMO RESPONSORIAL" || (upper.includes("SALMO") && txt.length < 25)) { currentReading = "salmo"; matchedHeader = true; }
            else if (upper === "SEGUNDA LECTURA" || upper === "LECTURA II") { currentReading = "segunda"; matchedHeader = true; }
            else if (upper === "EVANGELIO" || upper === "SANTO EVANGELIO") { currentReading = "evangelio"; matchedHeader = true; }

            if (matchedHeader) continue;

            if (currentReading) {
                let esReferencia = false;
                if (readingData[currentReading].text.length === 0 && txt.length < 150) {
                    if (txt.match(/\d+,\s*\d+/) || upper.startsWith("LECTURA ") || upper.startsWith("SANTO EVANGELIO") || upper.startsWith("DEL SANTO EVANGELIO")) {
                        esReferencia = true;
                    }
                }

                if (esReferencia) {
                    readingData[currentReading].ref += (readingData[currentReading].ref ? " " : "") + txt;
                } else {
                    // LIMPIEZA DE NÚMEROS DE VERSÍCULOS EN LA BASE DE DATOS
                    let txtLimpio = txt
                        .replace(/\b\d+[a-z]?([A-ZÁÉÍÓÚÑ¿¡])/g, '$1') 
                        .replace(/(^|\s)\d+[a-z]?\s+/g, ' ') 
                        .replace(/\[\d+\]/g, '') 
                        .trim();
                        
                    if (txtLimpio.length > 10 || (currentReading === 'salmo' && txtLimpio.length > 3)) { 
                        readingData[currentReading].text.push(txtLimpio);
                    }
                }
            }
        }

        // Armado de la estructura limpia JSON
        if (readingData.primera.text.length > 0) {
            datosDia.lecturas.primera = { titulo: "Primera Lectura", referencia: readingData.primera.ref || "", texto: readingData.primera.text };
        }
        if (readingData.salmo.text.length > 0) {
            datosDia.lecturas.salmo = { titulo: "Salmo", referencia: readingData.salmo.ref || "Salmo Responsorial", texto: readingData.salmo.text };
        }
        if (readingData.segunda.text.length > 0) {
            datosDia.lecturas.segunda = { titulo: "Segunda Lectura", referencia: readingData.segunda.ref || "", texto: readingData.segunda.text };
        }
        if (readingData.evangelio.text.length > 0) {
            datosDia.lecturas.evangelio = { titulo: "Evangelio", referencia: readingData.evangelio.ref || "", texto: readingData.evangelio.text };
        }

        const rutaArchivo = path.join(CARPETA_DATOS, `${fechaStr}.json`);
        fs.writeFileSync(rutaArchivo, JSON.stringify(datosDia, null, 2), 'utf8');
        console.log(`✅ Guardado con éxito y limpio: ${fechaStr}.json`);

    } catch (error) {
        console.error(`❌ Error extrayendo ${fechaStr}: Status ${error.response ? error.response.status : error.message}`);
    }
}

async function iniciarRobot() {
    let fechaActual = new Date('2026-11-02T12:00:00Z');
    const fechaFin = new Date('2027-11-27T12:00:00Z'); 

    console.log("🚀 Iniciando extracción del Leccionario con limpieza de versículos...");

    while (fechaActual <= fechaFin) {
        const fechaStr = formatearFecha(fechaActual);
        await extraerLecturasDelDia(fechaStr);
        await sleep(1500); 
        fechaActual.setDate(fechaActual.getDate() + 1); 
    }
    
    console.log("🎉 ¡PROCESO COMPLETADO! Base de datos de alta calidad lista.");
}

iniciarRobot();