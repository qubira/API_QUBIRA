'use strict';
/* Sistema de gestión integrado: normas ISO, mapa de riesgos y revisión por la dirección (lib/sgi) */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const C = require('../lib/codificacion');
const G = require('../lib/sgi');

const router = express.Router();
router.use(requireAuth);
const manejar = fn => async (req, res) => {
  try { const q = await C.quienEs(req.user); await fn(req, res, q); }
  catch (e) {
    if (e instanceof G.Rechazo || (e && e.status && e.message)) return res.status(e.status || 500).json({ ok: false, error: e.message });
    console.error('[SGI]', e.message); res.status(500).json({ ok: false, error: 'No se pudo completar la operación' });
  }
};
const enviar = async (res, q) => res.json({ ok: true, data: await G.resumen(q) });

router.get('/', manejar(async (req, res, q) => enviar(res, q)));
router.post('/riesgos', manejar(async (req, res, q) => { await G.riesgo(q, req.body || {}); await enviar(res, q); }));
router.put('/riesgos/:id', manejar(async (req, res, q) => { await G.riesgo(q, req.body || {}, req.params.id); await enviar(res, q); }));
router.post('/revisiones', manejar(async (req, res, q) => { await G.revision(req.user, q, 'crear', req.body || {}); await enviar(res, q); }));
router.put('/revisiones/:id', manejar(async (req, res, q) => { await G.revision(req.user, q, 'editar', req.body || {}, req.params.id); await enviar(res, q); }));
router.post('/revisiones/:id/emitir', manejar(async (req, res, q) => { await G.revision(req.user, q, 'emitir', req.body || {}, req.params.id); await enviar(res, q); }));

module.exports = router;
