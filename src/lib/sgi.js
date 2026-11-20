'use strict';
/* ============================================================
   Sistema de gestión integrado (ISO/IEC 27001, ISO 31000, ISO 9001…).
   - Mapa de riesgos de la empresa (ISO 31000): riesgos corporativos de cada
     área más los riesgos abiertos de los proyectos. Cada jefe es dueño de los
     de su área; DST (Coordinador de Riesgos y Continuidad) los consolida.
   - Revisión por la dirección (ISO/IEC 27001 9.3, ISO 9001 9.3): al menos una
     vez al año. Sus entradas se reúnen solas (riesgos, auditorías, incidentes,
     soporte, costos, cambios y cobros); la dirección registra decisiones y la
     emite como informe ADG-INF, que aprueba otra persona de ADG.
   ============================================================ */
const crypto = require('crypto');
const { pool } = require('../db');

class Rechazo extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const texto = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const AREAS = ['ADG', 'GG', 'OTI', 'OPP', 'ODACL', 'DST', 'OCOS', 'ODN', 'OCM', 'ORH'];
const TIPOS = ['estrategico', 'operativo', 'seguridad', 'legal', 'financiero', 'tecnologico', 'personas'];

let listo = null;
function asegurar() {
  if (!listo) listo = pool.query(`
    CREATE SCHEMA IF NOT EXISTS sgi;
    CREATE TABLE IF NOT EXISTS sgi.riesgos (
      id TEXT PRIMARY KEY, riesgo TEXT NOT NULL, area TEXT NOT NULL, tipo TEXT NOT NULL, probabilidad INT NOT NULL, impacto INT NOT NULL,
      tratamiento TEXT, responsable TEXT, estado TEXT NOT NULL DEFAULT 'abierto', creado_por TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      actualizado_por TEXT, actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS sgi.revisiones (
      id TEXT PRIMARY KEY, anio INT NOT NULL, fecha DATE NOT NULL DEFAULT CURRENT_DATE, entradas JSONB NOT NULL DEFAULT '{}'::jsonb,
      decisiones JSONB NOT NULL DEFAULT '[]'::jsonb, conclusiones TEXT, estado TEXT NOT NULL DEFAULT 'borrador', codigo TEXT,
      creado_por TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT now());`).catch(e => { listo = null; throw e; });
  return listo;
}

const permisos = q => ({
  ver: q.esADG || q.sigla === 'GG' || q.sigla === 'DST' || (q.nivel && q.nivel <= 3),
  riesgos_todos: q.esADG || (q.sigla === 'GG' && q.nivel <= 2) || (q.sigla === 'DST' && q.nivel <= 4),
  riesgos_area: q.nivel && q.nivel <= 3 ? q.sigla : null,
  revision: q.esADG || (q.sigla === 'GG' && q.nivel <= 2),
  emitir: !!q.esADG,
});
const puedeRiesgo = (q, area) => { const p = permisos(q); return p.riesgos_todos || p.riesgos_area === area; };

/* Lo que una consulta no puede leer (tabla aún no creada) cuenta como vacío */
const q0 = (sql, params) => pool.query(sql, params).then(r => r.rows).catch(() => []);
async function entradas(anio) {
  const desde = `${anio}-01-01`, hasta = `${anio + 1}-01-01`;
  const [proy, actas, inc, casos, cambios, facturas, docs, riesgosCorp] = await Promise.all([
    q0("SELECT name, flujo_etapa, riesgos, cambios, facturas FROM ti.projects WHERE flujo_etapa IS NOT NULL AND status <> 'cancelled'"),
    q0('SELECT tipo, estado, resumen FROM ti.auditorias_calidad WHERE created_at >= $1 AND created_at < $2', [desde, hasta]),
    q0('SELECT datos_personales FROM soporte.casos WHERE seguridad AND created_at >= $1 AND created_at < $2', [desde, hasta]),
    q0("SELECT nivel, area_actual, estado FROM soporte.casos WHERE created_at >= $1 AND created_at < $2", [desde, hasta]),
    Promise.resolve(null), Promise.resolve(null),
    q0("SELECT COUNT(*)::int AS n FROM doc.documentos WHERE estado IN ('EN RUTA', 'OBSERVADO')"),
    q0("SELECT area, probabilidad, impacto, estado FROM sgi.riesgos WHERE estado = 'abierto'"),
  ]);
  const riesgosProy = proy.flatMap(p => (p.riesgos || []).filter(r => r.estado === 'abierto').map(r => ({ ...r, proyecto: p.name })));
  const altos = [...riesgosProy, ...riesgosCorp].filter(r => r.probabilidad * r.impacto >= 15).length;
  const hallazgos = actas.reduce((a, x) => { const ab = (x.resumen || {}).abiertos || {}; ['critico', 'alto', 'medio', 'bajo'].forEach(k => { a[k] += ab[k] || 0; }); return a; }, { critico: 0, alto: 0, medio: 0, bajo: 0 });
  const camb = proy.flatMap(p => p.cambios || []);
  const fact = proy.flatMap(p => p.facturas || []);
  const etapas = proy.reduce((a, p) => { a[p.flujo_etapa] = (a[p.flujo_etapa] || 0) + 1; return a; }, {});
  return {
    anio, generado: new Date().toISOString(),
    proyectos: { total: proy.length, por_etapa: etapas },
    riesgos: { proyectos_abiertos: riesgosProy.length, corporativos_abiertos: riesgosCorp.length, altos_abiertos: altos },
    auditorias: { actas: actas.length, por_tipo: actas.reduce((a, x) => { a[x.tipo] = (a[x.tipo] || 0) + 1; return a; }, {}), hallazgos_abiertos: hallazgos },
    seguridad: { incidentes: inc.length, con_datos_personales: inc.filter(x => x.datos_personales).length },
    soporte: { casos: casos.length, escalados_oti: casos.filter(c => (c.nivel || 1) >= 4).length, abiertos: casos.filter(c => !['solucionado', 'cerrado'].includes(c.estado)).length },
    cambios_alcance: { aprobados: camb.filter(c => c.estado === 'aprobado').length, rechazados: camb.filter(c => c.estado === 'rechazado').length, pendientes: camb.filter(c => ['solicitado', 'valorizado'].includes(c.estado)).length },
    cobros: { facturas: fact.filter(f => !f.sin_monto).length, por_cobrar: fact.filter(f => !f.cobrada).length },
    documentos_en_ruta: (docs[0] || {}).n || 0,
  };
}

async function resumen(q) {
  await asegurar();
  const p = permisos(q);
  if (!p.ver) throw new Rechazo(403, 'El sistema de gestión lo ven ADG, GG, DST y los jefes de oficina');
  const [{ rows: corp }, proy, { rows: revs }] = await Promise.all([
    pool.query('SELECT * FROM sgi.riesgos ORDER BY (probabilidad * impacto) DESC, creado_en'),
    q0("SELECT id, code, name, riesgos FROM ti.projects WHERE flujo_etapa IS NOT NULL AND status <> 'cancelled'"),
    pool.query("SELECT id, anio, to_char(fecha,'YYYY-MM-DD') fecha, estado, codigo, conclusiones, decisiones, entradas, creado_por FROM sgi.revisiones ORDER BY fecha DESC"),
  ]);
  const riesgosProy = proy.flatMap(x => (x.riesgos || []).filter(r => r.estado === 'abierto').map(r => ({ ...r, proyecto: x.name, codigo: x.code })));
  const ultima = revs.find(r => r.estado === 'emitida');
  const vencida = !ultima || (Date.now() - new Date(ultima.fecha + 'T12:00:00Z')) > 365 * 864e5;
  return { permisos: p, normas: require('./jerarquia').NORMAS, riesgos: corp, riesgos_proyectos: riesgosProy, revisiones: p.revision ? revs : revs.map(r => ({ ...r, entradas: undefined })), revision_vencida: vencida, ultima_revision: ultima ? ultima.fecha : null };
}

async function riesgo(q, b = {}, id = null) {
  await asegurar();
  const n15 = v => { const x = parseInt(v, 10); return x >= 1 && x <= 5 ? x : null; };
  if (!id) {
    const area = AREAS.includes(String(b.area || '').toUpperCase()) ? String(b.area).toUpperCase() : null;
    if (!area) throw new Rechazo(400, 'Elige el área dueña del riesgo');
    if (!puedeRiesgo(q, area)) throw new Rechazo(403, 'Registra riesgos de su área el jefe (N3+); de cualquier área, DST (Coordinador de Riesgos), GG o ADG');
    const r = { riesgo: texto(b.riesgo, 400), tipo: TIPOS.includes(b.tipo) ? b.tipo : 'operativo', p: n15(b.probabilidad), i: n15(b.impacto) };
    if (!r.riesgo || !r.p || !r.i) throw new Rechazo(400, 'Escribe el riesgo y su probabilidad e impacto (1 a 5)');
    await pool.query('INSERT INTO sgi.riesgos (id, riesgo, area, tipo, probabilidad, impacto, tratamiento, responsable, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [crypto.randomUUID().slice(0, 10), r.riesgo, area, r.tipo, r.p, r.i, texto(b.tratamiento, 800) || null, texto(b.responsable, 120) || null, q.nombre]);
    return;
  }
  const { rows } = await pool.query('SELECT * FROM sgi.riesgos WHERE id = $1', [id]);
  if (!rows.length) throw new Rechazo(404, 'Riesgo no encontrado');
  if (!puedeRiesgo(q, rows[0].area)) throw new Rechazo(403, 'Este riesgo lo actualiza el jefe de su área, DST, GG o ADG');
  const c = rows[0];
  await pool.query('UPDATE sgi.riesgos SET tratamiento = $2, estado = $3, probabilidad = $4, impacto = $5, responsable = $6, actualizado_por = $7, actualizado_en = now() WHERE id = $1',
    [id, b.tratamiento !== undefined ? texto(b.tratamiento, 800) : c.tratamiento, ['abierto', 'mitigado', 'cerrado'].includes(b.estado) ? b.estado : c.estado,
      n15(b.probabilidad) || c.probabilidad, n15(b.impacto) || c.impacto, b.responsable !== undefined ? texto(b.responsable, 120) : c.responsable, q.nombre]);
}

async function revision(user, q, accion, b = {}, id = null) {
  await asegurar();
  const p = permisos(q);
  if (!p.revision) throw new Rechazo(403, 'La revisión por la dirección la preparan ADG o GG');
  if (accion === 'crear') {
    const anio = Number(b.anio) >= 2020 ? Number(b.anio) : new Date().getFullYear();
    const { rows: ya } = await pool.query("SELECT 1 FROM sgi.revisiones WHERE anio = $1 AND estado = 'borrador'", [anio]);
    if (ya.length) throw new Rechazo(409, `Ya hay una revisión ${anio} en borrador`);
    const nuevo = crypto.randomUUID().slice(0, 10);
    await pool.query('INSERT INTO sgi.revisiones (id, anio, entradas, creado_por) VALUES ($1,$2,$3,$4)', [nuevo, anio, JSON.stringify(await entradas(anio)), q.nombre]);
    return nuevo;
  }
  const { rows } = await pool.query('SELECT * FROM sgi.revisiones WHERE id = $1', [id]);
  if (!rows.length) throw new Rechazo(404, 'Revisión no encontrada');
  const r = rows[0];
  if (r.estado !== 'borrador') throw new Rechazo(409, 'La revisión ya fue emitida');
  if (accion === 'editar') {
    const decisiones = (Array.isArray(b.decisiones) ? b.decisiones : []).slice(0, 40).map(d => ({ decision: texto(d.decision, 600), area: AREAS.includes(d.area) ? d.area : null, fecha_limite: /^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha_limite || '')) ? d.fecha_limite : null })).filter(d => d.decision);
    await pool.query('UPDATE sgi.revisiones SET decisiones = $2::jsonb, conclusiones = $3, entradas = CASE WHEN $4 THEN $5::jsonb ELSE entradas END WHERE id = $1',
      [id, JSON.stringify(decisiones), texto(b.conclusiones, 5000) || null, !!b.actualizar_entradas, JSON.stringify(b.actualizar_entradas ? await entradas(r.anio) : {})]);
    return id;
  }
  if (accion === 'emitir') {
    if (!p.emitir) throw new Rechazo(403, 'La revisión la emite ADG');
    if (!texto(r.conclusiones) || !(r.decisiones || []).length) throw new Rechazo(400, 'Registra las conclusiones y al menos una decisión antes de emitir');
    const DM = require('./docModulo');
    const doc = await DM.emitirRegistro(user, { tipo: 'INF', area: 'ADG', titulo: `Revisión por la dirección ${r.anio} (ISO/IEC 27001 9.3 · ISO 9001 9.3)`, detalle: 'Sistema de gestión integrado', modulo: 'SGI', id_origen: id });
    await pool.query("UPDATE sgi.revisiones SET estado = 'emitida', codigo = $2, fecha = CURRENT_DATE WHERE id = $1", [id, doc.codigo]);
    return doc.codigo;
  }
  throw new Rechazo(400, 'Acción no válida');
}

module.exports = { asegurar, resumen, riesgo, revision, entradas, permisos, Rechazo };
