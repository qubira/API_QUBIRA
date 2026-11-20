'use strict';
/* ============================================================
   Tareas diarias (las corre el servidor una vez al día):
   - Contratos que vencen en 60 días: aviso a ODN (Customer Success) para
     buscar la renovación.
   - Facturas de proyectos sin cobrar después de 30 días: aviso a OPP
     (Cobranzas).
   - Revisión por la dirección: si la última emitida tiene más de 11 meses
     (o no hay), aviso a ADG y GG (una vez al mes).
   Cada aviso se marca para no repetirse.
   ============================================================ */
const { pool } = require('../db');
const N = require('./notificar');

const hoy = () => new Date().toISOString().slice(0, 10);
async function renovaciones() {
  await pool.query('ALTER TABLE comercial.contratos ADD COLUMN IF NOT EXISTS renovacion JSONB');
  const { rows } = await pool.query(`SELECT id, cliente_nombre, producto_nombre, to_char(fecha_fin,'YYYY-MM-DD') fin FROM comercial.contratos
    WHERE estado = 'vigente' AND fecha_fin IS NOT NULL AND fecha_fin <= CURRENT_DATE + 60 AND fecha_fin >= CURRENT_DATE - 30
      AND (renovacion IS NULL OR renovacion->>'avisado' IS NULL)`);
  for (const c of rows) {
    await N.escribir((await require('./codificacion').personasDelArea('ODN', 7)).map(r => r.usuario), { titulo: `${c.id}: contrato por vencer (${c.fin})`, texto: `${c.cliente_nombre || ''}${c.producto_nombre ? ' · ' + c.producto_nombre : ''}. Contacta al cliente para la renovación (sección Renovaciones).`, modulo: 'COMERCIAL', tipo: 'RENOVACION', referencia: c.id });
    await pool.query("UPDATE comercial.contratos SET renovacion = COALESCE(renovacion, '{}'::jsonb) || jsonb_build_object('avisado', $2::text, 'estado', COALESCE(renovacion->>'estado', 'pendiente')) WHERE id = $1", [c.id, hoy()]);
  }
  return rows.length;
}
async function cobros() {
  const { rows } = await pool.query("SELECT id, code, name, facturas FROM ti.projects WHERE facturas IS NOT NULL AND facturas <> '[]'::jsonb");
  let n = 0;
  for (const p of rows) {
    const lista = p.facturas || []; let cambio = false;
    for (const f of lista) {
      if (f.cobrada || f.avisada_cobro || !f.fecha) continue;
      if ((Date.now() - new Date(f.fecha + 'T12:00:00Z')) < 30 * 864e5) continue;
      await N.escribir((await require('./codificacion').personasDelArea('OPP', 7)).map(r => r.usuario), { titulo: `${p.name}: factura ${f.numero || ''} sin cobrar`, texto: `${f.hito} · ${f.moneda} ${f.monto} emitida el ${f.fecha}. Gestiona el cobro con el cliente.`, modulo: 'FLUJO', tipo: 'COBRO', referencia: p.code });
      f.avisada_cobro = hoy(); cambio = true; n++;
    }
    if (cambio) await pool.query('UPDATE ti.projects SET facturas = $2::jsonb WHERE id = $1', [p.id, JSON.stringify(lista)]);
  }
  return n;
}
async function revisionDireccion() {
  await require('./sgi').asegurar();
  await pool.query("CREATE TABLE IF NOT EXISTS ti.flujo_config (clave TEXT PRIMARY KEY, valor JSONB NOT NULL)");
  const { rows: [u] } = await pool.query("SELECT MAX(fecha) AS f FROM sgi.revisiones WHERE estado = 'emitida'");
  if (u.f && (Date.now() - new Date(u.f)) < 335 * 864e5) return 0;
  const { rows: [av] } = await pool.query("SELECT valor FROM ti.flujo_config WHERE clave = 'aviso_revision'");
  if (av && (Date.now() - new Date(av.valor)) < 30 * 864e5) return 0;
  const C = require('./codificacion');
  const us = [...(await C.personasDelArea('ADG', 1)), ...(await C.personasDelArea('GG', 2))].map(r => r.usuario);
  await N.escribir(us, { titulo: 'Revisión por la dirección pendiente', texto: u.f ? `La última se emitió el ${new Date(u.f).toISOString().slice(0, 10)}. ISO/IEC 27001 pide al menos una al año: prepárala en «Sistema de gestión».` : 'Todavía no hay una revisión por la dirección emitida. Prepárala en «Sistema de gestión» (ISO/IEC 27001 9.3).', modulo: 'SGI', tipo: 'REVISION' });
  await pool.query("INSERT INTO ti.flujo_config (clave, valor) VALUES ('aviso_revision', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor", [JSON.stringify(new Date().toISOString())]);
  return us.length;
}

async function correr() {
  const r = {};
  for (const [k, fn] of [['renovaciones', renovaciones], ['cobros', cobros], ['revision', revisionDireccion]]) {
    try { r[k] = await fn(); } catch (e) { r[k] = 'error: ' + e.message; }
  }
  console.log('[TAREAS DIARIAS]', JSON.stringify(r));
  return r;
}
function programar() {
  setTimeout(() => { correr(); setInterval(correr, 24 * 3600 * 1000); }, 90 * 1000);
}

module.exports = { correr, programar, renovaciones, cobros, revisionDireccion };
