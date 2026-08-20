'use strict';

const crypto = require('crypto');
const { pool } = require('../db');

const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_MINUTES = parseInt(process.env.LOCKOUT_MINUTES) || 15;
const IP_EVASION_DISTINCT_IPS = parseInt(process.env.IP_EVASION_DISTINCT_IPS) || 2;
const HANDOFF_TTL_SECONDS = 60;
const BRUTE_FORCE_THRESHOLD = parseInt(process.env.BRUTE_FORCE_THRESHOLD) || 3;
const BRUTE_FORCE_WINDOW_MINUTES = parseInt(process.env.BRUTE_FORCE_WINDOW_MINUTES) || 60;

let ready = null;
function ensureSecuritySchema() {
  if (!ready) {
    ready = pool.query(`
      CREATE SCHEMA IF NOT EXISTS security;

      CREATE TABLE IF NOT EXISTS security.login_attempts (
        id BIGSERIAL PRIMARY KEY,
        username TEXT,
        ip TEXT,
        success BOOLEAN NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS login_attempts_username_idx ON security.login_attempts(username, created_at DESC);
      CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON security.login_attempts(ip, created_at DESC);

      CREATE TABLE IF NOT EXISTS security.ip_status (
        ip TEXT PRIMARY KEY,
        category TEXT NOT NULL DEFAULT 'observacion'
          CHECK (category IN ('observacion','bloqueada','autorizada','sospechosa')),
        reason TEXT,
        blocked_until TIMESTAMPTZ,
        is_permanent BOOLEAN NOT NULL DEFAULT false,
        created_by INTEGER,
        updated_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS security.handoff_codes (
        id BIGSERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS handoff_codes_code_idx ON security.handoff_codes(code);

      /* Módulos otorgados explícitamente a una cuenta, ADEMÁS del que ya
         le da su área real — permite que alguien tenga TI+SOPORTE+ADG
         sin ser privilegiado y sin tocar rrhh.empleados. */
      CREATE TABLE IF NOT EXISTS security.usuario_modulos (
        usuario_id INTEGER NOT NULL,
        modulo TEXT NOT NULL,
        otorgado_por INTEGER,
        otorgado_en TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (usuario_id, modulo)
      );

      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueada_hasta TIMESTAMPTZ;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS suspendida_motivo TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS suspendida_por INTEGER;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS suspendida_en TIMESTAMPTZ;
    `);
  }
  return ready;
}

function clientIp(req) {
  return req.ip || req.connection?.remoteAddress || null;
}

/* ============================================================
   IP — una sola tabla con 4 categorías como estado, no 4 tablas.
   ============================================================ */
async function getIpStatus(ip) {
  if (!ip) return null;
  const { rows } = await pool.query('SELECT * FROM security.ip_status WHERE ip=$1', [ip]);
  return rows[0] || null;
}

function isIpBlockedRow(row) {
  if (!row || row.category !== 'bloqueada') return false;
  if (row.is_permanent) return true;
  return row.blocked_until && new Date(row.blocked_until) > new Date();
}

async function isIpBlocked(ip) {
  return isIpBlockedRow(await getIpStatus(ip));
}

async function upsertIpStatus(ip, { category, reason, blockedUntil, isPermanent, adminId, notes }) {
  await pool.query(
    `INSERT INTO security.ip_status (ip, category, reason, blocked_until, is_permanent, created_by, updated_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$7)
     ON CONFLICT (ip) DO UPDATE SET
       category = EXCLUDED.category, reason = EXCLUDED.reason, blocked_until = EXCLUDED.blocked_until,
       is_permanent = EXCLUDED.is_permanent, updated_by = EXCLUDED.updated_by, notes = EXCLUDED.notes,
       updated_at = NOW()`,
    [ip, category, reason || null, blockedUntil || null, !!isPermanent, adminId || null, notes || null]
  );
}

/* Primer contacto de una IP con el login — si todavía no tiene
   categoría, la deja "en observación" en vez de crearla implícita. */
async function touchIpObservation(ip) {
  if (!ip) return;
  await pool.query(
    `INSERT INTO security.ip_status (ip, category) VALUES ($1, 'observacion')
     ON CONFLICT (ip) DO NOTHING`,
    [ip]
  );
}

/* ============================================================
   Intentos de login — registro + bloqueo por umbral configurable.
   ============================================================ */
async function recordLoginAttempt({ username, ip, success, userAgent }) {
  await pool.query(
    `INSERT INTO security.login_attempts (username, ip, success, user_agent) VALUES ($1,$2,$3,$4)`,
    [username || null, ip || null, success, userAgent || null]
  );
}

async function countRecentFailures(username, minutes) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM security.login_attempts
     WHERE username=$1 AND success=false AND created_at > NOW() - ($2 || ' minutes')::interval`,
    [username, minutes]
  );
  return rows[0].n;
}

/* Detecta el escenario del pedido: la misma cuenta falla desde varias
   IP distintas en la ventana de bloqueo — señal de que están rotando
   IP para evadir el límite. Si pasa, marca la IP actual sospechosa. */
async function distinctFailureIps(username, minutes) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ip FROM security.login_attempts
     WHERE username=$1 AND success=false AND ip IS NOT NULL
       AND created_at > NOW() - ($2 || ' minutes')::interval`,
    [username, minutes]
  );
  return rows.map(r => r.ip);
}

async function lockAccount(userId, minutes) {
  await pool.query(
    `UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1,
       bloqueada_hasta = NOW() + ($2 || ' minutes')::interval
     WHERE id=$1`,
    [userId, minutes]
  );
}

async function bumpFailedAttempts(userId) {
  await pool.query('UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id=$1', [userId]);
}

async function resetFailedAttempts(userId) {
  await pool.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueada_hasta = NULL WHERE id=$1', [userId]);
}

/* ============================================================
   Traspaso entre paneles — código de un solo uso, vence en 60s.
   No hay dominio/cookie compartida entre paneles (son proyectos de
   Vercel separados), así que la sesión se traspasa con esto en vez
   de pedir credenciales de nuevo en cada uno.
   ============================================================ */
async function createHandoffCode(userId) {
  const code = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000);
  await pool.query(
    'INSERT INTO security.handoff_codes (code, user_id, expires_at) VALUES ($1,$2,$3)',
    [code, userId, expires]
  );
  return code;
}

async function consumeHandoffCode(code) {
  if (!code) return null;
  const { rows } = await pool.query(
    `UPDATE security.handoff_codes SET used_at = NOW()
     WHERE code=$1 AND used_at IS NULL AND expires_at > NOW()
     RETURNING user_id`,
    [code]
  );
  return rows.length ? rows[0].user_id : null;
}

/* ============================================================
   Permisos por módulo, otorgados explícitamente (además del que ya
   da el área real del empleado — ver moduleAccess.js).
   ============================================================ */
async function getGrantedModules(userId) {
  const { rows } = await pool.query('SELECT modulo FROM security.usuario_modulos WHERE usuario_id=$1', [userId]);
  return rows.map(r => r.modulo);
}

async function setGrantedModules(userId, modules, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM security.usuario_modulos WHERE usuario_id=$1', [userId]);
    for (const m of modules) {
      await client.query(
        'INSERT INTO security.usuario_modulos (usuario_id, modulo, otorgado_por) VALUES ($1,$2,$3)',
        [userId, m, adminId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}

/* ============================================================
   Suspensión manual — distinta del bloqueo automático temporal
   (bloqueada_hasta): esta no vence sola, la levanta un admin.
   ============================================================ */
async function suspendUser(userId, motivo, adminId) {
  await pool.query(
    'UPDATE usuarios SET suspendida_motivo=$2, suspendida_por=$3, suspendida_en=NOW() WHERE id=$1',
    [userId, motivo || null, adminId]
  );
}
async function unsuspendUser(userId) {
  await pool.query(
    'UPDATE usuarios SET suspendida_motivo=NULL, suspendida_por=NULL, suspendida_en=NULL WHERE id=$1',
    [userId]
  );
}

/* ============================================================
   Salud de la base de datos ("sondeo"): estado real del pool de
   conexiones de pg (no hay integración con la API de Neon todavía —
   eso requeriría un API key de Neon que hoy no existe en el
   proyecto; esto es lo que sí se puede medir sin credenciales
   nuevas). ping_ms mide la ida y vuelta de una consulta trivial.
   ============================================================ */
async function getDbHealth() {
  const start = Date.now();
  await pool.query('SELECT 1');
  const pingMs = Date.now() - start;
  return {
    ping_ms: pingMs,
    pool_total: pool.totalCount,
    pool_idle: pool.idleCount,
    pool_waiting: pool.waitingCount,
    pool_max: pool.options.max,
  };
}

/* Serie diaria de los últimos N días (incluye días sin datos, en 0,
   para que el gráfico no tenga huecos). */
async function getLoginSeries(days = 14) {
  const { rows } = await pool.query(`
    SELECT d::date AS dia,
           COALESCE(ok.n, 0)::int AS exitosos,
           COALESCE(fail.n, 0)::int AS fallidos
    FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, interval '1 day') d
    LEFT JOIN (
      SELECT date_trunc('day', created_at)::date AS dia, count(*) AS n
      FROM security.login_attempts
      WHERE success = true AND created_at >= CURRENT_DATE - ($1::int - 1)
      GROUP BY 1
    ) ok ON ok.dia = d::date
    LEFT JOIN (
      SELECT date_trunc('day', created_at)::date AS dia, count(*) AS n
      FROM security.login_attempts
      WHERE success = false AND created_at >= CURRENT_DATE - ($1::int - 1)
      GROUP BY 1
    ) fail ON fail.dia = d::date
    ORDER BY d`, [days]);
  return rows;
}

async function getAccessDeniedSeries(days = 14) {
  const { rows } = await pool.query(`
    SELECT d::date AS dia, COALESCE(x.n, 0)::int AS total
    FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, interval '1 day') d
    LEFT JOIN (
      SELECT date_trunc('day', created_at)::date AS dia, count(*) AS n
      FROM audit.logs
      WHERE action_type = 'access_denied' AND created_at >= CURRENT_DATE - ($1::int - 1)
      GROUP BY 1
    ) x ON x.dia = d::date
    ORDER BY d`, [days]);
  return rows;
}

/* Distribución de sesiones activas por área — para un gráfico simple
   de qué tan repartido está el uso del sistema ahora mismo. */
async function getSessionsByArea() {
  const { rows } = await pool.query(`
    SELECT COALESCE(c.nombre, 'Sin área') AS area, count(*)::int AS n
    FROM sesiones s
    JOIN usuarios u ON u.id = s.usuario_id
    LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
    LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
    WHERE s.expires_at > NOW()
    GROUP BY 1 ORDER BY n DESC`);
  return rows;
}

/* ============================================================
   Señales de fuerza bruta / abuso de login — sobre los mismos datos
   que ya se registran en cada intento (security.login_attempts) y en
   el bloqueo automático (usuarios.bloqueada_hasta). No es un motor de
   detección nuevo: agrupa lo que ya existe con un umbral configurable.
   ============================================================ */
async function getThreatSignals() {
  const [byIp, byUsername, locked] = await Promise.all([
    pool.query(`
      SELECT ip, count(*)::int AS fallidos, max(created_at) AS last_attempt,
             array_agg(DISTINCT username) FILTER (WHERE username IS NOT NULL) AS usernames
      FROM security.login_attempts
      WHERE success = false AND ip IS NOT NULL
        AND created_at >= NOW() - ($1 || ' minutes')::interval
      GROUP BY ip HAVING count(*) >= $2
      ORDER BY fallidos DESC LIMIT 20`, [BRUTE_FORCE_WINDOW_MINUTES, BRUTE_FORCE_THRESHOLD]),
    pool.query(`
      SELECT username, count(*)::int AS fallidos, max(created_at) AS last_attempt,
             array_agg(DISTINCT ip) FILTER (WHERE ip IS NOT NULL) AS ips
      FROM security.login_attempts
      WHERE success = false AND username IS NOT NULL
        AND created_at >= NOW() - ($1 || ' minutes')::interval
      GROUP BY username HAVING count(*) >= $2
      ORDER BY fallidos DESC LIMIT 20`, [BRUTE_FORCE_WINDOW_MINUTES, BRUTE_FORCE_THRESHOLD]),
    pool.query(`
      SELECT id, username, nombre, apellidos, intentos_fallidos, bloqueada_hasta
      FROM usuarios
      WHERE bloqueada_hasta IS NOT NULL AND bloqueada_hasta > NOW()
      ORDER BY bloqueada_hasta DESC LIMIT 50`),
  ]);
  return {
    by_ip: byIp.rows,
    by_username: byUsername.rows,
    locked_accounts: locked.rows,
    threshold: BRUTE_FORCE_THRESHOLD,
    window_minutes: BRUTE_FORCE_WINDOW_MINUTES,
  };
}

/* Historial de login por día de una cuenta puntual (para el
   desplegable de Sesiones) — se lee de login_attempts, así que
   incluye tanto los intentos fallidos como los exitosos, no solo las
   sesiones que siguen activas. */
async function getLoginHistory(username, days = 30) {
  const { rows } = await pool.query(`
    SELECT date_trunc('day', created_at)::date AS dia,
           count(*) FILTER (WHERE success) ::int AS exitosos,
           count(*) FILTER (WHERE NOT success)::int AS fallidos,
           json_agg(json_build_object('created_at', created_at, 'ip', ip, 'success', success)
                    ORDER BY created_at DESC) AS eventos
    FROM security.login_attempts
    WHERE username = $1 AND created_at >= NOW() - ($2 || ' days')::interval
    GROUP BY 1 ORDER BY 1 DESC`, [username, days]);
  return rows;
}

module.exports = {
  ensureSecuritySchema, clientIp,
  getIpStatus, isIpBlocked, isIpBlockedRow, upsertIpStatus, touchIpObservation,
  recordLoginAttempt, countRecentFailures, distinctFailureIps,
  lockAccount, bumpFailedAttempts, resetFailedAttempts,
  createHandoffCode, consumeHandoffCode,
  getGrantedModules, setGrantedModules, suspendUser, unsuspendUser,
  getDbHealth, getLoginSeries, getAccessDeniedSeries, getSessionsByArea,
  getThreatSignals, getLoginHistory,
  MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES, IP_EVASION_DISTINCT_IPS,
  BRUTE_FORCE_THRESHOLD, BRUTE_FORCE_WINDOW_MINUTES,
};
