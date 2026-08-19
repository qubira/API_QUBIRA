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
        status_code INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
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
  await pool.query(
    `INSERT INTO audit.logs (user_id, method, path, action_type, query, status_code)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.user.id, req.method, path, actionTypeFor(req.method, path), query, res.statusCode]
  );
}

/* Inserta explícitamente un evento de login exitoso — /login no pasa
   por requireAuth (todavía no hay sesión), así que no queda cubierto
   por el enganche genérico. */
async function logLoginAudit(userId, path) {
  await ensureAuditSchema();
  await pool.query(
    `INSERT INTO audit.logs (user_id, method, path, action_type, status_code)
     VALUES ($1,'POST',$2,'login',200)`,
    [userId, path]
  );
}

module.exports = { ensureAuditSchema, getEmployeeCargo, canViewAudit, logAudit, logLoginAudit, QUALIFYING_CARGOS };
