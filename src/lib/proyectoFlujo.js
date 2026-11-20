'use strict';
/* ============================================================
   Flujo de proyectos con etapas y puertas («Flujo de Proyectos QUBIRA»).
   Cada proyecto avanza de etapa solo cuando quien corresponde aprueba la
   puerta y se cumplen sus requisitos. Ruta A: producto propio (nace en
   ADG/GG). Ruta B: proyecto para un cliente (nace en una venta de ODN).
   Los proyectos anteriores al flujo quedan con etapa NULL hasta que ADG o
   GG los incorporan. Normas: ISO 31000 (registro de riesgos) e
   ISO/IEC 27002 (8.31 ambientes separados, 8.33 datos de prueba).
   ============================================================ */
const crypto = require('crypto');
const { pool } = require('../db');
const C = require('./codificacion');

const ETAPAS = {
  evaluacion: { nombre: 'Evaluación', quien: 'ADG aprueba el proyecto, su modalidad y el presupuesto máximo' },
  venta: { nombre: 'Venta', quien: 'GG abre el proyecto cuando el contrato con el cliente está aprobado' },
  apertura: { nombre: 'Apertura', quien: 'GG (Gerente de Proyectos) lo asigna a OTI con plazo' },
  desarrollo: { nombre: 'Desarrollo Scrum', quien: 'OTI (Jefe de OTI o Líder de QA) declara la versión lista' },
  comision: { nombre: 'Comisión de prueba', quien: 'El Jefe de OTI cierra la comisión con su informe OTI-INF aprobado' },
  especialistas: { nombre: 'Reunión de especialistas', quien: 'GG (Gerente de Proyectos) registra la reunión previa' },
  auditorias: { nombre: 'Auditorías finales', quien: 'GG (Gerente de Proyectos) junta las tres actas aprobadas' },
  precio: { nombre: 'Precio', quien: 'OPP fija el precio de venta, de alquiler y el precio mínimo' },
  liberacion: { nombre: 'Liberación', quien: 'ADG aprueba el precio y libera el producto al catálogo de ODN' },
  entrega: { nombre: 'Entrega', quien: 'OCOS registra el acta de conformidad firmada' },
  postventa: { nombre: 'Postventa', quien: null },
};
const MODALIDADES = ['venta', 'alquiler', 'ambos', 'interno'];
function secuencia(ruta, modalidad) {
  if (ruta === 'B') return ['venta', 'apertura', 'desarrollo', 'comision', 'especialistas', 'auditorias', 'entrega', 'postventa'];
  if (modalidad === 'interno') return ['evaluacion', 'apertura', 'desarrollo', 'comision', 'especialistas', 'auditorias', 'entrega', 'postventa'];
  return ['evaluacion', 'apertura', 'desarrollo', 'comision', 'especialistas', 'auditorias', 'precio', 'liberacion', 'postventa'];
}
// Quién aprueba la puerta de cada etapa: [sigla del área, nivel máximo]. ADG (N1) puede en todas.
const PUERTA = {
  evaluacion: [['ADG', 3]], venta: [['GG', 2]], apertura: [['GG', 2]], desarrollo: [['OTI', 5]], comision: [['OTI', 3]],
  especialistas: [['GG', 2]], auditorias: [['GG', 2]], precio: [['OPP', 3]], liberacion: [['ADG', 3]], entrega: [['OCOS', 3], ['GG', 2]],
};
const DEVUELVEN = [['GG', 2], ['OTI', 5], ['DST', 6], ['ODACL', 6]]; // y ADG
const DEVOLVIBLES = ['comision', 'especialistas', 'auditorias'];
const EDITAN_RIESGOS = [['GG', 6], ['DST', 6], ['OPP', 6], ['ODACL', 6], ['OTI', 5]];
const VEN_FLUJO = ['ADG', 'GG', 'OTI', 'OPP', 'ODACL', 'DST', 'OCOS', 'ODN'];

class Rechazo extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const cumple = (quien, lista) => !!quien && (quien.esADG || lista.some(([a, n]) => quien.sigla === a && quien.nivel && quien.nivel <= n));
const num = v => (v === undefined || v === null || v === '' ? null : Number(v));
const texto = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

/* ─── Esquema ─────────────────────────────────────────────────────── */
let listo = null;
function asegurarFlujo() {
  if (!listo) listo = pool.query(`
    ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS flujo_ruta TEXT;
    ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS flujo_etapa TEXT;
    ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS flujo_modalidad TEXT;
    ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS presupuesto_max NUMERIC;
    ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS costo_real NUMERIC;
    ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS exceso_aprobado NUMERIC;
    ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS contrato_codigo TEXT;
    ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS acta_conformidad TEXT;
    ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS riesgos JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE TABLE IF NOT EXISTS ti.proyecto_flujo_hist (
      id BIGSERIAL PRIMARY KEY, project_id TEXT NOT NULL, etapa TEXT, a_etapa TEXT, accion TEXT NOT NULL,
      usuario TEXT, usuario_nombre TEXT, area TEXT, comentario TEXT, fecha TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS proyecto_flujo_hist_idx ON ti.proyecto_flujo_hist(project_id, fecha);
    CREATE TABLE IF NOT EXISTS ti.flujo_config (clave TEXT PRIMARY KEY, valor JSONB NOT NULL);
    INSERT INTO ti.flujo_config (clave, valor) VALUES ('alerta_pct', '15'), ('venta_grande', 'null') ON CONFLICT (clave) DO NOTHING;`)
    .catch(e => { listo = null; throw e; });
  return listo;
}
async function config() {
  await asegurarFlujo();
  const { rows } = await pool.query('SELECT clave, valor FROM ti.flujo_config');
  const c = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
  return { alerta_pct: Number(c.alerta_pct) >= 0 ? Number(c.alerta_pct) : 15, venta_grande: c.venta_grande == null ? null : Number(c.venta_grande) };
}

/* ─── Datos del proyecto ─────────────────────────────────────────── */
async function actasDe(id) {
  const { rows } = await pool.query(`
    SELECT a.id, a.tipo, a.estado, a.codigo, d.estado AS doc_estado
      FROM ti.auditorias_calidad a LEFT JOIN doc.documentos d ON d.modulo = 'TI-ACTAS' AND d.id_origen = a.id
     WHERE (a.project_id = $1 OR COALESCE(a.datos->'proyectos_ids', '[]'::jsonb) ? $1) AND a.estado <> 'anulada'
     ORDER BY a.updated_at DESC`, [id]).catch(() => ({ rows: [] }));
  const out = {};
  for (const t of ['comision', 'seguridad', 'calidad', 'reglas']) {
    const de = rows.filter(r => r.tipo === t);
    const ok = de.find(r => ['APROBADO', 'ARCHIVADO'].includes(r.doc_estado) || ['emitida', 'cerrada'].includes(r.estado));
    const x = ok || de[0];
    out[t] = x ? { codigo: x.codigo, estado: x.estado, doc_estado: x.doc_estado || null, aprobada: !!ok } : null;
  }
  return out;
}
async function contratoDe(codigo) {
  if (!codigo) return null;
  const { rows } = await pool.query("SELECT codigo, estado, titulo FROM doc.documentos WHERE upper(codigo) = upper($1) AND tipo = 'CTR'", [codigo]).catch(() => ({ rows: [] }));
  return rows[0] ? { ...rows[0], aprobado: ['APROBADO', 'ARCHIVADO'].includes(rows[0].estado) } : { codigo, estado: null, aprobado: false };
}
function alertaCosto(p, cfg) {
  const tope = Number(p.presupuesto_max) || 0, real = Number(p.costo_real) || 0;
  const limite = tope * (1 + cfg.alerta_pct / 100);
  const activa = tope > 0 && real > limite && real > (Number(p.exceso_aprobado) || 0);
  return { presupuesto_max: tope || null, costo_real: real || null, limite: tope ? Math.round(limite * 100) / 100 : null, pct: cfg.alerta_pct, activa, exceso_aprobado: num(p.exceso_aprobado) };
}

/* Requisitos de la puerta de la etapa actual. `datos` trae lo que se completa al aprobar. */
function requisitos(p, ctx, datos = {}) {
  const r = [], R = (t, ok) => r.push({ texto: t, ok: !!ok });
  const sinExceso = () => R(`Sin exceso de costo pendiente de decisión (más de ${ctx.costo.pct} % sobre el presupuesto máximo)`, !ctx.costo.activa);
  const riesgos = Array.isArray(p.riesgos) ? p.riesgos : [];
  switch (p.flujo_etapa) {
    case 'evaluacion':
      R('Modalidad definida: venta, alquiler, ambos o uso interno', MODALIDADES.includes(datos.modalidad || p.flujo_modalidad));
      R('Presupuesto máximo aprobado', (num(datos.presupuesto_max) ?? num(p.presupuesto_max)) > 0);
      R('Registro de riesgos abierto con al menos un riesgo (ISO 31000)', riesgos.length > 0);
      break;
    case 'venta':
      R('Contrato con el cliente registrado', !!(datos.contrato_codigo || p.contrato_codigo));
      R('Contrato aprobado por ADG (revisado por ODACL)', ctx.contrato && ctx.contrato.aprobado);
      break;
    case 'apertura':
      R('Plazo de entrega definido', !!(datos.end_date || p.end_date));
      if (p.flujo_ruta === 'B') R('Contrato aprobado', ctx.contrato && ctx.contrato.aprobado);
      break;
    case 'desarrollo':
      R('OTI tomó el proyecto', !!p.claimed_by);
      sinExceso();
      break;
    case 'comision':
      R('Informe de la comisión de prueba (OTI-INF) aprobado', ctx.actas.comision && ctx.actas.comision.aprobada);
      break;
    case 'especialistas':
      R('Resumen de la reunión de especialistas (en el comentario)', !!texto(datos.comentario));
      break;
    case 'auditorias':
      R('Acta de seguridad aprobada (DST)', ctx.actas.seguridad && ctx.actas.seguridad.aprobada);
      R('Acta de calidad de software aprobada (GG)', ctx.actas.calidad && ctx.actas.calidad.aprobada);
      R('Acta de reglas de negocio aprobada (ODACL)', ctx.actas.reglas && ctx.actas.reglas.aprobada);
      R('Sin riesgos altos abiertos sin tratamiento', !riesgos.some(x => x.estado === 'abierto' && (x.probabilidad * x.impacto) >= 15 && !texto(x.tratamiento)));
      sinExceso();
      break;
    case 'precio': {
      const mod = p.flujo_modalidad;
      R('Valorización de OPP terminada', p.opp_pricing_status === 'priced');
      if (mod !== 'alquiler') R('Precio mínimo de venta fijado', num(p.sale_price_min) > 0);
      if (mod === 'alquiler' || mod === 'ambos') R('Precio mínimo de alquiler fijado', num(p.rental_price_min) > 0);
      break;
    }
    case 'liberacion':
      R('Precio fijado por OPP', p.opp_pricing_status === 'priced');
      break;
    case 'entrega':
      R('Acta de conformidad registrada (ODACL-FMT-03)', !!texto(datos.acta_conformidad || p.acta_conformidad));
      break;
    default: break;
  }
  return r;
}

async function cargar(id, cli = pool, bloquear = false) {
  const { rows } = await cli.query(`SELECT * FROM ti.projects WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
  if (!rows.length) throw new Rechazo(404, 'Proyecto no encontrado');
  return rows[0];
}
async function contexto(p) {
  const [cfg, actas, contrato] = await Promise.all([config(), actasDe(p.id), contratoDe(p.contrato_codigo)]);
  return { cfg, actas, contrato, costo: alertaCosto(p, cfg) };
}
async function puedeVer(quien) { return quien.esADG || VEN_FLUJO.includes(quien.sigla); }

/* Vista del proyecto en el flujo, desde la mirada de quien consulta */
async function vista(p, quien, conDetalle = true) {
  const ctx = await contexto(p);
  const seq = p.flujo_etapa ? secuencia(p.flujo_ruta, p.flujo_modalidad) : [];
  const etapa = p.flujo_etapa;
  const base = {
    id: p.id, code: p.code, name: p.name, client: p.client, status: p.status, ruta: p.flujo_ruta, modalidad: p.flujo_modalidad, etapa,
    etapa_nombre: etapa ? ETAPAS[etapa].nombre : null, costo: ctx.costo,
    pendiente: etapa && ETAPAS[etapa].quien ? ETAPAS[etapa].quien : null,
    puedo_aprobar: !!(etapa && PUERTA[etapa] && cumple(quien, PUERTA[etapa]) && !(etapa === 'evaluacion' && String(p.created_by) === String(quien.id))),
  };
  if (!conDetalle) return base;
  const { rows: hist } = await pool.query('SELECT etapa, a_etapa, accion, usuario_nombre, area, comentario, fecha FROM ti.proyecto_flujo_hist WHERE project_id = $1 ORDER BY fecha DESC LIMIT 100', [p.id]);
  return {
    ...base,
    secuencia: seq.map(k => ({ clave: k, nombre: ETAPAS[k].nombre })),
    requisitos: etapa ? requisitos(p, ctx) : [],
    puedo_devolver: DEVOLVIBLES.includes(etapa) && cumple(quien, DEVUELVEN),
    puedo_riesgos: cumple(quien, EDITAN_RIESGOS),
    mi_area: quien.sigla || null,
    puedo_costo: cumple(quien, [['OPP', 6], ['GG', 2]]),
    puedo_presupuesto: !!quien.esADG,
    puedo_exceso: cumple(quien, [['GG', 2]]),
    puedo_incorporar: !etapa && cumple(quien, [['GG', 2]]),
    actas: ctx.actas, contrato: ctx.contrato, end_date: p.end_date, presupuesto_max: num(p.presupuesto_max),
    acta_conformidad: p.acta_conformidad, contrato_codigo: p.contrato_codigo,
    riesgos: Array.isArray(p.riesgos) ? p.riesgos : [], historial: hist,
    precios: { opp_pricing_status: p.opp_pricing_status, sale_price_min: num(p.sale_price_min), rental_price_min: num(p.rental_price_min) },
  };
}

/* ─── Acciones ────────────────────────────────────────────────────── */
async function enTx(fn) {
  const cli = await pool.connect();
  try { await cli.query('BEGIN'); const r = await fn(cli); await cli.query('COMMIT'); return r; }
  catch (e) { await cli.query('ROLLBACK').catch(() => {}); throw e; }
  finally { cli.release(); }
}
const anotar = (cli, p, quien, accion, { etapa, a_etapa, comentario } = {}) => cli.query(
  'INSERT INTO ti.proyecto_flujo_hist (project_id, etapa, a_etapa, accion, usuario, usuario_nombre, area, comentario) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
  [p.id, etapa === undefined ? p.flujo_etapa : etapa, a_etapa || null, accion, quien.usuario, quien.nombre, quien.sigla, texto(comentario, 2000) || null]);

async function avanzar(id, quien, b = {}) {
  await asegurarFlujo();
  // Actas, contrato y costos se leen antes de bloquear el proyecto; dentro del bloqueo se confirma la etapa
  const previo = await cargar(id);
  const ctxPrevio = await contexto({ ...previo, contrato_codigo: texto(b.contrato_codigo, 40).toUpperCase() || previo.contrato_codigo });
  return enTx(async cli => {
    const p = await cargar(id, cli, true);
    if (p.flujo_etapa !== previo.flujo_etapa) throw new Rechazo(409, 'El proyecto cambió de etapa mientras lo aprobabas. Actualiza la página.');
    const etapa = p.flujo_etapa;
    if (!etapa) throw new Rechazo(409, 'Este proyecto es anterior al flujo: primero incorpóralo');
    if (b.etapa && b.etapa !== etapa) throw new Rechazo(409, `El proyecto ya pasó a «${ETAPAS[etapa].nombre}». Actualiza la página.`);
    if (!PUERTA[etapa]) throw new Rechazo(409, 'El proyecto ya está en su última etapa');
    if (!cumple(quien, PUERTA[etapa])) throw new Rechazo(403, `Esta puerta la aprueba: ${ETAPAS[etapa].quien}.`);
    if (etapa === 'evaluacion' && String(p.created_by) === String(quien.id)) throw new Rechazo(403, 'Nadie aprueba lo que propuso: otra persona de ADG debe aprobar este proyecto (si lo propuso el Director General, el Presidente del Directorio).');
    const datos = {
      modalidad: MODALIDADES.includes(b.modalidad) ? b.modalidad : undefined, presupuesto_max: num(b.presupuesto_max),
      contrato_codigo: texto(b.contrato_codigo, 40).toUpperCase() || undefined, end_date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.end_date || '')) ? b.end_date : undefined,
      acta_conformidad: texto(b.acta_conformidad, 120) || undefined, comentario: b.comentario,
    };
    if (datos.presupuesto_max !== null && !(datos.presupuesto_max >= 0)) throw new Rechazo(400, 'El presupuesto máximo debe ser un número mayor que cero');
    const pp = { ...p, flujo_modalidad: datos.modalidad || p.flujo_modalidad, contrato_codigo: datos.contrato_codigo || p.contrato_codigo };
    const ctx = { ...ctxPrevio, costo: alertaCosto(p, ctxPrevio.cfg) };
    const falta = requisitos(pp, ctx, datos).filter(x => !x.ok);
    if (falta.length) throw new Rechazo(409, 'Falta: ' + falta.map(x => x.texto).join(' · '));
    const seq = secuencia(pp.flujo_ruta, pp.flujo_modalidad);
    const siguiente = seq[seq.indexOf(etapa) + 1];
    const sets = ['flujo_etapa = $2', 'updated_at = now()'], vals = [p.id, siguiente];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (etapa === 'evaluacion') { set('flujo_modalidad', pp.flujo_modalidad); if (datos.presupuesto_max) set('presupuesto_max', datos.presupuesto_max); }
    if (datos.contrato_codigo) set('contrato_codigo', datos.contrato_codigo);
    if (etapa === 'apertura' && datos.end_date) set('end_date', datos.end_date);
    if (etapa === 'entrega') set('acta_conformidad', datos.acta_conformidad || p.acta_conformidad);
    if (etapa === 'liberacion') set('show_to_comercial', true);
    await cli.query(`UPDATE ti.projects SET ${sets.join(', ')} WHERE id = $1`, vals);
    await anotar(cli, p, quien, 'APRUEBA', { a_etapa: siguiente, comentario: datos.comentario });
    return siguiente;
  });
}

async function devolver(id, quien, comentario) {
  await asegurarFlujo();
  if (!texto(comentario)) throw new Rechazo(400, 'Escribe qué debe corregir OTI');
  return enTx(async cli => {
    const p = await cargar(id, cli, true);
    if (!DEVOLVIBLES.includes(p.flujo_etapa)) throw new Rechazo(409, 'Solo se devuelve a OTI desde la comisión de prueba, la reunión de especialistas o las auditorías');
    if (!cumple(quien, DEVUELVEN)) throw new Rechazo(403, 'Devuelven a OTI: GG, OTI (N5+), DST y ODACL (N6+) o ADG');
    await cli.query("UPDATE ti.projects SET flujo_etapa = 'desarrollo', updated_at = now() WHERE id = $1", [p.id]);
    await anotar(cli, p, quien, 'DEVUELVE', { a_etapa: 'desarrollo', comentario });
    return 'desarrollo';
  });
}

async function incorporar(id, quien, b = {}) {
  await asegurarFlujo();
  if (!cumple(quien, [['GG', 2]])) throw new Rechazo(403, 'Incorporan proyectos al flujo ADG o GG');
  const ruta = b.ruta === 'B' ? 'B' : 'A';
  const modalidad = MODALIDADES.includes(b.modalidad) ? b.modalidad : null;
  const seq = secuencia(ruta, modalidad);
  if (!seq.includes(b.etapa)) throw new Rechazo(400, 'Elige una etapa válida para esa ruta');
  return enTx(async cli => {
    const p = await cargar(id, cli, true);
    if (p.flujo_etapa) throw new Rechazo(409, 'El proyecto ya está en el flujo');
    await cli.query('UPDATE ti.projects SET flujo_ruta = $2, flujo_etapa = $3, flujo_modalidad = $4, contrato_codigo = COALESCE($5, contrato_codigo), updated_at = now() WHERE id = $1',
      [p.id, ruta, b.etapa, modalidad, texto(b.contrato_codigo, 40).toUpperCase() || null]);
    await anotar(cli, p, quien, 'INCORPORA', { etapa: null, a_etapa: b.etapa, comentario: b.comentario || `Ruta ${ruta}` });
    return b.etapa;
  });
}

async function costos(id, quien, b = {}) {
  await asegurarFlujo();
  return enTx(async cli => {
    const p = await cargar(id, cli, true);
    const cambios = [];
    if (b.costo_real !== undefined) {
      if (!cumple(quien, [['OPP', 6], ['GG', 2]])) throw new Rechazo(403, 'El costo real lo registra OPP (o GG / ADG)');
      const v = num(b.costo_real); if (!(v >= 0)) throw new Rechazo(400, 'El costo real debe ser un número');
      await cli.query('UPDATE ti.projects SET costo_real = $2, updated_at = now() WHERE id = $1', [p.id, v]); cambios.push(`costo real ${v}`);
    }
    if (b.presupuesto_max !== undefined) {
      if (!quien.esADG) throw new Rechazo(403, 'El presupuesto máximo lo aprueba ADG');
      const v = num(b.presupuesto_max); if (!(v > 0)) throw new Rechazo(400, 'El presupuesto máximo debe ser mayor que cero');
      await cli.query('UPDATE ti.projects SET presupuesto_max = $2, updated_at = now() WHERE id = $1', [p.id, v]); cambios.push(`presupuesto máximo ${v}`);
    }
    if (!cambios.length) throw new Rechazo(400, 'No hay cambios');
    await anotar(cli, p, quien, 'COSTO', { comentario: cambios.join(' · ') });
  });
}

async function exceso(id, quien, b = {}) {
  await asegurarFlujo();
  if (!cumple(quien, [['GG', 2]])) throw new Rechazo(403, 'Ante un exceso de costo deciden GG o ADG');
  if (!['continuar', 'detener'].includes(b.decision)) throw new Rechazo(400, 'Elige continuar o detener');
  if (!texto(b.comentario)) throw new Rechazo(400, 'Escribe el motivo de la decisión');
  return enTx(async cli => {
    const p = await cargar(id, cli, true);
    if (!alertaCosto(p, await config()).activa) throw new Rechazo(409, 'No hay un exceso de costo pendiente');
    if (b.decision === 'continuar') await cli.query('UPDATE ti.projects SET exceso_aprobado = costo_real, updated_at = now() WHERE id = $1', [p.id]);
    else await cli.query("UPDATE ti.projects SET status = 'paused', updated_at = now() WHERE id = $1", [p.id]);
    await anotar(cli, p, quien, b.decision === 'continuar' ? 'EXCESO CONTINÚA' : 'EXCESO DETIENE', { comentario: b.comentario });
  });
}

const TIPOS_RIESGO = ['negocio', 'legal', 'seguridad', 'tecnico', 'financiero'];
async function riesgo(id, quien, b = {}, rid = null) {
  await asegurarFlujo();
  if (!cumple(quien, EDITAN_RIESGOS)) throw new Rechazo(403, 'El registro de riesgos lo llevan GG, DST, OPP, ODACL (N6+), OTI (N5+) y ADG');
  return enTx(async cli => {
    const p = await cargar(id, cli, true);
    const lista = Array.isArray(p.riesgos) ? p.riesgos : [];
    const n15 = v => { const x = parseInt(v, 10); return x >= 1 && x <= 5 ? x : null; };
    let accion;
    if (!rid) {
      const r = { id: crypto.randomUUID().slice(0, 8), riesgo: texto(b.riesgo, 300), tipo: TIPOS_RIESGO.includes(b.tipo) ? b.tipo : 'negocio',
        probabilidad: n15(b.probabilidad), impacto: n15(b.impacto), tratamiento: texto(b.tratamiento, 500), responsable: texto(b.responsable, 20).toUpperCase() || quien.sigla,
        estado: 'abierto', registrado_por: quien.nombre, fecha: new Date().toISOString() };
      if (!r.riesgo || !r.probabilidad || !r.impacto) throw new Rechazo(400, 'Escribe el riesgo y su probabilidad e impacto (1 a 5)');
      lista.push(r); accion = `Riesgo agregado: ${r.riesgo} (nivel ${r.probabilidad * r.impacto})`;
    } else {
      const r = lista.find(x => x.id === rid); if (!r) throw new Rechazo(404, 'Riesgo no encontrado');
      if (b.tratamiento !== undefined) r.tratamiento = texto(b.tratamiento, 500);
      if (['abierto', 'mitigado', 'cerrado'].includes(b.estado)) r.estado = b.estado;
      if (n15(b.probabilidad)) r.probabilidad = n15(b.probabilidad);
      if (n15(b.impacto)) r.impacto = n15(b.impacto);
      r.actualizado_por = quien.nombre; r.actualizado = new Date().toISOString();
      accion = `Riesgo actualizado: ${r.riesgo} → ${r.estado}`;
    }
    await cli.query('UPDATE ti.projects SET riesgos = $2::jsonb, updated_at = now() WHERE id = $1', [p.id, JSON.stringify(lista)]);
    await anotar(cli, p, quien, 'RIESGO', { comentario: accion });
  });
}

async function guardarConfig(quien, b = {}) {
  await asegurarFlujo();
  if (!(quien.esADG && quien.nivel <= 2)) throw new Rechazo(403, 'La configuración del flujo la cambia ADG (N1–N2)');
  if (b.alerta_pct !== undefined) { const v = num(b.alerta_pct); if (!(v >= 0 && v <= 100)) throw new Rechazo(400, 'El margen debe estar entre 0 y 100'); await pool.query("UPDATE ti.flujo_config SET valor = $1 WHERE clave = 'alerta_pct'", [JSON.stringify(v)]); }
  if (b.venta_grande !== undefined) { const v = b.venta_grande === null || b.venta_grande === '' ? null : num(b.venta_grande); if (v !== null && !(v > 0)) throw new Rechazo(400, 'El monto de venta grande debe ser mayor que cero'); await pool.query("UPDATE ti.flujo_config SET valor = $1 WHERE clave = 'venta_grande'", [JSON.stringify(v)]); }
  return config();
}

/* Reglas que ti.js aplica a los proyectos del flujo */
const ANTES_DE_ABRIR = ['evaluacion', 'venta', 'apertura'];
const ANTES_DE_AUDITAR = ['evaluacion', 'venta', 'apertura', 'desarrollo', 'comision', 'especialistas', 'auditorias'];

module.exports = { ETAPAS, MODALIDADES, secuencia, asegurarFlujo, config, guardarConfig, vista, cargar, puedeVer, avanzar, devolver, incorporar, costos, exceso, riesgo, Rechazo, C, ANTES_DE_ABRIR, ANTES_DE_AUDITAR };
