'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getEmployeeCargo, logLoginAudit } = require('../lib/audit');

const router = express.Router();

/* ============================================================
   POST /api/auth/login
   Body: { username, password }
   ============================================================ */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Usuario y contraseña requeridos' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.apellidos, u.correo, u.username,
              u.password_hash, u.estado, u.avatar_color,
              r.nombre AS rol, r.nivel_acceso
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.username = $1`,
      [username.trim().toLowerCase()]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
    }

    const user = rows[0];

    if (user.estado !== 'activo') {
      return res.status(403).json({ ok: false, error: 'Cuenta desactivada. Contacta al administrador.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    const token = jwt.sign(
      { sub: user.id, username: user.username, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    const hours   = parseInt(expiresIn) || 24;
    const expires = new Date(Date.now() + hours * 3600 * 1000);

    await pool.query(
      `INSERT INTO sesiones (usuario_id, token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        token,
        req.ip || req.connection.remoteAddress,
        req.headers['user-agent'] || null,
        expires,
      ]
    );

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, realizado_por)
       VALUES ($1, 'LOGIN', $1)`,
      [user.id]
    );
    await logLoginAudit(user.id, '/api/auth/login').catch(() => {});

    const cargo = await getEmployeeCargo(user.username).catch(() => null);

    return res.json({
      ok: true,
      token,
      user: {
        id:           user.id,
        nombre:       user.nombre,
        apellidos:    user.apellidos,
        username:     user.username,
        correo:       user.correo,
        rol:          user.rol,
        nivel_acceso: user.nivel_acceso,
        avatar_color: user.avatar_color,
        cargo,
      },
    });

  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
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
   GET /api/auth/me
   Devuelve info del usuario autenticado
   ============================================================ */
router.get('/me', requireAuth, async (req, res) => {
  const cargo = await getEmployeeCargo(req.user.username).catch(() => null);
  return res.json({ ok: true, user: { ...req.user, cargo } });
});

module.exports = router;
