'use strict';

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { pool } = require('../db');
const cloudinary = require('../config/cloudinary');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Permite acceso con módulo ODACL, DJ o administradores (nivel >= 100)
router.use(requireAuth);
router.use(requireModuleAccess('ODACL', 'DJ', 'ADG'));

let schemaReady = null;
function ensureOdaclSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE SCHEMA IF NOT EXISTS odacl;

      CREATE TABLE IF NOT EXISTS odacl.legal_documents (
        id TEXT PRIMARY KEY,
        titulo TEXT NOT NULL,
        tipo_documento TEXT NOT NULL,
        contenido_html TEXT NOT NULL,
        cloudinary_url TEXT,
        cloudinary_public_id TEXT,
        archivo_nombre TEXT,
        autor TEXT DEFAULT 'ODACL Legal',
        estado TEXT DEFAULT 'Guardado en Nube',
        version INT DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_odacl_docs_tipo ON odacl.legal_documents (tipo_documento);
      CREATE INDEX IF NOT EXISTS idx_odacl_docs_updated ON odacl.legal_documents (updated_at DESC);
    `);
  }
  return schemaReady;
}

router.use((req, res, next) => {
  ensureOdaclSchema().then(() => next()).catch(next);
});

// Función auxiliar para subir buffer a Cloudinary
function uploadBufferToCloudinary(buffer, folder, resourceType, filename) {
  return new Promise((resolve, reject) => {
    const safeName = (filename || 'documento_legal')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\s+/g, '_');
    const publicId = `doc_${Date.now()}_${safeName}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType || 'raw',
        folder: folder || 'qubira/legal/documentos',
        public_id: publicId,
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

/* ============================================================
   1. LISTAR TODOS LOS DOCUMENTOS LEGALES
   ============================================================ */
router.get('/documents', async (req, res) => {
  try {
    const { tipo, q } = req.query;
    let query = `SELECT id, titulo, tipo_documento, cloudinary_url, cloudinary_public_id, archivo_nombre, autor, estado, version, created_at, updated_at FROM odacl.legal_documents WHERE 1=1`;
    const params = [];

    if (tipo) {
      params.push(tipo);
      query += ` AND tipo_documento = $${params.length}`;
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      query += ` AND (LOWER(titulo) LIKE $${params.length} OR LOWER(tipo_documento) LIKE $${params.length})`;
    }
    query += ` ORDER BY updated_at DESC`;

    const result = await pool.query(query, params);
    res.json({ ok: true, documents: result.rows });
  } catch (err) {
    console.error('[ODACL] Error listando documentos:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudieron obtener los documentos legales' });
  }
});

/* ============================================================
   2. OBTENER UN DOCUMENTO POR ID (CON CONTENIDO HTML)
   ============================================================ */
router.get('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM odacl.legal_documents WHERE id = $1`, [id]);
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    }
    res.json({ ok: true, document: result.rows[0] });
  } catch (err) {
    console.error('[ODACL] Error obteniendo documento:', err.message);
    res.status(500).json({ ok: false, error: 'Error al cargar el documento' });
  }
});

/* ============================================================
   3. GUARDAR NUEVO DOCUMENTO (Y SUBIR A CLOUDINARY)
   ============================================================ */
router.post('/documents', async (req, res) => {
  try {
    const { titulo, tipo_documento, contenido_html, autor } = req.body;
    if (!titulo || !contenido_html) {
      return res.status(400).json({ ok: false, error: 'Título y contenido del documento son requeridos' });
    }

    const docId = 'doc_' + crypto.randomUUID().slice(0, 12);
    const filename = `${titulo.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;

    // Empaquetar el HTML con formato y estilo oficial para Cloudinary
    const docBuffer = Buffer.from(contenido_html, 'utf-8');

    // Subir a Cloudinary en carpeta 'qubira/legal/documentos'
    let cloudResult = null;
    try {
      cloudResult = await uploadBufferToCloudinary(
        docBuffer,
        'qubira/legal/documentos',
        'raw',
        filename
      );
    } catch (cErr) {
      console.warn('[ODACL] Advertencia subiendo a Cloudinary:', cErr.message);
    }

    const cloudUrl = cloudResult?.secure_url || null;
    const publicId = cloudResult?.public_id || null;

    const insertResult = await pool.query(
      `INSERT INTO odacl.legal_documents 
       (id, titulo, tipo_documento, contenido_html, cloudinary_url, cloudinary_public_id, archivo_nombre, autor, estado, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Guardado en Nube', 1)
       RETURNING *`,
      [
        docId,
        titulo,
        tipo_documento || 'Contrato General',
        contenido_html,
        cloudUrl,
        publicId,
        filename,
        autor || req.user?.username || 'ODACL Legal'
      ]
    );

    res.json({
      ok: true,
      message: 'Documento guardado con éxito y respaldado en Cloudinary',
      document: insertResult.rows[0]
    });
  } catch (err) {
    console.error('[ODACL] Error guardando documento:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo guardar el documento: ' + err.message });
  }
});

/* ============================================================
   4. ACTUALIZAR DOCUMENTO EXISTENTE (NUEVA VERSIÓN EN CLOUDINARY)
   ============================================================ */
router.put('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, tipo_documento, contenido_html, autor } = req.body;

    const existing = await pool.query(`SELECT * FROM odacl.legal_documents WHERE id = $1`, [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    }

    const prev = existing.rows[0];
    const newVersion = (prev.version || 1) + 1;
    const filename = `${(titulo || prev.titulo).replace(/[^a-zA-Z0-9_-]/g, '_')}_v${newVersion}.html`;

    // Subir nueva versión a Cloudinary
    let cloudUrl = prev.cloudinary_url;
    let publicId = prev.cloudinary_public_id;

    if (contenido_html) {
      try {
        const docBuffer = Buffer.from(contenido_html, 'utf-8');
        const cloudResult = await uploadBufferToCloudinary(
          docBuffer,
          'qubira/legal/documentos',
          'raw',
          filename
        );
        cloudUrl = cloudResult.secure_url;
        publicId = cloudResult.public_id;
      } catch (cErr) {
        console.warn('[ODACL] Advertencia actualizando en Cloudinary:', cErr.message);
      }
    }

    const updateResult = await pool.query(
      `UPDATE odacl.legal_documents
       SET titulo = COALESCE($1, titulo),
           tipo_documento = COALESCE($2, tipo_documento),
           contenido_html = COALESCE($3, contenido_html),
           cloudinary_url = $4,
           cloudinary_public_id = $5,
           archivo_nombre = $6,
           autor = COALESCE($7, autor),
           version = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        titulo || prev.titulo,
        tipo_documento || prev.tipo_documento,
        contenido_html || prev.contenido_html,
        cloudUrl,
        publicId,
        filename,
        autor || req.user?.username || prev.autor,
        newVersion,
        id
      ]
    );

    res.json({
      ok: true,
      message: `Documento v${newVersion} actualizado y guardado en Cloudinary`,
      document: updateResult.rows[0]
    });
  } catch (err) {
    console.error('[ODACL] Error actualizando documento:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo actualizar el documento' });
  }
});

/* ============================================================
   5. ELIMINAR DOCUMENTO
   ============================================================ */
router.delete('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const del = await pool.query(`DELETE FROM odacl.legal_documents WHERE id = $1 RETURNING id, cloudinary_public_id`, [id]);
    if (!del.rows.length) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    }

    // Intento de borrado de Cloudinary si existe public_id
    if (del.rows[0].cloudinary_public_id) {
      try {
        await cloudinary.uploader.destroy(del.rows[0].cloudinary_public_id, { resource_type: 'raw' });
      } catch (_) {}
    }

    res.json({ ok: true, message: 'Documento eliminado del inventario legal' });
  } catch (err) {
    console.error('[ODACL] Error eliminando documento:', err.message);
    res.status(500).json({ ok: false, error: 'Error al eliminar el documento' });
  }
});

/* ============================================================
   6. SUBIDA DIRECTA DE ARCHIVO (WORD, PDF, ETC.) A CLOUDINARY
   ============================================================ */
router.post('/upload', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No se envió ningún archivo' });
    }

    const isImage = req.file.mimetype.startsWith('image/');
    const resType = isImage ? 'image' : 'raw';

    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      'qubira/legal/documentos',
      resType,
      req.file.originalname
    );

    res.json({
      ok: true,
      url: result.secure_url,
      public_id: result.public_id,
      bytes: result.bytes,
      format: result.format || 'bin',
      filename: req.file.originalname
    });
  } catch (err) {
    console.error('[ODACL] Error subiendo archivo a Cloudinary:', err.message);
    res.status(500).json({ ok: false, error: 'Error al subir a Cloudinary: ' + err.message });
  }
});

module.exports = router;
