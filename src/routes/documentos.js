'use strict';

/* ============================================================
   /api/documentos — Registro central de documentos (CODIFICACION.md)
   ============================================================ */
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { listarAreas } = require('../lib/employeeArea');
const C = require('../lib/codificacion');

const router = express.Router();
router.use(requireAuth);
router.use(async (req, res, next) => {
  try { await C.asegurarCodificacion(); next(); }
  catch (e) { console.error('[DOC] esquema:', e.message); res.status(503).json({ ok: false, error: 'El registro de documentos no está disponible' }); }
});

const err = (res, status, error) => res.status(status).json({ ok: false, error });
const limpio = v => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim();

/* ─── Lectura ──────────────────────────────────────────────────────── */
async function docPorCodigo(codigo, cli = pool) {
  const c = String(codigo || '').trim().toUpperCase();
  const { rows } = await cli.query(
    'SELECT * FROM doc.documentos WHERE codigo = $1 OR (codigo IS NULL AND id::text = $2) OR upper(codigo_anterior) = $1 ORDER BY (codigo = $1) DESC NULLS LAST LIMIT 1',
    [c, String(codigo)]);
  return rows[0] || null;
}
async function docPorId(id, cli = pool, bloquear = false) {
  if (!/^\d+$/.test(String(id))) return null;
  const { rows } = await cli.query(`SELECT * FROM doc.documentos WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
  return rows[0] || null;
}
async function rutaDe(docId, cli = pool) {
  const { rows } = await cli.query('SELECT * FROM doc.ruta WHERE documento_id = $1 ORDER BY ronda, orden, id', [docId]);
  return rows;
}
const pendiente = ruta => {
  const ronda = Math.max(0, ...ruta.map(p => p.ronda));
  return ruta.find(p => p.ronda === ronda && p.planificado && !p.fecha) || null;
};
function puedeVer(quien, doc, ruta) {
  if (quien.esADG || (quien.nivel && quien.nivel <= 2)) return true;
  if (doc.area === quien.sigla || doc.area_destino === quien.sigla) return true;
  if (String(doc.creado_por).toLowerCase() === quien.usuario.toLowerCase()) return true;
  return (ruta || []).some(p => p.area === quien.sigla);
}
const salida = (d, ruta) => ({ ...d, tipo: String(d.tipo).trim(), ruta: ruta || undefined, pendiente: ruta ? pendiente(ruta) : undefined });

/* Registra un paso hecho (acción con persona y fecha) */
async function anotar(cli, doc, quien, accion, { ronda, orden, area, comentario, motivo } = {}) {
  await cli.query(`INSERT INTO doc.ruta (documento_id, ronda, orden, area, accion, planificado, usuario, usuario_nombre, usuario_cargo, comentario, motivo, fecha)
    VALUES ($1,$2,$3,$4,$5,false,$6,$7,$8,$9,$10,now())`,
    [doc.id, ronda || 1, orden || 0, area || quien.sigla || doc.area, accion, quien.usuario, quien.nombre, quien.cargo, limpio(comentario), motivo || null]);
}

async function enTransaccion(fn) {
  const cli = await pool.connect();
  try { await cli.query('BEGIN'); const r = await fn(cli); await cli.query('COMMIT'); return r; }
  catch (e) { await cli.query('ROLLBACK').catch(() => {}); throw e; }
  finally { cli.release(); }
}
class Rechazo extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const manejar = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (e instanceof Rechazo) return err(res, e.status, e.message);
    if (e.code === '23505') return err(res, 409, 'Ese registro ya tiene un documento asociado.');
    console.error('[DOC]', req.method, req.path, e.message);
    err(res, 500, 'No se pudo completar la operación con el documento');
  }
};

/* ─── Catálogo y empresa ───────────────────────────────────────────── */
router.get('/catalogo', manejar(async (req, res) => {
  const [tipos, areas, empresa] = await Promise.all([C.listarTipos(), listarAreas(), C.datosEmpresa()]);
  res.json({ ok: true, tipos, areas, empresa, areasDuenas: C.AREA_DUENA_FIJA });
}));

router.put('/tipos/:sigla', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  if (!(quien.superadmin || (quien.esADG && quien.nivel <= 2))) throw new Rechazo(403, 'Solo la Alta Dirección puede cambiar el catálogo de tipos.');
  const tipo = await C.tipoPorSigla(req.params.sigla);
  if (!tipo) throw new Rechazo(404, 'Tipo no encontrado');
  const b = req.body || {};
  const { rows: [uso] } = await pool.query('SELECT COUNT(*)::int AS n FROM doc.correlativos WHERE tipo = $1', [tipo.sigla]);
  if (uso.n && ((b.clase && b.clase !== tipo.clase) || (b.lleva_anio !== undefined && !!b.lleva_anio !== tipo.lleva_anio))) {
    throw new Rechazo(409, 'Este tipo ya tiene códigos emitidos: su clase y si lleva año ya no se pueden cambiar.');
  }
  if (b.clase && !C.CLASES.includes(b.clase)) throw new Rechazo(400, 'Clase no válida');
  const { rows } = await pool.query(`UPDATE doc.tipos SET
      nombre = COALESCE($2, nombre), clase = COALESCE($3, clase), lleva_anio = COALESCE($4, lleva_anio),
      ruta_defecto = COALESCE($5, ruta_defecto), firmante = CASE WHEN $6::text = 'null' THEN NULL ELSE COALESCE($6::jsonb, firmante) END,
      emite_nivel_min = CASE WHEN $7 THEN $8 ELSE emite_nivel_min END, activo = COALESCE($9, activo)
    WHERE sigla = $1 RETURNING *`,
    [tipo.sigla, limpio(b.nombre), b.clase || null, b.lleva_anio === undefined ? null : !!b.lleva_anio,
      b.ruta_defecto ? JSON.stringify(b.ruta_defecto) : null, b.firmante === undefined ? null : JSON.stringify(b.firmante),
      b.emite_nivel_min !== undefined, b.emite_nivel_min ? Number(b.emite_nivel_min) : null, b.activo === undefined ? null : !!b.activo]);
  res.json({ ok: true, data: rows[0] });
}));

router.put('/empresa', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  if (!(quien.superadmin || (quien.esADG && quien.nivel <= 2))) throw new Rechazo(403, 'Solo la Alta Dirección puede cambiar los datos de la empresa.');
  res.json({ ok: true, data: await C.guardarEmpresa(req.body || {}, quien.nombre) });
}));

router.get('/validar/:codigo', manejar(async (req, res) => res.json(await C.validarCodigo(req.params.codigo))));

/* ─── Búsqueda ─────────────────────────────────────────────────────── */
router.get('/', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const q = req.query, p = [], w = [];
  if (limpio(q.buscar)) { p.push(`%${q.buscar.trim()}%`); w.push(`(codigo ILIKE $${p.length} OR codigo_anterior ILIKE $${p.length} OR titulo ILIKE $${p.length} OR detalle ILIKE $${p.length})`); }
  for (const [campo, col] of [['area', 'area'], ['tipo', 'tipo'], ['estado', 'estado'], ['modulo', 'modulo']]) {
    if (limpio(q[campo])) { p.push(q[campo].trim().toUpperCase()); w.push(`upper(${col}) = $${p.length}`); }
  }
  if (/^\d{4}$/.test(q.anio || '')) { p.push(Number(q.anio)); w.push(`anio = $${p.length}`); }
  if (q.estado !== 'BORRADOR') { p.push(req.user.username); w.push(`(estado <> 'BORRADOR' OR lower(creado_por) = lower($${p.length}))`); }
  const { rows } = await pool.query(`SELECT * FROM doc.documentos ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
    ORDER BY COALESCE(emitido_en, creado_en) DESC LIMIT 300`, p);
  const ids = rows.map(r => r.id);
  const rutas = ids.length ? (await pool.query('SELECT documento_id, area FROM doc.ruta WHERE documento_id = ANY($1)', [ids])).rows : [];
  const visibles = rows.filter(d => puedeVer(quien, d, rutas.filter(r => r.documento_id === d.id)));
  res.json({ ok: true, data: visibles.map(d => salida(d)) });
}));

/* Pendientes de mi revisión o aprobación */
router.get('/pendientes', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const { rows } = await pool.query("SELECT * FROM doc.documentos WHERE estado = 'EN RUTA' ORDER BY emitido_en LIMIT 500");
  const out = [];
  for (const d of rows) {
    const ruta = await rutaDe(d.id);
    const paso = pendiente(ruta);
    if (paso && (await C.puedeActuar(quien, paso, d)).ok) out.push(salida(d, ruta));
  }
  const { rows: observados } = await pool.query("SELECT * FROM doc.documentos WHERE estado = 'OBSERVADO' AND lower(creado_por) = lower($1)", [req.user.username]);
  res.json({ ok: true, data: out, observados: observados.map(d => salida(d)) });
}));

router.get('/por-codigo/:codigo', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const d = await docPorCodigo(req.params.codigo);
  if (!d) throw new Rechazo(404, 'No existe un documento con ese código');
  const ruta = await rutaDe(d.id);
  if (!puedeVer(quien, d, ruta)) throw new Rechazo(403, 'No tienes acceso a este documento');
  res.json({ ok: true, data: salida(d, ruta) });
}));

/* ─── Crear borrador ───────────────────────────────────────────────── */
async function crearBorrador(cli, quien, b) {
  const tipo = await C.tipoPorSigla(b.tipo);
  if (!tipo || !tipo.activo) throw new Rechazo(400, 'Elige un tipo de documento válido');
  const areas = await listarAreas();
  const area = String(b.area || quien.sigla || '').trim().toUpperCase();
  if (!areas.some(a => a.sigla === area)) throw new Rechazo(400, `El área ${area || '(vacía)'} no está activa en el catálogo de ORH`);
  const fijas = C.AREA_DUENA_FIJA[tipo.sigla];
  if (fijas && !fijas.includes(area)) throw new Rechazo(400, `Los documentos ${tipo.sigla} pertenecen a ${fijas.join(' / ')}`);
  const permiso = C.puedeEmitir(quien, area, tipo);
  if (!permiso.ok) throw new Rechazo(403, permiso.error);
  if (!limpio(b.titulo)) throw new Rechazo(400, 'Escribe el título del documento');
  if (limpio(b.enlace_externo) && !/^https:\/\/\S+$/i.test(b.enlace_externo.trim())) throw new Rechazo(400, 'El enlace debe empezar con https://');
  const destino = limpio(b.area_destino) ? b.area_destino.trim().toUpperCase() : null;
  if (destino && !areas.some(a => a.sigla === destino)) throw new Rechazo(400, `El área destino ${destino} no existe`);
  if (tipo.sigla === 'SOL' && !destino) throw new Rechazo(400, 'Una solicitud necesita el área destino');
  let reemplaza = null;
  if (limpio(b.reemplaza_a)) {
    reemplaza = await docPorCodigo(b.reemplaza_a, cli);
    if (!reemplaza || !reemplaza.codigo) throw new Rechazo(400, 'El documento a reemplazar no existe');
    if (reemplaza.area !== area || String(reemplaza.tipo).trim() !== tipo.sigla) throw new Rechazo(400, 'Solo se reemplaza un documento de la misma área y tipo');
    if (tipo.clase !== 'DOCUMENTO') throw new Rechazo(400, 'Solo los documentos (no los versionados ni los registros) se reemplazan');
    if (['ANULADO', 'RECHAZADO'].includes(reemplaza.estado)) throw new Rechazo(409, `${reemplaza.codigo} ya está ${reemplaza.estado.toLowerCase()}`);
  }
  if (limpio(b.referencia) && !(await docPorCodigo(b.referencia, cli))) throw new Rechazo(400, `No existe el documento de referencia ${b.referencia}`);
  const { rows } = await cli.query(`INSERT INTO doc.documentos
      (area, tipo, detalle, titulo, estado, area_destino, elevar_adg, formato_codigo, formato_version, referencia, referencia_version,
       reemplaza_a, codigo_anterior, modulo, id_origen, enlace_externo, fecha_documento, creado_por)
    VALUES ($1,$2,$3,$4,'BORRADOR',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [area, tipo.sigla, limpio(b.detalle), b.titulo.trim(), destino, !!b.elevar_adg, limpio(b.formato_codigo),
      b.formato_version ? Number(b.formato_version) : null, limpio(b.referencia), b.referencia_version ? Number(b.referencia_version) : null,
      reemplaza ? reemplaza.codigo : null, limpio(b.codigo_anterior), limpio(b.modulo), limpio(b.id_origen), limpio(b.enlace_externo),
      limpio(b.fecha_documento), quien.usuario]);
  return { doc: rows[0], tipo };
}

/* Emite: asigna el código y lo envía a su ruta (o lo deja en su estado final si no tiene ruta) */
async function emitir(cli, quien, docId) {
  const doc = await docPorId(docId, cli, true);
  if (!doc) throw new Rechazo(404, 'Documento no encontrado');
  if (doc.estado !== 'BORRADOR' || doc.codigo) throw new Rechazo(409, 'Este documento ya fue emitido');
  if (String(doc.creado_por).toLowerCase() !== quien.usuario.toLowerCase() && !quien.esADG) throw new Rechazo(403, 'Solo quien creó el borrador puede emitirlo');
  const tipo = await C.tipoPorSigla(doc.tipo);
  const permiso = C.puedeEmitir(quien, doc.area, tipo);
  if (!permiso.ok) throw new Rechazo(403, permiso.error);
  // pg entrega DATE como medianoche local: getFullYear() da el año escrito en la fecha
  const anioOriginal = f => (f instanceof Date ? f.getFullYear() : Number(String(f).slice(0, 4)));
  const anio = tipo.lleva_anio ? (doc.fecha_documento && doc.modulo === 'EXTERNO' ? anioOriginal(doc.fecha_documento) : C.anioLima()) : 0;
  const numero = await C.siguienteNumero(cli, doc.area, tipo.sigla, anio);
  const codigo = C.formatearCodigo(doc.area, tipo, anio, numero);
  const pasos = doc.modulo === 'EXTERNO' ? [] : C.rutaPara(tipo, doc);
  const estado = pasos.length ? 'EN RUTA' : C.estadoFinal(tipo);
  await cli.query(`UPDATE doc.documentos SET codigo = $2, anio = $3, numero = $4, estado = $5, emitido_en = now(), actualizado_en = now(),
    version_aceptada = NULL WHERE id = $1`, [doc.id, codigo, anio || null, numero, estado]);
  const emitido = { ...doc, codigo };
  await anotar(cli, emitido, quien, 'CREA', { orden: 0, area: doc.area, comentario: doc.modulo === 'EXTERNO' ? 'Registrado como documento externo' : null });
  let orden = 1;
  for (const p of pasos) {
    await cli.query('INSERT INTO doc.ruta (documento_id, ronda, orden, area, accion, nivel_min, planificado) VALUES ($1,1,$2,$3,$4,$5,true)',
      [doc.id, orden++, p.area, p.accion, p.nivel_min || null]);
  }
  if (tipo.sigla === 'FMT' && !pasos.length) {
    await cli.query("INSERT INTO doc.versiones (documento_id, version, estado, creado_por) VALUES ($1, 1, 'VIGENTE', $2)", [doc.id, quien.usuario]);
  }
  // Reemplazo: si el tipo no tiene ruta, el anterior se anula ya; si tiene, al aprobarse el nuevo
  if (doc.reemplaza_a && !pasos.length) await anularPorReemplazo(cli, quien, doc.reemplaza_a, codigo);
  return { ...(await docPorId(doc.id, cli)) };
}

async function anularPorReemplazo(cli, quien, codigoViejo, codigoNuevo) {
  const viejo = await docPorCodigo(codigoViejo, cli);
  if (!viejo || ['ANULADO', 'RECHAZADO'].includes(viejo.estado)) return;
  await cli.query(`UPDATE doc.documentos SET estado = 'ANULADO', reemplazado_por = $2, motivo_anulacion = $3, actualizado_en = now() WHERE id = $1`,
    [viejo.id, codigoNuevo, `Reemplazado por ${codigoNuevo}`]);
  await anotar(cli, viejo, quien, 'ANULA', { orden: 999, area: viejo.area, comentario: `Anulado – reemplazado por ${codigoNuevo}` });
}

router.post('/', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const b = req.body || {};
  if (b.modulo && String(b.modulo).toUpperCase() === 'EXTERNO') throw new Rechazo(400, 'Usa «Registrar documento externo»');
  const out = await enTransaccion(async cli => {
    const { doc } = await crearBorrador(cli, quien, b);
    return b.emitir ? emitir(cli, quien, doc.id) : doc;
  });
  res.status(201).json({ ok: true, data: salida(out) });
}));

router.post('/:id/emitir', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const out = await enTransaccion(cli => emitir(cli, quien, req.params.id));
  res.json({ ok: true, data: salida(out) });
}));

/* Editar un borrador (solo quien lo creó) */
router.put('/:id', manejar(async (req, res) => {
  const d = await docPorId(req.params.id);
  if (!d) throw new Rechazo(404, 'Documento no encontrado');
  if (d.estado !== 'BORRADOR') throw new Rechazo(409, 'Un documento emitido no se edita: anúlalo y emite uno nuevo que lo reemplace');
  if (String(d.creado_por).toLowerCase() !== req.user.username.toLowerCase()) throw new Rechazo(403, 'Solo quien creó el borrador puede editarlo');
  const b = req.body || {};
  const { rows } = await pool.query(`UPDATE doc.documentos SET titulo = COALESCE($2, titulo), detalle = COALESCE($3, detalle),
      area_destino = COALESCE($4, area_destino), elevar_adg = COALESCE($5, elevar_adg), referencia = COALESCE($6, referencia), actualizado_en = now()
    WHERE id = $1 RETURNING *`, [d.id, limpio(b.titulo), limpio(b.detalle), limpio(b.area_destino) && b.area_destino.toUpperCase(),
    b.elevar_adg === undefined ? null : !!b.elevar_adg, limpio(b.referencia)]);
  res.json({ ok: true, data: salida(rows[0]) });
}));

/* Eliminar: solo un borrador nunca emitido, y solo quien lo creó */
router.delete('/:id', manejar(async (req, res) => {
  const d = await docPorId(req.params.id);
  if (!d) throw new Rechazo(404, 'Documento no encontrado');
  if (d.estado !== 'BORRADOR' || d.codigo) throw new Rechazo(409, 'Lo emitido no se elimina: se anula (documentos), se desactiva (clientes y proyectos) o se cierra (casos)');
  if (String(d.creado_por).toLowerCase() !== req.user.username.toLowerCase()) throw new Rechazo(403, 'Solo quien creó el borrador puede eliminarlo');
  await pool.query('DELETE FROM doc.documentos WHERE id = $1', [d.id]);
  res.json({ ok: true });
}));

/* ─── Ruta: revisar, observar, aprobar, rechazar, archivar ─────────── */
router.post('/:codigo/ruta', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const accion = String((req.body || {}).accion || '').toUpperCase();
  const comentario = (req.body || {}).comentario;
  if (!['REVISA', 'OBSERVA', 'APRUEBA', 'RECHAZA', 'ARCHIVA'].includes(accion)) throw new Rechazo(400, 'Acción no válida');
  const out = await enTransaccion(async cli => {
    const base = await docPorCodigo(req.params.codigo, cli);
    if (!base || !base.codigo) throw new Rechazo(404, 'Documento no encontrado');
    const d = await docPorId(base.id, cli, true);
    const tipo = await C.tipoPorSigla(d.tipo);
    if (accion === 'ARCHIVA') {
      if (!['APROBADO'].includes(d.estado)) throw new Rechazo(409, 'Solo se archiva un documento aprobado');
      const p = C.puedeEmitir(quien, d.area, { ...tipo, emite_nivel_min: 3 });
      if (!p.ok) throw new Rechazo(403, 'Archivar le corresponde a un nivel N3 o superior del área dueña (o ADG)');
      await cli.query("UPDATE doc.documentos SET estado = 'ARCHIVADO', actualizado_en = now() WHERE id = $1", [d.id]);
      await anotar(cli, d, quien, 'ARCHIVA', { orden: 998, area: d.area, comentario });
      return d.id;
    }
    if (d.estado !== 'EN RUTA') throw new Rechazo(409, d.estado === 'OBSERVADO' ? 'El documento está observado: espera a que quien lo creó lo corrija y lo reenvíe' : `El documento está ${d.estado.toLowerCase()}`);
    const ruta = await rutaDe(d.id, cli);
    const paso = pendiente(ruta);
    if (!paso) throw new Rechazo(409, 'El documento no tiene pasos pendientes');
    if (accion === 'APRUEBA' && paso.accion === 'REVISA') throw new Rechazo(409, 'El paso pendiente es una revisión: usa «Revisado»');
    if (accion === 'REVISA' && paso.accion === 'APRUEBA') throw new Rechazo(409, 'El paso pendiente es una aprobación: usa «Aprobar»');
    if (accion === 'RECHAZA' && paso.accion !== 'APRUEBA') throw new Rechazo(409, 'Solo quien aprueba puede rechazar; en una revisión usa «Observar»');
    const permiso = await C.puedeActuar(quien, { ...paso, accion: accion === 'OBSERVA' || accion === 'RECHAZA' ? paso.accion : accion }, d);
    if (!permiso.ok) throw new Rechazo(403, permiso.error);
    if (['OBSERVA', 'RECHAZA'].includes(accion) && !limpio(comentario)) throw new Rechazo(400, accion === 'OBSERVA' ? 'Escribe la observación' : 'Escribe el motivo del rechazo');
    if (accion === 'OBSERVA') {
      await anotar(cli, d, quien, 'OBSERVA', { ronda: paso.ronda, orden: paso.orden, area: paso.area, comentario, motivo: permiso.motivo });
      await cli.query("UPDATE doc.documentos SET estado = 'OBSERVADO', actualizado_en = now() WHERE id = $1", [d.id]);
      return d.id;
    }
    if (accion === 'RECHAZA') {
      await anotar(cli, d, quien, 'RECHAZA', { ronda: paso.ronda, orden: paso.orden, area: paso.area, comentario, motivo: permiso.motivo });
      await cli.query("UPDATE doc.ruta SET fecha = now(), usuario = $2, comentario = 'Rechazado' WHERE id = $1", [paso.id, quien.usuario]);
      // Una versión nueva de proforma o formato rechazada no anula lo anterior: vuelve a la versión previa
      if (tipo.clase === 'VERSIONADO' && d.version > 1) {
        await cli.query(`UPDATE doc.documentos SET version = version - 1, estado = $2, actualizado_en = now() WHERE id = $1`, [d.id, C.estadoFinal(tipo)]);
      } else {
        await cli.query("UPDATE doc.documentos SET estado = 'RECHAZADO', actualizado_en = now() WHERE id = $1", [d.id]);
      }
      return d.id;
    }
    await cli.query(`UPDATE doc.ruta SET usuario = $2, usuario_nombre = $3, usuario_cargo = $4, comentario = $5, motivo = $6, fecha = now() WHERE id = $1`,
      [paso.id, quien.usuario, quien.nombre, quien.cargo, limpio(comentario), permiso.motivo]);
    const queda = (await rutaDe(d.id, cli)).some(p => p.ronda === paso.ronda && p.planificado && !p.fecha);
    if (!queda) {
      await cli.query('UPDATE doc.documentos SET estado = $2, actualizado_en = now() WHERE id = $1', [d.id, C.estadoFinal(tipo)]);
      if (tipo.sigla === 'FMT') {
        await cli.query("UPDATE doc.versiones SET estado = 'OBSOLETA' WHERE documento_id = $1 AND estado = 'VIGENTE'", [d.id]);
        await cli.query("INSERT INTO doc.versiones (documento_id, version, estado, creado_por) VALUES ($1,$2,'VIGENTE',$3) ON CONFLICT (documento_id, version) DO UPDATE SET estado = 'VIGENTE'", [d.id, d.version, d.creado_por]);
      }
      if (d.reemplaza_a) await anularPorReemplazo(cli, quien, d.reemplaza_a, d.codigo);
    }
    return d.id;
  });
  const d = await docPorId(out);
  res.json({ ok: true, data: salida(d, await rutaDe(d.id)) });
}));

/* Quien creó un documento observado lo corrige y lo reenvía (conserva su código) */
router.post('/:codigo/reenviar', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const d = await docPorCodigo(req.params.codigo);
  if (!d || d.estado !== 'OBSERVADO') throw new Rechazo(409, 'Solo se reenvía un documento observado');
  if (String(d.creado_por).toLowerCase() !== quien.usuario.toLowerCase()) throw new Rechazo(403, 'Solo quien creó el documento puede reenviarlo');
  await enTransaccion(async cli => {
    const paso = pendiente(await rutaDe(d.id, cli));
    await anotar(cli, d, quien, 'CREA', { ronda: paso ? paso.ronda : 1, orden: paso ? paso.orden : 0, area: d.area, comentario: limpio((req.body || {}).comentario) || 'Corregido y reenviado' });
    await cli.query("UPDATE doc.documentos SET estado = 'EN RUTA', actualizado_en = now() WHERE id = $1", [d.id]);
  });
  res.json({ ok: true, data: salida(await docPorId(d.id), await rutaDe(d.id)) });
}));

/* ─── Versiones (proformas y formatos) ─────────────────────────────── */
router.post('/:codigo/version', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const out = await enTransaccion(async cli => {
    const base = await docPorCodigo(req.params.codigo, cli);
    if (!base || !base.codigo) throw new Rechazo(404, 'Documento no encontrado');
    const d = await docPorId(base.id, cli, true);
    const tipo = await C.tipoPorSigla(d.tipo);
    if (tipo.clase !== 'VERSIONADO') throw new Rechazo(409, 'Solo las proformas y los formatos tienen versiones');
    if (d.estado === 'ACEPTADA') throw new Rechazo(409, 'La proforma ya fue aceptada: su versión quedó bloqueada. Para negociar algo distinto, emite una proforma nueva.');
    if (['ANULADO', 'RECHAZADO', 'EN RUTA', 'OBSERVADO'].includes(d.estado)) throw new Rechazo(409, `No se crea una versión nueva mientras está ${d.estado.toLowerCase()}`);
    const permiso = C.puedeEmitir(quien, d.area, tipo);
    if (!permiso.ok) throw new Rechazo(403, permiso.error);
    const version = d.version + 1;
    const pasos = C.rutaPara(tipo, d);
    const ronda = Math.max(1, ...(await rutaDe(d.id, cli)).map(p => p.ronda)) + 1;
    await anotar(cli, d, quien, 'CREA', { ronda, orden: 0, area: d.area, comentario: limpio((req.body || {}).comentario) || `Versión ${version}` });
    let orden = 1;
    for (const p of pasos) await cli.query('INSERT INTO doc.ruta (documento_id, ronda, orden, area, accion, nivel_min, planificado) VALUES ($1,$2,$3,$4,$5,$6,true)', [d.id, ronda, orden++, p.area, p.accion, p.nivel_min || null]);
    await cli.query('UPDATE doc.documentos SET version = $2, estado = $3, actualizado_en = now() WHERE id = $1', [d.id, version, pasos.length ? 'EN RUTA' : C.estadoFinal(tipo)]);
    if (tipo.sigla === 'FMT' && !pasos.length) {
      await cli.query("UPDATE doc.versiones SET estado = 'OBSOLETA' WHERE documento_id = $1 AND estado = 'VIGENTE'", [d.id]);
      await cli.query("INSERT INTO doc.versiones (documento_id, version, estado, creado_por) VALUES ($1,$2,'VIGENTE',$3)", [d.id, version, quien.usuario]);
    }
    return d.id;
  });
  const d = await docPorId(out);
  res.json({ ok: true, data: salida(d, await rutaDe(d.id)) });
}));

/* Proforma aceptada por el cliente: la versión queda bloqueada */
router.post('/:codigo/aceptar', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const d = await docPorCodigo(req.params.codigo);
  if (!d || String(d.tipo).trim() !== 'PRF') throw new Rechazo(404, 'Proforma no encontrada');
  if (d.estado !== 'EMITIDA') throw new Rechazo(409, d.estado === 'ACEPTADA' ? 'La proforma ya estaba aceptada' : `Una proforma ${d.estado.toLowerCase()} no se puede aceptar`);
  const permiso = C.puedeEmitir(quien, d.area, await C.tipoPorSigla('PRF'));
  if (!permiso.ok) throw new Rechazo(403, permiso.error);
  await enTransaccion(async cli => {
    await cli.query("UPDATE doc.documentos SET estado = 'ACEPTADA', version_aceptada = version, actualizado_en = now() WHERE id = $1", [d.id]);
    await anotar(cli, d, quien, 'APRUEBA', { orden: 997, area: d.area, comentario: `Aceptada por el cliente (v${d.version})` });
  });
  res.json({ ok: true, data: salida(await docPorId(d.id)) });
}));

/* ─── Anular ───────────────────────────────────────────────────────── */
router.post('/:codigo/anular', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const motivo = limpio((req.body || {}).motivo);
  if (!motivo) throw new Rechazo(400, 'Escribe el motivo de la anulación');
  const d = await docPorCodigo(req.params.codigo);
  if (!d || !d.codigo) throw new Rechazo(404, 'Documento no encontrado');
  const tipo = await C.tipoPorSigla(d.tipo);
  if (tipo.clase === 'REGISTRO') throw new Rechazo(409, tipo.sigla === 'CAS' ? 'Un caso no se anula: se cierra' : 'Un registro no se anula: se desactiva');
  if (['ANULADO', 'RECHAZADO'].includes(d.estado)) throw new Rechazo(409, `El documento ya está ${d.estado.toLowerCase()}`);
  const p = C.puedeEmitir(quien, d.area, { ...tipo, emite_nivel_min: 3 });
  if (!p.ok) throw new Rechazo(403, 'Anular le corresponde a un nivel N3 o superior del área dueña (o ADG)');
  await enTransaccion(async cli => {
    await cli.query("UPDATE doc.documentos SET estado = 'ANULADO', motivo_anulacion = $2, actualizado_en = now() WHERE id = $1", [d.id, motivo]);
    await anotar(cli, d, quien, 'ANULA', { orden: 999, area: d.area, comentario: motivo });
  });
  res.json({ ok: true, data: salida(await docPorId(d.id)) });
}));

/* ─── Registros: activar, desactivar, cerrar, reabrir ──────────────── */
router.post('/:codigo/estado', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const estado = String((req.body || {}).estado || '').toUpperCase();
  const d = await docPorCodigo(req.params.codigo);
  if (!d || !d.codigo) throw new Rechazo(404, 'Registro no encontrado');
  const tipo = await C.tipoPorSigla(d.tipo);
  if (tipo.clase !== 'REGISTRO') throw new Rechazo(409, 'Solo los clientes, proyectos y casos cambian de estado así');
  const validos = tipo.sigla === 'CAS' ? ['ABIERTO', 'CERRADO'] : ['ACTIVO', 'INACTIVO'];
  if (!validos.includes(estado)) throw new Rechazo(400, `Estado no válido: usa ${validos.join(' o ')}`);
  const p = C.puedeEmitir(quien, d.area, tipo);
  if (!p.ok) throw new Rechazo(403, p.error);
  await enTransaccion(async cli => {
    await cli.query('UPDATE doc.documentos SET estado = $2, actualizado_en = now() WHERE id = $1', [d.id, estado]);
    await anotar(cli, d, quien, 'ARCHIVA', { orden: 996, area: d.area, comentario: `${d.estado} → ${estado}${limpio(req.body.comentario) ? ': ' + req.body.comentario.trim() : ''}` });
  });
  res.json({ ok: true, data: salida(await docPorId(d.id)) });
}));

/* ─── Documentos externos (hechos fuera del sistema) ───────────────── */
router.post('/externo', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const b = req.body || {};
  const area = String(b.area || '').trim().toUpperCase();
  if (!(quien.esADG || (quien.sigla === area && quien.nivel && quien.nivel <= 3))) {
    throw new Rechazo(403, 'Pueden registrar documentos externos el Jefe (N3) de cada área, solo para su área, y ADG para cualquier área');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_documento || '')) throw new Rechazo(400, 'Indica la fecha del documento original');
  if (!limpio(b.enlace_externo) || !/^https:\/\//i.test(b.enlace_externo)) throw new Rechazo(400, 'Pega el enlace de Drive del documento (https://…)');
  const out = await enTransaccion(async cli => {
    const { doc } = await crearBorrador(cli, { ...quien, esADG: true }, { ...b, area, modulo: 'EXTERNO', emitir: false });
    return emitir(cli, { ...quien, esADG: true }, doc.id);
  });
  res.status(201).json({ ok: true, data: salida(out) });
}));

/* Membrete, línea de ruta, firmas y leyendas para imprimir (plantilla común) */
router.get('/membrete/:codigo', manejar(async (req, res) => {
  const quien = await C.quienEs(req.user);
  const d = await docPorCodigo(req.params.codigo);
  if (!d) throw new Rechazo(404, 'Documento no encontrado');
  const ruta = await rutaDe(d.id);
  if (!puedeVer(quien, d, ruta)) throw new Rechazo(403, 'No tienes acceso a este documento');
  const [tipo, empresa] = await Promise.all([C.tipoPorSigla(d.tipo), C.datosEmpresa()]);
  res.json({ ok: true, data: C.datosMembrete(d, ruta, tipo, empresa) });
}));

module.exports = router;
// Para que los módulos (ORH, ODN, OTI…) emitan sus documentos dentro de su propia transacción
module.exports.servicio = { crearBorrador, emitir, docPorCodigo, docPorId, rutaDe, anotar, anularPorReemplazo, Rechazo };
