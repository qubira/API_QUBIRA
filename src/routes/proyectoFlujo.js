'use strict';
/* API del flujo de proyectos (etapas y puertas). La usan ADG, GG, OTI, OPP, ODACL,
   DST, OCOS y ODN desde sus módulos; cada acción revisa área y nivel en lib/proyectoFlujo. */
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const F = require('../lib/proyectoFlujo');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { F.asegurarFlujo().then(() => next()).catch(next); });

const quienDe = async req => ({ ...(await F.C.quienEs(req.user)), id: req.user.id });
const manejar = fn => async (req, res) => {
  try {
    const quien = await quienDe(req);
    if (!(await F.puedeVer(quien))) return res.status(403).json({ ok: false, error: 'Tu área no participa en el flujo de proyectos' });
    await fn(req, res, quien);
  } catch (e) {
    if (e instanceof F.Rechazo) return res.status(e.status).json({ ok: false, error: e.message });
    console.error('[FLUJO]', e.message);
    res.status(500).json({ ok: false, error: 'No se pudo completar la operación' });
  }
};
const detalle = async (res, id, quien) => res.json({ ok: true, data: await F.vista(await F.cargar(id), quien) });

router.get('/config', manejar(async (req, res, quien) => res.json({ ok: true, data: { ...(await F.config()), etapas: F.ETAPAS, puedo_config: !!(quien.esADG && quien.nivel <= 2) } })));
router.put('/config', manejar(async (req, res, quien) => res.json({ ok: true, data: await F.guardarConfig(quien, req.body || {}) })));

// Proyectos en el flujo (los anteriores se piden con ?anteriores=1)
router.get('/', manejar(async (req, res, quien) => {
  const { rows } = await pool.query(`SELECT * FROM ti.projects WHERE ${req.query.anteriores ? 'flujo_etapa IS NULL' : 'flujo_etapa IS NOT NULL'} AND status <> 'cancelled' ORDER BY updated_at DESC LIMIT 300`);
  const data = []; for (const p of rows) data.push(await F.vista(p, quien, false));
  res.json({ ok: true, data });
}));
router.get('/:id', manejar(async (req, res, quien) => detalle(res, req.params.id, quien)));
router.post('/:id/avanzar', manejar(async (req, res, quien) => { await F.avanzar(req.params.id, quien, req.body || {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/devolver', manejar(async (req, res, quien) => { await F.devolver(req.params.id, quien, (req.body || {}).comentario); await detalle(res, req.params.id, quien); }));
router.post('/:id/incorporar', manejar(async (req, res, quien) => { await F.incorporar(req.params.id, quien, req.body || {}); await detalle(res, req.params.id, quien); }));
router.put('/:id/costos', manejar(async (req, res, quien) => { await F.costos(req.params.id, quien, req.body || {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/exceso', manejar(async (req, res, quien) => { await F.exceso(req.params.id, quien, req.body || {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/traspaso/:accion', manejar(async (req, res, quien) => { await F.traspaso(req.params.id, quien, req.params.accion, req.body || {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/riesgos', manejar(async (req, res, quien) => { await F.riesgo(req.params.id, quien, req.body || {}); await detalle(res, req.params.id, quien); }));
router.put('/:id/riesgos/:rid', manejar(async (req, res, quien) => { await F.riesgo(req.params.id, quien, req.body || {}, req.params.rid); await detalle(res, req.params.id, quien); }));

module.exports = router;
