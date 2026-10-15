'use strict';

const express  = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');

const router = express.Router();

router.use(requireAuth);
router.use(requireModuleAccess('COMERCIAL'));

/* Solo lectura. Columnas whitelisteadas a propósito: nunca se expone
   cliente, presupuesto, responsable interno ni nº de documento — esos
   datos son de ADG/TI, no del área Comercial. */
router.get('/products', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, code, name, description, status, progress, family, project_type,
             company_logo, commercial_offer_type, commercial_price, commercial_price_currency, commercial_notes,
             rental_price, sale_price_min, rental_price_min,
             updated_at
      FROM ti.projects
      WHERE show_to_comercial = true
      ORDER BY updated_at DESC
    `);
    res.json({ products: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE commercial_offer_type = 'venta')::int AS en_venta,
             COUNT(*) FILTER (WHERE commercial_offer_type = 'alquiler')::int AS en_alquiler,
             COUNT(*) FILTER (WHERE commercial_offer_type = 'venta_alquiler')::int AS venta_o_alquiler,
             COALESCE(ROUND(AVG(progress)), 0)::int AS avg_progress
      FROM ti.projects
      WHERE show_to_comercial = true
    `);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
