'use strict';

/* ============================================================
   Analytics del sitio público QUBIRA — historial de visitas e
   interacciones (vistas de página, clicks en "Ver sitio" de cada
   caso de éxito, clicks en WhatsApp, uso del chatbot). El sitio
   público (carpeta QUBIRA, deploy aparte en Vercel) manda los
   eventos acá sin autenticarse — es tráfico anónimo de visitantes,
   no una cuenta del ecosistema. Se consulta desde la sección
   "Visitas" de QUBIRA_ADG, QUBIRA_SOPORTE y QUBIRA_DST, con el
   mismo criterio de acceso que ya usa Auditoría en esos mismos
   paneles: cargo Supervisor/Coordinador/Gerente, nivel_acceso>=100,
   o el módulo DST otorgado (para quien entra solo por DST y no
   tiene un cargo calificado en ninguna área real).
   ============================================================ */

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getAuthorizedModules } = require('../lib/moduleAccess');
const { canViewAudit } = require('../lib/audit');

const router = express.Router();

let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = pool.query(`
      CREATE SCHEMA IF NOT EXISTS analytics;
      CREATE TABLE IF NOT EXISTS analytics.events (
        id BIGSERIAL PRIMARY KEY,
        event_type  TEXT NOT NULL,
        case_name   TEXT,
        label       TEXT,
        page        TEXT,
        referrer    TEXT,
        session_id  TEXT,
        ip_address  TEXT,
        user_agent  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS events_type_created_idx ON analytics.events (event_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS events_session_idx      ON analytics.events (session_id);
      CREATE INDEX IF NOT EXISTS events_created_idx       ON analytics.events (created_at DESC);
    `);
  }
  return ready;
}
router.use((req, res, next) => { ensureSchema().then(() => next()).catch(next); });

const EVENT_TYPES = ['page_view', 'case_click', 'whatsapp_click', 'chatbot_open', 'chatbot_message'];
const EVENT_LABEL = {
  page_view: 'Vista de página', case_click: 'Click en caso de éxito',
  whatsapp_click: 'Click en WhatsApp', chatbot_open: 'Abrió el chatbot', chatbot_message: 'Mensaje al chatbot',
};

function clip(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

/* Quién puede VER las estadísticas — mismo criterio que ya usa
   Auditoría en ADG/TI/RRHH/Soporte (cargo Supervisor/Coordinador/
   Gerente, o nivel_acceso>=100), más el módulo DST otorgado para
   quien entra solo por DST y no tiene un cargo calificado. */
async function requirePrivileged(req, res, next) {
  if (await canViewAudit(req)) return next();
  try {
    const authorized = await getAuthorizedModules(req.user.username, req.user.nivel_acceso, req.user.id);
    if (authorized.includes('DST')) return next();
  } catch (e) { return next(e); }
  return res.status(403).json({ error: 'No tienes permiso para ver las estadísticas del sitio' });
}

/* ============================================================
   POST /event — público, sin autenticar (lo llama el sitio en
   Vercel desde el navegador de cualquier visitante).
   ============================================================ */
router.post('/event', async (req, res) => {
  try {
    const { event_type, case_name, label, page, referrer, session_id } = req.body || {};
    if (!EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({ error: 'event_type inválido' });
    }
    await pool.query(
      `INSERT INTO analytics.events (event_type, case_name, label, page, referrer, session_id, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        event_type,
        clip(case_name, 150),
        clip(label, 300),
        clip(page, 300),
        clip(referrer, 500),
        clip(session_id, 100),
        req.ip || null,
        clip(req.headers['user-agent'], 300),
      ]
    );
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   GET /summary — panel QUBIRA_DST, sección Visitas.
   ============================================================ */
router.get('/summary', requireAuth, requirePrivileged, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 180);

    const [totals, byDay, byCase, byType, topPages, topReferrers] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS total_views,
          COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'page_view')::int AS unique_visitors,
          COUNT(*) FILTER (WHERE event_type = 'case_click')::int AS case_clicks,
          COUNT(*) FILTER (WHERE event_type = 'whatsapp_click')::int AS whatsapp_clicks,
          COUNT(*) FILTER (WHERE event_type = 'chatbot_open')::int AS chatbot_opens,
          COUNT(*) FILTER (WHERE event_type = 'chatbot_message')::int AS chatbot_messages
        FROM analytics.events
        WHERE created_at >= NOW() - ($1 || ' days')::interval`, [days]),
      pool.query(`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS dia, COUNT(*)::int AS total
        FROM analytics.events
        WHERE event_type = 'page_view' AND created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY 1 ORDER BY 1 ASC`, [days]),
      pool.query(`
        SELECT case_name, COUNT(*)::int AS total
        FROM analytics.events
        WHERE event_type = 'case_click' AND case_name IS NOT NULL AND created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY case_name ORDER BY total DESC LIMIT 15`, [days]),
      pool.query(`
        SELECT event_type, COUNT(*)::int AS total
        FROM analytics.events
        WHERE created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY event_type`, [days]),
      pool.query(`
        SELECT page, COUNT(*)::int AS total
        FROM analytics.events
        WHERE event_type = 'page_view' AND page IS NOT NULL AND created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY page ORDER BY total DESC LIMIT 10`, [days]),
      pool.query(`
        SELECT referrer, COUNT(*)::int AS total
        FROM analytics.events
        WHERE event_type = 'page_view' AND referrer IS NOT NULL AND referrer <> '' AND created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY referrer ORDER BY total DESC LIMIT 10`, [days]),
    ]);

    res.json({
      days,
      ...totals.rows[0],
      views_by_day: byDay.rows,
      top_cases: byCase.rows,
      by_type: byType.rows,
      top_pages: topPages.rows,
      top_referrers: topReferrers.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   GET /events — historial crudo, filtrable (panel QUBIRA_DST).
   ============================================================ */
router.get('/events', requireAuth, requirePrivileged, async (req, res) => {
  try {
    const { event_type, date_from, date_to, q } = req.query;
    const params = []; let where = 'WHERE 1=1';
    if (event_type) { params.push(event_type); where += ` AND event_type = $${params.length}`; }
    if (date_from)  { params.push(date_from);  where += ` AND created_at >= $${params.length}`; }
    if (date_to)    { params.push(date_to + ' 23:59:59'); where += ` AND created_at <= $${params.length}`; }
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      where += ` AND (case_name ILIKE $${n} OR label ILIKE $${n} OR page ILIKE $${n} OR referrer ILIKE $${n})`;
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM analytics.events ${where}`, params);

    params.push(limit); params.push(offset);
    const { rows } = await pool.query(
      `SELECT id, event_type, case_name, label, page, referrer, session_id, ip_address, user_agent, created_at
       FROM analytics.events ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

    res.json({
      rows: rows.map(r => ({ ...r, event_label: EVENT_LABEL[r.event_type] || r.event_type })),
      total: countRows[0].total,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
