'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getEmployeeCargo, logSecurityEvent, logLoginAudit } = require('../lib/audit');
const { getAuthorizedModules } = require('../lib/moduleAccess');
const sec = require('../lib/security');

const router = express.Router();
router.use((req, res, next) => { sec.ensureSecuritySchema().then(() => next()).catch(next); });

/* Una sola sesión activa por cuenta: entrar con credenciales o rostro
   desde un dispositivo nuevo apaga las sesiones que esa cuenta tenía
   abiertas en cualquier otro lado. Deliberadamente NO se usa en
   /exchange (el traspaso entre paneles del MISMO dispositivo/sesión
   central, ej. ADG → TI vía el botón "Módulos") — si no, tener dos
   paneles abiertos a la vez en la misma compu se rompería solo. */
async function revokeOtherSessions(userId, newIp) {
  await pool.query(
    `UPDATE sesiones SET expires_at = NOW(), revoked_reason = 'replaced', revoked_by_ip = $2
     WHERE usuario_id = $1 AND expires_at > NOW() AND revoked_reason IS NULL`,
    [userId, newIp]
  );
}

/* Arma el token + sesión + respuesta para un usuario ya verificado —
   usado tanto por /login (credenciales) como por /exchange (código de
   traspaso desde login/modulo.html), así ambos caminos terminan en
   exactamente la misma sesión. */
async function issueSession(user, req) {
  const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
  const token = jwt.sign(
    { sub: user.id, username: user.username, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn }
  );
  const hours = parseInt(expiresIn) || 24;
  const expires = new Date(Date.now() + hours * 3600 * 1000);
  const ip = sec.clientIp(req);

  await pool.query(
    `INSERT INTO sesiones (usuario_id, token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, token, ip, req.headers['user-agent'] || null, expires]
  );

  const [cargo, authorized_modules] = await Promise.all([
    getEmployeeCargo(user.username).catch(() => null),
    getAuthorizedModules(user.username, user.nivel_acceso, user.id).catch(() => []),
  ]);

  return {
    token,
    user: {
      id: user.id, nombre: user.nombre, apellidos: user.apellidos, username: user.username,
      correo: user.correo, rol: user.rol, nivel_acceso: user.nivel_acceso,
      avatar_color: user.avatar_color, cargo, authorized_modules,
    },
  };
}

/* ============================================================
   POST /api/auth/login
   Body: { username, password }
   ============================================================ */
router.post('/login', async (req, res) => {
  const ip = sec.clientIp(req);
  const usernameRaw = req.body?.username;
  const username = usernameRaw ? String(usernameRaw).trim().toLowerCase() : null;

  try {
    const { password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Usuario y contraseña requeridos' });
    }

    await sec.touchIpObservation(ip);
    if (await sec.isIpBlocked(ip)) {
      await sec.recordLoginAttempt({ username, ip, success: false, userAgent: req.headers['user-agent'] });
      await logSecurityEvent({ userId: null, path: '/api/auth/login', actionType: 'ip_blocked_attempt', ip, statusCode: 403 });
      return res.status(403).json({ ok: false, error: 'Acceso bloqueado por seguridad. Contacta al administrador.' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.apellidos, u.correo, u.username,
              u.password_hash, u.estado, u.avatar_color, u.intentos_fallidos, u.bloqueada_hasta,
              u.suspendida_en,
              r.nombre AS rol, r.nivel_acceso
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.username = $1`,
      [username]
    );

    if (!rows.length) {
      await sec.recordLoginAttempt({ username, ip, success: false, userAgent: req.headers['user-agent'] });
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
    }

    const user = rows[0];

    if (user.estado !== 'activo') {
      return res.status(403).json({ ok: false, error: 'Cuenta desactivada. Contacta al administrador.' });
    }

    if (user.suspendida_en) {
      await sec.recordLoginAttempt({ username, ip, success: false, userAgent: req.headers['user-agent'] });
      return res.status(403).json({ ok: false, error: 'Cuenta suspendida por seguridad. Contacta al administrador.' });
    }

    const stillLocked = user.bloqueada_hasta && new Date(user.bloqueada_hasta) > new Date();
    if (stillLocked) {
      await sec.recordLoginAttempt({ username, ip, success: false, userAgent: req.headers['user-agent'] });
      return res.status(403).json({ ok: false, error: 'Cuenta temporalmente bloqueada por seguridad. Intenta más tarde.' });
    }
    /* El bloqueo ya venció — arranca un contador limpio antes de seguir. */
    if (user.bloqueada_hasta) await sec.resetFailedAttempts(user.id);

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      await sec.recordLoginAttempt({ username, ip, success: false, userAgent: req.headers['user-agent'] });
      await sec.bumpFailedAttempts(user.id);

      const failures = await sec.countRecentFailures(username, sec.LOCKOUT_MINUTES);
      if (failures >= sec.MAX_LOGIN_ATTEMPTS) {
        await sec.lockAccount(user.id, sec.LOCKOUT_MINUTES);
        await logSecurityEvent({ userId: user.id, path: '/api/auth/login', actionType: 'account_locked', ip, statusCode: 403 });
      }

      const distinctIps = await sec.distinctFailureIps(username, sec.LOCKOUT_MINUTES);
      if (distinctIps.length >= sec.IP_EVASION_DISTINCT_IPS) {
        const current = await sec.getIpStatus(ip);
        if (!current || current.category === 'observacion') {
          await sec.upsertIpStatus(ip, { category: 'sospechosa', reason: `Múltiples IP con fallos para "${username}" en ${sec.LOCKOUT_MINUTES} min` });
          await logSecurityEvent({ userId: user.id, path: '/api/auth/login', actionType: 'ip_marked_suspicious', ip, statusCode: 403 });
        }
      }

      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
    }

    await sec.resetFailedAttempts(user.id);
    await sec.recordLoginAttempt({ username, ip, success: true, userAgent: req.headers['user-agent'] });

    await revokeOtherSessions(user.id, ip);
    const { token, user: userOut } = await issueSession(user, req);

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, realizado_por) VALUES ($1, 'LOGIN', $1)`,
      [user.id]
    );
    await logLoginAudit(user.id, '/api/auth/login').catch(() => {});

    return res.json({ ok: true, token, user: userOut });

  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

/* ============================================================
   POST /api/auth/handoff
   Autenticado. Genera un código de un solo uso (vence en 60s) para
   que login/modulo.html abra otro panel (dominio distinto) sin pedir
   credenciales de nuevo.
   ============================================================ */
router.post('/handoff', requireAuth, async (req, res) => {
  try {
    const code = await sec.createHandoffCode(req.user.id);
    res.json({ ok: true, code });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'No se pudo generar el traspaso' });
  }
});

/* ============================================================
   POST /api/auth/exchange
   Body: { code }
   Cambia un código de traspaso por una sesión real — lo usa la
   página de login delgada de cada panel al recibir ?handoff=...
   ============================================================ */
router.post('/exchange', async (req, res) => {
  try {
    const userId = await sec.consumeHandoffCode(req.body?.code);
    if (!userId) return res.status(401).json({ ok: false, error: 'Código de traspaso inválido o vencido' });

    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.apellidos, u.correo, u.username, u.estado, u.avatar_color,
              r.nombre AS rol, r.nivel_acceso
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`,
      [userId]
    );
    if (!rows.length || rows[0].estado !== 'activo') {
      return res.status(403).json({ ok: false, error: 'Cuenta no disponible' });
    }

    const { token, user: userOut } = await issueSession(rows[0], req);
    await logSecurityEvent({ userId, path: '/api/auth/exchange', actionType: 'handoff_used', ip: sec.clientIp(req), statusCode: 200 });
    return res.json({ ok: true, token, user: userOut });
  } catch (err) {
    console.error('[AUTH] Exchange error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

/* ============================================================
   POST /api/auth/logout
   Header: Authorization: Bearer <token>
   ============================================================ */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization.slice(7);

    await pool.query('DELETE FROM sesiones WHERE token = $1', [token]);

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, realizado_por)
       VALUES ($1, 'LOGOUT', $1)`,
      [req.user.id]
    );

    return res.json({ ok: true, message: 'Sesión cerrada correctamente' });
  } catch (err) {
    console.error('[AUTH] Logout error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al cerrar sesión' });
  }
});

/* ============================================================
   Reconocimiento facial
   - /face/enroll y /face/status son de RRHH: capturan/consultan el
     rostro de OTRO colaborador (por username), no el propio, así que
     exigen módulo RRHH otorgado o nivel_acceso privilegiado.
   - /face/login es público (como /login): identifica QUIÉN es a
     partir del rostro, así que compara contra todos los registrados.
   ============================================================ */
async function requireRrhhStaff(req, res, next) {
  try {
    if ((req.user.nivel_acceso || 0) >= 100) return next();
    const modules = await getAuthorizedModules(req.user.username, req.user.nivel_acceso, req.user.id);
    if (modules.includes('RRHH')) return next();
    return res.status(403).json({ ok: false, error: 'Solo RR. HH. puede administrar el reconocimiento facial de colaboradores' });
  } catch (err) { return next(err); }
}

async function findUserIdByUsername(username) {
  const { rows } = await pool.query('SELECT id FROM usuarios WHERE lower(username) = lower($1)', [username]);
  return rows.length ? rows[0].id : null;
}

router.get('/face/status', requireAuth, requireRrhhStaff, async (req, res) => {
  try {
    const username = req.query?.username;
    if (!username) return res.status(400).json({ ok: false, error: 'Falta el usuario' });
    const userId = await findUserIdByUsername(username);
    if (!userId) return res.status(404).json({ ok: false, error: 'Colaborador no encontrado' });
    const samples = await sec.getFaceEnrollmentCount(userId);
    res.json({ ok: true, enrolled: samples > 0, samples });
  } catch (err) {
    console.error('[AUTH] Face status error:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

router.post('/face/enroll', requireAuth, requireRrhhStaff, async (req, res) => {
  try {
    const { username, descriptors } = req.body || {};
    if (!username) return res.status(400).json({ ok: false, error: 'Falta el usuario' });
    if (!Array.isArray(descriptors) || !descriptors.length || descriptors.length > 5 || !descriptors.every(sec.isValidFaceDescriptor)) {
      return res.status(400).json({ ok: false, error: 'Se necesitan entre 1 y 5 capturas válidas del rostro' });
    }
    const userId = await findUserIdByUsername(username);
    if (!userId) return res.status(404).json({ ok: false, error: 'Colaborador no encontrado' });

    await sec.saveFaceDescriptors(userId, descriptors);
    await logSecurityEvent({ userId: req.user.id, path: '/api/auth/face/enroll', actionType: 'face_enrolled', ip: sec.clientIp(req), statusCode: 200 });
    res.json({ ok: true, samples: descriptors.length });
  } catch (err) {
    console.error('[AUTH] Face enroll error:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

router.delete('/face/enroll', requireAuth, requireRrhhStaff, async (req, res) => {
  try {
    const username = req.query?.username || req.body?.username;
    if (!username) return res.status(400).json({ ok: false, error: 'Falta el usuario' });
    const userId = await findUserIdByUsername(username);
    if (!userId) return res.status(404).json({ ok: false, error: 'Colaborador no encontrado' });

    await sec.deleteFaceDescriptors(userId);
    await logSecurityEvent({ userId: req.user.id, path: '/api/auth/face/enroll', actionType: 'face_removed', ip: sec.clientIp(req), statusCode: 200 });
    res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] Face delete error:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

router.post('/face/login', async (req, res) => {
  const ip = sec.clientIp(req);
  try {
    const descriptor = req.body?.descriptor;
    if (!sec.isValidFaceDescriptor(descriptor)) {
      return res.status(400).json({ ok: false, error: 'Captura de rostro inválida' });
    }

    await sec.touchIpObservation(ip);
    if (await sec.isIpBlocked(ip)) {
      await sec.recordLoginAttempt({ username: 'face:unknown', ip, success: false, userAgent: req.headers['user-agent'] });
      await logSecurityEvent({ userId: null, path: '/api/auth/face/login', actionType: 'ip_blocked_attempt', ip, statusCode: 403 });
      return res.status(403).json({ ok: false, error: 'Acceso bloqueado por seguridad. Contacta al administrador.' });
    }

    const match = await sec.findFaceMatch(descriptor);
    if (!match) {
      await sec.recordLoginAttempt({ username: 'face:unknown', ip, success: false, userAgent: req.headers['user-agent'] });
      return res.status(401).json({ ok: false, error: 'Rostro no reconocido' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.apellidos, u.correo, u.username, u.estado, u.avatar_color,
              u.bloqueada_hasta, u.suspendida_en,
              r.nombre AS rol, r.nivel_acceso
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`,
      [match.usuario_id]
    );
    if (!rows.length) {
      await sec.recordLoginAttempt({ username: 'face:unknown', ip, success: false, userAgent: req.headers['user-agent'] });
      return res.status(401).json({ ok: false, error: 'Rostro no reconocido' });
    }
    const user = rows[0];

    if (user.estado !== 'activo') {
      await sec.recordLoginAttempt({ username: user.username, ip, success: false, userAgent: req.headers['user-agent'] });
      return res.status(403).json({ ok: false, error: 'Cuenta desactivada. Contacta al administrador.' });
    }
    if (user.suspendida_en) {
      await sec.recordLoginAttempt({ username: user.username, ip, success: false, userAgent: req.headers['user-agent'] });
      return res.status(403).json({ ok: false, error: 'Cuenta suspendida por seguridad. Contacta al administrador.' });
    }
    const stillLocked = user.bloqueada_hasta && new Date(user.bloqueada_hasta) > new Date();
    if (stillLocked) {
      await sec.recordLoginAttempt({ username: user.username, ip, success: false, userAgent: req.headers['user-agent'] });
      return res.status(403).json({ ok: false, error: 'Cuenta temporalmente bloqueada por seguridad. Intenta más tarde.' });
    }

    await sec.recordLoginAttempt({ username: user.username, ip, success: true, userAgent: req.headers['user-agent'] });
    await revokeOtherSessions(user.id, ip);
    const { token, user: userOut } = await issueSession(user, req);

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, realizado_por) VALUES ($1, 'LOGIN', $1)`,
      [user.id]
    );
    await logLoginAudit(user.id, '/api/auth/face/login').catch(() => {});

    return res.json({ ok: true, token, user: userOut });
  } catch (err) {
    console.error('[AUTH] Face login error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

/* ============================================================
   POST /api/auth/security/block-replacing-ip
   Público (a propósito): a quien lo llama recién le mataron la sesión
   porque su cuenta inició sesión en otro dispositivo — no tiene un
   token válido para autenticarse. En su lugar prueba que es EL DUEÑO
   de esa cuenta puntual con su propio rostro (verificación 1:1, no
   una búsqueda como el login facial normal) y, si coincide, bloquea
   el IP que le reemplazó la sesión.
   Body: { username, descriptor, ip }
   ============================================================ */
router.post('/security/block-replacing-ip', async (req, res) => {
  const callerIp = sec.clientIp(req);
  try {
    const { username, descriptor, ip } = req.body || {};
    if (!username || !ip || !sec.isValidFaceDescriptor(descriptor)) {
      return res.status(400).json({ ok: false, error: 'Datos inválidos' });
    }

    await sec.touchIpObservation(callerIp);
    if (await sec.isIpBlocked(callerIp)) {
      return res.status(403).json({ ok: false, error: 'Acceso bloqueado por seguridad. Contacta al administrador.' });
    }

    const userId = await findUserIdByUsername(username);
    if (!userId) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const enrolled = await sec.getFaceEnrollmentCount(userId);
    if (!enrolled) {
      return res.status(409).json({ ok: false, error: 'Esta cuenta no tiene reconocimiento facial registrado — no se puede verificar al titular.' });
    }

    const verified = await sec.verifyOwnFace(userId, descriptor);
    if (!verified) {
      await sec.recordLoginAttempt({ username: 'face-block:' + username, ip: callerIp, success: false, userAgent: req.headers['user-agent'] });
      return res.status(401).json({ ok: false, error: 'El rostro no coincide con el titular de la cuenta' });
    }

    await sec.upsertIpStatus(ip, {
      category: 'bloqueada',
      reason: `Bloqueado por ${username} (verificación facial) tras detectar un inicio de sesión no reconocido`,
      adminId: userId,
      lockedToDst: true,
    });
    await logSecurityEvent({ userId, path: '/api/auth/security/block-replacing-ip', actionType: 'ip_blocked_by_owner', ip: callerIp, statusCode: 200 });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] block-replacing-ip error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

/* ============================================================
   GET /api/auth/me
   Devuelve info del usuario autenticado, incluyendo qué módulos
   tiene autorizados (dato calculado por el servidor, nunca por el
   cliente) — login/modulo.html y el chequeo de cada panel lo usan.
   ============================================================ */
router.get('/me', requireAuth, async (req, res) => {
  const [cargo, authorized_modules] = await Promise.all([
    getEmployeeCargo(req.user.username).catch(() => null),
    getAuthorizedModules(req.user.username, req.user.nivel_acceso, req.user.id).catch(() => []),
  ]);
  return res.json({ ok: true, user: { ...req.user, cargo, authorized_modules } });
});

module.exports = router;
