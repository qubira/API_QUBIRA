'use strict';

const { pool } = require('../db');

/* Área de trabajo (en mayúsculas) del empleado dueño de esta cuenta,
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
  return rows.length ? rows[0].nombre.trim().toUpperCase() : null;
}

module.exports = { getEmployeeArea };
