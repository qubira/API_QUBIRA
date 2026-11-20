'use strict';
/* ============================================================
   Notificaciones dentro de QUBIRA (campana en cada módulo).
   Avisan a cada persona cuando le toca actuar: un paso de un documento,
   una puerta del flujo, un exceso de costo, un traspaso, un caso escalado
   o un incidente de seguridad. Nunca bloquean la operación que las origina:
   se escriben aparte y un error solo queda en el registro del servidor.
   ============================================================ */
const { pool } = require('../db');

let listo = null;
function asegurar() {
  if (!listo) listo = pool.query(`
    CREATE SCHEMA IF NOT EXISTS notif;
    CREATE TABLE IF NOT EXISTS notif.avisos (
      id BIGSERIAL PRIMARY KEY, usuario TEXT NOT NULL, titulo TEXT NOT NULL, texto TEXT,
      modulo TEXT, tipo TEXT, referencia TEXT, leida BOOLEAN NOT NULL DEFAULT false,
      creada TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS avisos_usuario_ix ON notif.avisos (usuario, leida, creada DESC);`).catch(e => { listo = null; throw e; });
  return listo;
}

/* Personas activas por sigla de área y nivel máximo (N1 = más alto) */
async function personas(sigla, nivelMax, excluir) {
  const C = require('./codificacion');
  return (await C.personasDelArea(sigla, nivelMax, excluir)).map(r => r.usuario);
}
/* Empleados activos que ocupan un cargo (sub-cargo) exacto */
async function titulares(cargo, excluir) {
  const { rows } = await pool.query(`SELECT e.usuario FROM rrhh.empleados e JOIN rrhh.catalogos s ON s.id = e.subcargo_id
    WHERE lower(s.nombre) = lower($1) AND COALESCE(lower(e.estado), 'activo') = 'activo' AND e.usuario IS NOT NULL AND e.usuario <> ''`, [cargo]).catch(() => ({ rows: [] }));
  return rows.map(r => r.usuario).filter(u => !excluir || u.toLowerCase() !== String(excluir).toLowerCase());
}

async function escribir(usuarios, a) {
  await asegurar();
  const lista = [...new Set((usuarios || []).filter(Boolean).map(u => String(u).trim().toLowerCase()))];
  for (const u of lista) {
    await pool.query('INSERT INTO notif.avisos (usuario, titulo, texto, modulo, tipo, referencia) VALUES ($1,$2,$3,$4,$5,$6)',
      [u, String(a.titulo).slice(0, 200), String(a.texto || '').slice(0, 1000), a.modulo || null, a.tipo || null, a.referencia ? String(a.referencia).slice(0, 80) : null]);
  }
  return lista.length;
}
/* Lo dispara después de la operación (no la frena ni la hace fallar) */
function despues(fn) {
  setImmediate(() => { Promise.resolve().then(fn).catch(e => console.warn('[AVISOS]', e.message)); });
}
const aUsuarios = (usuarios, a) => despues(() => escribir(usuarios, a));
/* A un área: [[sigla, nivelMax], …] */
const aAreas = (areas, a, excluir) => despues(async () => {
  const us = [];
  for (const [s, n] of areas) us.push(...(await personas(s, n, excluir)));
  return escribir(us, a);
});

/* A quien le toca un paso de la ruta de un documento: el titular del cargo si el paso lo pide
   y está cubierto; si no, el área con el nivel pedido; si no hay, el área superior y luego ADG. */
const pasoDocumento = (doc, paso) => despues(async () => {
  if (!paso) return 0;
  const { reportaA } = require('./jerarquia');
  const { canonArea, etiquetaArea } = require('./employeeArea');
  let us = paso.cargo ? await titulares(paso.cargo, doc.creado_por) : [];
  if (!us.length) us = await personas(paso.area, paso.nivel_min || 3, doc.creado_por);
  if (!us.length) { const sup = reportaA(canonArea(paso.area)); if (sup) us = await personas(etiquetaArea(sup), 3, doc.creado_por); }
  if (!us.length) us = await personas('ADG', 3, doc.creado_por);
  const verbo = paso.accion === 'REVISA' ? 'revisar' : 'aprobar';
  return escribir(us, { titulo: `${doc.codigo}: te toca ${verbo}`, texto: `${doc.titulo || ''}${paso.cargo ? ` · le corresponde al ${paso.cargo}` : ''}. Está en tus Pendientes (o en el Registro de documentos).`, modulo: 'DOCUMENTOS', tipo: 'PASO', referencia: doc.codigo });
});

module.exports = { asegurar, aUsuarios, aAreas, pasoDocumento, titulares, despues, escribir };
