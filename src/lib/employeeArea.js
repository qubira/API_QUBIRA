'use strict';

const { pool } = require('../db');

/* ============================================================
   Áreas de trabajo — fuente única: catálogo «areasTrabajo» de ORH
   (rrhh.catalogos). Cada área tiene:
   - sigla: la que va en los códigos y se muestra (ORH, ODN, OCOS, OTI…).
     2 a 5 letras, única; se bloquea cuando ya se usó en un código.
   - nombre_completo: el que se imprime en los membretes.
   - alias: nombres antiguos o internos que se reconocen como esta área.
   - activo: un área desactivada no emite códigos nuevos.
   - clave: nombre interno con el que se guardan reuniones, permisos y
     auditoría (histórico: RRHH, COMERCIAL, SOPORTE, TI…). No se muestra.
   Un área nueva creada en ORH usa su sigla como clave, así aparece en
   todos los módulos sin tocar código.
   ============================================================ */

// Claves internas históricas (datos ya guardados con estos nombres). Fijas.
const CLAVE_HISTORICA = { ORH: 'RRHH', ODN: 'COMERCIAL', OCOS: 'SOPORTE', OTI: 'TI', ACM: 'OCM', DJ: 'ODACL', CG: 'OPP' };
const ETIQUETA_HISTORICA = { RRHH: 'ORH', COMERCIAL: 'ODN', SOPORTE: 'OCOS', TI: 'OTI' };

// Mapas vivos, se completan con el catálogo (sigla, nombre y alias de cada área)
let ALIAS_AREA = { ...CLAVE_HISTORICA };
let ETIQUETA_AREA = { ...ETIQUETA_HISTORICA };
let AREAS = [];          // [{ id, clave, sigla, nombre, alias, activo }]

const limpiar = s => String(s || '').trim().toUpperCase();
const canonArea = nombre => {
  const a = limpiar(nombre);
  return a ? (ALIAS_AREA[a] || a) : null;
};
const etiquetaArea = clave => ETIQUETA_AREA[clave] || clave;
const claveDeFila = r => CLAVE_HISTORICA[limpiar(r.sigla)] || CLAVE_HISTORICA[limpiar(r.nombre)] || limpiar(r.sigla) || limpiar(r.nombre);

// Misma normalización dentro de SQL (para filtrar por área sobre una columna de nombre)
function sqlCanonArea(col) {
  const seguro = s => /^[A-Z0-9 ÁÉÍÓÚÑ]+$/.test(s); // los alias vienen del catálogo: nada de comillas en el SQL
  const casos = Object.entries(ALIAS_AREA).filter(([a, c]) => a !== c && seguro(a) && seguro(c))
    .map(([a, c]) => `WHEN '${a}' THEN '${c}'`).join(' ');
  return casos ? `(CASE upper(trim(${col})) ${casos} ELSE upper(trim(${col})) END)` : `upper(trim(${col}))`;
}

/* ─── Campos de área en el catálogo (una sola vez) ─────────────────── */
// Solo para llenar las áreas existentes la primera vez; después se editan en ORH.
const SEMILLA = {
  ADG: ['ADG', 'Alta Dirección Gerencial'], GG: ['GG', 'Gerencia General'],
  TI: ['OTI', 'Oficina de Tecnología e Información'], RRHH: ['ORH', 'Oficina de Recursos Humanos'],
  SOPORTE: ['OCOS', 'Oficina de Centro de Operaciones y Servicios'], COMERCIAL: ['ODN', 'Oficina de Desarrollo de Negocios'],
  OPP: ['OPP', 'Oficina de Presupuestos y Planeación'], OCM: ['OCM', 'Oficina de Comunicación y Marketing'],
  ODACL: ['ODACL', 'Oficina de Asuntos Corporativos y Legales'], DST: ['DST', 'Desarrollo de Seguridad y Tecnología'],
};
let listo = null;
function asegurarAreas() {
  if (!listo) listo = (async () => {
    await pool.query(`
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS sigla TEXT;
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS nombre_completo TEXT;
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS alias TEXT[];
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;`);
    const { rows } = await pool.query("SELECT id, nombre, sigla, alias FROM rrhh.catalogos WHERE catalogo = 'areasTrabajo'");
    for (const r of rows) {
      if (r.sigla) continue;
      const clave = canonArea(r.nombre);
      const [sigla, nombre] = SEMILLA[clave] || [limpiar(r.nombre).replace(/[^A-Z]/g, '').slice(0, 5) || null, r.nombre];
      const alias = Object.entries(CLAVE_HISTORICA).filter(([a, c]) => c === clave && a !== sigla).map(([a]) => a);
      if (clave !== sigla && !alias.includes(clave)) alias.push(clave);
      await pool.query('UPDATE rrhh.catalogos SET sigla = $1, nombre_completo = COALESCE(nombre_completo, $2), alias = $3 WHERE id = $4',
        [sigla, nombre, alias.length ? alias : null, r.id]);
    }
    await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS catalogos_area_sigla_uq ON rrhh.catalogos (sigla) WHERE catalogo = 'areasTrabajo'");
    // Nombre visible = sigla oficial (TI → OTI, SOPORTE → OCOS). Los nombres antiguos quedan como alias.
    await pool.query("UPDATE rrhh.catalogos SET nombre = sigla WHERE catalogo = 'areasTrabajo' AND sigla IS NOT NULL AND upper(trim(nombre)) IN ('TI', 'SOPORTE')");
    await refrescarAreas();
  })().catch(e => { listo = null; throw e; });
  return listo;
}

/* Relee el catálogo y reconstruye los mapas de alias. Se llama al arrancar,
   cada minuto y cada vez que ORH cambia un área. */
async function refrescarAreas() {
  const { rows } = await pool.query(
    "SELECT id, nombre, sigla, nombre_completo, alias, COALESCE(activo, true) AS activo FROM rrhh.catalogos WHERE catalogo = 'areasTrabajo' ORDER BY nombre");
  const alias = { ...CLAVE_HISTORICA }, etiqueta = { ...ETIQUETA_HISTORICA }, areas = [];
  for (const r of rows) {
    const clave = claveDeFila(r);
    const sigla = limpiar(r.sigla) || etiqueta[clave] || clave;
    for (const a of [r.nombre, r.sigla, ...(r.alias || [])].map(limpiar).filter(Boolean)) if (a !== clave) alias[a] = clave;
    etiqueta[clave] = sigla;
    areas.push({ id: r.id, clave, sigla, nombre: r.nombre_completo || sigla, alias: r.alias || [], activo: r.activo });
  }
  ALIAS_AREA = alias; ETIQUETA_AREA = etiqueta; AREAS = areas;
  return areas;
}
let reloj = null;
function iniciarAreas() {
  if (!reloj) { reloj = setInterval(() => refrescarAreas().catch(() => {}), 60e3); reloj.unref?.(); }
  return asegurarAreas();
}

/* Área de trabajo (clave interna) del empleado dueño de esta cuenta,
   según su campo `usuario` en rrhh.empleados. Devuelve null si la
   cuenta no tiene un registro de empleado o no tiene área asignada. */
async function getEmployeeArea(username) {
  if (!username) return null;
  const { rows } = await pool.query(
    `SELECT c.nombre
     FROM rrhh.empleados e
     JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
     WHERE lower(e.usuario) = lower($1) AND e.area_trabajo_id IS NOT NULL
     LIMIT 1`,
    [username]
  );
  return rows.length ? canonArea(rows[0].nombre) : null;
}

/* Lista de áreas del catálogo de ORH: [{ clave, etiqueta, sigla, nombre, activo }]
   Por defecto solo las activas. */
async function listarAreas({ incluirInactivas = false } = {}) {
  try { await asegurarAreas(); } catch { await refrescarAreas().catch(() => {}); }
  if (!AREAS.length) await refrescarAreas().catch(() => {});
  const vistas = new Set(), out = [];
  for (const a of AREAS) {
    if ((!a.activo && !incluirInactivas) || vistas.has(a.clave)) continue;
    vistas.add(a.clave);
    out.push({ clave: a.clave, etiqueta: a.sigla, sigla: a.sigla, nombre: a.nombre, activo: a.activo });
  }
  return out;
}

/* Datos de un área por clave, sigla o alias (para membretes y códigos) */
function areaPorNombre(nombre) {
  const clave = canonArea(nombre);
  return AREAS.find(a => a.clave === clave) || null;
}

module.exports = {
  getEmployeeArea, canonArea, etiquetaArea, sqlCanonArea, listarAreas, areaPorNombre,
  asegurarAreas, refrescarAreas, iniciarAreas,
  get ALIAS_AREA() { return ALIAS_AREA; },
};
