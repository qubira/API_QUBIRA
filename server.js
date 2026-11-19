'use strict';

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const { testConnection } = require('./src/db');

const authRouter     = require('./src/routes/auth');
const soporteRouter  = require('./src/routes/soporte');
const rrhhRouter     = require('./src/routes/rrhh');
const usuariosRouter = require('./src/routes/usuarios');
const tiRouter       = require('./src/routes/ti');
const calendarRouter = require('./src/routes/calendar');
const auditRouter    = require('./src/routes/audit');
const securityRouter = require('./src/routes/security');
const analyticsRouter = require('./src/routes/analytics');
const jobsPublicRouter = require('./src/routes/jobs-public');
const comercialRouter = require('./src/routes/comercial');
const constanciasPublicRouter = require('./src/routes/constancias-public');
const oppRouter = require('./src/routes/opp');
const divisasRouter = require('./src/routes/divisas');
const odaclRouter = require('./src/routes/odacl');
const casesPublicRouter = require('./src/routes/cases-public');
const ocmRoutes         = require('./src/routes/ocm');
const sitiosRoutes      = require('./src/routes/sitios');
const estadoRoutes      = require('./src/routes/estado');
const areasRoutes       = require('./src/routes/areas');
const documentosRouter  = require('./src/routes/documentos');

const app  = express();
const PORT = process.env.PORT || 4000;

/* Detrás de Vercel/Render hay un proxy delante de esta API — sin esto,
   req.ip devuelve la IP del proxy para todo el mundo, lo que rompe el
   rate limiting por IP y el registro de intentos/bloqueos. */
app.set('trust proxy', 1);

/* ============================================================
   MIDDLEWARES GLOBALES
   ============================================================ */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

/* Contador de visitas de los sitios de clientes: va ANTES del CORS global porque
   recibe eventos desde dominios externos (tiene su propio CORS abierto). */
app.use('/api/public/sitios', sitiosRoutes.publico);

app.use(cors({
  origin(origin, callback) {
    /* Peticiones sin origin (curl, Postman, server-to-server) siempre pasan */
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Elevation-Token'],
}));

// Los casos de soporte llevan sus capturas (imágenes) dentro: un poco más de margen solo ahí
const jsonCasos = express.json({ limit: '8mb' }), jsonNormal = express.json({ limit: '1mb' });
app.use((req, res, next) => (req.path.startsWith('/api/soporte/casos') ? jsonCasos : jsonNormal)(req, res, next));
app.use(express.urlencoded({ extended: true }));

/* ============================================================
   BLOQUEO ABSOLUTO — archivos que nunca deben exponerse
   ============================================================ */
const BLOCKED_PATTERNS = [
  /\.env(\.|$)/i,
  /package(-lock)?\.json$/i,
  /^\/node_modules\//i,
  /^\/src\//i,
  /^\/server\.js$/i,
];
app.use((req, res, next) => {
  if (BLOCKED_PATTERNS.some(r => r.test(req.path))) {
    return res.status(403).json({ ok: false, error: 'Acceso denegado' });
  }
  next();
});

/* ============================================================
   RATE LIMITING
   ============================================================ */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Demasiados intentos. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const masterPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { ok: false, error: 'Demasiados intentos con la contraseña maestra. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { ok: false, error: 'Demasiadas peticiones' },
});

/* ============================================================
   RUTAS API
   ============================================================ */
app.use('/api/auth/login',                    loginLimiter);
app.use('/api/auth/passkey/login',            rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos. Espera 15 minutos.' },
}));
app.use('/api/soporte/master-password/verify', masterPasswordLimiter);
app.use('/api',                               apiLimiter);

app.use('/api/auth',       authRouter);
app.use('/api/soporte',    soporteRouter);
app.use('/api/rrhh',       rrhhRouter);
app.use('/api/usuarios',   usuariosRouter);
app.use('/api/ti',         tiRouter);
app.use('/api/calendar',   calendarRouter);
app.use('/api/audit',      auditRouter);
app.use('/api/security',   securityRouter);
app.use('/api/analytics',  analyticsRouter);
app.use('/api/public/jobs', jobsPublicRouter);
app.use('/api/comercial',  comercialRouter);
app.use('/api/opp',        oppRouter);
app.use('/api/divisas',    divisasRouter);
app.use('/api/odacl',      odaclRouter);
app.use('/api/documentos', documentosRouter); // registro central de documentos (CODIFICACION.md)
app.use('/api/public/constancias', constanciasPublicRouter);
app.use('/api/public/cases',       casesPublicRouter);
app.use('/api/ocm',               ocmRoutes.router);
app.use('/api/public/ocm',        ocmRoutes.publico);
app.use('/api/ocm/sitios',        sitiosRoutes.router);
app.use('/api/public',            estadoRoutes.publico); // /estado y /estado.js (horas de Render)
app.use('/api/public',            areasRoutes.publico);  // /areas y /areas.js (catálogo de áreas de ORH)

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'running', service: 'qubira-api' });
});

/* ============================================================
   404 para rutas no encontradas (esta API no sirve HTML)
   ============================================================ */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Ruta ${req.path} no encontrada` });
});

/* ============================================================
   MANEJADOR GLOBAL DE ERRORES
   ============================================================ */
app.use((err, req, res, next) => {
  if (err && /Origen no permitido por CORS/.test(err.message)) {
    return res.status(403).json({ ok: false, error: err.message });
  }
  console.error('[SERVER] Error no manejado:', err.message);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

/* ============================================================
   INICIO DEL SERVIDOR
   ============================================================ */
(async () => {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`[SERVER] QUBIRA API corriendo en http://localhost:${PORT}`);
    console.log(`[SERVER] Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[SERVER] Orígenes permitidos: ${allowedOrigins.join(', ') || '(todos en dev)'}`);
    mantenerDespierto();
    estadoRoutes.iniciarMedicion();
    require('./src/lib/jerarquia').asegurarJerarquia().then(() => console.log('[JERARQUIA] lista')).catch(e => console.warn('[JERARQUIA]', e.message));
    require('./src/lib/employeeArea').iniciarAreas()
      .then(() => require('./src/lib/codificacion').asegurarCodificacion())
      .then(() => console.log('[CODIFICACION] lista'))
      // Fase 4: migración de los códigos antiguos, una sola vez y en una sola transacción
      .then(() => require('./src/lib/migracionCodificacion').ejecutarUnaVez())
      .then(r => console.log('[MIGRACION]', JSON.stringify(r)))
      .catch(e => console.error('[CODIFICACION/MIGRACION] no se aplicó nada:', e.message));
  });
})();

/* ============================================================
   MANTENER DESPIERTO (Render, plan gratuito)
   Render apaga el servicio tras 15 min sin tráfico entrante. Cada 10 min
   el API llama a su propia dirección pública (pasa por el proxy de Render,
   que lo cuenta como tráfico), así queda siempre activo y la sincronización
   horaria de TikTok corre sola. Solo actúa en Render (RENDER_EXTERNAL_URL
   la define Render); se desactiva con KEEPALIVE=off.
   ============================================================ */
function mantenerDespierto() {
  const base = process.env.RENDER_EXTERNAL_URL;
  if (!base || process.env.KEEPALIVE === 'off') return;
  const url = base.replace(/\/$/, '') + '/api/health';
  setInterval(() => {
    fetch(url, { headers: { 'User-Agent': 'qubira-keepalive' } }).catch(e => console.warn('[KEEPALIVE]', e.message));
  }, 10 * 60 * 1000);
  console.log('[KEEPALIVE] activo: ping cada 10 min a', url);
}
