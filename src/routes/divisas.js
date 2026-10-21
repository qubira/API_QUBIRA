'use strict';

/* ============================================================
   Divisas — tipos de cambio oficiales de QUBIRA, administrados por
   OPP (Oficina de Presupuestos y Planeación). Moneda base: PEN.
   Cada divisa guarda cuántos soles vale 1 unidad (tasa_pen).

   - Lectura: cualquier cuenta autenticada (ODN/Comercial convierte
     proformas y contratos con estas tasas).
   - Escritura: solo OPP (o CG/ADG por supervisión).
   ============================================================ */

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');

const router = express.Router();
router.use(requireAuth);

const BASE = 'PEN';
const CODIGO_RE = /^[A-Z]{3}$/;

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE SCHEMA IF NOT EXISTS opp;

      CREATE TABLE IF NOT EXISTS opp.divisas (
        codigo TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        simbolo TEXT NOT NULL,
        tasa_pen NUMERIC(18,6) NOT NULL CHECK (tasa_pen > 0),
        activo BOOLEAN NOT NULL DEFAULT true,
        orden INT NOT NULL DEFAULT 100,
        actualizado_por TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS opp.divisas_historial (
        id BIGSERIAL PRIMARY KEY,
        codigo TEXT NOT NULL,
        tasa_anterior NUMERIC(18,6),
        tasa_nueva NUMERIC(18,6),
        cambio TEXT NOT NULL,
        usuario TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS divisas_historial_codigo_idx ON opp.divisas_historial (codigo, created_at DESC);

      -- Divisas iniciales (OPP ajusta las tasas desde su módulo)
      INSERT INTO opp.divisas (codigo, nombre, simbolo, tasa_pen, activo, orden, actualizado_por) VALUES
        ('PEN', 'Soles Peruanos', 'S/', 1, true, 0, 'sistema'),
        ('USD', 'Dólares Americanos', '$', 3.75, true, 1, 'sistema'),
        ('EUR', 'Euros', '€', 4.05, true, 2, 'sistema')
      ON CONFLICT (codigo) DO NOTHING;
    `);
  }
  return schemaReady;
}
router.use((req, res, next) => { ensureSchema().then(() => next()).catch(next); });

function filaDivisa(r) {
  return {
    codigo: r.codigo, nombre: r.nombre, simbolo: r.simbolo, tasa_pen: Number(r.tasa_pen),
    activo: r.activo, orden: r.orden, actualizado_por: r.actualizado_por, updated_at: r.updated_at,
  };
}

/* Lista de divisas. ?todas=1 incluye las inactivas (para OPP). */
router.get('/', async (req, res) => {
  try {
    const todas = req.query.todas === '1';
    const { rows } = await pool.query(
      `SELECT * FROM opp.divisas ${todas ? '' : 'WHERE activo'} ORDER BY orden, codigo`
    );
    res.json({ base: BASE, divisas: rows.map(filaDivisa), generated_at: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/historial', requireModuleAccess('OPP', 'CG', 'ADG'), async (req, res) => {
  try {
    const params = [];
    let where = '';
    if (req.query.codigo && CODIGO_RE.test(String(req.query.codigo).toUpperCase())) {
      params.push(String(req.query.codigo).toUpperCase());
      where = 'WHERE codigo = $1';
    }
    const { rows } = await pool.query(
      `SELECT * FROM opp.divisas_historial ${where} ORDER BY created_at DESC LIMIT 200`, params
    );
    res.json({ historial: rows.map(r => ({ ...r, tasa_anterior: r.tasa_anterior == null ? null : Number(r.tasa_anterior), tasa_nueva: r.tasa_nueva == null ? null : Number(r.tasa_nueva) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Crear o actualizar una divisa (solo OPP). */
router.put('/:codigo', requireModuleAccess('OPP', 'CG', 'ADG'), async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').toUpperCase();
    if (!CODIGO_RE.test(codigo)) return res.status(400).json({ error: 'El código debe tener 3 letras (ISO 4217, ej. USD)' });
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim().slice(0, 60);
    const simbolo = String(b.simbolo || '').trim().slice(0, 6);
    const tasa = Number(b.tasa_pen);
    const activo = b.activo !== false;
    const usuario = req.user.nombre || req.user.username;

    if (codigo === BASE) {
      if (tasa && tasa !== 1) return res.status(400).json({ error: 'El Sol (PEN) es la moneda base: su tasa siempre es 1' });
      if (!activo) return res.status(400).json({ error: 'La moneda base (PEN) no se puede desactivar' });
    }
    if (!nombre || !simbolo) return res.status(400).json({ error: 'Nombre y símbolo son requeridos' });
    const tasaFinal = codigo === BASE ? 1 : tasa;
    if (!Number.isFinite(tasaFinal) || tasaFinal <= 0 || tasaFinal > 100000) {
      return res.status(400).json({ error: 'La tasa debe ser un número mayor a 0 (soles por 1 unidad)' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: prev } = await client.query('SELECT * FROM opp.divisas WHERE codigo=$1 FOR UPDATE', [codigo]);
      const { rows } = await client.query(`
        INSERT INTO opp.divisas (codigo, nombre, simbolo, tasa_pen, activo, orden, actualizado_por, updated_at)
        VALUES ($1,$2,$3,$4,$5,COALESCE($6, 100),$7,NOW())
        ON CONFLICT (codigo) DO UPDATE SET
          nombre=EXCLUDED.nombre, simbolo=EXCLUDED.simbolo, tasa_pen=EXCLUDED.tasa_pen,
          activo=EXCLUDED.activo, actualizado_por=EXCLUDED.actualizado_por, updated_at=NOW()
        RETURNING *`,
        [codigo, nombre, simbolo, tasaFinal, activo, Number.isInteger(b.orden) ? b.orden : null, usuario]
      );
      const antes = prev[0];
      let cambio = null;
      if (!antes) cambio = 'alta';
      else if (Number(antes.tasa_pen) !== tasaFinal) cambio = 'tasa';
      else if (antes.activo !== activo) cambio = activo ? 'activada' : 'desactivada';
      else if (antes.nombre !== nombre || antes.simbolo !== simbolo) cambio = 'datos';
      if (cambio) {
        await client.query(
          `INSERT INTO opp.divisas_historial (codigo, tasa_anterior, tasa_nueva, cambio, usuario) VALUES ($1,$2,$3,$4,$5)`,
          [codigo, antes ? antes.tasa_pen : null, tasaFinal, cambio, usuario]
        );
      }
      await client.query('COMMIT');
      res.json({ divisa: filaDivisa(rows[0]) });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
