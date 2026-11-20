'use strict';
/* ============================================================
   Tablero Scrum de cada proyecto (OTI desarrolla con Scrum).
   - Backlog: historias con criterios de aceptación, puntos, prioridad y
     Definición de Hecho (código revisado, pruebas unitarias, QA, seguridad
     automática de DevSecOps y documentación).
   - Sprints de 2 semanas por defecto (configurable): se planifican, se
     inician (uno a la vez) y se cierran con retrospectiva; lo no terminado
     vuelve al backlog.
   - El flujo exige el backlog terminado para pasar a la comisión de prueba,
     y cada devolución de una auditoría crea una historia de tipo «falla».
   ============================================================ */
const crypto = require('crypto');
const { pool } = require('../db');

class Rechazo extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const texto = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const ESTADOS = ['backlog', 'por_hacer', 'en_curso', 'revision', 'hecho', 'descartada'];
const TIPOS = ['historia', 'falla', 'tecnica'];
const DOD = ['codigo_revisado', 'pruebas_unitarias', 'qa', 'seguridad', 'documentado'];
const DOD_NOMBRE = { codigo_revisado: 'Código revisado por el Líder Técnico', pruebas_unitarias: 'Pruebas unitarias', qa: 'Aprobada por QA', seguridad: 'Pruebas de seguridad automáticas (DevSecOps)', documentado: 'Documentada' };

let listo = null;
function asegurar() {
  if (!listo) listo = pool.query(`
    CREATE SCHEMA IF NOT EXISTS ti;
    CREATE TABLE IF NOT EXISTS ti.scrum_sprints (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, numero INT NOT NULL, objetivo TEXT, inicio DATE, fin DATE,
      estado TEXT NOT NULL DEFAULT 'planificado', retro TEXT, creado_por TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (project_id, numero));
    CREATE TABLE IF NOT EXISTS ti.scrum_historias (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sprint_id TEXT, titulo TEXT NOT NULL, descripcion TEXT, criterios TEXT,
      tipo TEXT NOT NULL DEFAULT 'historia', origen TEXT, puntos INT, prioridad INT NOT NULL DEFAULT 1000, estado TEXT NOT NULL DEFAULT 'backlog',
      dod JSONB NOT NULL DEFAULT '{}'::jsonb, responsable TEXT, creado_por TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS scrum_historias_proj_ix ON ti.scrum_historias (project_id, estado);
    CREATE TABLE IF NOT EXISTS ti.flujo_config (clave TEXT PRIMARY KEY, valor JSONB NOT NULL);
    INSERT INTO ti.flujo_config (clave, valor) VALUES ('sprint_dias', '14') ON CONFLICT (clave) DO NOTHING;`)
    .catch(e => { listo = null; throw e; });
  return listo;
}
const esOTI = (q, n = 9) => q.esADG || (q.sigla === 'OTI' && q.nivel && q.nivel <= n);
const puedeVer = q => q.esADG || ['GG', 'OTI', 'OPP', 'ODACL', 'DST', 'OCOS', 'ODN'].includes(q.sigla);

async function diasSprint() {
  const { rows } = await pool.query("SELECT valor FROM ti.flujo_config WHERE clave = 'sprint_dias'").catch(() => ({ rows: [] }));
  const n = rows[0] ? Number(rows[0].valor) : 14;
  return n >= 7 && n <= 28 ? n : 14;
}

async function tablero(pid) {
  await asegurar();
  const [{ rows: sprints }, { rows: hist }] = await Promise.all([
    pool.query("SELECT id, numero, objetivo, to_char(inicio,'YYYY-MM-DD') inicio, to_char(fin,'YYYY-MM-DD') fin, estado, retro FROM ti.scrum_sprints WHERE project_id = $1 ORDER BY numero", [pid]),
    pool.query('SELECT * FROM ti.scrum_historias WHERE project_id = $1 ORDER BY prioridad, creado_en', [pid]),
  ]);
  const activo = sprints.find(s => s.estado === 'en_curso') || null;
  const pendientes = hist.filter(h => !['hecho', 'descartada'].includes(h.estado));
  return { sprints, historias: hist, activo, dias_sprint: await diasSprint(), dod: DOD.map(k => ({ clave: k, nombre: DOD_NOMBRE[k] })),
    resumen: { total: hist.length, hechas: hist.filter(h => h.estado === 'hecho').length, pendientes: pendientes.length,
      puntos: hist.reduce((a, h) => a + (h.estado !== 'descartada' ? h.puntos || 0 : 0), 0), puntos_hechos: hist.reduce((a, h) => a + (h.estado === 'hecho' ? h.puntos || 0 : 0), 0) } };
}

/* Estado del backlog para la puerta «Desarrollo» del flujo */
async function backlogTerminado(pid) {
  await asegurar();
  const { rows: [r] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE estado = 'hecho')::int AS hechas,
    COUNT(*) FILTER (WHERE estado NOT IN ('hecho', 'descartada'))::int AS pendientes FROM ti.scrum_historias WHERE project_id = $1`, [pid]);
  return { ok: r.hechas > 0 && r.pendientes === 0, hechas: r.hechas, pendientes: r.pendientes };
}

async function crearHistoria(pid, quien, b = {}, cli = pool) {
  await asegurar();
  const t = texto(b.titulo, 200);
  if (!t) throw new Rechazo(400, 'Escribe el título de la historia');
  // OTI escribe historias de cualquier tipo; las demás áreas del flujo solo reportan fallas
  if (!esOTI(quien) && !['GG', 'DST', 'ODACL', 'OCOS', 'OPP', 'ODN'].includes(quien.sigla)) throw new Rechazo(403, 'Las historias las escribe OTI; las demás áreas del flujo pueden reportar fallas');
  const tipo = esOTI(quien) ? (TIPOS.includes(b.tipo) ? b.tipo : 'historia') : 'falla';
  const { rows: [m] } = await cli.query('SELECT COALESCE(MAX(prioridad), 0) + 10 AS p FROM ti.scrum_historias WHERE project_id = $1', [pid]);
  const id = crypto.randomUUID().slice(0, 12);
  await cli.query(`INSERT INTO ti.scrum_historias (id, project_id, titulo, descripcion, criterios, tipo, origen, puntos, prioridad, creado_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, pid, t, texto(b.descripcion, 3000) || null, texto(b.criterios, 3000) || null, tipo, texto(b.origen, 40) || null,
    [1, 2, 3, 5, 8, 13, 21].includes(Number(b.puntos)) ? Number(b.puntos) : null, tipo === 'falla' ? 1 : m.p, quien.nombre]);
  return id;
}

async function editarHistoria(pid, hid, quien, b = {}) {
  await asegurar();
  if (!esOTI(quien)) throw new Rechazo(403, 'El tablero lo mueve OTI');
  const { rows } = await pool.query('SELECT * FROM ti.scrum_historias WHERE id = $1 AND project_id = $2', [hid, pid]);
  if (!rows.length) throw new Rechazo(404, 'Historia no encontrada');
  const h = rows[0], cambios = {};
  if (b.titulo !== undefined) cambios.titulo = texto(b.titulo, 200) || h.titulo;
  if (b.descripcion !== undefined) cambios.descripcion = texto(b.descripcion, 3000);
  if (b.criterios !== undefined) cambios.criterios = texto(b.criterios, 3000);
  if (b.responsable !== undefined) cambios.responsable = texto(b.responsable, 120);
  if (b.puntos !== undefined) cambios.puntos = [1, 2, 3, 5, 8, 13, 21].includes(Number(b.puntos)) ? Number(b.puntos) : null;
  if (b.dod && typeof b.dod === 'object') {
    // Lo que certifica QA lo marca el Líder o Analista de QA (OTI N7+); el resto, el equipo
    cambios.dod = { ...(h.dod || {}) };
    for (const k of DOD) if (b.dod[k] !== undefined) cambios.dod[k] = !!b.dod[k];
  }
  if (b.sprint_id !== undefined) {
    if (b.sprint_id) {
      const { rows: s } = await pool.query('SELECT estado FROM ti.scrum_sprints WHERE id = $1 AND project_id = $2', [b.sprint_id, pid]);
      if (!s.length || s[0].estado === 'cerrado') throw new Rechazo(409, 'Ese sprint no existe o ya se cerró');
      cambios.sprint_id = b.sprint_id; if (h.estado === 'backlog') cambios.estado = 'por_hacer';
    } else { cambios.sprint_id = null; if (!['hecho', 'descartada'].includes(h.estado)) cambios.estado = 'backlog'; }
  }
  if (b.estado !== undefined) {
    if (!ESTADOS.includes(b.estado)) throw new Rechazo(400, 'Estado no válido');
    if (b.estado === 'hecho') {
      const dod = cambios.dod || h.dod || {};
      const falta = DOD.filter(k => !dod[k]);
      if (falta.length) throw new Rechazo(409, 'No cumple la Definición de Hecho. Falta: ' + falta.map(k => DOD_NOMBRE[k]).join(' · '));
    }
    if (b.estado === 'descartada' && !esOTI(quien, 4)) throw new Rechazo(403, 'Descarta una historia el Product Owner (N4) o el Jefe de OTI');
    if (['por_hacer', 'en_curso', 'revision'].includes(b.estado) && !(cambios.sprint_id || h.sprint_id)) throw new Rechazo(409, 'Primero agrégala a un sprint');
    cambios.estado = b.estado;
  }
  if (b.mover === 'arriba' || b.mover === 'abajo') {
    // El Product Owner ordena el backlog: intercambia la prioridad con la historia vecina
    if (!esOTI(quien, 4)) throw new Rechazo(403, 'El backlog lo prioriza el Product Owner (N4) o el Jefe de OTI');
    const { rows: lista } = await pool.query("SELECT id, prioridad FROM ti.scrum_historias WHERE project_id = $1 AND estado = 'backlog' ORDER BY prioridad, creado_en", [pid]);
    const i = lista.findIndex(x => x.id === hid), otro = lista[b.mover === 'arriba' ? i - 1 : i + 1];
    if (i >= 0 && otro) {
      const pa = otro.prioridad === h.prioridad ? h.prioridad + (b.mover === 'arriba' ? 1 : -1) : h.prioridad;
      await pool.query('UPDATE ti.scrum_historias SET prioridad = $2 WHERE id = $1', [otro.id, pa]);
      cambios.prioridad = otro.prioridad;
    }
  }
  const claves = Object.keys(cambios);
  if (!claves.length) return;
  await pool.query(`UPDATE ti.scrum_historias SET ${claves.map((k, i) => `${k} = $${i + 2}${k === 'dod' ? '::jsonb' : ''}`).join(', ')}, actualizado_en = now() WHERE id = $1`,
    [hid, ...claves.map(k => (k === 'dod' ? JSON.stringify(cambios[k]) : cambios[k]))]);
}

async function sprint(pid, quien, accion, b = {}, sid = null) {
  await asegurar();
  if (!esOTI(quien, 5)) throw new Rechazo(403, 'Los sprints los gestionan el Scrum Master o el Product Owner (OTI N5+)');
  if (accion === 'crear') {
    const { rows: [m] } = await pool.query('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM ti.scrum_sprints WHERE project_id = $1', [pid]);
    const inicio = /^\d{4}-\d{2}-\d{2}$/.test(String(b.inicio || '')) ? b.inicio : new Date().toISOString().slice(0, 10);
    const dias = await diasSprint();
    const fin = new Date(new Date(inicio + 'T12:00:00Z').getTime() + (dias - 1) * 864e5).toISOString().slice(0, 10);
    const id = crypto.randomUUID().slice(0, 12);
    await pool.query('INSERT INTO ti.scrum_sprints (id, project_id, numero, objetivo, inicio, fin, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, pid, m.n, texto(b.objetivo, 500) || null, inicio, fin, quien.nombre]);
    return id;
  }
  const { rows } = await pool.query('SELECT * FROM ti.scrum_sprints WHERE id = $1 AND project_id = $2', [sid, pid]);
  if (!rows.length) throw new Rechazo(404, 'Sprint no encontrado');
  const s = rows[0];
  if (accion === 'iniciar') {
    if (s.estado !== 'planificado') throw new Rechazo(409, 'Ese sprint ya se inició');
    const { rows: act } = await pool.query("SELECT numero FROM ti.scrum_sprints WHERE project_id = $1 AND estado = 'en_curso'", [pid]);
    if (act.length) throw new Rechazo(409, `Ya hay un sprint en curso (Sprint ${act[0].numero}): ciérralo primero`);
    const { rows: [c] } = await pool.query('SELECT COUNT(*)::int AS n FROM ti.scrum_historias WHERE sprint_id = $1', [sid]);
    if (!c.n) throw new Rechazo(409, 'Agrega historias al sprint antes de iniciarlo (Sprint Planning)');
    if (!texto(s.objetivo) && !texto(b.objetivo)) throw new Rechazo(400, 'Escribe el objetivo del sprint');
    await pool.query("UPDATE ti.scrum_sprints SET estado = 'en_curso', objetivo = COALESCE(NULLIF($2, ''), objetivo) WHERE id = $1", [sid, texto(b.objetivo, 500)]);
  } else if (accion === 'cerrar') {
    if (s.estado !== 'en_curso') throw new Rechazo(409, 'Solo se cierra un sprint en curso');
    const retro = texto(b.retro, 3000);
    if (!retro) throw new Rechazo(400, 'Escribe la retrospectiva: qué salió bien y qué se mejora');
    await pool.query("UPDATE ti.scrum_sprints SET estado = 'cerrado', retro = $2 WHERE id = $1", [sid, retro]);
    // Lo que no se terminó vuelve al backlog
    await pool.query("UPDATE ti.scrum_historias SET sprint_id = NULL, estado = 'backlog', actualizado_en = now() WHERE sprint_id = $1 AND estado NOT IN ('hecho', 'descartada')", [sid]);
  } else throw new Rechazo(400, 'Acción no válida');
}

module.exports = { asegurar, tablero, backlogTerminado, crearHistoria, editarHistoria, sprint, puedeVer, Rechazo, DOD };
