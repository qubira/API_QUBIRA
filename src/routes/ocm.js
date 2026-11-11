'use strict';

/* ============================================================
   OCM — Oficina de Comunicación y Marketing
   Conexión con TikTok (Login Kit, sandbox) y métricas de la cuenta.

   - Los tokens de TikTok se guardan cifrados (AES-256-GCM) en ocm.tiktok_cuentas.
   - El CLIENT_SECRET solo se usa aquí, nunca llega al navegador.
   - El "state" del OAuth va firmado (HMAC) para evitar CSRF.
   - /cron (público, protegido con CRON_SECRET) sincroniza todas las cuentas.
   ============================================================ */

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');

const router = express.Router();        // /api/ocm          (panel OCM)
const publico = express.Router();       // /api/public/ocm   (callback y cron)

const TT_AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const TT_API = 'https://open.tiktokapis.com/v2';
const CAMPOS_USUARIO = 'open_id,avatar_url,display_name,username,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count';
const CAMPOS_VIDEO = 'id,title,video_description,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count';
const PANEL_URL = () => (process.env.OCM_PANEL_URL || 'https://qubira-ocm.vercel.app').replace(/\/$/, '');

// ─── Esquema ────────────────────────────────────────────────────────────────
let esquemaListo = null;
function asegurarEsquema() {
  if (!esquemaListo) {
    esquemaListo = pool.query(`
      CREATE SCHEMA IF NOT EXISTS ocm;
      CREATE TABLE IF NOT EXISTS ocm.tiktok_cuentas (
        id SERIAL PRIMARY KEY,
        open_id TEXT UNIQUE NOT NULL,
        username TEXT, display_name TEXT, avatar_url TEXT, bio TEXT, perfil_url TEXT,
        verificado BOOLEAN DEFAULT false,
        access_token_enc TEXT NOT NULL, refresh_token_enc TEXT NOT NULL,
        access_expira TIMESTAMPTZ, refresh_expira TIMESTAMPTZ, scope TEXT,
        conectado_por INTEGER, conectado_en TIMESTAMPTZ DEFAULT NOW(),
        ultima_sync TIMESTAMPTZ, ultimo_error TEXT
      );
      CREATE TABLE IF NOT EXISTS ocm.tiktok_metricas_diarias (
        cuenta_id INTEGER REFERENCES ocm.tiktok_cuentas(id) ON DELETE CASCADE,
        fecha DATE NOT NULL,
        seguidores INTEGER, seguidos INTEGER, likes BIGINT, videos INTEGER,
        PRIMARY KEY (cuenta_id, fecha)
      );
      CREATE TABLE IF NOT EXISTS ocm.tiktok_videos (
        video_id TEXT PRIMARY KEY,
        cuenta_id INTEGER REFERENCES ocm.tiktok_cuentas(id) ON DELETE CASCADE,
        titulo TEXT, portada TEXT, enlace TEXT, duracion INTEGER, publicado_en TIMESTAMPTZ,
        vistas BIGINT, likes BIGINT, comentarios BIGINT, compartidos BIGINT,
        actualizado TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(e => { esquemaListo = null; throw e; });
  }
  return esquemaListo;
}

// ─── Cifrado de tokens y firma del state ────────────────────────────────────
function claveCifrado() {
  const k = process.env.TOKEN_ENCRYPTION_KEY || '';
  if (!k) throw new Error('Falta TOKEN_ENCRYPTION_KEY');
  return crypto.createHash('sha256').update(k).digest();
}
function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', claveCifrado(), iv);
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map(b => b.toString('base64')).join('.');
}
function descifrar(valor) {
  const [iv, tag, datos] = String(valor).split('.').map(p => Buffer.from(p, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', claveCifrado(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
}
function firmar(carga) {
  const secreto = process.env.OAUTH_STATE_SECRET;
  if (!secreto) throw new Error('Falta OAUTH_STATE_SECRET');
  const cuerpo = Buffer.from(JSON.stringify(carga)).toString('base64url');
  const firma = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}
function verificarState(state) {
  const [cuerpo, firma] = String(state || '').split('.');
  if (!cuerpo || !firma || !process.env.OAUTH_STATE_SECRET) return null;
  const esperada = crypto.createHmac('sha256', process.env.OAUTH_STATE_SECRET).update(cuerpo).digest('base64url');
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  const carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
  return Date.now() - carga.ts < 10 * 60 * 1000 ? carga : null; // vale 10 minutos
}

// ─── Llamadas a TikTok ──────────────────────────────────────────────────────
async function pedirToken(params) {
  const res = await fetch(`${TT_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) throw new Error(data.error_description || data.error || `TikTok respondió ${res.status}`);
  return data;
}
async function tiktok(ruta, token, { metodo = 'GET', cuerpo } = {}) {
  const res = await fetch(`${TT_API}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.error && data.error.code && data.error.code !== 'ok')) throw new Error(data.error?.message || `TikTok respondió ${res.status}`);
  return data.data || {};
}
const expira = segundos => new Date(Date.now() + (Number(segundos) || 0) * 1000);

// Devuelve un access token vigente; lo renueva con el refresh token si vence en menos de 1 h
async function tokenVigente(cuenta) {
  if (cuenta.access_expira && new Date(cuenta.access_expira) - Date.now() > 3600 * 1000) return descifrar(cuenta.access_token_enc);
  const t = await pedirToken({ grant_type: 'refresh_token', refresh_token: descifrar(cuenta.refresh_token_enc) });
  await pool.query(`UPDATE ocm.tiktok_cuentas SET access_token_enc=$1, refresh_token_enc=$2, access_expira=$3, refresh_expira=$4 WHERE id=$5`,
    [cifrar(t.access_token), cifrar(t.refresh_token), expira(t.expires_in), expira(t.refresh_expires_in), cuenta.id]);
  return t.access_token;
}

// Trae perfil, métricas del día y videos; guarda todo en la base
async function sincronizar(cuenta) {
  try {
    const token = await tokenVigente(cuenta);
    const { user: u = {} } = await tiktok(`/user/info/?fields=${CAMPOS_USUARIO}`, token);
    await pool.query(`UPDATE ocm.tiktok_cuentas SET username=$1, display_name=$2, avatar_url=$3, bio=$4, perfil_url=$5, verificado=$6, ultima_sync=NOW(), ultimo_error=NULL WHERE id=$7`,
      [u.username || null, u.display_name || null, u.avatar_url || null, u.bio_description || null, u.profile_deep_link || null, !!u.is_verified, cuenta.id]);
    await pool.query(`
      INSERT INTO ocm.tiktok_metricas_diarias (cuenta_id, fecha, seguidores, seguidos, likes, videos)
      VALUES ($1, (NOW() AT TIME ZONE 'America/Lima')::date, $2, $3, $4, $5)
      ON CONFLICT (cuenta_id, fecha) DO UPDATE SET seguidores=EXCLUDED.seguidores, seguidos=EXCLUDED.seguidos, likes=EXCLUDED.likes, videos=EXCLUDED.videos`,
      [cuenta.id, u.follower_count ?? null, u.following_count ?? null, u.likes_count ?? null, u.video_count ?? null]);

    let cursor = 0;
    for (let pagina = 0; pagina < 10; pagina++) { // hasta 200 videos
      const d = await tiktok(`/video/list/?fields=${CAMPOS_VIDEO}`, token, { metodo: 'POST', cuerpo: { max_count: 20, ...(cursor ? { cursor } : {}) } });
      for (const v of d.videos || []) {
        await pool.query(`
          INSERT INTO ocm.tiktok_videos (video_id, cuenta_id, titulo, portada, enlace, duracion, publicado_en, vistas, likes, comentarios, compartidos, actualizado)
          VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7),$8,$9,$10,$11,NOW())
          ON CONFLICT (video_id) DO UPDATE SET titulo=EXCLUDED.titulo, portada=EXCLUDED.portada, enlace=EXCLUDED.enlace,
            vistas=EXCLUDED.vistas, likes=EXCLUDED.likes, comentarios=EXCLUDED.comentarios, compartidos=EXCLUDED.compartidos, actualizado=NOW()`,
          [String(v.id), cuenta.id, v.title || v.video_description || '', v.cover_image_url || null, v.share_url || null, v.duration ?? null,
            v.create_time || null, v.view_count ?? 0, v.like_count ?? 0, v.comment_count ?? 0, v.share_count ?? 0]);
      }
      if (!d.has_more || !d.cursor) break;
      cursor = d.cursor;
    }
    return { ok: true };
  } catch (e) {
    await pool.query('UPDATE ocm.tiktok_cuentas SET ultimo_error=$1 WHERE id=$2', [String(e.message).slice(0, 500), cuenta.id]).catch(() => {});
    return { ok: false, error: e.message };
  }
}

// ─── Rutas del panel (requieren sesión y acceso OCM) ───────────────────────
router.use(requireAuth);
router.use(requireModuleAccess('OCM', 'ACM'));
router.use((req, res, next) => asegurarEsquema().then(() => next()).catch(next));

const COLS_PUBLICAS = 'id, open_id, username, display_name, avatar_url, bio, perfil_url, verificado, scope, conectado_en, ultima_sync, ultimo_error, access_expira, refresh_expira';

router.get('/tiktok/config', (req, res) => {
  res.json({
    configurado: !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REDIRECT_URI && process.env.TOKEN_ENCRYPTION_KEY && process.env.OAUTH_STATE_SECRET),
    entorno: process.env.TIKTOK_ENV || 'sandbox',
    scopes: (process.env.TIKTOK_SCOPES || '').split(',').filter(Boolean),
  });
});

router.get('/tiktok/conectar', (req, res) => {
  try {
    if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_REDIRECT_URI) return res.status(400).json({ error: 'Faltan las variables de TikTok en el servidor' });
    const url = new URL(TT_AUTH);
    url.search = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      scope: process.env.TIKTOK_SCOPES || 'user.info.basic,user.info.profile,user.info.stats,video.list',
      response_type: 'code',
      redirect_uri: process.env.TIKTOK_REDIRECT_URI,
      state: firmar({ uid: req.user.id, ts: Date.now(), n: crypto.randomBytes(8).toString('hex') }),
    });
    res.json({ url: url.toString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/tiktok/resumen', async (req, res) => {
  try {
    const { rows: cuentas } = await pool.query(`SELECT ${COLS_PUBLICAS} FROM ocm.tiktok_cuentas ORDER BY conectado_en`);
    const cuenta = cuentas[0] || null;
    if (!cuenta) return res.json({ cuenta: null, historial: [], videos: [] });
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 90, 7), 365);
    const [{ rows: historial }, { rows: videos }] = await Promise.all([
      pool.query(`SELECT to_char(fecha,'YYYY-MM-DD') AS fecha, seguidores, seguidos, likes, videos FROM ocm.tiktok_metricas_diarias
                  WHERE cuenta_id=$1 AND fecha >= CURRENT_DATE - $2::int ORDER BY fecha`, [cuenta.id, dias]),
      pool.query(`SELECT video_id, titulo, portada, enlace, duracion, publicado_en, vistas, likes, comentarios, compartidos
                  FROM ocm.tiktok_videos WHERE cuenta_id=$1 ORDER BY publicado_en DESC NULLS LAST`, [cuenta.id]),
    ]);
    res.json({ cuenta, historial, videos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tiktok/sincronizar', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ocm.tiktok_cuentas ORDER BY conectado_en');
    if (!rows.length) return res.status(404).json({ error: 'No hay una cuenta de TikTok conectada' });
    const r = await sincronizar(rows[0]);
    if (!r.ok) return res.status(502).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/tiktok/cuenta/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ocm.tiktok_cuentas WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Cuenta no encontrada' });
    // Revocar en TikTok (si falla igual se borra localmente)
    await fetch(`${TT_API}/oauth/revoke/`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY || '', client_secret: process.env.TIKTOK_CLIENT_SECRET || '', token: descifrar(rows[0].access_token_enc) }),
    }).catch(() => {});
    await pool.query('DELETE FROM ocm.tiktok_cuentas WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Rutas públicas: callback de TikTok y cron ─────────────────────────────
publico.use((req, res, next) => asegurarEsquema().then(() => next()).catch(next));

publico.get('/tiktok/callback', async (req, res) => {
  const volver = (estado, msg = '') => res.redirect(`${PANEL_URL()}/index.html?tiktok=${estado}${msg ? '&msg=' + encodeURIComponent(msg) : ''}`);
  try {
    if (req.query.error) return volver('cancelado', req.query.error_description || req.query.error);
    const state = verificarState(req.query.state);
    if (!state) return volver('error', 'La solicitud venció o no es válida. Vuelve a intentarlo.');
    if (!req.query.code) return volver('error', 'TikTok no devolvió el código de autorización');

    const t = await pedirToken({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: process.env.TIKTOK_REDIRECT_URI });
    const { rows } = await pool.query(`
      INSERT INTO ocm.tiktok_cuentas (open_id, access_token_enc, refresh_token_enc, access_expira, refresh_expira, scope, conectado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (open_id) DO UPDATE SET access_token_enc=EXCLUDED.access_token_enc, refresh_token_enc=EXCLUDED.refresh_token_enc,
        access_expira=EXCLUDED.access_expira, refresh_expira=EXCLUDED.refresh_expira, scope=EXCLUDED.scope, conectado_por=EXCLUDED.conectado_por, conectado_en=NOW()
      RETURNING *`,
      [t.open_id, cifrar(t.access_token), cifrar(t.refresh_token), expira(t.expires_in), expira(t.refresh_expires_in), t.scope || null, state.uid]);
    const r = await sincronizar(rows[0]);
    volver('ok', r.ok ? '' : 'Conectado, pero la primera sincronización falló: ' + r.error);
  } catch (e) {
    volver('error', e.message);
  }
});

// Cron diario: Authorization: Bearer <CRON_SECRET>
publico.all('/cron', async (req, res) => {
  const secreto = process.env.CRON_SECRET || '';
  const dado = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secreto || dado.length !== secreto.length || !crypto.timingSafeEqual(Buffer.from(dado), Buffer.from(secreto))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const { rows } = await pool.query('SELECT * FROM ocm.tiktok_cuentas');
  const resultados = [];
  for (const c of rows) resultados.push({ cuenta: c.username || c.open_id, ...(await sincronizar(c)) });
  res.json({ ok: true, resultados });
});

module.exports = { router, publico };
