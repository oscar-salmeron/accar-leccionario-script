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
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            }
        });
        
        const $ = cheerio.load(response.data);
        let textosExtraidos = [];
        
        $('.container p, .reading p, .content p').each((i, el) => {
            let txt = $(el).text().trim();
            if(txt.length > 20) textosExtraidos.push(txt);
        });

        let datosDia = {
            fecha: fechaStr,
            fiesta: "", 
            color: "VERDE", 
            lecturas: {}
        };

        if (textosExtraidos.length >= 4) {
            datosDia.lecturas.primera = { titulo: "Primera Lectura", texto: textosExtraidos[0] };
            datosDia.lecturas.salmo = { titulo: "Salmo Responsorial", texto: textosExtraidos[1] };
            datosDia.lecturas.segunda = { titulo: "Segunda Lectura", texto: textosExtraidos[2] };
            datosDia.lecturas.evangelio = { titulo: "Evangelio", texto: textosExtraidos[3] };
        } else if (textosExtraidos.length === 3) {
            datosDia.lecturas.primera = { titulo: "Primera Lectura", texto: textosExtraidos[0] };
            datosDia.lecturas.salmo = { titulo: "Salmo Responsorial", texto: textosExtraidos[1] };
            datosDia.lecturas.evangelio = { titulo: "Evangelio", texto: textosExtraidos[2] };
        } else {
            datosDia.lecturas.primera = { titulo: "Lectura Única", texto: textosExtraidos[0] || "No encontrada" };
        }

        const rutaArchivo = path.join(CARPETA_DATOS, `${fechaStr}.json`);
        fs.writeFileSync(rutaArchivo, JSON.stringify(datosDia, null, 2), 'utf8');
        console.log(`✅ Guardado con éxito: ${fechaStr}.json`);

    } catch (error) {
        console.error(`❌ Error extrayendo ${fechaStr}: Status ${error.response ? error.response.status : error.message}`);
    }
}

async function iniciarRobot() {
    // FECHAS LISTAS PARA DISPARAR EN CASO DE EMERGENCIA
    let fechaActual = new Date('2026-11-02T12:00:00Z');
    // EWTN marca error 500 después de esta fecha (inicio de nuevo año litúrgico)
    const fechaFin = new Date('2027-11-27T12:00:00Z'); 

    console.log("🚀 Iniciando extracción del Leccionario (EWTN Latino)...");

    while (fechaActual <= fechaFin) {
        const fechaStr = formatearFecha(fechaActual);
        await extraerLecturasDelDia(fechaStr);
        await sleep(2000); 
        fechaActual.setDate(fechaActual.getDate() + 1); 
    }
    
    console.log("🎉 ¡PROCESO COMPLETADO! Base de datos lista.");
}

iniciarRobot();