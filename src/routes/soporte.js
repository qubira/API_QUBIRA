'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');
const sec = require('../lib/security');

const router = express.Router();

/* Todos los endpoints de este módulo requieren estar logueado Y
   pertenecer al área de Soporte — dentro de eso, cualquier trabajador
   con sesión activa puede usarlos (estilo mesa de ayuda); el filtro
   fino adicional es la verificación en dos pasos de cada cuenta, no
   el cargo. */
router.use(requireAuth);
router.use(requireModuleAccess('SOPORTE', 'OCOS'));

/* ============================================================
   Elevación de acceso — antes esto pedía una "contraseña maestra"
   compartida (process.env.MASTER_PASSWORD, la misma para todo
   Soporte). Ahora usa el código TOTP propio de cada cuenta: más
   seguro (nada compartido que filtrar) y queda atribuido a la
   persona exacta que lo usó.

   Un código TOTP solo es válido ~30-90s, así que no se puede
   reenviar en cada petición sensible como se hacía con la
   contraseña — en su lugar, verificar el código una vez emite un
   token de elevación de corta duración (15 min) que el frontend
   guarda en memoria (nunca en localStorage) y reenvía como header
   en las siguientes llamadas, igual que antes vivía msPassword
   "solo en memoria de esta pestaña".
   ============================================================ */
const ELEVATION_TTL = '15m';

function requireElevatedAccess(req, res, next) {
  const token = req.headers['x-elevation-token'];
  if (!token) return res.status(403).json({ ok: false, error: 'Verifica tu código de verificación en dos pasos primero' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== 'soporte_trabajadores' || payload.sub !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Token de elevación inválido' });
    }
  } catch {
    return res.status(403).json({ ok: false, error: 'La verificación expiró, vuelve a ingresar tu código' });
  }
  next();
}

/* ============================================================
   POST /api/soporte/elevate
   Body: { code } — código de 6 dígitos de la app autenticadora de
   la propia cuenta. Si es válido, emite el token de elevación que
   desbloquea GET/PATCH /trabajadores por 15 minutos.
   ============================================================ */
router.post('/elevate', async (req, res) => {
  try {
    const { valid, error } = await sec.verifyAccountTotp({
      userId: req.user.id, username: req.user.username, code: req.body?.code,
      ip: sec.clientIp(req), userAgent: req.headers['user-agent'],
    });

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, realizado_por)
       VALUES ($1, $2, $1)`,
      [req.user.id, valid ? 'MASTER_PASSWORD_OK' : 'MASTER_PASSWORD_FAIL']
    );

    if (!valid) return res.status(403).json({ ok: false, error });

    const token = jwt.sign({ sub: req.user.id, purpose: 'soporte_trabajadores' }, process.env.JWT_SECRET, { expiresIn: ELEVATION_TTL });
    return res.json({ ok: true, token });
  } catch (err) {
    console.error('[SOPORTE] elevate error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

/* ============================================================
   GET /api/soporte/trabajadores
   Lista todas las cuentas de trabajadores (sin password_hash).
   Requiere contraseña maestra vigente en cada llamada.
   ============================================================ */
router.get('/trabajadores', requireElevatedAccess, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.apellidos, u.dni, u.celular, u.correo, u.username,
              r.nombre AS rol, r.nivel_acceso, u.estado, u.avatar_color,
              u.created_at, u.updated_at
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       ORDER BY u.nombre ASC, u.apellidos ASC`
    );
    return res.json({ ok: true, trabajadores: rows });
  } catch (err) {
    console.error('[SOPORTE] GET /trabajadores error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener trabajadores' });
  }
});

/* ============================================================
   PATCH /api/soporte/trabajadores/:id/password
   Único campo editable desde este panel: la contraseña.
   Body: { nueva_password }
   ============================================================ */
router.patch('/trabajadores/:id/password', requireElevatedAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

    const { nueva_password } = req.body;
    if (!nueva_password || nueva_password.length < 8) {
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const { rows: target } = await pool.query(
      'SELECT id, username, nombre, apellidos FROM usuarios WHERE id = $1', [id]
    );
    if (!target.length) return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });

    const hash = await bcrypt.hash(nueva_password, 12);

    await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, id]);

    /* Cierra las sesiones activas del trabajador para forzar el uso de la nueva contraseña */
    await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [id]);

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, valor_nuevo, realizado_por)
       VALUES ($1, 'RESET_PASSWORD_SOPORTE', $2, $3)`,
      [id, `Contraseña reseteada desde el panel de Soporte por ${req.user.username}`, req.user.id]
    );

    return res.json({
      ok: true,
      message: `Contraseña actualizada para ${target[0].nombre} ${target[0].apellidos || ''}`.trim(),
    });
  } catch (err) {
    console.error('[SOPORTE] PATCH password error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al actualizar la contraseña' });
  }
});

module.exports = router;
