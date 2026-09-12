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

      /* UTM — solo se llenan en el page_view de entrada (el que trae
         los parámetros ?utm_... en la URL), para poder agrupar
         sesiones por campaña/canal como hace GA4. */
      ALTER TABLE analytics.events ADD COLUMN IF NOT EXISTS utm_source TEXT;
      ALTER TABLE analytics.events ADD COLUMN IF NOT EXISTS utm_medium TEXT;
      ALTER TABLE analytics.events ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
    `);
  }
  return ready;
}
router.use((req, res, next) => { ensureSchema().then(() => next()).catch(next); });

const EVENT_TYPES = [
  'page_view', 'case_click', 'whatsapp_click', 'chatbot_open', 'chatbot_message',
  'scroll_depth', 'time_on_page', 'outbound_click', 'nav_click',
];
const EVENT_LABEL = {
  page_view: 'Vista de página', case_click: 'Click en caso de éxito',
  whatsapp_click: 'Click en WhatsApp', chatbot_open: 'Abrió el chatbot', chatbot_message: 'Mensaje al chatbot',
  scroll_depth: 'Scroll', time_on_page: 'Tiempo en página', outbound_click: 'Click a link externo', nav_click: 'Click en navegación',
};

/* Canal de tráfico, al estilo GA4 — se calcula a partir del referrer
   y (si vino) el utm_source, nunca se guarda como columna fija: así
   cambiar las reglas de clasificación no exige migrar datos viejos. */
function classifyChannel(referrer, utmSource) {
  if (utmSource) return `Campaña (${utmSource})`;
  if (!referrer) return 'Directo';
  let host = '';
  try { host = new URL(referrer).hostname.replace(/^www\./, ''); } catch { return 'Directo'; }
  if (/google|bing|yahoo|duckduckgo/i.test(host)) return 'Orgánico (buscadores)';
  if (/facebook|instagram|twitter|x\.com|linkedin|tiktok|whatsapp|t\.co/i.test(host)) return 'Redes sociales';
  return `Referido (${host})`;
}

function clip(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

/* Parser de User-Agent liviano, sin dependencias — alcanza para el
   reporte de negocio (móvil/escritorio/tablet + navegador + so), no
   pretende ser exacto al 100% como una librería dedicada. */
function parseUserAgent(ua) {
  if (!ua) return { device: 'Desconocido', browser: 'Desconocido', os: 'Desconocido' };
  const isTablet = /iPad|Tablet|Nexus 7|Nexus 10|SM-T/i.test(ua);
  const isMobile = !isTablet && /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const device = isTablet ? 'Tablet' : (isMobile ? 'Móvil' : 'Escritorio');

  let browser = 'Otro';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && /Version\//i.test(ua)) browser = 'Safari';

  let os = 'Otro';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return { device, browser, os };
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
    const { event_type, case_name, label, page, referrer, session_id, utm_source, utm_medium, utm_campaign } = req.body || {};
    if (!EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({ error: 'event_type inválido' });
    }
    await pool.query(
      `INSERT INTO analytics.events (event_type, case_name, label, page, referrer, session_id, ip_address, user_agent, utm_source, utm_medium, utm_campaign)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        event_type,
        clip(case_name, 150),
        clip(label, 300),
        clip(page, 300),
        clip(referrer, 500),
        clip(session_id, 100),
        req.ip || null,
        clip(req.headers['user-agent'], 300),
        clip(utm_source, 100),
        clip(utm_medium, 100),
        clip(utm_campaign, 100),
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

    const [totals, byDay, byCase, byType, topPages, topReferrers, visitorAge, leads, uaRows,
      avgTimeOnPage, scrollDepth, engagement, channelRows, outboundClicks, navClicks, topCampaigns] = await Promise.all([
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
      /* Nuevo vs recurrente: si la primera vez que ESE session_id
         apareció (en toda la historia, no solo en este rango) cae
         dentro del rango, es nuevo; si ya existía de antes, recurrente. */
      pool.query(`
        WITH first_seen AS (
          SELECT session_id, MIN(created_at) AS first_ever FROM analytics.events GROUP BY session_id
        ), in_range AS (
          SELECT DISTINCT session_id FROM analytics.events
          WHERE event_type = 'page_view' AND created_at >= NOW() - ($1 || ' days')::interval
        )
        SELECT
          COUNT(*) FILTER (WHERE fs.first_ever >= NOW() - ($1 || ' days')::interval)::int AS new_visitors,
          COUNT(*) FILTER (WHERE fs.first_ever <  NOW() - ($1 || ' days')::interval)::int AS returning_visitors
        FROM in_range ir JOIN first_seen fs ON fs.session_id = ir.session_id`, [days]),
      /* "Leads calientes": visitantes que mostraron una señal real de
         interés en contactar (escribieron al chatbot o tocaron
         WhatsApp), no solo pasaron a mirar. */
      pool.query(`
        SELECT COUNT(DISTINCT session_id)::int AS hot_leads
        FROM analytics.events
        WHERE event_type IN ('whatsapp_click', 'chatbot_message') AND created_at >= NOW() - ($1 || ' days')::interval`, [days]),
      pool.query(`
        SELECT DISTINCT ON (session_id) session_id, user_agent
        FROM analytics.events
        WHERE event_type = 'page_view' AND created_at >= NOW() - ($1 || ' days')::interval
        ORDER BY session_id, created_at ASC`, [days]),
      /* Tiempo promedio en página — cada "time_on_page" trae en label
         los segundos que esa pestaña estuvo visible, medidos en el
         navegador (ver script.js del sitio público). */
      pool.query(`
        SELECT AVG(label::numeric)::int AS avg_seconds
        FROM analytics.events
        WHERE event_type = 'time_on_page' AND label ~ '^[0-9]+(\\.[0-9]+)?$'
          AND created_at >= NOW() - ($1 || ' days')::interval`, [days]),
      /* Embudo de scroll — el navegador manda un evento por cada hito
         (25/50/75/100) que cruza UNA sola vez por vista de página, así
         que esto ya cuenta sesiones que llegaron AL MENOS a ese punto. */
      pool.query(`
        SELECT label AS depth, COUNT(DISTINCT session_id)::int AS sessions
        FROM analytics.events
        WHERE event_type = 'scroll_depth' AND created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY label`, [days]),
      /* "Sesión con interacción real" al estilo GA4: vio 2+ páginas, o
         tocó algo que importa (caso, WhatsApp, chatbot), o se quedó al
         menos 10s — no solo entró y se fue en el acto. */
      pool.query(`
        WITH sess AS (
          SELECT session_id,
            COUNT(*) FILTER (WHERE event_type = 'page_view') AS pv,
            COUNT(*) FILTER (WHERE event_type IN ('case_click','whatsapp_click','chatbot_message')) AS interactions,
            MAX(CASE WHEN event_type = 'time_on_page' AND label ~ '^[0-9]+(\\.[0-9]+)?$' THEN label::numeric ELSE 0 END) AS max_time
          FROM analytics.events
          WHERE created_at >= NOW() - ($1 || ' days')::interval AND session_id IS NOT NULL
          GROUP BY session_id
        )
        SELECT COUNT(*)::int AS total_sessions,
          COUNT(*) FILTER (WHERE pv >= 2 OR interactions > 0 OR max_time >= 10)::int AS engaged_sessions
        FROM sess`, [days]),
      /* Canal de tráfico — un registro por sesión (su primer page_view),
         clasificado en JS con classifyChannel() para no fijar las reglas
         en SQL y poder ajustarlas sin migrar nada. */
      pool.query(`
        SELECT DISTINCT ON (session_id) session_id, referrer, utm_source
        FROM analytics.events
        WHERE event_type = 'page_view' AND created_at >= NOW() - ($1 || ' days')::interval
        ORDER BY session_id, created_at ASC`, [days]),
      pool.query(`
        SELECT label AS destino, COUNT(*)::int AS total
        FROM analytics.events
        WHERE event_type = 'outbound_click' AND label IS NOT NULL AND created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY label ORDER BY total DESC LIMIT 10`, [days]),
      pool.query(`
        SELECT label AS seccion, COUNT(*)::int AS total
        FROM analytics.events
        WHERE event_type = 'nav_click' AND label IS NOT NULL AND created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY label ORDER BY total DESC LIMIT 10`, [days]),
      pool.query(`
        SELECT utm_campaign, utm_source, utm_medium, COUNT(DISTINCT session_id)::int AS sessions
        FROM analytics.events
        WHERE event_type = 'page_view' AND utm_campaign IS NOT NULL AND created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY utm_campaign, utm_source, utm_medium ORDER BY sessions DESC LIMIT 10`, [days]),
    ]);

    const deviceCounts = {};
    uaRows.rows.forEach(r => {
      const { device } = parseUserAgent(r.user_agent);
      deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    });
    const device_breakdown = Object.entries(deviceCounts).map(([device, total]) => ({ device, total })).sort((a, b) => b.total - a.total);

    const channelCounts = {};
    channelRows.rows.forEach(r => {
      const ch = classifyChannel(r.referrer, r.utm_source);
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    });
    const channels = Object.entries(channelCounts).map(([channel, total]) => ({ channel, total })).sort((a, b) => b.total - a.total);

    const SCROLL_MILESTONES = ['25', '50', '75', '100'];
    const scrollBySessions = Object.fromEntries(scrollDepth.rows.map(r => [r.depth, r.sessions]));
    const scroll_depth = SCROLL_MILESTONES.map(depth => ({ depth, sessions: scrollBySessions[depth] || 0 }));

    const engagement_rate = engagement.rows[0].total_sessions > 0
      ? Math.round((engagement.rows[0].engaged_sessions / engagement.rows[0].total_sessions) * 1000) / 10
      : 0;

    res.json({
      days,
      ...totals.rows[0],
      ...visitorAge.rows[0],
      avg_time_on_page_seconds: avgTimeOnPage.rows[0].avg_seconds || 0,
      scroll_depth,
      engaged_sessions: engagement.rows[0].engaged_sessions,
      total_sessions: engagement.rows[0].total_sessions,
      engagement_rate,
      channels,
      top_outbound_clicks: outboundClicks.rows,
      top_nav_clicks: navClicks.rows,
      top_campaigns: topCampaigns.rows,
      hot_leads: leads.rows[0].hot_leads,
      views_by_day: byDay.rows,
      top_cases: byCase.rows,
      by_type: byType.rows,
      top_pages: topPages.rows,
      top_referrers: topReferrers.rows,
      device_breakdown,
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

/* ============================================================
   GET /sessions — el "recorrido" de cada visitante (agrupa todos sus
   eventos por session_id), en vez del log plano evento por evento.
   Es lo que de verdad cuenta qué hizo y qué quería un visitante: qué
   páginas vio, qué casos le interesaron, si escribió al chatbot o
   tocó WhatsApp — todo junto, no disperso en filas sueltas.
   ============================================================ */
router.get('/sessions', requireAuth, requirePrivileged, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 180);
    const { q, only_leads } = req.query;

    const params = [days];
    let sessionFilter = '';
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      sessionFilter += ` AND session_id IN (
        SELECT DISTINCT session_id FROM analytics.events
        WHERE case_name ILIKE $${n} OR label ILIKE $${n} OR page ILIKE $${n} OR referrer ILIKE $${n}
      )`;
    }

    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const baseWhere = `WHERE created_at >= NOW() - ($1 || ' days')::interval AND session_id IS NOT NULL${sessionFilter}`;
    const leadsHaving = (only_leads === '1' || only_leads === 'true')
      ? `HAVING COUNT(*) FILTER (WHERE event_type IN ('whatsapp_click', 'chatbot_message')) > 0`
      : '';

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM (
         SELECT session_id FROM analytics.events ${baseWhere} GROUP BY session_id ${leadsHaving}
       ) t`, params);

    const { rows } = await pool.query(`
      SELECT session_id,
        MIN(created_at) AS first_seen, MAX(created_at) AS last_seen,
        COUNT(*) FILTER (WHERE event_type='page_view')::int AS page_views,
        COUNT(*) FILTER (WHERE event_type='case_click')::int AS case_clicks,
        COUNT(*) FILTER (WHERE event_type='whatsapp_click')::int AS whatsapp_clicks,
        COUNT(*) FILTER (WHERE event_type='chatbot_open')::int AS chatbot_opens,
        COUNT(*) FILTER (WHERE event_type='chatbot_message')::int AS chatbot_messages,
        array_remove(array_agg(DISTINCT case_name), NULL) AS cases,
        (array_agg(user_agent ORDER BY created_at ASC))[1] AS user_agent,
        (array_agg(referrer ORDER BY created_at ASC) FILTER (WHERE referrer IS NOT NULL AND referrer <> ''))[1] AS referrer,
        (array_agg(ip_address ORDER BY created_at ASC))[1] AS ip_address,
        (array_agg(utm_source ORDER BY created_at ASC) FILTER (WHERE utm_source IS NOT NULL))[1] AS utm_source,
        (array_agg(page ORDER BY created_at ASC) FILTER (WHERE event_type = 'page_view'))[1] AS entry_page,
        (array_agg(page ORDER BY created_at DESC) FILTER (WHERE event_type = 'page_view'))[1] AS exit_page,
        MAX(CASE WHEN event_type = 'time_on_page' AND label ~ '^[0-9]+(\.[0-9]+)?$' THEN label::numeric ELSE 0 END) AS time_on_page_seconds,
        MAX(CASE WHEN event_type = 'scroll_depth' THEN label::int ELSE 0 END) AS scroll_max
      FROM analytics.events
      ${baseWhere}
      GROUP BY session_id
      ${leadsHaving}
      ORDER BY last_seen DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const sessions = rows.map(r => {
      const { device, browser, os } = parseUserAgent(r.user_agent);
      return {
        ...r,
        device, browser, os,
        channel: classifyChannel(r.referrer, r.utm_source),
        is_lead: r.whatsapp_clicks > 0 || r.chatbot_messages > 0,
      };
    });

    res.json({ rows: sessions, total: countRows[0].total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   GET /sessions/:session_id/timeline — el detalle cronológico de un
   visitante puntual, para abrir en un modal desde la lista de
   sesiones y ver exactamente qué hizo, en orden.
   ============================================================ */
router.get('/sessions/:session_id/timeline', requireAuth, requirePrivileged, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT event_type, case_name, label, page, referrer, created_at
       FROM analytics.events WHERE session_id = $1 ORDER BY created_at ASC`,
      [req.params.session_id]
    );
    if (!rows.length) return res.json({ session_id: req.params.session_id, events: [], device: null, browser: null, os: null });

    const first = await pool.query(
      `SELECT user_agent, ip_address FROM analytics.events WHERE session_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [req.params.session_id]
    );
    const { device, browser, os } = parseUserAgent(first.rows[0]?.user_agent);

    res.json({
      session_id: req.params.session_id,
      device, browser, os,
      ip_address: first.rows[0]?.ip_address || null,
      events: rows.map(r => ({ ...r, event_label: EVENT_LABEL[r.event_type] || r.event_type })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
