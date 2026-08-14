'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/* Todos los endpoints de este módulo requieren estar logueado.
   Cualquier trabajador con sesión activa puede usarlos (estilo mesa de ayuda) —
   el filtro real de acceso es la contraseña maestra, no el rol. */
router.use(requireAuth);

/* ============================================================
   Middleware — exige la contraseña maestra en cada petición
   sensible (no solo al "desbloquear" la vista en el frontend).
   Header: X-Master-Password
   ============================================================ */
function requireMasterPassword(req, res, next) {
  const provided = req.headers['x-master-password'];
  if (!provided || provided !== process.env.MASTER_PASSWORD) {
    return res.status(403).json({ ok: false, error: 'Contraseña maestra incorrecta o faltante' });
  }
  next();
}

/* ============================================================
   POST /api/soporte/master-password/verify
   Valida la contraseña maestra para desbloquear el panel en el frontend.
   ============================================================ */
router.post('/master-password/verify', async (req, res) => {
  try {
    const { password } = req.body;
    const correcta = !!password && password === process.env.MASTER_PASSWORD;

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, realizado_por)
       VALUES ($1, $2, $1)`,
      [req.user.id, correcta ? 'MASTER_PASSWORD_OK' : 'MASTER_PASSWORD_FAIL']
    );

    if (!correcta) {
      return res.status(403).json({ ok: false, error: 'Contraseña maestra incorrecta' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[SOPORTE] master-password/verify error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

/* ============================================================
   GET /api/soporte/trabajadores
   Lista todas las cuentas de trabajadores (sin password_hash).
   Requiere contraseña maestra vigente en cada llamada.
   ============================================================ */
router.get('/trabajadores', requireMasterPassword, async (req, res) => {
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
router.patch('/trabajadores/:id/password', requireMasterPassword, async (req, res) => {
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
