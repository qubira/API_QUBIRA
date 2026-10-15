'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const QRCode   = require('qrcode');
const { authenticator } = require('otplib');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getEmployeeCargo, logSecurityEvent, logLoginAudit } = require('../lib/audit');
const { getAuthorizedModules } = require('../lib/moduleAccess');
const { encrypt: encryptField, decrypt: decryptField } = require('../lib/crypto');
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
              u.suspendida_en, u.totp_enabled,
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

    /* Contraseña correcta, pero la cuenta tiene activada la
       verificación en dos pasos — todavía no se emite sesión real.
       Se devuelve un token de corta duración (5 min) que solo sirve
       para completar POST /login/totp con el código de la app
       autenticadora; si no se usa a tiempo, hay que volver a loguear. */
    if (user.totp_enabled) {
      const preToken = jwt.sign({ sub: user.id, stage: 'totp' }, process.env.JWT_SECRET, { expiresIn: '5m' });
      return res.json({ ok: true, totp_required: true, pre_token: preToken });
    }

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
   POST /api/auth/location
   Registra la ubicación geográfica del usuario al iniciar sesión
   Header: Authorization: Bearer <token>
   Body: { latitude, longitude, accuracy, address }
   ============================================================ */
router.post('/location', requireAuth, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, address } = req.body;
    const token = req.headers.authorization?.slice(7);
    const ip = sec.clientIp(req);
    const ua = req.headers['user-agent'] || null;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ ok: false, error: 'Latitud y longitud son requeridas' });
    }

    if (token) {
      await pool.query(
        `UPDATE public.sesiones 
         SET latitude = $1, longitude = $2, accuracy = $3, location_address = $4 
         WHERE token = $5`,
        [latitude, longitude, accuracy || null, address || null, token]
      );
    }

    await pool.query(
      `INSERT INTO security.login_locations 
       (usuario_id, username, token, latitude, longitude, accuracy, address, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.user.id,
        req.user.username,
        token,
        latitude,
        longitude,
        accuracy || null,
        address || null,
        ip,
        ua
      ]
    );

    await pool.query(
      `INSERT INTO public.auditoria_usuarios (usuario_id, accion, valor_nuevo, realizado_por)
       VALUES ($1, 'LOGIN_LOCATION', $2, $1)`,
      [
        req.user.id,
        JSON.stringify({ lat: latitude, lng: longitude, acc: accuracy, addr: address, ip })
      ]
    );

    return res.json({ ok: true, message: 'Ubicación registrada exitosamente' });
  } catch (err) {
    console.error('[AUTH] Error guardando ubicación:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al registrar ubicación' });
  }
});

/* ============================================================
   POST /api/auth/login/totp
   Body: { pre_token, code }
   Segundo paso del login cuando la cuenta tiene 2FA activo — cambia
   el pre_token de /login (válido 5 min) + un código de 6 dígitos de
   la app autenticadora por una sesión real, igual que /login normal.
   ============================================================ */
router.post('/login/totp', async (req, res) => {
  const ip = sec.clientIp(req);
  try {
    const { pre_token, code } = req.body;
    if (!pre_token || !code) {
      return res.status(400).json({ ok: false, error: 'Falta el token de verificación o el código' });
    }

    let payload;
    try {
      payload = jwt.verify(pre_token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ ok: false, error: 'La verificación expiró, vuelve a iniciar sesión' });
    }
    if (payload.stage !== 'totp') {
      return res.status(401).json({ ok: false, error: 'Token de verificación inválido' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.apellidos, u.correo, u.username, u.estado, u.avatar_color,
              r.nombre AS rol, r.nivel_acceso
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`,
      [payload.sub]
    );
    if (!rows.length || rows[0].estado !== 'activo') {
      return res.status(403).json({ ok: false, error: 'Cuenta no disponible' });
    }
    const user = rows[0];

    const { valid, error } = await sec.verifyAccountTotp({
      userId: user.id, username: user.username, code, ip, userAgent: req.headers['user-agent'],
    });
    if (!valid) return res.status(401).json({ ok: false, error });

    await revokeOtherSessions(user.id, ip);
    const { token, user: userOut } = await issueSession(user, req);

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, realizado_por) VALUES ($1, 'LOGIN', $1)`,
      [user.id]
    );
    await logLoginAudit(user.id, '/api/auth/login/totp').catch(() => {});

    return res.json({ ok: true, token, user: userOut });
  } catch (err) {
    console.error('[AUTH] TOTP login error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

/* ============================================================
   Verificación en dos pasos — autogestión de cada cuenta sobre su
   propio TOTP. Todo requiere sesión ya iniciada (se activa/desactiva
   desde dentro, nunca antes de loguearse).
   ============================================================ */
router.get('/totp/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT totp_enabled, totp_enabled_at FROM usuarios WHERE id=$1', [req.user.id]);
    res.json({ ok: true, enabled: rows[0]?.totp_enabled || false, enabled_at: rows[0]?.totp_enabled_at || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'No se pudo consultar el estado' });
  }
});

/* Re-confirmación genérica con el código de la propia cuenta — para
   gates de "confirma que eres tú" en momentos sensibles (ej. entrar
   al módulo DST desde modulo.html) que no necesitan un token de
   elevación de varios minutos como Soporte > Trabajadores, solo un
   sí/no puntual antes de seguir con el flujo normal (handoff). */
router.post('/totp/verify', requireAuth, async (req, res) => {
  try {
    const { valid, error } = await sec.verifyAccountTotp({
      userId: req.user.id, username: req.user.username, code: req.body?.code,
      ip: sec.clientIp(req), userAgent: req.headers['user-agent'],
    });
    if (!valid) return res.status(401).json({ ok: false, error });
    res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] TOTP verify error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo verificar el código' });
  }
});

/* Genera un secreto nuevo (reemplaza cualquiera anterior sin
   confirmar) y lo deja guardado ya cifrado, pero totp_enabled sigue
   en false hasta que /totp/confirm reciba un código válido — así
   nunca queda "a medias" una cuenta con 2FA exigido pero sin que el
   dueño haya probado que de verdad puede generar códigos. */
router.post('/totp/setup', requireAuth, async (req, res) => {
  try {
    const secret = authenticator.generateSecret();
    const uri = authenticator.keyuri(req.user.username, 'QUBIRA', secret);
    const qr = await QRCode.toDataURL(uri);
    await pool.query('UPDATE usuarios SET totp_secret=$1, totp_enabled=false, totp_enabled_at=NULL WHERE id=$2', [encryptField(secret), req.user.id]);
    res.json({ ok: true, secret, qr });
  } catch (err) {
    console.error('[AUTH] TOTP setup error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo generar el código' });
  }
});

router.post('/totp/confirm', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const { rows } = await pool.query('SELECT totp_secret FROM usuarios WHERE id=$1', [req.user.id]);
    const secret = rows[0]?.totp_secret ? decryptField(rows[0].totp_secret) : null;
    if (!secret) return res.status(400).json({ ok: false, error: 'Primero genera el código QR' });

    const valid = authenticator.verify({ token: String(code || '').trim(), secret });
    if (!valid) return res.status(401).json({ ok: false, error: 'Código inválido' });

    await pool.query('UPDATE usuarios SET totp_enabled=true, totp_enabled_at=NOW() WHERE id=$1', [req.user.id]);
    await logSecurityEvent({ userId: req.user.id, path: '/api/auth/totp/confirm', actionType: 'totp_enabled', ip: sec.clientIp(req), statusCode: 200 });
    res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] TOTP confirm error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo confirmar' });
  }
});

/* Exige la contraseña actual (no un código TOTP) para poder
   desactivar — así alguien que perdió el acceso a su app
   autenticadora todavía puede apagar el 2FA sabiendo su contraseña,
   en vez de quedar bloqueado de su propia cuenta. */
router.post('/totp/disable', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const { rows } = await pool.query('SELECT password_hash FROM usuarios WHERE id=$1', [req.user.id]);
    const match = rows.length && await bcrypt.compare(password || '', rows[0].password_hash);
    if (!match) return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });

    await pool.query('UPDATE usuarios SET totp_enabled=false, totp_secret=NULL, totp_enabled_at=NULL WHERE id=$1', [req.user.id]);
    await logSecurityEvent({ userId: req.user.id, path: '/api/auth/totp/disable', actionType: 'totp_disabled', ip: sec.clientIp(req), statusCode: 200 });
    res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] TOTP disable error:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo desactivar' });
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

    const closest = await sec.closestFaceCandidate(descriptor);
    const match = (closest && closest.distance <= sec.FACE_MATCH_THRESHOLD) ? closest : null;
    if (!match) {
      await sec.recordLoginAttempt({ username: 'face:unknown', ip, success: false, userAgent: req.headers['user-agent'] });
      await sec.logFaceDebug(closest, ip);
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

    /* El ip viaja en el body porque el que llama no tiene token válido
       para que el servidor lo saque de una sesión propia — pero no por
       eso se confía a ciegas: tiene que coincidir con un reemplazo de
       sesión real y reciente de ESTA cuenta, si no cualquiera podría
       mandar a bloquear cualquier IP con solo cambiarlo en la URL. */
    const validReplacement = await sec.wasSessionReplacedByIp(userId, ip);
    if (!validReplacement) {
      return res.status(400).json({ ok: false, error: 'No se encontró un inicio de sesión reciente desde ese IP para esta cuenta' });
    }

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
