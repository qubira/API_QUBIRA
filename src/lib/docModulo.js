'use strict';

/* ============================================================
   Integración de los módulos con el registro de documentos
   (CODIFICACION.md, fase 3). Cada módulo (ODN, OTI, DST, ODACL,
   ORH, OCOS) guarda sus datos en sus tablas y pide aquí:
   - el código, al emitir (lo asigna siempre el servidor);
   - anular (documentos), desactivar (clientes, proyectos) o cerrar (casos);
   - sincronizar versiones y la aceptación de proformas.
   El área del código es la del módulo responsable, no la de quien crea
   (el acceso al módulo ya lo comprobó su router).
   ============================================================ */
const { pool } = require('../db');
const C = require('./codificacion');

const svc = () => require('../routes/documentos').servicio;
class ErrorModulo extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function enTransaccion(cli, fn) {
  if (cli) return fn(cli);
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

/* Emite el documento de un registro del módulo y devuelve la fila de doc.documentos
   (con su `codigo`). datos: { tipo, area, titulo, detalle, modulo, id_origen,
   referencia, referencia_version, reemplaza_a, codigo_anterior, formato_codigo, formato_version }.
   idOrigenEsCodigo: el registro del módulo usa el propio código como id. */
async function emitirRegistro(user, datos, { cli = null, idOrigenEsCodigo = false } = {}) {
  await C.asegurarCodificacion();
  const quien = await C.quienEs(user);
  const porModulo = { ...quien, esADG: true }; // ver nota de cabecera
  return enTransaccion(cli, async c => {
    const { crearBorrador, emitir } = svc();
    const { doc } = await crearBorrador(c, porModulo, datos);
    const e = await emitir(c, porModulo, doc.id);
    if (idOrigenEsCodigo) await c.query('UPDATE doc.documentos SET id_origen = $2 WHERE id = $1', [e.id, e.codigo]);
    return { ...e, id_origen: idOrigenEsCodigo ? e.codigo : e.id_origen };
  });
}

async function docDe(modulo, idOrigen) {
  try {
    const { rows } = await pool.query('SELECT * FROM doc.documentos WHERE modulo = $1 AND id_origen = $2', [modulo, String(idOrigen)]);
    return rows[0] || null;
  } catch { return null; }
}
/* Estado en el registro de varios registros del módulo: { id_origen: { codigo, estado, version, pendiente } } */
async function estadosDe(modulo, ids) {
  const lista = (ids || []).filter(Boolean).map(String);
  if (!lista.length) return {};
  try {
    const { rows } = await pool.query(`
      SELECT d.id_origen, d.codigo, d.estado, d.version, d.version_aceptada,
             (SELECT json_build_object('area', r.area, 'accion', r.accion) FROM doc.ruta r
               WHERE r.documento_id = d.id AND r.planificado AND r.fecha IS NULL ORDER BY r.ronda DESC, r.orden LIMIT 1) AS pendiente
        FROM doc.documentos d WHERE d.modulo = $1 AND d.id_origen = ANY($2)`, [modulo, lista]);
    return Object.fromEntries(rows.map(r => [r.id_origen, r]));
  } catch { return {}; }
}

/* Anular (documentos y proformas). Lo hace el nivel N3+ del área dueña o ADG, con motivo. */
async function anular(user, modulo, idOrigen, motivo, { cli = null } = {}) {
  if (!String(motivo || '').trim()) throw new ErrorModulo(400, 'Escribe el motivo de la anulación');
  const d = await docDe(modulo, idOrigen);
  if (!d) return null; // registro anterior a la codificación: el módulo decide
  const tipo = await C.tipoPorSigla(d.tipo);
  if (tipo.clase === 'REGISTRO') throw new ErrorModulo(409, tipo.sigla === 'CAS' ? 'Un caso no se anula: se cierra' : 'Un registro no se anula: se desactiva');
  if (['ANULADO', 'RECHAZADO'].includes(d.estado)) throw new ErrorModulo(409, `${d.codigo} ya está ${d.estado.toLowerCase()}`);
  const quien = await C.quienEs(user);
  const p = C.puedeEmitir(quien, d.area, { ...tipo, emite_nivel_min: 3 });
  if (!p.ok) throw new ErrorModulo(403, `Anular ${d.codigo} le corresponde a un nivel N3 o superior de ${d.area} (o ADG)`);
  return enTransaccion(cli, async c => {
    await c.query("UPDATE doc.documentos SET estado = 'ANULADO', motivo_anulacion = $2, actualizado_en = now() WHERE id = $1", [d.id, motivo.trim()]);
    await svc().anotar(c, d, quien, 'ANULA', { orden: 999, area: d.area, comentario: motivo.trim() });
    return { ...d, estado: 'ANULADO' };
  });
}

/* Registros (CLI, PRY, CAS): ACTIVO/INACTIVO o ABIERTO/CERRADO */
async function estadoRegistro(user, modulo, idOrigen, estado, comentario, { cli = null } = {}) {
  const d = await docDe(modulo, idOrigen);
  if (!d || d.estado === estado) return d;
  const quien = await C.quienEs(user);
  return enTransaccion(cli, async c => {
    await c.query('UPDATE doc.documentos SET estado = $2, actualizado_en = now() WHERE id = $1', [d.id, estado]);
    await svc().anotar(c, d, quien, 'ARCHIVA', { orden: 996, area: d.area, comentario: `${d.estado} → ${estado}${comentario ? ': ' + comentario : ''}` });
    return { ...d, estado };
  });
}

/* Versión nueva de una proforma o formato desde su módulo: mismo código, no gasta número.
   La aceptada queda bloqueada. */
/* Versión nueva de una proforma: mismo código y vuelve a aprobación desde el inicio
   (ronda nueva). Los pasos que quedaban pendientes de la versión anterior se descartan.
   elevar_adg: venta grande (la aprueba también ADG); si no se indica, se conserva. */
async function nuevaVersion(user, modulo, idOrigen, version, nota, { cli = null, elevar_adg } = {}) {
  const d = await docDe(modulo, idOrigen);
  if (!d) return null;
  if (d.estado === 'ACEPTADA') throw new ErrorModulo(409, `${d.codigo} ya fue aceptada por el cliente (v${d.version_aceptada}): su versión quedó bloqueada. Para negociar algo distinto, emite una proforma nueva.`);
  if (['ANULADO', 'RECHAZADO'].includes(d.estado)) throw new ErrorModulo(409, `${d.codigo} está ${d.estado.toLowerCase()}`);
  const quien = await C.quienEs(user);
  return enTransaccion(cli, async c => {
    const tipo = await C.tipoPorSigla(d.tipo);
    const elevar = elevar_adg === undefined ? !!d.elevar_adg : !!elevar_adg;
    const { rows: ruta } = await c.query('SELECT ronda FROM doc.ruta WHERE documento_id = $1', [d.id]);
    const ronda = Math.max(1, ...ruta.map(p => p.ronda)) + 1;
    await c.query('DELETE FROM doc.ruta WHERE documento_id = $1 AND planificado AND fecha IS NULL', [d.id]);
    await svc().anotar(c, d, quien, 'CREA', { ronda, orden: 0, area: d.area, comentario: `Versión ${version}${nota ? ' — ' + nota : ''}` });
    const pasos = C.rutaPara(tipo, { ...d, elevar_adg: elevar });
    let orden = 1;
    for (const p of pasos) await c.query('INSERT INTO doc.ruta (documento_id, ronda, orden, area, accion, nivel_min, planificado) VALUES ($1,$2,$3,$4,$5,$6,true)', [d.id, ronda, orden++, p.area, p.accion, p.nivel_min || null]);
    await c.query('UPDATE doc.documentos SET version = $2, estado = $3, elevar_adg = $4, actualizado_en = now() WHERE id = $1', [d.id, version, pasos.length ? 'EN RUTA' : C.estadoFinal(tipo), elevar]);
    return { ...d, version, elevar_adg: elevar };
  });
}
/* Antes de crear una versión: falla si la proforma ya fue aceptada */
async function puedeVersionar(modulo, idOrigen) {
  const d = await docDe(modulo, idOrigen);
  if (d && d.estado === 'ACEPTADA') throw new ErrorModulo(409, `${d.codigo} ya fue aceptada por el cliente (v${d.version_aceptada}): su versión quedó bloqueada. Para negociar algo distinto, emite una proforma nueva.`);
  return d;
}

/* Proforma aceptada: necesita estar aprobada (OPP revisó y GG aprobó; ADG también si es venta grande) */
async function aceptar(user, modulo, idOrigen, { cli = null } = {}) {
  const d = await docDe(modulo, idOrigen);
  if (!d) return null;
  if (d.estado === 'ACEPTADA') return d;
  if (d.estado !== 'EMITIDA') {
    throw new ErrorModulo(409, d.estado === 'EN RUTA' || d.estado === 'OBSERVADO'
      ? `${d.codigo} todavía no está aprobada (${d.estado.toLowerCase()}): debe pasar su ruta en el Registro de documentos antes de que el cliente la acepte.`
      : `${d.codigo} está ${d.estado.toLowerCase()} y no se puede aceptar.`);
  }
  const quien = await C.quienEs(user);
  return enTransaccion(cli, async c => {
    await c.query("UPDATE doc.documentos SET estado = 'ACEPTADA', version_aceptada = version, actualizado_en = now() WHERE id = $1", [d.id]);
    await svc().anotar(c, d, quien, 'APRUEBA', { orden: 997, area: d.area, comentario: `Aceptada por el cliente (v${d.version})` });
    return { ...d, estado: 'ACEPTADA', version_aceptada: d.version };
  });
}

/* Un documento con ruta debe estar aprobado antes de pasar a firma/vigencia en su módulo */
async function exigirAprobado(modulo, idOrigen, accion) {
  const d = await docDe(modulo, idOrigen);
  if (!d) return null;
  if (!['APROBADO', 'ARCHIVADO', 'EMITIDA', 'ACEPTADA', 'VIGENTE'].includes(d.estado)) {
    throw new ErrorModulo(409, `${d.codigo} todavía no está aprobado (${d.estado.toLowerCase()}): ${accion} cuando termine su ruta en el Registro de documentos.`);
  }
  return d;
}

/* Inserta el código en el HTML del documento: reemplaza el texto provisional del
   navegador y, si el modelo no tenía lugar para el código, lo agrega arriba.
   Así el servidor garantiza que el texto guardado contiene su código. */
const PROVISIONAL = /[A-Z]{2,5}-[A-Z]{3}-\[SE ASIGNA AL EMITIR\]|\[SE ASIGNA AL EMITIR\]|\[CODIGO_[A-Z_]+\]/g;
function ponerCodigo(html, codigo, ...previos) {
  if (!html) return html;
  let out = String(html).replace(PROVISIONAL, codigo);
  for (const p of previos.filter(Boolean)) out = out.split(p).join(codigo);
  if (!out.includes(codigo)) out = `<p style="text-align:right;font-size:9pt;color:#555;margin:0 0 6pt">N.° ${codigo}</p>` + out;
  return out;
}

const responder = (res, e, contexto) => {
  if (e && (e instanceof ErrorModulo || e.constructor?.name === 'Rechazo') && e.status) return res.status(e.status).json({ ok: false, error: e.message });
  console.error(contexto, e && e.message);
  return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'Error interno' });
};

module.exports = { emitirRegistro, docDe, estadosDe, anular, estadoRegistro, nuevaVersion, puedeVersionar, aceptar, exigirAprobado, ponerCodigo, enTransaccion, ErrorModulo, responder };
