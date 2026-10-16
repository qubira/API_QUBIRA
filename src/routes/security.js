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
      SELECT s.ip, s.category, s.reason, s.blocked_until, s.is_permanent, s.notes, s.locked_to_dst,
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

    /* Un IP que el propio dueño de una cuenta bloqueó vía verificación
       facial (locked_to_dst) solo lo puede tocar DST — Soporte puede
       seguir viéndolo, pero no levantarlo ni recategorizarlo. */
    const current = await sec.getIpStatus(req.params.ip);
    if (current?.locked_to_dst) {
      const authorized = await getAuthorizedModules(req.user.username, req.user.nivel_acceso, req.user.id);
      const isDstOrPrivileged = req.user.nivel_acceso >= 100 || authorized.includes('DST');
      if (!isDstOrPrivileged) {
        return res.status(403).json({ error: 'Este IP fue bloqueado por verificación facial del titular de la cuenta — solo DST puede modificarlo' });
      }
    }

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
             u.totp_enabled, u.totp_enabled_at,
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
   Bloqueos de 2FA — pestaña propia de DST para ver qué cuentas
   tienen (o tuvieron) bloqueos/suspensiones por códigos de
   verificación en dos pasos incorrectos, y detectar si es reiterado.
   Solo entran cuentas con alguna señal: bloqueo activo, suspensión
   activa, o historial de vida (totp_lockout_total/
   totp_auto_suspended_total) aunque la racha actual ya esté limpia.
   ============================================================ */
router.get('/totp-lockouts', requirePrivileged, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.nombre, u.apellidos, u.username, u.correo, u.estado,
             r.nombre AS rol,
             u.totp_enabled, u.totp_failed_attempts, u.totp_lockout_count,
             u.totp_lockout_total, u.totp_auto_suspended_total, u.totp_last_lockout_at,
             u.bloqueada_hasta, u.suspendida_en, u.suspendida_motivo, u.suspendida_por,
             sp.nombre AS suspendida_por_nombre
      FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      LEFT JOIN usuarios sp ON sp.id = u.suspendida_por
      WHERE u.totp_lockout_total > 0 OR u.totp_auto_suspended_total > 0
         OR u.suspendida_en IS NOT NULL
         OR (u.bloqueada_hasta IS NOT NULL AND u.bloqueada_hasta > NOW())
      ORDER BY u.totp_last_lockout_at DESC NULLS LAST, u.totp_lockout_total DESC
      LIMIT 200
    `);
    res.json({
      rows,
      thresholds: { maxAttempts: sec.TOTP_MAX_ATTEMPTS, lockoutMinutes: sec.TOTP_LOCKOUT_MINUTES, lockoutsBeforeSuspend: sec.TOTP_MAX_LOCKOUTS_BEFORE_SUSPEND },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Historial puntual de una cuenta: intentos de 2FA (vía
   security.login_attempts, mismo registro que ya usa el bloqueo por
   contraseña) + los eventos de seguridad relacionados en audit.logs
   (bloqueos, suspensión, reactivación, activar/desactivar 2FA) —
   junto arman la "auditoría completa" que pidió DST para esa cuenta. */
router.get('/totp-lockouts/:userId/history', requirePrivileged, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query('SELECT username FROM usuarios WHERE id=$1', [req.params.userId]);
    if (!userRows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const { username } = userRows[0];

    const [attempts, events] = await Promise.all([
      pool.query(
        `SELECT ip, success, user_agent, created_at FROM security.login_attempts
         WHERE username = $1 ORDER BY created_at DESC LIMIT 50`,
        [username]
      ),
      pool.query(
        `SELECT action_type, ip, status_code, created_at FROM audit.logs
         WHERE user_id = $1 AND action_type IN
           ('account_locked','account_suspended','account_unsuspended','totp_enabled','totp_disabled','login')
         ORDER BY created_at DESC LIMIT 50`,
        [req.params.userId]
      ),
    ]);
    res.json({ attempts: attempts.rows, events: events.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Reporte de Cuentas sin 2FA (Control y Auditoría de Seguridad)
   Lista el estado de 2FA de las cuentas corporativas, métricas de
   adopción/cumplimiento y resalta cuentas en riesgo sin 2FA.
   ============================================================ */
router.get('/totp-compliance', requirePrivileged, async (req, res) => {
  try {
    const { q, area, rol, status, only_inactive } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (u.nombre ILIKE $${params.length} OR u.apellidos ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.correo ILIKE $${params.length})`;
    }
    if (area) {
      params.push(area);
      where += ` AND c.nombre = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND u.estado = $${params.length}`;
    }
    if (only_inactive === 'true' || only_inactive === true) {
      where += ` AND (u.totp_enabled IS FALSE OR u.totp_enabled IS NULL)`;
    }

    const { rows } = await pool.query(`
      SELECT u.id, u.nombre, u.apellidos, u.username, u.correo, u.telefono, u.estado,
             u.totp_enabled, u.totp_enabled_at,
             u.intentos_fallidos, u.bloqueada_hasta, u.suspendida_motivo, u.suspendida_en, u.suspendida_por,
             r.nombre AS rol, r.nivel_acceso,
             c.nombre AS area,
             (SELECT array_agg(modulo) FROM security.usuario_modulos m WHERE m.usuario_id = u.id) AS granted_modules,
             (SELECT max(l.created_at) FROM audit.logs l WHERE l.user_id = u.id AND l.action_type='login') AS ultimo_login,
             (SELECT la.ip FROM security.login_attempts la WHERE la.username = u.username AND la.success = true
                ORDER BY la.created_at DESC LIMIT 1) AS ultima_ip
      FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      ${where}
      ORDER BY 
        CASE WHEN u.totp_enabled IS TRUE THEN 1 ELSE 0 END ASC,
        r.nivel_acceso DESC,
        u.nombre ASC`, params);

    // Métricas globales del sistema
    const { rows: statsRows } = await pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(CASE WHEN u.totp_enabled IS TRUE THEN 1 END)::int AS active_count,
        COUNT(CASE WHEN u.totp_enabled IS NOT TRUE THEN 1 END)::int AS inactive_count,
        COUNT(CASE WHEN u.totp_enabled IS NOT TRUE AND (r.nivel_acceso >= 50 OR r.nombre ILIKE '%admin%' OR r.nombre ILIKE '%dst%' OR r.nombre ILIKE '%ti%') THEN 1 END)::int AS critical_inactive_count,
        COUNT(CASE WHEN u.estado = 'activo' THEN 1 END)::int AS total_active_users,
        COUNT(CASE WHEN u.estado = 'activo' AND u.totp_enabled IS TRUE THEN 1 END)::int AS active_users_with_2fa
      FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
    `);

    const stats = statsRows[0] || { total: 0, active_count: 0, inactive_count: 0, critical_inactive_count: 0, total_active_users: 0, active_users_with_2fa: 0 };
    const compliance_pct = stats.total > 0 ? Math.round((stats.active_count / stats.total) * 100) : 0;
    const active_users_compliance_pct = stats.total_active_users > 0 ? Math.round((stats.active_users_with_2fa / stats.total_active_users) * 100) : 0;

    res.json({
      rows,
      stats: {
        ...stats,
        compliance_pct,
        active_users_compliance_pct,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
             s.latitude, s.longitude, s.accuracy, s.location_address, s.created_at AS location_registered_at,
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

/* Cierra TODAS las sesiones activas de un usuario de una sola vez */
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
   Geolocalización — Inicios de sesión con GPS en el mapa de Perú
   ============================================================ */
router.get('/locations', requirePrivileged, async (req, res) => {
  try {
    // 1. Historial de ubicaciones registradas
    const { rows: history } = await pool.query(`
      SELECT l.id, l.usuario_id, l.token, l.latitude, l.longitude, l.accuracy,
             l.ip_address, l.user_agent, l.address, l.created_at,
             u.nombre, u.apellidos, u.username, u.estado AS usuario_estado, u.avatar_color,
             r.nombre AS rol, c.nombre AS area
      FROM security.login_locations l
      JOIN usuarios u ON u.id = l.usuario_id
      LEFT JOIN roles r ON r.id = u.rol_id
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL
      ORDER BY l.created_at DESC
      LIMIT 500
    `);

    // 2. Sesiones activas con ubicación
    const { rows: activeSessions } = await pool.query(`
      SELECT s.id, s.usuario_id, s.latitude, s.longitude, s.accuracy,
             s.location_address, s.created_at AS location_registered_at, s.ip_address, s.user_agent,
             s.created_at, s.expires_at,
             u.nombre, u.apellidos, u.username, u.estado AS usuario_estado, u.avatar_color,
             r.nombre AS rol, c.nombre AS area
      FROM sesiones s
      JOIN usuarios u ON u.id = s.usuario_id
      LEFT JOIN roles r ON r.id = u.rol_id
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      WHERE s.expires_at > NOW() AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
      ORDER BY s.created_at DESC
    `);

    res.json({
      ok: true,
      locations: history,
      active: activeSessions,
      stats: {
        total_registered: history.length,
        active_with_gps: activeSessions.length,
        unique_users: new Set(history.map(h => h.usuario_id)).size,
      }
    });
  } catch (e) {
    console.error('[SECURITY] Error en /locations:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* Historial de ubicaciones de un usuario puntual para trazado de ruta */
router.get('/locations/history/:userId', requirePrivileged, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT l.id, l.latitude, l.longitude, l.accuracy, l.ip_address, l.address, l.created_at
      FROM security.login_locations l
      WHERE l.usuario_id = $1 AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
      ORDER BY l.created_at ASC
      LIMIT 100
    `, [req.params.userId]);
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ============================================================
   Geocercas y Perímetro de Seguridad Corporativo
   ============================================================ */
router.get('/geofence', requirePrivileged, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, points, active, updated_at
      FROM security.geofence_perimeter
      ORDER BY id DESC
      LIMIT 1
    `);
    res.json({ ok: true, geofence: rows[0] || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/geofence', requirePrivileged, async (req, res) => {
  try {
    const { name, points, active = true } = req.body;
    if (!points || !Array.isArray(points) || points.length < 3) {
      return res.status(400).json({ ok: false, error: 'Se requieren al menos 3 vértices para el perímetro' });
    }

    await pool.query('DELETE FROM security.geofence_perimeter');
    const { rows } = await pool.query(`
      INSERT INTO security.geofence_perimeter (name, points, active, updated_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `, [name || 'Perímetro Corporativo Autorizado', JSON.stringify(points), active]);

    res.json({ ok: true, geofence: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete('/geofence', requirePrivileged, async (req, res) => {
  try {
    await pool.query('DELETE FROM security.geofence_perimeter');
    res.json({ ok: true, message: 'Perímetro eliminado' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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
