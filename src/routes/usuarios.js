'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth, requireLevel } = require('../middleware/auth');

const router = express.Router();

/* Todos los endpoints requieren autenticación + nivel ADMIN/CEO (>=80).
   Es la tabla `usuarios` compartida por todo Qubira (login de control.html,
   RRHH, Soporte, TI), no un dato exclusivo de un solo panel. */
router.use(requireAuth, requireLevel(80));

/* ============================================================
   GET /api/usuarios/roles
   Lista de roles disponibles (para el selector del formulario)
   ============================================================ */
router.get('/roles', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, descripcion, nivel_acceso FROM roles ORDER BY nivel_acceso DESC'
    );
    return res.json({ ok: true, roles: rows });
  } catch (err) {
    console.error('[USUARIOS] GET /roles error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener roles' });
  }
});

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

/* ============================================================
   POST /api/usuarios
   Crear cuenta
   ============================================================ */
router.post('/', async (req, res) => {
  try {
    const { nombre, apellidos, dni, celular, correo, username, password, rol, estado, avatar_color } = req.body;

    if (!nombre || !apellidos || !correo || !username || !password || !rol) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios' });
    }

    const { rows: rolRows } = await pool.query('SELECT id FROM roles WHERE nombre = $1', [rol.toUpperCase()]);
    if (!rolRows.length) return res.status(400).json({ ok: false, error: 'Rol no válido' });

    const { rows: exists } = await pool.query(
      'SELECT id FROM usuarios WHERE username = $1 OR correo = $2',
      [username.trim().toLowerCase(), correo.trim().toLowerCase()]
    );
    if (exists.length) return res.status(409).json({ ok: false, error: 'El usuario o correo ya existe' });

    const hash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `INSERT INTO usuarios
         (nombre, apellidos, dni, celular, correo, username, password_hash, rol_id, estado, avatar_color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, nombre, apellidos, dni, celular, correo, username, estado, avatar_color, created_at`,
      [
        nombre.trim(), apellidos.trim(), dni?.trim() || null, celular?.trim() || null,
        correo.trim().toLowerCase(), username.trim().toLowerCase(), hash,
        rolRows[0].id, estado || 'activo', avatar_color ?? 0,
      ]
    );

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, valor_nuevo, realizado_por)
       VALUES ($1, 'CREAR_USUARIO', $2, $3)`,
      [rows[0].id, username, req.user.id]
    );

    return res.status(201).json({ ok: true, usuario: { ...rows[0], rol: rol.toUpperCase() } });
  } catch (err) {
    console.error('[USUARIOS] POST / error:', err.message);
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Usuario o correo duplicado' });
    return res.status(500).json({ ok: false, error: 'Error al crear usuario' });
  }
});

/* ============================================================
   PUT /api/usuarios/:id
   Editar cuenta (contraseña opcional — solo se cambia si se envía)
   ============================================================ */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

    const { rows: existing } = await pool.query(
      `SELECT u.*, r.nombre AS rol_nombre, r.nivel_acceso
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`,
      [id]
    );
    if (!existing.length) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const target = existing[0];

    if (target.nivel_acceso >= 100 && req.user.nivel_acceso < 100) {
      return res.status(403).json({ ok: false, error: 'No puedes editar un usuario CEO' });
    }

    const { nombre, apellidos, dni, celular, correo, username, password, rol, estado, avatar_color } = req.body;

    let rolId = target.rol_id;
    if (rol && rol.toUpperCase() !== target.rol_nombre) {
      const { rows: rolRows } = await pool.query('SELECT id FROM roles WHERE nombre=$1', [rol.toUpperCase()]);
      if (!rolRows.length) return res.status(400).json({ ok: false, error: 'Rol no válido' });
      rolId = rolRows[0].id;
    }

    let hash = target.password_hash;
    if (password) {
      if (password.length < 8) return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
      hash = await bcrypt.hash(password, 12);
    }

    const { rows } = await pool.query(
      `UPDATE usuarios SET
         nombre = $1, apellidos = $2, dni = $3, celular = $4, correo = $5,
         username = $6, password_hash = $7, rol_id = $8, estado = $9, avatar_color = $10
       WHERE id = $11
       RETURNING id, nombre, apellidos, dni, celular, correo, username, estado, avatar_color, updated_at`,
      [
        nombre?.trim() || target.nombre,
        apellidos?.trim() || target.apellidos,
        dni?.trim() || target.dni,
        celular?.trim() || target.celular,
        correo?.trim().toLowerCase() || target.correo,
        username?.trim().toLowerCase() || target.username,
        hash, rolId, estado || target.estado, avatar_color ?? target.avatar_color, id,
      ]
    );

    if (password) {
      await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [id]);
    }

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, valor_anterior, valor_nuevo, realizado_por)
       VALUES ($1, 'EDITAR_USUARIO', $2, $3, $4)`,
      [id, target.username, username || target.username, req.user.id]
    );

    const { rows: rolNombre } = await pool.query('SELECT nombre FROM roles WHERE id = $1', [rolId]);

    return res.json({ ok: true, usuario: { ...rows[0], rol: rolNombre[0].nombre } });
  } catch (err) {
    console.error('[USUARIOS] PUT error:', err.message);
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Usuario o correo duplicado' });
    return res.status(500).json({ ok: false, error: 'Error al actualizar usuario' });
  }
});

/* ============================================================
   PATCH /api/usuarios/:id/estado
   Alterna activo/inactivo
   ============================================================ */
router.patch('/:id/estado', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

    if (id === req.user.id) {
      return res.status(400).json({ ok: false, error: 'No puedes desactivar tu propia cuenta' });
    }

    const { rows } = await pool.query(
      `UPDATE usuarios
       SET estado = CASE WHEN estado = 'activo' THEN 'inactivo'::estado_usuario ELSE 'activo'::estado_usuario END
       WHERE id = $1
       RETURNING id, estado`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (rows[0].estado === 'inactivo') {
      await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [id]);
    }

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, valor_nuevo, realizado_por)
       VALUES ($1, 'CAMBIO_ESTADO', $2, $3)`,
      [id, rows[0].estado, req.user.id]
    );

    return res.json({ ok: true, id: rows[0].id, estado: rows[0].estado });
  } catch (err) {
    console.error('[USUARIOS] PATCH estado error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al cambiar estado' });
  }
});

/* ============================================================
   DELETE /api/usuarios/:id
   Solo CEO
   ============================================================ */
router.delete('/:id', requireLevel(100), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

    if (id === req.user.id) {
      return res.status(400).json({ ok: false, error: 'No puedes eliminarte a ti mismo' });
    }

    const { rows: target } = await pool.query('SELECT username FROM usuarios WHERE id=$1', [id]);
    if (!target.length) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await pool.query(
      `INSERT INTO auditoria_usuarios (usuario_id, accion, valor_anterior, realizado_por)
       VALUES ($1, 'ELIMINAR_USUARIO', $2, $3)`,
      [id, target[0].username, req.user.id]
    );

    await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [id]);
    await pool.query('DELETE FROM usuarios WHERE id=$1', [id]);

    return res.json({ ok: true, message: 'Usuario eliminado' });
  } catch (err) {
    console.error('[USUARIOS] DELETE error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar usuario' });
  }
});

module.exports = router;
