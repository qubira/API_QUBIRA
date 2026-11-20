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
const C = require('../lib/codificacion');
const N = require('../lib/notificar');

/* Niveles de soporte (Flujo de Proyectos QUBIRA, fase 5): el caso sube en orden
   OCOS N1 → N2 → N3 → OTI (error de fondo). Un incidente de seguridad salta directo a
   DST desde cualquier nivel (y avisa a ODACL si hubo datos personales). Nivel y área van
   en columnas propias: el panel guarda el caso completo y no debe poder pisarlos. */
const NIVEL = { 1: 'OCOS N1 · mesa de ayuda', 2: 'OCOS N2 · soporte técnico', 3: 'OCOS N3 · especialista', 4: 'OTI · error de fondo' };
const COLS_NIVEL = ['nivel', 'area_actual', 'seguridad', 'datos_personales', 'escalamiento'];

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
    CREATE INDEX IF NOT EXISTS soporte_casos_creado_ix ON soporte.casos (created_at DESC);
    ALTER TABLE soporte.casos ADD COLUMN IF NOT EXISTS nivel INT NOT NULL DEFAULT 1;
    ALTER TABLE soporte.casos ADD COLUMN IF NOT EXISTS area_actual TEXT NOT NULL DEFAULT 'OCOS';
    ALTER TABLE soporte.casos ADD COLUMN IF NOT EXISTS seguridad BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE soporte.casos ADD COLUMN IF NOT EXISTS datos_personales BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE soporte.casos ADD COLUMN IF NOT EXISTS escalamiento JSONB NOT NULL DEFAULT '[]'::jsonb;`).catch(e => { listo = null; throw e; });
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
  COLS_NIVEL.forEach(k => { delete d[k]; }); delete d.areaActual; delete d.datosPersonales;
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
const salida = r => ({ ...r.datos, id: r.codigo, codigoAnterior: r.codigo_local || null, estado: r.datos.estado || r.estado,
  nivel: r.nivel || 1, nivelNombre: r.seguridad && r.area_actual === 'DST' ? 'DST · incidente de seguridad' : (NIVEL[r.nivel] || NIVEL[1]),
  areaActual: r.area_actual || 'OCOS', seguridad: !!r.seguridad, datosPersonales: !!r.datos_personales, escalamiento: r.escalamiento || [] });
const entrada = (quien, accion, de, a, comentario, extra = {}) => ({ fecha: new Date().toISOString(), accion, de, a, usuario: quien.nombre, area: quien.sigla, comentario: texto(comentario || '').slice(0, 2000), ...extra });
const esDireccion = q => q.esADG || q.sigla === 'GG';

async function emitirCaso(user, cx, c) {
  const titulo = String(c.titulo || c.tipoCaso || 'Caso de soporte').slice(0, 300);
  return (await DM.emitirRegistro(user, {
    tipo: 'CAS', area: 'OCOS', titulo, detalle: c.proyecto ? `Proyecto: ${String(c.proyecto).slice(0, 120)}` : (c.tipo || null), modulo: 'SOPORTE',
    codigo_anterior: c.codigoAnterior || null,
  }, { cli: cx, idOrigenEsCodigo: true })).codigo;
}

function montar(router) {
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

  /* Escalar: N1 → N2 → N3 (cualquier persona de OCOS) y N3 → OTI (Especialista N3, N6 o superior) */
  router.post('/casos/:codigo/escalar', async (req, res) => {
    try {
      const quien = await C.quienEs(req.user);
      const comentario = String((req.body || {}).comentario || '').trim();
      if (!comentario) return res.status(400).json({ ok: false, error: 'Escribe qué se intentó y por qué sube de nivel.' });
      if (!(quien.sigla === 'OCOS' || esDireccion(quien))) return res.status(403).json({ ok: false, error: 'Escala casos el personal de OCOS.' });
      const out = await DM.enTransaccion(null, async cx => {
        const { rows } = await cx.query('SELECT * FROM soporte.casos WHERE codigo = $1 FOR UPDATE', [req.params.codigo]);
        if (!rows.length) throw new DM.ErrorModulo(404, 'Caso no encontrado');
        const c = rows[0];
        if (c.area_actual !== 'OCOS') throw new DM.ErrorModulo(409, `El caso está en ${c.area_actual}: espera a que lo devuelva.`);
        if (CERRADOS.includes(c.estado)) throw new DM.ErrorModulo(409, 'El caso está cerrado: reábrelo para escalarlo.');
        let nivel = c.nivel || 1, area = 'OCOS';
        if (nivel < 3) nivel += 1;
        else {
          if (!(esDireccion(quien) || (quien.sigla === 'OCOS' && quien.nivel && quien.nivel <= 6))) throw new DM.ErrorModulo(403, 'A OTI lo escala el Especialista de Soporte Nivel 3 (N6 o superior) de OCOS.');
          nivel = 4; area = 'OTI';
        }
        const esc = [...(c.escalamiento || []), entrada(quien, 'ESCALA', NIVEL[c.nivel || 1], NIVEL[nivel], comentario, { a_area: area })];
        const { rows: [act] } = await cx.query('UPDATE soporte.casos SET nivel = $2, area_actual = $3, escalamiento = $4::jsonb, updated_at = NOW() WHERE codigo = $1 RETURNING *', [c.codigo, nivel, area, JSON.stringify(esc)]);
        return act;
      });
      if (out.area_actual === 'OTI') N.aAreas([['OTI', 5]], { titulo: `${out.codigo}: caso escalado a OTI`, texto: `${out.datos.titulo || ''} · error de fondo para corregir. Está en «Casos de soporte».`, modulo: 'SOPORTE', tipo: 'ESCALA', referencia: out.codigo });
      res.json({ ok: true, caso: salida(out) });
    } catch (e) { DM.responder(res, e, '[SOPORTE] escalar:'); }
  });

  /* Incidente de seguridad: salta directo a DST (desde cualquier nivel); ODACL lo ve si hubo datos personales */
  router.post('/casos/:codigo/seguridad', async (req, res) => {
    try {
      const quien = await C.quienEs(req.user);
      const b = req.body || {};
      const comentario = String(b.comentario || '').trim();
      if (!comentario) return res.status(400).json({ ok: false, error: 'Describe el incidente: qué pasó y qué se vio comprometido.' });
      if (!(quien.sigla === 'OCOS' || esDireccion(quien))) return res.status(403).json({ ok: false, error: 'Lo reporta el personal de OCOS.' });
      const out = await DM.enTransaccion(null, async cx => {
        const { rows } = await cx.query('SELECT * FROM soporte.casos WHERE codigo = $1 FOR UPDATE', [req.params.codigo]);
        if (!rows.length) throw new DM.ErrorModulo(404, 'Caso no encontrado');
        const c = rows[0];
        if (c.area_actual === 'DST') throw new DM.ErrorModulo(409, 'El incidente ya está en DST.');
        const dp = !!b.datos_personales;
        const avisos = ['DST', 'ADG (Director General)'].concat(dp ? ['ODACL (Oficial de Protección de Datos)'] : []);
        const esc = [...(c.escalamiento || []), entrada(quien, 'INCIDENTE DE SEGURIDAD', c.area_actual === 'OTI' ? NIVEL[4] : NIVEL[c.nivel || 1], 'DST', comentario, { a_area: 'DST', avisos, datos_personales: dp })];
        const { rows: [act] } = await cx.query('UPDATE soporte.casos SET area_actual = \'DST\', seguridad = true, datos_personales = (datos_personales OR $2), escalamiento = $3::jsonb, updated_at = NOW() WHERE codigo = $1 RETURNING *', [c.codigo, dp, JSON.stringify(esc)]);
        return act;
      });
      const aviso = { titulo: `${out.codigo}: incidente de seguridad`, texto: `${out.datos.titulo || ''}${out.datos_personales ? ' · expuso datos personales' : ''}. Lo atiende DST.`, modulo: 'SOPORTE', tipo: 'SEGURIDAD', referencia: out.codigo };
      N.aAreas([['DST', 5], ['ADG', 1]].concat(out.datos_personales ? [['ODACL', 6]] : []), aviso);
      res.json({ ok: true, caso: salida(out) });
    } catch (e) { DM.responder(res, e, '[SOPORTE] incidente:'); }
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
}
module.exports = montar;
module.exports.util = { asegurar, salida, entrada, NIVEL, CERRADOS, esDireccion };
