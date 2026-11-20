'use strict';
/* Tablero Scrum de cada proyecto (lib/scrum). Lo mueve OTI; las demás áreas del flujo lo ven y pueden reportar fallas. */
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const C = require('../lib/codificacion');
const S = require('../lib/scrum');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { S.asegurar().then(() => next()).catch(next); });

const manejar = fn => async (req, res) => {
  try {
    const q = await C.quienEs(req.user);
    if (!S.puedeVer(q)) return res.status(403).json({ ok: false, error: 'Tu área no participa en el desarrollo de proyectos' });
    const { rows } = await pool.query('SELECT id, name, flujo_etapa FROM ti.projects WHERE id = $1', [req.params.pid]).catch(() => ({ rows: [] }));
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Proyecto no encontrado' });
    await fn(req, res, q, rows[0]);
  } catch (e) {
    if (e instanceof S.Rechazo) return res.status(e.status).json({ ok: false, error: e.message });
    console.error('[SCRUM]', e.message);
    res.status(500).json({ ok: false, error: 'No se pudo completar la operación' });
  }
};
const esOTI = (q, n) => q.esADG || (q.sigla === 'OTI' && q.nivel && q.nivel <= n);
const enviar = async (res, q, p) => res.json({ ok: true, data: { ...(await S.tablero(p.id)), proyecto: p.name, etapa: p.flujo_etapa,
  puedo_editar: esOTI(q, 9), puedo_sprint: esOTI(q, 5), puedo_priorizar: esOTI(q, 4), puedo_falla: esOTI(q, 9) || ['GG', 'DST', 'ODACL', 'OCOS', 'OPP', 'ODN'].includes(q.sigla) } });

router.get('/:pid', manejar(async (req, res, q, p) => enviar(res, q, p)));
router.post('/:pid/historias', manejar(async (req, res, q, p) => { await S.crearHistoria(p.id, q, req.body || {}); await enviar(res, q, p); }));
router.put('/:pid/historias/:hid', manejar(async (req, res, q, p) => { await S.editarHistoria(p.id, req.params.hid, q, req.body || {}); await enviar(res, q, p); }));
router.post('/:pid/sprints', manejar(async (req, res, q, p) => { await S.sprint(p.id, q, 'crear', req.body || {}); await enviar(res, q, p); }));
router.post('/:pid/sprints/:sid/:accion', manejar(async (req, res, q, p) => { await S.sprint(p.id, q, req.params.accion, req.body || {}, req.params.sid); await enviar(res, q, p); }));

module.exports = router;
