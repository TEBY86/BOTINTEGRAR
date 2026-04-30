// api-server.js — Servidor API completo para producción
// Arranca con: node api-server.js

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const axios   = require('axios');
const Tesseract = require('tesseract.js');


// ─── IMPORTA procesarDireccion desde bot.js ───────────────────
const { procesarDireccion, verificarPermiso } = require('./bot');

const app = express();



// ─── MIDDLEWARES ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── LOGS ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString('es-CL')}] ${req.method} ${req.path}`);
  next();
});

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// ─── ENDPOINT RUT — llama a api.js del celular ────────────────
const API_CELULAR = process.env.API_CELULAR || 'http://192.168.1.7:3000';


// ========== AGREGAR AQUÍ ==========
// ─── ENDPOINT PERMISOS (proxy centralizado hacia Google Sheets) ───
const PERMISOS_URL = 'https://script.google.com/macros/s/AKfycbwVX-cyiGJl8vE3uBj0g6qWKv6ivNlHtir1BnoSqXVYHZwyB4E6mSEX2VSaeF623d0w/exec';

app.get('/permisos/:userId', async (req, res) => {
  const { userId } = req.params;
  const { accion = 'consultar', telefono = null } = req.query;

  if (!userId) return res.status(400).json({ permitido: false, mensaje: 'Falta userId' });

  try {
    const respuesta = await fetch(PERMISOS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, telefono, accion })
    });
    const datos = await respuesta.json();
    console.log(`[PERMISOS] userId=${userId} → permitido=${datos.permitido}`);
    res.json(datos);
  } catch (e) {
    console.error('[PERMISOS] Error:', e.message);
    res.status(500).json({ permitido: false, mensaje: 'Error al verificar permisos' });
  }
});

    
// ========== FIN AGREGAR ==========

app.post('/rut', async (req, res) => {
  const { rut, userId } = req.body;
  
  if (!rut) return res.status(400).json({ ok: false, error: 'Falta el campo rut' });
  if (!userId) return res.status(401).json({ ok: false, error: 'Se requiere userId' });
  
  // Verificar permisos
  const permiso = await verificarPermiso(userId, 'consultar');
  if (!permiso.permitido) {
    console.log(`[RUT] ❌ Usuario ${userId} sin permisos: ${permiso.mensaje}`);
    return res.status(403).json({ ok: false, error: permiso.mensaje });
  }
  
  console.log(`[RUT] ✅ Usuario ${userId} autorizado. Restantes: ${permiso.estadisticas?.dia?.restantes || 0}`);

  const rutLimpio = rut.replace(/\./g, '').toUpperCase();
  console.log(`[RUT] Consultando: ${rutLimpio}`);

  try {
    console.log(`[HTTP] Conectando a: ${API_CELULAR}/evaluar`);
    const respuesta = await axios.post(`${API_CELULAR}/evaluar`, { rut: rutLimpio }, {

      
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000
    });

    console.log("📦 RESPUESTA CELULAR:", Object.keys(respuesta.data));
console.log("🖼️ screenshot existe?:", !!respuesta.data.screenshot);

if (respuesta.data.screenshot) {
  console.log("🖼️ screenshot largo:", respuesta.data.screenshot.length);
  console.log("🖼️ screenshot primeros 50:", respuesta.data.screenshot.substring(0, 50));
}
    console.log(`[HTTP] Status: ${respuesta.status}`);
    console.log(`[RUT] Resultado: ${respuesta.data.ok ? '✅' : '❌'} ${rutLimpio}`);
    res.json(respuesta.data);
  } catch (e) {
    if (e.code === 'ECONNABORTED') {
      console.error(`[RUT] Timeout`);
      return res.status(504).json({ ok: false, error: 'Timeout: El celular no respondió' });
    }
    if (e.response) {
      console.error(`[RUT] Error HTTP: ${e.response.status}`);
      return res.status(e.response.status).json({ ok: false, error: `Error del celular: HTTP ${e.response.status}` });
    }
    console.error(`[RUT] Error: ${e.message}`);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── ENDPOINT VERIFICAR DIRECCIÓN — SSE ───────────────────────
// GET /verificar?direccion=Av+Providencia+1234,+Providencia
//
// El frontend escucha eventos SSE con este formato JSON por línea:
//   { tipo: 'mensaje', texto: '...' }
//   { tipo: 'foto',    nombre: '...', caption: '...', base64: '...' }
//   { tipo: 'fin' }
//   { tipo: 'error',   texto: '...' }
app.get('/verificar', async (req, res) => {
  const { direccion, userId } = req.query;
  
  if (!direccion) return res.status(400).json({ error: 'Falta dirección' });
  if (!userId) return res.status(401).json({ error: 'Se requiere userId' });
  
  // Verificar permisos
  const permiso = await verificarPermiso(userId, 'consultar');
  if (!permiso.permitido) {
    console.log(`[DIRECCIÓN] ❌ Usuario ${userId} sin permisos: ${permiso.mensaje}`);
    return res.status(403).json({ error: permiso.mensaje });
  }
  
  console.log(`[DIRECCIÓN] ✅ Usuario ${userId} autorizado. Restantes: ${permiso.estadisticas?.dia?.restantes || 0}`);

  console.log(`[DIRECCIÓN] Verificando: ${direccion}`);

  // ── Headers SSE ─────────────────────────────────────────────
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Para nginx
  res.flushHeaders();

  // Keepalive cada 20 s para que no cierre la conexión
  const keepalive = setInterval(() => res.write(': ping\n\n'), 20000);

  // Helper que envía un evento SSE
  const enviar = (payload) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {
      console.error('[SSE] Error escribiendo evento:', e.message);
    }
  };

  // ── Adaptadores de canal para procesarDireccion ─────────────
  const enviarMensaje = async (texto) => {
    enviar({ tipo: 'mensaje', texto });
  };

  const enviarFoto = async (rutaFoto, caption) => {
    const nombre = path.basename(rutaFoto);

    // Si el archivo existe, lo convertimos a base64 y lo enviamos inline
    if (fs.existsSync(rutaFoto)) {
      try {
        const buffer = fs.readFileSync(rutaFoto);
        const base64 = buffer.toString('base64');
        enviar({ tipo: 'foto', nombre, caption, base64 });

        // Limpiar archivos temporales (no los de la carpeta imagenes/)
        if (!rutaFoto.includes('imagenes') && !rutaFoto.includes('imagenes/')) {
          fs.unlink(rutaFoto, () => {});
        }
      } catch (e) {
        console.error('[SSE] Error leyendo foto:', e.message);
        enviar({ tipo: 'foto', nombre, caption });
      }
    } else {
      // Solo envía el nombre (el frontend puede hacer GET /imagen/:nombre si lo necesita)
      enviar({ tipo: 'foto', nombre, caption });
    }
  };

  try {
   await procesarDireccion(direccion, enviarMensaje, enviarFoto, userId);
    console.log(`[DIRECCIÓN] ✅ Completado: ${direccion}`);
  } catch (e) {
    console.error(`[DIRECCIÓN] ❌ Error: ${e.message}`);
    enviar({ tipo: 'error', texto: e.message });
  } finally {
    clearInterval(keepalive);
    enviar({ tipo: 'fin' });
    res.end();
  }
});

// ─── ENDPOINT IMÁGENES (opcional, para acceder por nombre) ────
app.get('/imagen/:nombre', (req, res) => {
  // Evitar path traversal
  const nombre = path.basename(req.params.nombre);

  // Buscar en la raíz del proyecto y en la carpeta imagenes/
  const rutas = [
    path.join(__dirname, nombre),
    path.join(__dirname, 'imagenes', nombre),
  ];

  for (const ruta of rutas) {
    if (fs.existsSync(ruta)) {
      return res.sendFile(ruta);
    }
  }

  return res.status(404).json({ error: 'Imagen no encontrada' });
});

// ─── MANEJO DE ERRORES GLOBAL ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ ok: false, error: err.message });
});



// Servir frontend
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// ─── INICIAR SERVIDOR ─────────────────────────────────────────
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(50));
  console.log('🚀 API Server corriendo');
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Celular: ${API_CELULAR}`);
  console.log('─'.repeat(50));
  console.log('Endpoints disponibles:');
  console.log(`  GET  /health`);
  console.log(`  POST /rut         { "rut": "12345678-9" }`);
  console.log(`  GET  /verificar?direccion=Av+Ejemplo+123,+Comuna`);
  console.log(`  GET  /imagen/:nombre`);
  console.log('═'.repeat(50) + '\n');
});

process.on('unhandledRejection', err => console.error('❌ Error no manejado:', err.message));