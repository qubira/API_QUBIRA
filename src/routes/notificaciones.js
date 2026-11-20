'use strict';
/* Notificaciones de la cuenta (campana de los módulos): solo las propias */
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const N = require('../lib/notificar');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { N.asegurar().then(() => next()).catch(next); });
const yo = req => String(req.user.username || '').toLowerCase();

router.get('/', async (req, res) => {
  try {
    const [{ rows }, { rows: [c] }] = await Promise.all([
      pool.query('SELECT id, titulo, texto, modulo, tipo, referencia, leida, creada FROM notif.avisos WHERE usuario = $1 ORDER BY creada DESC LIMIT 50', [yo(req)]),
      pool.query('SELECT COUNT(*)::int AS n FROM notif.avisos WHERE usuario = $1 AND NOT leida', [yo(req)]),
    ]);
    res.json({ ok: true, sin_leer: c.n, avisos: rows });
  } catch (e) { res.status(500).json({ ok: false, error: 'No se pudieron leer las notificaciones' }); }
});
router.post('/leer-todas', async (req, res) => {
  try { await pool.query('UPDATE notif.avisos SET leida = true WHERE usuario = $1 AND NOT leida', [yo(req)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: 'No se pudo marcar' }); }
});
router.post('/:id/leer', async (req, res) => {
  try { await pool.query('UPDATE notif.avisos SET leida = true WHERE id = $1 AND usuario = $2', [Number(req.params.id) || 0, yo(req)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: 'No se pudo marcar' }); }
});

module.exports = router;
