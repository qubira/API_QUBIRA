'use strict';

const jwt = require('jsonwebtoken');
const { pool } = require('../db');

/* Verifica el JWT en el header Authorization: Bearer <token> */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    /* Verificar que la sesión todavía existe y no ha expirado */
    const { rows } = await pool.query(
      `SELECT s.id, u.id AS usuario_id, u.username, u.nombre, u.estado,
              r.nombre AS rol, r.nivel_acceso, u.avatar_color
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       JOIN roles    r ON r.id = u.rol_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
    }

    const sesion = rows[0];

    if (sesion.estado !== 'activo') {
      return res.status(403).json({ ok: false, error: 'Cuenta desactivada' });
    }

    req.user = {
      id:           sesion.usuario_id,
      username:     sesion.username,
      nombre:       sesion.nombre,
      rol:          sesion.rol,
      nivel_acceso: sesion.nivel_acceso,
      avatar_color: sesion.avatar_color,
    };

    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
}

/* Solo permite roles con nivel_acceso >= minLevel */
function requireLevel(minLevel) {
  return (req, res, next) => {
    if (!req.user || req.user.nivel_acceso < minLevel) {
      return res.status(403).json({ ok: false, error: 'Permisos insuficientes' });
    }
    next();
  };
}

module.exports = { requireAuth, requireLevel };
