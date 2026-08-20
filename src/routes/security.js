'use strict';

/* ============================================================
   Administración de IP — observación / bloqueadas / autorizadas /
   sospechosas, todas como categorías de una sola tabla
   (security.ip_status). Mismo público que la Auditoría: cargo
   Supervisor/Coordinador/Gerente o nivel_acceso>=100.
   ============================================================ */

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { canViewAudit, logSecurityEvent } = require('../lib/audit');
const { getAuthorizedModules } = require('../lib/moduleAccess');
const sec = require('../lib/security');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { sec.ensureSecuritySchema().then(() => next()).catch(next); });

const VALID_CATEGORIES = ['observacion', 'bloqueada', 'autorizada', 'sospechosa'];

/* Las rutas de IP quedan abiertas a cualquier cargo calificado (ya las
   usa la pestaña IP de Soporte, mismo criterio que la Auditoría) — y
   también a quien tenga el módulo DST otorgado, porque la pestaña IP
   del propio panel QUBIRA_DST llama a esta misma ruta. */
async function requireIpAccess(req, res, next) {
  if (await canViewAudit(req)) return next();
  try {
    const authorized = await getAuthorizedModules(req.user.username, req.user.nivel_acceso, req.user.id);
    if (authorized.includes('DST')) return next();
  } catch (e) { return next(e); }
  return res.status(403).json({ error: 'No tienes permiso para administrar seguridad' });
}

/* Todo lo demás en este archivo — usuarios, permisos, sesiones,
   suspensión — es más sensible: exige nivel_acceso>=100 O que le
   hayan otorgado el módulo DST (el mismo otorgamiento que controla la
   entrada al panel QUBIRA_DST — una vez dentro, el permiso debe valer
   para operarlo, no solo para verlo). Deliberadamente NO reutiliza
   requireIpAccess/canViewAudit: un cargo calificado sin DST otorgado
   no debe poder administrar usuarios/permisos/sesiones. */
async function requirePrivileged(req, res, next) {
  if (req.user.nivel_acceso >= 100) return next();
  try {
    const authorized = await getAuthorizedModules(req.user.username, req.user.nivel_acceso, req.user.id);
    if (authorized.includes('DST')) return next();
  } catch (e) { return next(e); }
  return res.status(403).json({ error: 'Esta acción requiere privilegios de administrador' });
}

router.get('/ips', requireIpAccess, async (req, res) => {
  try {
    const { category, q } = req.query;
    const params = []; let where = 'WHERE 1=1';
    if (category) {
      if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Categoría inválida' });
      params.push(category); where += ` AND s.category = $${params.length}`;
    }
    if (q) { params.push(`%${q}%`); where += ` AND s.ip ILIKE $${params.length}`; }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    params.push(limit); params.push(offset);

    const { rows } = await pool.query(`
      SELECT s.ip, s.category, s.reason, s.blocked_until, s.is_permanent, s.notes,
             s.created_at, s.updated_at,
             cu.username AS created_by_username, uu.username AS updated_by_username,
             (SELECT count(*)::int FROM security.login_attempts la WHERE la.ip = s.ip) AS attempt_count,
             (SELECT count(*)::int FROM security.login_attempts la WHERE la.ip = s.ip AND la.success = false) AS failed_count,
             (SELECT max(la.created_at) FROM security.login_attempts la WHERE la.ip = s.ip) AS last_seen
      FROM security.ip_status s
      LEFT JOIN usuarios cu ON cu.id = s.created_by
      LEFT JOIN usuarios uu ON uu.id = s.updated_by
      ${where}
      ORDER BY s.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

    res.json({ rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/ips/:ip', requireIpAccess, async (req, res) => {
  try {
    const { category, reason, blocked_until, is_permanent, notes } = req.body;
    if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Categoría inválida' });

    await sec.upsertIpStatus(req.params.ip, {
      category, reason, blockedUntil: blocked_until || null, isPermanent: !!is_permanent,
      adminId: req.user.id, notes,
    });
    await logSecurityEvent({
      userId: req.user.id, path: `/api/security/ips/${req.params.ip}`,
      actionType: category === 'bloqueada' ? 'ip_blocked' : 'ip_status_changed',
      ip: sec.clientIp(req), statusCode: 200,
    });
    res.json({ message: 'Actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Usuarios — vista de administración (QUBIRA_DST)
   ============================================================ */
router.get('/users', requirePrivileged, async (req, res) => {
  try {
    const { q } = req.query;
    const params = []; let where = 'WHERE 1=1';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (u.nombre ILIKE $${params.length} OR u.apellidos ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.correo ILIKE $${params.length})`;
    }
    const { rows } = await pool.query(`
      SELECT u.id, u.nombre, u.apellidos, u.username, u.correo, u.estado,
             u.intentos_fallidos, u.bloqueada_hasta, u.suspendida_motivo, u.suspendida_en, u.suspendida_por,
             r.nombre AS rol, r.nivel_acceso,
             c.nombre AS area,
             (SELECT array_agg(modulo) FROM security.usuario_modulos m WHERE m.usuario_id = u.id) AS granted_modules,
             (SELECT max(l.created_at) FROM audit.logs l WHERE l.user_id = u.id AND l.action_type='login') AS ultimo_login,
             (SELECT max(l.created_at) FROM audit.logs l WHERE l.user_id = u.id AND l.action_type='logout') AS ultimo_logout,
             (SELECT la.ip FROM security.login_attempts la WHERE la.username = u.username AND la.success = true
                ORDER BY la.created_at DESC LIMIT 1) AS ultima_ip
      FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      ${where}
      ORDER BY u.nombre ASC LIMIT 100`, params);
    res.json({ rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Permisos — módulos otorgados explícitamente, además del área.
   ============================================================ */
router.get('/permissions/:userId', requirePrivileged, async (req, res) => {
  try {
    const granted = await sec.getGrantedModules(req.params.userId);
    res.json({ granted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/permissions/:userId', requirePrivileged, async (req, res) => {
  try {
    const modules = Array.isArray(req.body?.modules) ? req.body.modules : [];
    const before = await sec.getGrantedModules(req.params.userId);
    await sec.setGrantedModules(req.params.userId, modules, req.user.id);
    // Inserto directo (no logSecurityEvent) para poder guardar el
    // antes/después en la misma fila, sin una segunda escritura frágil.
    await sec.ensureSecuritySchema();
    const bodyJson = JSON.stringify({ target_user_id: Number(req.params.userId), before, after: modules });
    await pool.query(
      `INSERT INTO audit.logs (user_id, method, path, action_type, body, ip, status_code)
       VALUES ($1,'POST',$2,'permission_change',$3,$4,200)`,
      [req.user.id, `/api/security/permissions/${req.params.userId}`, bodyJson, sec.clientIp(req)]
    );
    res.json({ message: 'Actualizado', before, after: modules });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/permissions/:userId/history', requirePrivileged, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT l.id, l.created_at, l.user_id AS admin_id, u.nombre AS admin_name, l.body
      FROM audit.logs l
      LEFT JOIN usuarios u ON u.id = l.user_id
      WHERE l.action_type = 'permission_change'
        AND (l.body::json->>'target_user_id')::int = $1
      ORDER BY l.created_at DESC LIMIT 50`, [req.params.userId]);
    res.json({ rows: rows.map(r => {
      let parsed = null;
      try { parsed = JSON.parse(r.body); } catch { /* ignora filas corruptas */ }
      return { id: r.id, created_at: r.created_at, admin_id: r.admin_id, admin_name: r.admin_name,
        before: parsed?.before || [], after: parsed?.after || [] };
    }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Suspensión manual — distinta del bloqueo automático temporal.
   ============================================================ */
router.post('/users/:id/suspend', requirePrivileged, async (req, res) => {
  try {
    await sec.suspendUser(req.params.id, req.body?.motivo, req.user.id);
    await logSecurityEvent({
      userId: req.user.id, path: `/api/security/users/${req.params.id}/suspend`,
      actionType: 'account_suspended', ip: sec.clientIp(req), statusCode: 200,
    });
    res.json({ message: 'Cuenta suspendida' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/unsuspend', requirePrivileged, async (req, res) => {
  try {
    await sec.unsuspendUser(req.params.id);
    await logSecurityEvent({
      userId: req.user.id, path: `/api/security/users/${req.params.id}/unsuspend`,
      actionType: 'account_unsuspended', ip: sec.clientIp(req), statusCode: 200,
    });
    res.json({ message: 'Cuenta reactivada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Desbloqueo manual del bloqueo automático por intentos fallidos
   (bloqueada_hasta) — distinto de unsuspend, que es para la
   suspensión manual. Sin esto, la única forma de "desbloquear" era
   esperar a que venza bloqueada_hasta solo. */
router.post('/users/:id/unlock', requirePrivileged, async (req, res) => {
  try {
    await sec.resetFailedAttempts(req.params.id);
    await logSecurityEvent({
      userId: req.user.id, path: `/api/security/users/${req.params.id}/unlock`,
      actionType: 'account_unlocked', ip: sec.clientIp(req), statusCode: 200,
    });
    res.json({ message: 'Cuenta desbloqueada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Sesiones activas — "última actividad" se aproxima con la última
   fila de audit.logs de ese usuario, sin agregar una columna que
   habría que escribir en cada petición.
   ============================================================ */
router.get('/sessions', requirePrivileged, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.usuario_id, u.nombre, u.apellidos, u.username, c.nombre AS area,
             s.ip_address, s.user_agent, s.created_at, s.expires_at,
             (SELECT max(l.created_at) FROM audit.logs l WHERE l.user_id = s.usuario_id) AS ultima_actividad,
             (SELECT l.path FROM audit.logs l WHERE l.user_id = s.usuario_id ORDER BY l.created_at DESC LIMIT 1) AS ultima_pagina
      FROM sesiones s
      JOIN usuarios u ON u.id = s.usuario_id
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      WHERE s.expires_at > NOW()
      ORDER BY s.created_at DESC LIMIT 200`);
    res.json({ rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/sessions/:id', requirePrivileged, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM sesiones WHERE id=$1 RETURNING usuario_id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    await logSecurityEvent({
      userId: req.user.id, path: `/api/security/sessions/${req.params.id}`,
      actionType: 'session_revoked', ip: sec.clientIp(req), statusCode: 200,
    });
    res.json({ message: 'Sesión cerrada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Cierra TODAS las sesiones activas de un usuario de una sola vez —
   distinto de borrar una fila puntual: esto es "cerrar sesión en
   todas las áreas" para esa persona, porque cada panel genera su
   propia fila en `sesiones` y no se comparten entre sí. */
router.delete('/sessions/by-user/:userId', requirePrivileged, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM sesiones WHERE usuario_id=$1 RETURNING id', [req.params.userId]);
    await logSecurityEvent({
      userId: req.user.id, path: `/api/security/sessions/by-user/${req.params.userId}`,
      actionType: 'session_revoked', ip: sec.clientIp(req), statusCode: 200,
    });
    res.json({ message: 'Sesiones cerradas', count: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Dashboard — contadores reales, nada hardcodeado. Además de los
   contadores del día, trae series de los últimos 14 días (para los
   gráficos), la distribución de sesiones por área, y la salud del
   pool de conexiones a la base (ver getDbHealth en lib/security.js).
   ============================================================ */
router.get('/dashboard', requirePrivileged, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [
      sessions, sessionsDistinctUsers, loginsOk, loginsFail, ipSospechosas, ipBloqueadas, suspendidas, accesosDenegados,
      loginsSeries, accessDeniedSeries, sessionsByArea, dbHealth,
    ] = await Promise.all([
      pool.query('SELECT count(*)::int AS n FROM sesiones WHERE expires_at > NOW()'),
      pool.query('SELECT count(DISTINCT usuario_id)::int AS n FROM sesiones WHERE expires_at > NOW()'),
      pool.query("SELECT count(*)::int AS n FROM security.login_attempts WHERE success=true AND created_at >= $1::date", [today]),
      pool.query("SELECT count(*)::int AS n FROM security.login_attempts WHERE success=false AND created_at >= $1::date", [today]),
      pool.query("SELECT count(*)::int AS n FROM security.ip_status WHERE category='sospechosa'"),
      pool.query("SELECT count(*)::int AS n FROM security.ip_status WHERE category='bloqueada'"),
      pool.query('SELECT count(*)::int AS n FROM usuarios WHERE suspendida_en IS NOT NULL'),
      pool.query("SELECT count(*)::int AS n FROM audit.logs WHERE action_type='access_denied' AND created_at >= $1::date", [today]),
      sec.getLoginSeries(14),
      sec.getAccessDeniedSeries(14),
      sec.getSessionsByArea(),
      sec.getDbHealth(),
    ]);
    res.json({
      sesiones_activas: sessions.rows[0].n,
      sesiones_activas_usuarios: sessionsDistinctUsers.rows[0].n,
      logins_exitosos_hoy: loginsOk.rows[0].n,
      logins_fallidos_hoy: loginsFail.rows[0].n,
      ip_sospechosas: ipSospechosas.rows[0].n,
      ip_bloqueadas: ipBloqueadas.rows[0].n,
      cuentas_suspendidas: suspendidas.rows[0].n,
      accesos_denegados_hoy: accesosDenegados.rows[0].n,
      logins_series: loginsSeries,
      access_denied_series: accessDeniedSeries,
      sessions_by_area: sessionsByArea,
      db_health: dbHealth,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Detalle crudo de los intentos de login de hoy — usado por la
   tarjeta "Logins hoy" del dashboard para desplegar el detalle. */
router.get('/logins-today', requirePrivileged, async (req, res) => {
  try {
    const rows = await sec.getLoginsToday();
    res.json({ rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Amenazas — señales de fuerza bruta / abuso de login, agrupadas
   sobre los mismos datos que ya se registran en cada intento.
   ============================================================ */
router.get('/threats', requirePrivileged, async (req, res) => {
  try {
    const data = await sec.getThreatSignals();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Historial de login por día de un usuario puntual — para el
   desplegable de la vista Sesiones.
   ============================================================ */
router.get('/login-history/:username', requirePrivileged, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const rows = await sec.getLoginHistory(req.params.username, days);
    res.json({ rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
