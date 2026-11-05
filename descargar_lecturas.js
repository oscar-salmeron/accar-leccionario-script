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
        
        let datosDia = { 
            fecha: fechaStr, 
            fiesta: "", 
            color: "VERDE", 
            lecturas: {} 
        };

        // 1. Detección de Fiestas y Color Litúrgico
        // EWTN suele poner el color o fiesta en divs informativos al inicio.
        $('div, span').each((i, el) => {
            if (i > 50) return; // Solo buscar al inicio de la página
            let txt = $(el).text().trim().toUpperCase();
            
            if (txt.includes("COLOR: MORADO") || txt.includes("COLOR MORADO")) datosDia.color = "MORADO";
            else if (txt.includes("COLOR: ROJO") || txt.includes("COLOR ROJO")) datosDia.color = "ROJO";
            else if (txt.includes("COLOR: BLANCO") || txt.includes("COLOR BLANCO")) datosDia.color = "BLANCO";
            else if (txt.includes("COLOR: ROSADO") || txt.includes("COLOR ROSADO")) datosDia.color = "ROSADO";

            if (!datosDia.fiesta && txt.length > 5 && txt.length < 80 && (txt.includes("FIESTA") || txt.includes("MEMORIA") || txt.includes("DOMINGO") || txt.includes("SOLEMNIDAD"))) {
                datosDia.fiesta = $(el).text().trim(); // Guardamos con mayúsculas/minúsculas originales
            }
        });

        // 2. Extracción estricta SOLO dentro de los bloques de lectura
        // EWTN encapsula cada lectura en un <div class="reading"> o similar.
        $('.reading, .lecture, .content').each((indexLectura, divLectura) => {
            
            let tipo = "";
            let referencia = "";
            let parrafos = [];
            
            // Buscar títulos (h2, h3)
            $(divLectura).find('h2, h3, h4').each((i, el) => {
                let txt = $(el).text().trim().toUpperCase();
                if (txt.includes("PRIMERA") || txt === "LECTURA I") tipo = "primera";
                else if (txt.includes("SEGUNDA") || txt === "LECTURA II") tipo = "segunda";
                else if (txt.includes("SALMO")) tipo = "salmo";
                else if (txt.includes("EVANGELIO")) tipo = "evangelio";
            });

            if (!tipo) return; // Ignorar si no es una lectura válida

            // Buscar la referencia (suele estar en un div.reference o cite)
            $(divLectura).find('.reference, cite, .ref').each((i, el) => {
                referencia = $(el).text().trim();
            });

            // Buscar los párrafos
            $(divLectura).find('p, .text').each((i, el) => {
                let pTxt = $(el).text().trim();
                
                // Si la referencia no se encontró arriba, a veces está en el primer párrafo cortito
                if (!referencia && i === 0 && pTxt.length < 100 && (pTxt.match(/\d+/) || pTxt.toLowerCase().includes("según"))) {
                    referencia = pTxt;
                    return; // Saltamos para que no lo meta al texto
                }

                // Limpieza de versículos del texto (ej. "1", "25", "12a")
                let txtLimpio = pTxt
                    .replace(/\b\d+[a-z]?([A-ZÁÉÍÓÚÑ¿¡])/g, '$1') 
                    .replace(/(^|\s)\d+[a-z]?\s+/g, ' ') 
                    .replace(/\[\d+\]/g, '') 
                    .trim();
                
                if (txtLimpio.length > 5) {
                    // Evitar duplicados (a veces EWTN repite el texto en la versión móvil)
                    if (!parrafos.includes(txtLimpio)) {
                        parrafos.push(txtLimpio);
                    }
                }
            });

            // Guardar en el objeto
            if (parrafos.length > 0) {
                datosDia.lecturas[tipo] = {
                    titulo: tipo === "primera" ? "Primera Lectura" : 
                            tipo === "segunda" ? "Segunda Lectura" : 
                            tipo === "salmo" ? "Salmo" : "Evangelio",
                    referencia: referencia.replace(/:\s*$/, ""),
                    texto: parrafos
                };
            }
        });

        // Si después del bucle no encontró lecturas estructuradas (fallback a la antigua pero limpio)
        if (Object.keys(datosDia.lecturas).length === 0) {
            console.log(`⚠️ Advertencia: Estructura no estándar en ${fechaStr}. Aplicando fallback.`);
            // Aquí iría el código fallback si EWTN cambia su diseño por completo, 
            // pero para este paso confiaremos en la extracción estricta de arriba.
        }

        const rutaArchivo = path.join(CARPETA_DATOS, `${fechaStr}.json`);
        fs.writeFileSync(rutaArchivo, JSON.stringify(datosDia, null, 2), 'utf8');
        console.log(`✅ Guardado con éxito y ultra-limpio: ${fechaStr}.json`);

    } catch (error) {
        console.error(`❌ Error extrayendo ${fechaStr}: Status ${error.response ? error.response.status : error.message}`);
    }
}

async function iniciarRobot() {
    let fechaActual = new Date('2026-11-02T12:00:00Z');
    const fechaFin = new Date('2027-11-27T12:00:00Z'); 

    console.log("🚀 Iniciando extracción ESTRICTA del Leccionario...");

    while (fechaActual <= fechaFin) {
        const fechaStr = formatearFecha(fechaActual);
        await extraerLecturasDelDia(fechaStr);
        await sleep(1500); 
        fechaActual.setDate(fechaActual.getDate() + 1); 
    }
    
    console.log("🎉 ¡PROCESO COMPLETADO! Base de datos perfecta.");
}

iniciarRobot();