'use strict';

const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { logAudit } = require('../lib/audit');

/* Verifica el JWT en el header Authorization: Bearer <token> */
/* ¿Ocupa el cargo «Presidente del Directorio»? (caché de 60 s por usuario) */
const cachePres = new Map();
async function esPresidente(username) {
  if (!username) return false;
  const k = String(username).toLowerCase(), c = cachePres.get(k);
  if (c && Date.now() - c.t < 60000) return c.v;
  let v = false;
  try {
    const info = await require('../lib/jerarquia').infoCargo(username);
    v = !!info && /^presidente del directorio$/i.test(String(info.subcargo || info.cargo || '').trim());
  } catch { v = false; }
  cachePres.set(k, { v, t: Date.now() });
  return v;
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    /* Se trae la sesión exista o no haya expirado ya — así se puede
       distinguir "expiró sola" de "te desplazó un login nuevo en otro
       dispositivo" (revoked_reason) y devolver un aviso específico en
       vez del genérico "sesión inválida". */
    const { rows } = await pool.query(
      `SELECT s.id, s.expires_at, s.revoked_reason, s.revoked_by_ip,
              u.id AS usuario_id, u.username, u.nombre, u.apellidos, u.estado,
              r.nombre AS rol, r.nivel_acceso, u.avatar_color
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       JOIN roles    r ON r.id = u.rol_id
       WHERE s.token = $1`,
      [token]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
    }

    const sesion = rows[0];

    if (sesion.revoked_reason === 'replaced') {
      return res.status(401).json({
        ok: false, code: 'SESSION_REPLACED', ip: sesion.revoked_by_ip,
        error: 'Tu cuenta inició sesión en otro dispositivo',
      });
    }

    if (new Date(sesion.expires_at) <= new Date()) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
    }

    if (sesion.estado !== 'activo') {
      return res.status(403).json({ ok: false, error: 'Cuenta desactivada' });
    }

    req.user = {
      id:           sesion.usuario_id,
      username:     sesion.username,
      nombre:       sesion.nombre,
      apellidos:    sesion.apellidos,
      rol:          sesion.rol,
      nivel_acceso: sesion.nivel_acceso,
      avatar_color: sesion.avatar_color,
      sessionId:    sesion.id,
    };

    /* Regla fundamental: el Presidente del Directorio actúa sin restricciones.
       Se le da el nivel máximo en esta petición (todo sigue quedando en la auditoría). */
    if ((req.user.nivel_acceso || 0) < 100 && await esPresidente(req.user.username)) {
      req.user.nivel_acceso = 100; req.user.presidente = true;
    }

    /* Registro genérico de auditoría — cubre automáticamente toda ruta
       autenticada (presente y futura) desde este único punto. Se excluye
       el propio panel de auditoría para no generar ruido/recursión si
       alguien lo deja abierto con auto-refresh. */
    if (!req.originalUrl.startsWith('/api/audit')) {
      res.on('finish', () => { logAudit(req, res).catch(() => {}); });
    }

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
