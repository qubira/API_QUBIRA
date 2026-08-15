'use strict';

const express  = require('express');
const { pool } = require('../db');
const { requireAuth, requireLevel } = require('../middleware/auth');

const router = express.Router();

/* Solo lectura: la única tabla `usuarios` compartida por todo Qubira.
   Crear cuentas es exclusivo de RRHH (al dar de alta un empleado, ver
   rrhh.js) y restablecer contraseñas es exclusivo de Soporte (ver
   soporte.js). Este router no expone ninguna escritura. */
router.use(requireAuth, requireLevel(80));

/* ============================================================
   GET /api/usuarios
   Lista todas las cuentas del sistema
   ============================================================ */
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.apellidos, u.dni, u.celular, u.correo, u.username,
              r.nombre AS rol, r.nivel_acceso, u.estado, u.avatar_color,
              u.created_at, u.updated_at
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       ORDER BY u.nombre ASC, u.apellidos ASC`
    );
    return res.json({ ok: true, usuarios: rows });
  } catch (err) {
    console.error('[USUARIOS] GET / error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener usuarios' });
  }
});

module.exports = router;
