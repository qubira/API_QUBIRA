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

const app  = express();
const PORT = process.env.PORT || 4000;

/* ============================================================
   MIDDLEWARES GLOBALES
   ============================================================ */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    /* Peticiones sin origin (curl, Postman, server-to-server) siempre pasan */
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Master-Password'],
}));

app.use(express.json({ limit: '1mb' }));
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
app.use('/api/soporte/master-password/verify', masterPasswordLimiter);
app.use('/api',                               apiLimiter);

app.use('/api/auth',       authRouter);
app.use('/api/soporte',    soporteRouter);
app.use('/api/rrhh',       rrhhRouter);
app.use('/api/usuarios',   usuariosRouter);
app.use('/api/ti',         tiRouter);
app.use('/api/calendar',   calendarRouter);

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
  });
})();
