'use strict';

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');

const router = express.Router();
const estados = new Set(['pendiente', 'en_revision', 'observado', 'revisado']);
let esquema;

function prepararRegistro() {
  esquema ??= pool.query(`
    CREATE SCHEMA IF NOT EXISTS on_interna;
    CREATE TABLE IF NOT EXISTS on_interna.registro (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      referencia TEXT NOT NULL UNIQUE,
      titulo TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente','en_revision','observado','revisado')),
      observacion TEXT NOT NULL DEFAULT '',
      creado_por INTEGER NOT NULL,
      actualizado_por INTEGER NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(error => {
    esquema = null;
    throw error;
  });
  return esquema;
}

router.use(requireAuth, requireModuleAccess('ON'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  prepararRegistro().then(() => next(), next);
});

router.get('/registro', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.referencia, r.titulo, r.estado, r.observacion, r.actualizado_en,
             trim(concat_ws(' ', u.nombre, u.apellidos)) AS actualizado_por
      FROM on_interna.registro r
      LEFT JOIN public.usuarios u ON u.id=r.actualizado_por
      ORDER BY r.actualizado_en DESC, r.id DESC
    `);
    res.json(rows);
  } catch (error) { next(error); }
});

router.post('/registro', async (req, res, next) => {
  const referencia = typeof req.body?.referencia === 'string' ? req.body.referencia.trim().toUpperCase() : '';
  const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
  if (!referencia || referencia.length > 80 || !titulo || titulo.length > 200) {
    return res.status(400).json({ error: 'Ingresa una referencia y un título válidos.' });
  }
  try {
    const { rows } = await pool.query(`
      INSERT INTO on_interna.registro (referencia,titulo,creado_por,actualizado_por)
      VALUES ($1,$2,$3,$3) RETURNING id
    `, [referencia, titulo, req.user.id]);
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Esa referencia ya está registrada.' });
    next(error);
  }
});

router.patch('/registro/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return res.status(404).json({ error: 'Registro no encontrado.' });
  const { estado, observacion } = req.body || {};
  if (!estados.has(estado) || typeof observacion !== 'string' || observacion.length > 2000) {
    return res.status(400).json({ error: 'Selecciona un estado válido y revisa la longitud de la observación.' });
  }
  try {
    const { rowCount } = await pool.query(`
      UPDATE on_interna.registro
      SET estado=$2, observacion=$3, actualizado_por=$4, actualizado_en=NOW()
      WHERE id=$1
    `, [id, estado, observacion.trim(), req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
