'use strict';

/* ============================================================
   Casos de soporte de OCOS en el servidor (CODIFICACION.md, fase 3)
   Antes vivían solo en el navegador de cada persona (localStorage,
   QS-0001…), así que el mismo número podía existir en varias
   computadoras con contenido distinto. Ahora:
   - cada caso nuevo recibe su código OCOS-CAS-AAAA-NNN del servidor;
   - «Enviar mis casos al sistema central» sube los casos guardados en
     el navegador y los numera en orden de llegada (el QS-… queda como
     código anterior). Un mismo caso no se sube dos veces.
   - Un caso no se borra: se cierra (y se puede reabrir).
   ============================================================ */
const { pool } = require('../db');
const DM = require('../lib/docModulo');

let listo = null;
function asegurar() {
  if (!listo) listo = pool.query(`
    CREATE SCHEMA IF NOT EXISTS soporte;
    CREATE TABLE IF NOT EXISTS soporte.casos (
      codigo TEXT PRIMARY KEY,
      datos JSONB NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      codigo_local TEXT,
      huella TEXT UNIQUE,
      enviado_por TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS soporte_casos_creado_ix ON soporte.casos (created_at DESC);`).catch(e => { listo = null; throw e; });
  return listo;
}

const CERRADOS = ['solucionado', 'cerrado'];
const ESTADOS = ['pendiente', 'revisado', 'solucionado', 'cerrado'];
const TIPOS = ['web', 'movil', 'escritorio', 'proyecto'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];

/* Los casos ahora se comparten entre todo el equipo y el panel de Soporte los pinta
   como HTML: el texto se guarda sin caracteres que abran etiquetas o atributos
   (< > " ' se cambian por sus equivalentes tipográficos), así un caso nunca puede
   ejecutar código en el navegador de otra persona. */
const TIPOGRAFICO = { '<': '‹', '>': '›', '"': '”', "'": '’', '`': 'ˋ' };
const texto = v => String(v).replace(/[<>"'`]/g, ch => TIPOGRAFICO[ch]).slice(0, 20000);
function sanear(v, prof = 0) {
  if (prof > 4 || v === null || v === undefined) return v === undefined ? undefined : null;
  if (typeof v === 'string') return texto(v);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 200).map(x => sanear(x, prof + 1));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 60).map(([k, x]) => [texto(k).slice(0, 60), sanear(x, prof + 1)]));
  return null;
}
const imagenValida = s => typeof s === 'string' && (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(s) || /^https:\/\/[^\s"'<>`]+$/.test(s));

// Lo que se guarda del caso (sin el id: el id es el código del servidor)
function limpiarCaso(c) {
  const { imagenes, ...resto } = c || {};
  const d = sanear(resto);
  delete d.id; delete d.codigoAnterior; delete d.sinEnviar;
  // Las imágenes van como data-URL (capturas): solo imágenes reales, con tope razonable
  d.imagenes = (Array.isArray(imagenes) ? imagenes : []).filter(i => i && typeof i === 'object').slice(0, 10).map(i => {
    const type = /^[a-z]+\/[a-z0-9.+-]{1,60}$/i.test(String(i.type || '')) ? String(i.type) : 'application/octet-stream';
    const esImagen = type.startsWith('image/') && imagenValida(i.data);
    return { name: texto(i.name || 'archivo').slice(0, 200), type: esImagen ? type : (type.startsWith('image/') ? 'application/octet-stream' : type), data: esImagen ? i.data : null };
  });
  // Valores que el panel usa para dibujar (uno desconocido rompería la lista)
  if (!ESTADOS.includes(d.estado)) d.estado = 'pendiente';
  if (!TIPOS.includes(d.tipo)) d.tipo = 'web';
  if (!PRIORIDADES.includes(d.prioridad)) d.prioridad = 'media';
  for (const k of ['titulo', 'tipoCaso', 'proyecto', 'descripcion', 'nombre']) if (typeof d[k] !== 'string') d[k] = d[k] == null ? '' : texto(d[k]);
  if (!Array.isArray(d.historial)) d.historial = [];
  return d;
}
const salida = r => ({ ...r.datos, id: r.codigo, codigoAnterior: r.codigo_local || null, estado: r.datos.estado || r.estado });

async function emitirCaso(user, cx, c) {
  const titulo = String(c.titulo || c.tipoCaso || 'Caso de soporte').slice(0, 300);
  return (await DM.emitirRegistro(user, {
    tipo: 'CAS', area: 'OCOS', titulo, detalle: c.proyecto ? `Proyecto: ${String(c.proyecto).slice(0, 120)}` : (c.tipo || null), modulo: 'SOPORTE',
    codigo_anterior: c.codigoAnterior || null,
  }, { cli: cx, idOrigenEsCodigo: true })).codigo;
}

module.exports = function montar(router) {
  router.use('/casos', (req, res, next) => { asegurar().then(() => next()).catch(next); });

  router.get('/casos', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM soporte.casos ORDER BY created_at DESC LIMIT 2000');
      res.json({ ok: true, casos: rows.map(salida) });
    } catch (e) { DM.responder(res, e, '[SOPORTE] casos:'); }
  });

  // Caso nuevo: el código lo asigna el servidor
  router.post('/casos', async (req, res) => {
    try {
      const c = req.body || {};
      if (!String(c.titulo || '').trim()) return res.status(400).json({ ok: false, error: 'Escribe el título del caso.' });
      const fila = await DM.enTransaccion(null, async cx => {
        const codigo = await emitirCaso(req.user, cx, c);
        const { rows } = await cx.query('INSERT INTO soporte.casos (codigo, datos, estado, enviado_por) VALUES ($1,$2,$3,$4) RETURNING *',
          [codigo, JSON.stringify(limpiarCaso(c)), c.estado || 'pendiente', req.user.username]);
        return rows[0];
      });
      res.status(201).json({ ok: true, caso: salida(fila) });
    } catch (e) { DM.responder(res, e, '[SOPORTE] nuevo caso:'); }
  });

  // Actualizar (respuesta, asignación, estado…). Cerrar/reabrir se refleja en el registro.
  router.put('/casos/:codigo', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM soporte.casos WHERE codigo = $1', [req.params.codigo]);
      if (!rows.length) return res.status(404).json({ ok: false, error: 'Caso no encontrado' });
      const previo = rows[0];
      const datos = limpiarCaso({ ...previo.datos, ...(req.body || {}) });
      const estado = datos.estado || previo.estado;
      const { rows: [act] } = await pool.query('UPDATE soporte.casos SET datos = $2, estado = $3, updated_at = NOW() WHERE codigo = $1 RETURNING *',
        [req.params.codigo, JSON.stringify(datos), estado]);
      const cerradoAntes = CERRADOS.includes(previo.estado), cerradoAhora = CERRADOS.includes(estado);
      if (cerradoAntes !== cerradoAhora) await DM.estadoRegistro(req.user, 'SOPORTE', req.params.codigo, cerradoAhora ? 'CERRADO' : 'ABIERTO', estado).catch(() => {});
      res.json({ ok: true, caso: salida(act) });
    } catch (e) { DM.responder(res, e, '[SOPORTE] actualizar caso:'); }
  });

  router.delete('/casos/:codigo', (req, res) => {
    res.status(409).json({ ok: false, error: 'Un caso no se elimina: se cierra (y se puede reabrir).' });
  });

  /* «Enviar mis casos al sistema central»: numera en orden de llegada.
     huella = usuario + código local + fecha de creación → el mismo caso no entra dos veces. */
  router.post('/casos/enviar', async (req, res) => {
    try {
      const lista = Array.isArray((req.body || {}).casos) ? req.body.casos.slice(0, 500) : [];
      const ordenados = lista.filter(c => c && String(c.titulo || '').trim())
        .sort((a, b) => String(a.fechaCreacion || '').localeCompare(String(b.fechaCreacion || '')));
      const resultado = [];
      for (const c of ordenados) {
        const huella = `${req.user.username}|${c.id || ''}|${c.fechaCreacion || ''}`;
        const { rows: ya } = await pool.query('SELECT codigo FROM soporte.casos WHERE huella = $1', [huella]);
        if (ya.length) { resultado.push({ local: c.id, codigo: ya[0].codigo, repetido: true }); continue; }
        const codigo = await DM.enTransaccion(null, async cx => {
          const cod = await emitirCaso(req.user, cx, { ...c, codigoAnterior: c.id });
          await cx.query('INSERT INTO soporte.casos (codigo, datos, estado, codigo_local, huella, enviado_por, created_at) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()))',
            [cod, JSON.stringify(limpiarCaso(c)), c.estado || 'pendiente', c.id || null, huella, req.user.username, /^\d{4}-\d{2}-\d{2}T/.test(c.fechaCreacion || '') ? c.fechaCreacion : null]);
          return cod;
        });
        // Ya resuelto en el navegador: queda CERRADO en el registro (después de confirmar la emisión)
        if (CERRADOS.includes(c.estado)) await DM.estadoRegistro(req.user, 'SOPORTE', codigo, 'CERRADO', c.estado).catch(() => {});
        resultado.push({ local: c.id, codigo });
      }
      res.json({ ok: true, enviados: resultado });
    } catch (e) { DM.responder(res, e, '[SOPORTE] enviar casos:'); }
  });
};
