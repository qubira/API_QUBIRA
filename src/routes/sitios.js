'use strict';

/* ============================================================
   Sitios web de clientes — contador central de visitas.
   Cada proyecto carga /api/public/sitios/t.js con data-sitio="clave";
   el script envía vistas de página, tiempo activo y clics a /e.
   El panel OCM (vista «Sitios web») lee las estadísticas.

   - No se guardan datos personales: el visitante es un id aleatorio
     del navegador; la IP solo se usa para excluir las de la oficina.
   - El país se estima por la zona horaria del navegador.
   ============================================================ */

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');

const router = express.Router();    // /api/ocm/sitios   (panel)
const publico = express.Router();   // /api/public/sitios (script y eventos)

const SITIOS = {
  'qubira': { nombre: 'QUBIRA', url: 'https://qubira.vercel.app' },
  'huellas-unidas': { nombre: 'Huellas Unidas', url: 'https://huellas-unidas.vercel.app' },
  'express': { nombre: 'Express', url: 'https://express-nine-theta-23.vercel.app' },
  'am-importaciones': { nombre: 'AM Importaciones', url: 'https://am-exportaciones.onrender.com' },
  'yaplin': { nombre: 'YapLin', url: 'https://yaplin-peru.vercel.app' },
  'nutrivida': { nombre: 'NutriVida', url: 'https://nutrivida-blond.vercel.app' },
  'geovs': { nombre: 'GeoVS', url: 'https://geovs.vercel.app' },
  'the-twenties': { nombre: 'The Twenties', url: 'https://the-twenties.onrender.com' },
};
const TIPOS = ['vista', 'ping', 'clic', 'salida'];

let esquema = null;
function asegurarEsquema() {
  if (!esquema) {
    esquema = pool.query(`
      CREATE SCHEMA IF NOT EXISTS analytics;
      CREATE TABLE IF NOT EXISTS analytics.sitios_eventos (
        id BIGSERIAL PRIMARY KEY,
        sitio TEXT NOT NULL,
        tipo TEXT NOT NULL,
        ruta TEXT, titulo TEXT, etiqueta TEXT,
        sesion TEXT, visitante TEXT,
        segundos INTEGER DEFAULT 0,
        referrer TEXT, pais TEXT, idioma TEXT, dispositivo TEXT, navegador TEXT,
        ip TEXT,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS sitios_eventos_sitio_fecha ON analytics.sitios_eventos (sitio, creado_en DESC);
      CREATE INDEX IF NOT EXISTS sitios_eventos_sesion ON analytics.sitios_eventos (sesion);
    `).catch(e => { esquema = null; throw e; });
  }
  return esquema;
}

// País aproximado según la zona horaria del navegador
const ZONAS = {
  'America/Lima': 'Perú', 'America/Bogota': 'Colombia', 'America/Mexico_City': 'México', 'America/Santiago': 'Chile',
  'America/Argentina/Buenos_Aires': 'Argentina', 'America/Buenos_Aires': 'Argentina', 'America/Guayaquil': 'Ecuador',
  'America/La_Paz': 'Bolivia', 'America/Caracas': 'Venezuela', 'America/Sao_Paulo': 'Brasil', 'America/Asuncion': 'Paraguay',
  'America/Montevideo': 'Uruguay', 'America/Panama': 'Panamá', 'America/Costa_Rica': 'Costa Rica', 'America/Guatemala': 'Guatemala',
  'America/El_Salvador': 'El Salvador', 'America/Tegucigalpa': 'Honduras', 'America/Managua': 'Nicaragua', 'America/Santo_Domingo': 'Rep. Dominicana',
  'America/Havana': 'Cuba', 'America/Puerto_Rico': 'Puerto Rico', 'Europe/Madrid': 'España', 'Europe/London': 'Reino Unido',
  'Europe/Paris': 'Francia', 'Europe/Berlin': 'Alemania', 'Europe/Rome': 'Italia', 'Asia/Tokyo': 'Japón', 'Asia/Shanghai': 'China',
};
function paisDe(tz, idioma) {
  if (ZONAS[tz]) return ZONAS[tz];
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit)/.test(tz || '')) return 'Estados Unidos';
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax)/.test(tz || '')) return 'Canadá';
  const reg = String(idioma || '').split('-')[1];
  return reg ? `Otro (${reg.toUpperCase()})` : 'Desconocido';
}
function dispositivoDe(ua = '', ancho = 0) {
  if (/ipad|tablet/i.test(ua) || (ancho >= 600 && ancho < 1024 && /mobile|android/i.test(ua))) return 'Tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'Celular';
  return 'Computadora';
}
function navegadorDe(ua = '') {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Otro';
}
const corta = (v, n) => (v == null ? null : String(v).slice(0, n));
const esBot = ua => /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|vercel|google-inspection|chrome-lighthouse|gtmetrix/i.test(ua || '');

// ─── Público: script y recepción de eventos (CORS abierto solo aquí) ────────
publico.use((req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Script de seguimiento (ligero, sin cookies de terceros)
const SCRIPT = `(function(){try{
var s=document.currentScript||document.querySelector('script[src*="/api/public/sitios/t.js"]');if(!s||window.__qbSitio)return;window.__qbSitio=1;
var sitio=s.getAttribute('data-sitio')||(s.src.match(/[?&]s=([a-z0-9-]+)/)||[])[1];if(!sitio)return;
var api=s.src.replace(/\\/t\\.js.*$/,'')+'/e';
function id(){return Math.random().toString(36).slice(2)+Date.now().toString(36)}
var ls={};try{ls=window.localStorage}catch(e){}
var vis;try{vis=ls.getItem('qb_v')||'';if(!vis){vis=id();ls.setItem('qb_v',vis)}}catch(e){vis=id()}
var ses,ss;try{ss=window.sessionStorage;ses=ss.getItem('qb_s');var ult=+ss.getItem('qb_t')||0;if(!ses||Date.now()-ult>18e5){ses=id();ss.setItem('qb_s',ses)}}catch(e){ses=ses||id()}
function toca(){try{ss.setItem('qb_t',Date.now())}catch(e){}}
var tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}
function env(tipo,x){x=x||{};var d={sitio:sitio,tipo:tipo,ruta:location.pathname,titulo:document.title,sesion:ses,visitante:vis,ref:document.referrer,tz:tz,idioma:navigator.language,ancho:screen.width};for(var k in x)d[k]=x[k];var b=JSON.stringify(d);toca();
try{if(navigator.sendBeacon&&navigator.sendBeacon(api,new Blob([b],{type:'text/plain'})))return}catch(e){}
try{fetch(api,{method:'POST',body:b,keepalive:true,mode:'no-cors',headers:{'Content-Type':'text/plain'}})}catch(e){}}
var activo=0,ultimaAct=Date.now(),pend=0;
['mousemove','keydown','scroll','touchstart','click'].forEach(function(e){addEventListener(e,function(){ultimaAct=Date.now()},{passive:true})});
setInterval(function(){if(document.visibilityState==='visible'&&Date.now()-ultimaAct<6e4){activo++;pend++}},1e3);
setInterval(function(){if(pend>0){env('ping',{segundos:pend,ruta:ultimaRuta});pend=0}},15e3);
function sale(){if(pend>0){env('salida',{segundos:pend,ruta:ultimaRuta});pend=0}}
addEventListener('pagehide',sale);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')sale()});
var ultimaRuta=location.pathname;function vista(){env('vista');ultimaRuta=location.pathname}
function cambio(){if(location.pathname!==ultimaRuta){sale();vista()}}
['pushState','replaceState'].forEach(function(m){var o=history[m];history[m]=function(){var r=o.apply(this,arguments);setTimeout(cambio,0);return r}});
addEventListener('popstate',cambio);
document.addEventListener('click',function(e){var el=e.target&&e.target.closest&&e.target.closest('a,button,[role=button],input[type=submit]');if(!el)return;
var t=(el.getAttribute('aria-label')||el.innerText||el.value||el.getAttribute('href')||'').replace(/\\s+/g,' ').trim().slice(0,80);if(t)env('clic',{etiqueta:t})},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',vista);else vista();
}catch(e){}})();`;
publico.get('/t.js', (req, res) => {
  res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  res.send(SCRIPT);
});

// Recibe eventos (sendBeacon manda text/plain)
publico.post('/e', express.text({ type: '*/*', limit: '8kb' }), async (req, res) => {
  res.status(204).end(); // respuesta inmediata: el navegador no espera
  try {
    const ua = req.headers['user-agent'] || '';
    if (esBot(ua)) return;
    const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!SITIOS[d.sitio] || !TIPOS.includes(d.tipo)) return;
    await asegurarEsquema();
    const ip = req.ip || null;
    if (ip) {
      const { rows } = await pool.query(`SELECT 1 FROM analytics.exclusiones WHERE ip = $1 LIMIT 1`, [ip]).catch(() => ({ rows: [] }));
      if (rows.length) return;
    }
    await pool.query(`INSERT INTO analytics.sitios_eventos (sitio, tipo, ruta, titulo, etiqueta, sesion, visitante, segundos, referrer, pais, idioma, dispositivo, navegador, ip)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [d.sitio, d.tipo, corta(d.ruta, 300), corta(d.titulo, 200), corta(d.etiqueta, 120), corta(d.sesion, 60), corta(d.visitante, 60),
        Math.max(0, Math.min(parseInt(d.segundos, 10) || 0, 120)), corta(d.ref, 400), paisDe(d.tz, d.idioma), corta(d.idioma, 20),
        dispositivoDe(ua, +d.ancho || 0), navegadorDe(ua), ip]);
  } catch (e) { console.warn('[sitios] evento:', e.message); }
});

// ─── Panel OCM ──────────────────────────────────────────────────────────────
router.use(requireAuth);
router.use(requireModuleAccess('OCM', 'ACM'));
router.use((req, res, next) => asegurarEsquema().then(() => next()).catch(next));

router.get('/', (req, res) => res.json(Object.entries(SITIOS).map(([clave, s]) => ({ clave, ...s }))));

/* GET /resumen?sitio=clave|todos&rango=hoy|dia|7|30|90|365&fecha=AAAA-MM-DD
   Agrupa por hora (hoy/día), por día (7/30/90) o por mes (365). Hora de Lima. */
router.get('/resumen', async (req, res) => {
  try {
    const sitio = req.query.sitio && SITIOS[req.query.sitio] ? req.query.sitio : null;
    const rango = String(req.query.rango || '30');
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha || '') ? req.query.fecha : null;
    const L = `(creado_en AT TIME ZONE 'America/Lima')`;
    let filtro, grupo, formato, filtroPrev;
    if (rango === 'hoy' || rango === 'dia') {
      const dia = rango === 'dia' && fecha ? `$2::date` : `(NOW() AT TIME ZONE 'America/Lima')::date`;
      filtro = `${L}::date = ${dia}`;
      // Hoy: ayer hasta la misma hora · Día: el día anterior completo
      filtroPrev = rango === 'hoy'
        ? `${L}::date = ${dia} - 1 AND ${L}::time <= (NOW() AT TIME ZONE 'America/Lima')::time`
        : `${L}::date = ${dia} - 1`;
      grupo = `date_trunc('hour', ${L})`; formato = 'HH24:00';
    } else {
      const dias = Math.min(Math.max(parseInt(rango, 10) || 30, 1), 366);
      filtro = `creado_en >= NOW() - INTERVAL '${dias} days'`;
      filtroPrev = `creado_en >= NOW() - INTERVAL '${dias * 2} days' AND creado_en < NOW() - INTERVAL '${dias} days'`;
      grupo = dias > 120 ? `date_trunc('month', ${L})` : `date_trunc('day', ${L})`;
      formato = dias > 120 ? 'YYYY-MM' : 'YYYY-MM-DD';
    }
    const params = [sitio]; if (rango === 'dia' && fecha) params.push(fecha);
    const W = `WHERE ($1::text IS NULL OR sitio = $1) AND ${filtro}`;
    const q = (sql) => pool.query(sql, params).then(r => r.rows);
    const WP = `WHERE ($1::text IS NULL OR sitio = $1) AND ${filtroPrev}`;
    // Una fila por visita: entrada, salida, páginas, duración, origen, país, dispositivo y si el visitante es recurrente
    const SES = `WITH ses AS (
      SELECT sesion, MIN(sitio) sitio, MIN(visitante) visitante, MIN(creado_en) inicio, MAX(creado_en) fin,
             COUNT(*) FILTER (WHERE tipo='vista') paginas, COALESCE(SUM(segundos),0) seg, COUNT(*) FILTER (WHERE tipo='clic') clics,
             (ARRAY_AGG(ruta ORDER BY creado_en) FILTER (WHERE tipo='vista'))[1] entrada,
             (ARRAY_AGG(ruta ORDER BY creado_en DESC) FILTER (WHERE tipo='vista'))[1] salida,
             (ARRAY_AGG(referrer ORDER BY creado_en))[1] referrer, MIN(pais) pais, MIN(dispositivo) dispositivo, MIN(navegador) navegador
      FROM analytics.sitios_eventos ${W} GROUP BY sesion)`;
    const [tot, serie, paginas, origen, paises, dispositivos, navegadores, clics, porSitio, enVivo, sesiones, horas] = await Promise.all([
      q(`SELECT COUNT(*) FILTER (WHERE tipo='vista') vistas, COUNT(DISTINCT visitante) visitantes, COUNT(DISTINCT sesion) sesiones,
           COALESCE(SUM(segundos),0) segundos, COUNT(*) FILTER (WHERE tipo='clic') clics FROM analytics.sitios_eventos ${W}`),
      q(`SELECT to_char(${grupo}, '${formato}') AS t, COUNT(*) FILTER (WHERE tipo='vista') vistas, COUNT(DISTINCT visitante) visitantes,
           COALESCE(SUM(segundos),0) segundos, COUNT(*) FILTER (WHERE tipo='clic') clics FROM analytics.sitios_eventos ${W} GROUP BY 1 ORDER BY 1`),
      q(`SELECT ruta, MAX(titulo) titulo, COUNT(*) FILTER (WHERE tipo='vista') vistas, COUNT(DISTINCT visitante) visitantes, COALESCE(SUM(segundos),0) segundos
           FROM analytics.sitios_eventos ${W} GROUP BY ruta HAVING COUNT(*) FILTER (WHERE tipo='vista') > 0 ORDER BY 3 DESC LIMIT 15`),
      q(`SELECT CASE WHEN COALESCE(referrer,'') = '' THEN 'Directo'
                     WHEN referrer ~* 'google\\.' THEN 'Google' WHEN referrer ~* 'facebook|fb\\.' THEN 'Facebook'
                     WHEN referrer ~* 'instagram' THEN 'Instagram' WHEN referrer ~* 'tiktok' THEN 'TikTok'
                     WHEN referrer ~* 'whatsapp|wa\\.me' THEN 'WhatsApp' WHEN referrer ~* 'bing\\.' THEN 'Bing'
                     WHEN referrer ~* 'qubira' THEN 'QUBIRA'
                     ELSE substring(referrer from '://([^/]+)') END AS origen, COUNT(DISTINCT sesion) sesiones
           FROM analytics.sitios_eventos ${W} AND tipo='vista' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
      q(`SELECT pais, COUNT(DISTINCT visitante) visitantes FROM analytics.sitios_eventos ${W} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
      q(`SELECT dispositivo, COUNT(DISTINCT visitante) visitantes FROM analytics.sitios_eventos ${W} GROUP BY 1 ORDER BY 2 DESC`),
      q(`SELECT navegador, COUNT(DISTINCT visitante) visitantes FROM analytics.sitios_eventos ${W} GROUP BY 1 ORDER BY 2 DESC`),
      q(`SELECT etiqueta, COUNT(*) clics FROM analytics.sitios_eventos ${W} AND tipo='clic' GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
      q(`SELECT sitio, COUNT(*) FILTER (WHERE tipo='vista') vistas, COUNT(DISTINCT visitante) visitantes, COUNT(DISTINCT sesion) sesiones, COALESCE(SUM(segundos),0) segundos
           FROM analytics.sitios_eventos ${W} GROUP BY sitio ORDER BY 2 DESC`),
      pool.query(`SELECT sitio, COUNT(DISTINCT sesion) n FROM analytics.sitios_eventos WHERE ($1::text IS NULL OR sitio = $1) AND creado_en > NOW() - INTERVAL '5 minutes' GROUP BY sitio`, [sitio]).then(r => r.rows),
      // Sesiones: duración y páginas para rebote y promedio
      q(`SELECT COUNT(*) n, COUNT(*) FILTER (WHERE paginas <= 1 AND seg < 10) rebote, AVG(seg) seg_medio, AVG(paginas) paginas_medias, COUNT(*) FILTER (WHERE nuevas) nuevas
           FROM (SELECT sesion, COUNT(*) FILTER (WHERE tipo='vista') paginas, COALESCE(SUM(segundos),0) seg,
                        MIN(creado_en) <= (SELECT MIN(creado_en) FROM analytics.sitios_eventos x WHERE x.visitante = e.visitante AND x.sitio = e.sitio) nuevas
                 FROM analytics.sitios_eventos e ${W} GROUP BY sesion, visitante, sitio) s`),
      // Horas del día en que más se conectan (en el periodo)
      q(`SELECT EXTRACT(HOUR FROM ${L})::int h, COUNT(DISTINCT sesion) sesiones FROM analytics.sitios_eventos ${W} GROUP BY 1 ORDER BY 1`),
    ]);
    const [prev, entradas, salidas, flujos, duraciones, profundidad, recurrentes, calor, recientes, idiomas] = await Promise.all([
      q(`SELECT COUNT(*) FILTER (WHERE tipo='vista') vistas, COUNT(DISTINCT visitante) visitantes, COUNT(DISTINCT sesion) sesiones,
           COALESCE(SUM(segundos),0) segundos, COUNT(*) FILTER (WHERE tipo='clic') clics FROM analytics.sitios_eventos ${WP}`),
      // Páginas por donde entran y por donde se van (con % de salida sobre sus vistas)
      q(`${SES} SELECT entrada ruta, COUNT(*) visitas, ROUND(100.0 * COUNT(*) FILTER (WHERE paginas <= 1 AND seg < 10) / COUNT(*)) rebote
           FROM ses WHERE entrada IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
      q(`${SES}, vis AS (SELECT ruta, COUNT(*) vistas FROM analytics.sitios_eventos ${W} AND tipo='vista' GROUP BY ruta)
         SELECT s.salida ruta, COUNT(*) salidas, ROUND(100.0 * COUNT(*) / MAX(v.vistas)) tasa FROM ses s JOIN vis v ON v.ruta = s.salida
         WHERE s.salida IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
      // Recorridos: de qué página pasan a cuál
      q(`SELECT desde, hacia, COUNT(*) veces FROM (
           SELECT ruta hacia, LAG(ruta) OVER (PARTITION BY sesion ORDER BY creado_en) desde
           FROM analytics.sitios_eventos ${W} AND tipo='vista') t
         WHERE desde IS NOT NULL AND desde <> hacia GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10`),
      q(`${SES} SELECT CASE WHEN seg < 10 THEN '0–10 s' WHEN seg < 30 THEN '10–30 s' WHEN seg < 60 THEN '30–60 s'
                              WHEN seg < 180 THEN '1–3 min' WHEN seg < 600 THEN '3–10 min' ELSE '+10 min' END rango,
                         MIN(seg) orden, COUNT(*) visitas FROM ses GROUP BY 1 ORDER BY 2`),
      q(`${SES} SELECT LEAST(paginas, 6) paginas, COUNT(*) visitas FROM ses GROUP BY 1 ORDER BY 1`),
      // Nuevos vs. que regresan (visitaron antes del periodo o en otra sesión)
      q(`${SES}, porV AS (SELECT visitante, COUNT(*) visitas FROM ses GROUP BY visitante),
           antes AS (SELECT DISTINCT visitante FROM analytics.sitios_eventos WHERE ($1::text IS NULL OR sitio = $1)
                     AND creado_en < (SELECT MIN(inicio) FROM ses) AND visitante IN (SELECT visitante FROM porV))
         SELECT COUNT(*) FILTER (WHERE p.visitas = 1 AND a.visitante IS NULL) nuevos,
                COUNT(*) FILTER (WHERE p.visitas > 1 OR a.visitante IS NOT NULL) recurrentes,
                ROUND(AVG(p.visitas), 2) visitas_por_visitante
         FROM porV p LEFT JOIN antes a ON a.visitante = p.visitante`),
      // Mapa de calor: día de la semana × hora (Lima)
      q(`SELECT EXTRACT(ISODOW FROM ${L})::int d, EXTRACT(HOUR FROM ${L})::int h, COUNT(DISTINCT sesion) n
         FROM analytics.sitios_eventos ${W} GROUP BY 1, 2`),
      // Últimas visitas (detalle)
      q(`${SES} SELECT sitio, to_char(inicio AT TIME ZONE 'America/Lima', 'DD/MM HH24:MI') hora, entrada, salida, paginas, seg, clics, pais, dispositivo, navegador,
           CASE WHEN COALESCE(referrer,'') = '' THEN 'Directo' ELSE substring(referrer from '://(?:www\\.)?([^/]+)') END origen,
           (fin > NOW() - INTERVAL '5 minutes') en_linea
         FROM ses ORDER BY inicio DESC LIMIT 25`),
      q(`SELECT split_part(COALESCE(idioma, '?'), '-', 1) idioma, COUNT(DISTINCT visitante) visitantes FROM analytics.sitios_eventos ${W} GROUP BY 1 ORDER BY 2 DESC LIMIT 6`),
    ]);
    res.json({ prev: prev[0], entradas, salidas, flujos, duraciones, profundidad, recurrentes: recurrentes[0], calor, recientes, idiomas,
      sitios: SITIOS, sitio, rango, fecha, total: tot[0], sesion: sesiones[0], serie, paginas, origen, paises, dispositivos, navegadores, clics, porSitio, enVivo, horas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router, publico, asegurarEsquema };
