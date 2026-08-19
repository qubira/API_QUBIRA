'use strict';

/* ============================================================
   Auditoría corporativa — registro genérico de toda petición
   autenticada, escrito por el enganche en middleware/auth.js.
   Solo pueden consultarlo usuarios con cargo Supervisor,
   Coordinador o Gerente (o nivel_acceso >= 100).
   ============================================================ */

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getEmployeeArea } = require('../lib/employeeArea');
const { ensureAuditSchema, canViewAudit } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { ensureAuditSchema().then(() => next()).catch(next); });
router.use(async (req, res, next) => {
  if (!(await canViewAudit(req))) {
    return res.status(403).json({ error: 'No tienes permiso para ver la auditoría' });
  }
  next();
});

const ACTION_LABEL = {
  view: 'Consultó', create: 'Creó', update: 'Actualizó', delete: 'Eliminó',
  login: 'Inició sesión', logout: 'Cerró sesión',
};

function friendlyDescription(row) {
  const verb = ACTION_LABEL[row.action_type] || row.action_type;
  const segments = row.path.replace(/^\/api\//, '').split('/').filter(Boolean);
  const resource = segments[1] || segments[0] || '';
  if (row.action_type === 'login' || row.action_type === 'logout') return verb;
  return `${verb} ${resource}`.trim();
}

router.get('/logs', async (req, res) => {
  try {
    const { area, user_id, action_type, date_from, date_to, q } = req.query;
    const privileged = req.user.nivel_acceso >= 100;
    const viewerArea = await getEmployeeArea(req.user.username);

    const params = []; let where = 'WHERE 1=1';
    if (area === 'ALL') {
      if (!privileged) return res.status(403).json({ error: 'No tienes permiso para ver todas las áreas' });
    } else if (area) {
      params.push(area.toUpperCase()); where += ` AND upper(c.nombre) = $${params.length}`;
    } else if (!privileged) {
      if (!viewerArea) return res.json({ rows: [], total: 0 });
      params.push(viewerArea); where += ` AND upper(c.nombre) = $${params.length}`;
    }
    if (user_id)     { params.push(user_id);     where += ` AND l.user_id = $${params.length}`; }
    if (action_type) { params.push(action_type);  where += ` AND l.action_type = $${params.length}`; }
    if (date_from)   { params.push(date_from);    where += ` AND l.created_at >= $${params.length}`; }
    if (date_to)     { params.push(date_to + ' 23:59:59'); where += ` AND l.created_at <= $${params.length}`; }
    if (q)           { params.push(`%${q}%`);     where += ` AND l.path ILIKE $${params.length}`; }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const { rows: countRows } = await pool.query(`
      SELECT count(*)::int AS total
      FROM audit.logs l
      LEFT JOIN public.usuarios u ON u.id = l.user_id
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      ${where}`, params);

    params.push(limit); params.push(offset);
    const { rows } = await pool.query(`
      SELECT l.id, l.user_id, u.nombre AS user_name, u.username, c.nombre AS area, cg.nombre AS cargo,
             l.method, l.path, l.action_type, l.status_code, l.created_at
      FROM audit.logs l
      LEFT JOIN public.usuarios u ON u.id = l.user_id
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      LEFT JOIN rrhh.catalogos cg ON cg.id = e.cargo_id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

    res.json({ rows: rows.map(r => ({ ...r, description: friendlyDescription(r) })), total: countRows[0].total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
