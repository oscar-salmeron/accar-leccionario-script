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

// Limpieza para extraer referencias y textos puros
const limpiarTexto = (texto) => {
    const basura = ["ACI Prensa", "ChurchPOP", "EnglishEspaña", "PolskaMagyar", "Svenska", "Deutsch", "Українська", "@", "VerEscuchar", "BibliaTienda", "© EWTN", "Madre Angelica", "Sitios de noticias", "Más información", "Catolicismo", "Comparte estas lecturas diarias"];
    for (const b of basura) {
        if (texto.toLowerCase().includes(b.toLowerCase())) return null; 
    }
    
    // Elimina números adheridos a letras (ej. "28»Porque") y corchetes
    let limpio = texto
        .replace(/(?:^|\s)\d+[a-z]?\s+/g, ' ') 
        .replace(/(?:^|\s)\d+[a-z]?([A-ZÁÉÍÓÚÑ¿¡—«"'-])/g, ' $1')
        .replace(/\[\d+\]/g, '') 
        .replace(/»/g, '')
        .trim();
    return limpio;
};

async function extraerLecturasDelDia(fechaStr) {
    const url = `https://www.ewtn.com/es/lecturas/${fechaStr}`;

    try {
        console.log(`Analizando lecturas del: ${fechaStr}...`);
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        const $ = cheerio.load(response.data);
        $('footer, nav, header, script, style, form, button, .social, img').remove();
        
        let datosDia = { fecha: fechaStr, fiesta: "", color: "VERDE", lecturas: {} };
        let cuerpoTexto = [];

        // 1. Extraer TODAS las líneas con contenido útil
        $('*').each((i, el) => {
            if ($(el).children().length === 0) { 
                let txt = $(el).text().trim().replace(/\s+/g, ' ');
                if (txt.length > 2) cuerpoTexto.push(txt);
            }
        });

        // 2. Extraer Fiesta y Color 
        for (let i = 0; i < Math.min(30, cuerpoTexto.length); i++) {
            let linea = cuerpoTexto[i];
            let upper = linea.toUpperCase();
            
            if (upper.includes("COLOR: MORADO") || upper.includes("COLOR MORADO")) datosDia.color = "MORADO";
            else if (upper.includes("COLOR: ROJO") || upper.includes("COLOR ROJO")) datosDia.color = "ROJO";
            else if (upper.includes("COLOR: BLANCO") || upper.includes("COLOR BLANCO")) datosDia.color = "BLANCO";
            else if (upper.includes("COLOR: ROSADO") || upper.includes("COLOR ROSADO")) datosDia.color = "ROSADO";

            if (!datosDia.fiesta && (upper.includes("FIESTA") || upper.includes("MEMORIA") || upper.includes("SOLEMNIDAD"))) {
                 datosDia.fiesta = linea.replace(/Comparte estas lecturas diarias/gi, '').trim();
            }
        }

        let tipoActual = null;
        let lecturas = {};
        
        // 3. Analizar línea por línea (El motor de lectura)
        for (let i = 0; i < cuerpoTexto.length; i++) {
            let linea = cuerpoTexto[i];
            let upper = linea.toUpperCase();

            const textoLimpio = limpiarTexto(linea);
            if (!textoLimpio) continue;

            // Detectar los títulos aunque EWTN les cambie el nombre
            let isSectionHeader = false;
            if (/PRIMERA LECTURA|LECTURA I$|LECTURA 1|1RA LECTURA|1A LECTURA/.test(upper)) { 
                tipoActual = "primera"; 
                if (!lecturas[tipoActual]) lecturas[tipoActual] = { titulo: "Primera Lectura", referencia: "", texto: [] };
                isSectionHeader = true; 
            }
            else if (/SALMO RESPONSORIAL|^SALMO$/.test(upper)) { 
                tipoActual = "salmo"; 
                if (!lecturas[tipoActual]) lecturas[tipoActual] = { titulo: "Salmo", referencia: "", texto: [] };
                isSectionHeader = true; 
            }
            else if (/SEGUNDA LECTURA|LECTURA II$|LECTURA 2|2DA LECTURA|2A LECTURA/.test(upper)) { 
                tipoActual = "segunda"; 
                if (!lecturas[tipoActual]) lecturas[tipoActual] = { titulo: "Segunda Lectura", referencia: "", texto: [] };
                isSectionHeader = true; 
            }
            else if (/EVANGELIO/.test(upper) && !upper.includes("ALELUYA")) { 
                tipoActual = "evangelio"; 
                if (!lecturas[tipoActual]) lecturas[tipoActual] = { titulo: "Evangelio", referencia: "", texto: [] };
                isSectionHeader = true; 
            }

            if (isSectionHeader) continue;

            // Escudo: Si EWTN omitió por completo el título "Primera Lectura" y empezó con la cita bíblica
            if (!tipoActual && /^(\d\s)?[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+\s\d+\s*[:,]\d+/.test(textoLimpio)) {
                tipoActual = "primera";
                lecturas[tipoActual] = { titulo: "Primera Lectura", referencia: textoLimpio.replace(/:\s*$/, "").replace(/, -/g, ", "), texto: [] };
                continue;
            }

            if (tipoActual) {
                // Atrapa la referencia bíblica
                const regexReferencia = /^(\d\s)?[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+\s\d+\s*[:,]\d+/; 
                const regexSalmo = /^(\d\s)?[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+\s\d+\s*$/; 
                
                if (!lecturas[tipoActual].referencia && textoLimpio.length < 100 && (regexReferencia.test(textoLimpio) || regexSalmo.test(textoLimpio) || textoLimpio.toLowerCase().includes("según "))) {
                    lecturas[tipoActual].referencia = textoLimpio.replace(/:\s*$/, "").replace(/, -/g, ", ");
                    continue;
                }

                // Extrae los párrafos sin repetir
                if (textoLimpio.length > 15 || (tipoActual === "salmo" && textoLimpio.length > 5)) {
                    let currentArray = lecturas[tipoActual].texto;
                    if (currentArray.length === 0 || currentArray[currentArray.length - 1] !== textoLimpio) {
                        currentArray.push(textoLimpio);
                    }
                }
            }
        }

        // Limpiar secciones que quedaron vacías
        for (const key in lecturas) {
            if (lecturas[key].texto.length === 0) delete lecturas[key];
        }

        datosDia.lecturas = lecturas;
        
        const rutaArchivo = path.join(CARPETA_DATOS, `${fechaStr}.json`);
        fs.writeFileSync(rutaArchivo, JSON.stringify(datosDia, null, 2), 'utf8');
        console.log(`✅ Guardado definitivo: ${fechaStr}.json`);

    } catch (error) {
        console.error(`❌ Error en ${fechaStr}: ${error.message}`);
    }
}

async function iniciarRobot() {
    let fechaActual = new Date('2026-11-04T12:00:00Z'); 
    const fechaFin = new Date('2026-11-10T12:00:00Z');  

    console.log("🚀 Iniciando extracción ULTRA-ROBUSTA (4 al 10 de noviembre)...");

    while (fechaActual <= fechaFin) {
        const fechaStr = formatearFecha(fechaActual);
        await extraerLecturasDelDia(fechaStr);
        await sleep(1500); 
        fechaActual.setDate(fechaActual.getDate() + 1); 
    }
    console.log("🎉 Extracción finalizada.");
}

iniciarRobot();