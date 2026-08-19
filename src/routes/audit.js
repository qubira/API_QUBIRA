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

/* Ruta técnica completa (path + query legible), para que dos peticiones
   al mismo endpoint con parámetros distintos no se vean como si fueran
   la misma fila repetida — ej. GET /projects?limit=6 vs
   GET /projects?status=finished_by_ti. */
function fullPath(row) {
  if (!row.query) return row.path;
  try {
    const qs = new URLSearchParams(JSON.parse(row.query)).toString();
    return qs ? `${row.path}?${qs}` : row.path;
  } catch { return row.path; }
}

router.get('/logs', async (req, res) => {
  try {
    const { area, user_id, action_type, q } = req.query;
    let { date_from, date_to } = req.query;
    const privileged = req.user.nivel_acceso >= 100;
    const viewerArea = await getEmployeeArea(req.user.username);
    /* Solo ADG (o nivel_acceso>=100) puede ver la auditoría de otras
       áreas y elegir un rango de fechas — el resto queda limitado a su
       propia área y solo al día de hoy, sin importar qué pida el
       frontend (nunca confiar en el filtro del cliente). */
    const canSeeOtherAreas = privileged || viewerArea === 'ADG';

    const params = []; let where = 'WHERE 1=1';
    if (area === 'ALL') {
      if (!canSeeOtherAreas) return res.status(403).json({ error: 'No tienes permiso para ver todas las áreas' });
    } else if (area) {
      const wantedArea = area.toUpperCase();
      if (!canSeeOtherAreas && wantedArea !== viewerArea) {
        return res.status(403).json({ error: 'No tienes permiso para ver la auditoría de otra área' });
      }
      params.push(wantedArea); where += ` AND upper(c.nombre) = $${params.length}`;
    } else {
      if (!viewerArea) return res.json({ rows: [], total: 0 });
      params.push(viewerArea); where += ` AND upper(c.nombre) = $${params.length}`;
    }

    if (!canSeeOtherAreas) {
      const today = new Date().toISOString().slice(0, 10);
      date_from = today; date_to = today;
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
             l.method, l.path, l.query, l.action_type, l.status_code, l.created_at
      FROM audit.logs l
      LEFT JOIN public.usuarios u ON u.id = l.user_id
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      LEFT JOIN rrhh.catalogos cg ON cg.id = e.cargo_id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

    res.json({
      rows: rows.map(r => ({ ...r, description: friendlyDescription(r), full_path: fullPath(r) })),
      total: countRows[0].total,
      canSeeOtherAreas,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
