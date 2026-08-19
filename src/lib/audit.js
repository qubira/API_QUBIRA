'use strict';

const { pool } = require('../db');

const QUALIFYING_CARGOS = ['SUPERVISOR', 'COORDINADOR', 'GERENTE'];

let ready = null;
function ensureAuditSchema() {
  if (!ready) {
    ready = pool.query(`
      CREATE SCHEMA IF NOT EXISTS audit;
      CREATE TABLE IF NOT EXISTS audit.logs (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        action_type TEXT NOT NULL,
        query TEXT,
        body TEXT,
        ip TEXT,
        status_code INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE audit.logs ADD COLUMN IF NOT EXISTS body TEXT;
      ALTER TABLE audit.logs ADD COLUMN IF NOT EXISTS ip TEXT;
      CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit.logs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit.logs(created_at DESC);
    `);
  }
  return ready;
}

/* Cargo (en mayúsculas) del empleado dueño de esta cuenta, según su
   campo `usuario` en rrhh.empleados. Devuelve null si no tiene cargo
   asignado — mismo patrón que getEmployeeArea() en employeeArea.js. */
async function getEmployeeCargo(username) {
  if (!username) return null;
  const { rows } = await pool.query(
    `SELECT c.nombre
     FROM rrhh.empleados e
     JOIN rrhh.catalogos c ON c.id = e.cargo_id
     WHERE lower(e.usuario) = lower($1) AND e.cargo_id IS NOT NULL
     LIMIT 1`,
    [username]
  );
  return rows.length ? rows[0].nombre.trim().toUpperCase() : null;
}

async function canViewAudit(req) {
  if (req.user.nivel_acceso >= 100) return true;
  const cargo = await getEmployeeCargo(req.user.username);
  return !!(cargo && QUALIFYING_CARGOS.includes(cargo));
}

const SENSITIVE_KEY = /pass|contrasena|contraseña|token|secret|hash/i;
const BODY_MAX_LEN = 2000;

/* Oculta cualquier campo que huela a contraseña/token/secreto antes de
   guardar — nunca se persiste ese valor, ni siquiera cifrado. Recorre
   objetos anidados; deja arrays/valores simples tal cual. */
function redactBody(value) {
  if (Array.isArray(value)) return value.map(redactBody);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[oculto]' : redactBody(v);
    }
    return out;
  }
  return value;
}

function serializeBody(body) {
  if (!body || typeof body !== 'object' || !Object.keys(body).length) return null;
  const json = JSON.stringify(redactBody(body));
  return json.length > BODY_MAX_LEN ? json.slice(0, BODY_MAX_LEN) : json;
}

function actionTypeFor(method, path) {
  if (path.endsWith('/login')) return 'login';
  if (path.endsWith('/logout')) return 'logout';
  if (path.endsWith('/cancel')) return 'update';
  switch (method) {
    case 'GET': return 'view';
    case 'POST': return 'create';
    case 'PUT': case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    default: return 'view';
  }
}

/* Registra una petición ya resuelta (después de que la respuesta salió,
   para no sumar latencia). Nunca debe tumbar la petición real — el
   llamador siempre encadena .catch(()=>{}). */
async function logAudit(req, res) {
  await ensureAuditSchema();
  if (!req.user) return;
  const path = req.originalUrl.split('?')[0];
  const query = Object.keys(req.query || {}).length ? JSON.stringify(req.query) : null;
  const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? serializeBody(req.body) : null;
  const ip = req.ip || req.connection?.remoteAddress || null;
  await pool.query(
    `INSERT INTO audit.logs (user_id, method, path, action_type, query, body, ip, status_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [req.user.id, req.method, path, actionTypeFor(req.method, path), query, body, ip, res.statusCode]
  );
}

/* Eventos de seguridad explícitos que no pasan por requireAuth (login,
   intentos fallidos, bloqueos, traspasos) — /login y /exchange no
   tienen sesión todavía, así que no quedan cubiertos por el enganche
   genérico de logAudit(). userId puede ser null (ej. intento fallido
   contra un usuario que no existe). */
async function logSecurityEvent({ userId, path, actionType, ip, statusCode }) {
  await ensureAuditSchema();
  await pool.query(
    `INSERT INTO audit.logs (user_id, method, path, action_type, ip, status_code)
     VALUES ($1,'POST',$2,$3,$4,$5)`,
    [userId || null, path, actionType, ip || null, statusCode || 200]
  );
}

/* Alias retrocompatible — login exitoso. */
function logLoginAudit(userId, path) {
  return logSecurityEvent({ userId, path, actionType: 'login', statusCode: 200 });
}

module.exports = { ensureAuditSchema, getEmployeeCargo, canViewAudit, logAudit, logLoginAudit, logSecurityEvent, QUALIFYING_CARGOS };
