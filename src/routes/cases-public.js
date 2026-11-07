'use strict';

/* ============================================================
   Casos de Éxito / Proyectos Públicos — Qubira Web
   Permite al sitio web público (Index.html en QUBIRA o deploy en Vercel)
   obtener la lista de proyectos publicados en "Casos que muestran
   impacto real" sin requerir autenticación.
   ============================================================ */

const express = require('express');
const { pool } = require('../db');
const tiRouter = require('./ti');

const router = express.Router();

router.use((req, res, next) => {
  if (tiRouter.helpers?.ensureSchema) {
    tiRouter.helpers.ensureSchema().then(() => next()).catch(err => {
      console.error('[CASES-PUBLIC] Error asegurando schema:', err.message);
      next();
    });
  } else {
    next();
  }
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, code, name, client, description, company_name, company_logo,
             CASE WHEN web_link_locked THEN NULL ELSE website_url END AS website_url,
             COALESCE(web_link_locked, false) AS link_bloqueado,
             project_type, family, web_metric, web_tagline, web_description, web_order
      FROM ti.projects
      WHERE show_on_web = true
      ORDER BY COALESCE(web_order, 0) ASC, created_at DESC
    `);
    res.json({ ok: true, cases: rows });
  } catch (e) {
    console.error('[CASES-PUBLIC] Error obteniendo casos:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

