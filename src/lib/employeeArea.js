'use strict';

const { pool } = require('../db');

/* ============================================================
   Áreas de trabajo — fuente única: catálogo «areasTrabajo» de ORH
   (rrhh.catalogos). Cada área tiene:
   - clave: nombre interno con el que se guardan reuniones, permisos y
     auditoría (histórico: RRHH, COMERCIAL, SOPORTE, TI…).
   - etiqueta: sigla oficial que se muestra (ORH, ODN, OCOS, OTI…).
   Un área nueva creada en ORH usa su propio nombre como clave y etiqueta,
   así aparece en todos los módulos sin tocar código.
   ============================================================ */

// Sigla oficial o histórica -> clave interna
const ALIAS_AREA = { ORH: 'RRHH', ODN: 'COMERCIAL', OCOS: 'SOPORTE', OTI: 'TI', ACM: 'OCM', DJ: 'ODACL', CG: 'OPP' };
// Clave interna -> sigla oficial para mostrar
const ETIQUETA_AREA = { RRHH: 'ORH', COMERCIAL: 'ODN', SOPORTE: 'OCOS', TI: 'OTI' };

const canonArea = nombre => {
  const a = String(nombre || '').trim().toUpperCase();
  return a ? (ALIAS_AREA[a] || a) : null;
};
const etiquetaArea = clave => ETIQUETA_AREA[clave] || clave;

// Misma normalización dentro de SQL (para filtrar por área sobre una columna de nombre)
function sqlCanonArea(col) {
  const casos = Object.entries(ALIAS_AREA).map(([a, c]) => `WHEN '${a}' THEN '${c}'`).join(' ');
  return `(CASE upper(trim(${col})) ${casos} ELSE upper(trim(${col})) END)`;
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

// Lista de áreas del catálogo de ORH: [{ clave, etiqueta }]
async function listarAreas() {
  const { rows } = await pool.query("SELECT nombre FROM rrhh.catalogos WHERE catalogo = 'areasTrabajo' ORDER BY nombre");
  const vistas = new Set(), out = [];
  for (const r of rows) {
    const clave = canonArea(r.nombre);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    out.push({ clave, etiqueta: etiquetaArea(clave) });
  }
  return out;
}

module.exports = { getEmployeeArea, canonArea, etiquetaArea, sqlCanonArea, listarAreas, ALIAS_AREA };
