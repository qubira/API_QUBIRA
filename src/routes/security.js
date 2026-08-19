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
const sec = require('../lib/security');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { sec.ensureSecuritySchema().then(() => next()).catch(next); });
router.use(async (req, res, next) => {
  if (!(await canViewAudit(req))) {
    return res.status(403).json({ error: 'No tienes permiso para administrar seguridad' });
  }
  next();
});

const VALID_CATEGORIES = ['observacion', 'bloqueada', 'autorizada', 'sospechosa'];

router.get('/ips', async (req, res) => {
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
      SELECT s.ip, s.category, s.reason, s.blocked_until, s.is_permanent, s.notes,
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

router.put('/ips/:ip', async (req, res) => {
  try {
    const { category, reason, blocked_until, is_permanent, notes } = req.body;
    if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Categoría inválida' });

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

module.exports = router;
