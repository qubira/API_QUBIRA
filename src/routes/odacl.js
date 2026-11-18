'use strict';

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { pool } = require('../db');
const cloudinary = require('../config/cloudinary');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');
const DM = require('../lib/docModulo'); // códigos del registro de documentos (CODIFICACION.md)

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Permite acceso con módulo ODACL, DJ o administradores (nivel >= 100),
// y permite lectura (GET) de plantillas oficiales del Catálogo también a ODN / COMERCIAL.
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.method === 'GET' && (req.path.startsWith('/templates') || req.path === '/info-societaria')) {
    return requireModuleAccess('ODACL', 'DJ', 'ADG', 'COMERCIAL', 'ODN')(req, res, next);
  }
  return requireModuleAccess('ODACL', 'DJ', 'ADG')(req, res, next);
});

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
      -- Código del registro de documentos al emitir (ODN-CTR, ODACL-CTR u ODACL-FMT según la contraparte)
      ALTER TABLE odacl.legal_documents ADD COLUMN IF NOT EXISTS codigo TEXT;
      ALTER TABLE odacl.legal_documents ADD COLUMN IF NOT EXISTS creado_por TEXT;
      CREATE INDEX IF NOT EXISTS idx_odacl_docs_updated ON odacl.legal_documents (updated_at DESC);

      -- Plantillas oficiales del Catálogo reemplazadas por un documento editado
      CREATE TABLE IF NOT EXISTS odacl.official_templates (
        clave TEXT PRIMARY KEY,
        titulo TEXT,
        tipo_documento TEXT,
        contenido_html TEXT NOT NULL,
        origen_doc_id TEXT,
        origen_titulo TEXT,
        origen_version INT,
        actualizado_por TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Datos de catálogo de las plantillas creadas por ODACL
      ALTER TABLE odacl.official_templates ADD COLUMN IF NOT EXISTS categoria TEXT;
      ALTER TABLE odacl.official_templates ADD COLUMN IF NOT EXISTS descripcion TEXT;
      ALTER TABLE odacl.official_templates ADD COLUMN IF NOT EXISTS badge TEXT;
      -- Sección del catálogo: contratos, acuerdos, politicas, terminos
      ALTER TABLE odacl.official_templates ADD COLUMN IF NOT EXISTS grupo TEXT;
      -- Gestión: casos supuestos y los documentos que requiere cada uno
      CREATE TABLE IF NOT EXISTS odacl.gestion_casos (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL, descripcion TEXT, icono TEXT,
        documentos JSONB NOT NULL DEFAULT '[]'::jsonb,
        orden INT DEFAULT 0, updated_por TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Contratos que ODACL registra a mano (NDA, proveedores, locación, etc.)
      CREATE TABLE IF NOT EXISTS odacl.contratos_externos (
        id TEXT PRIMARY KEY,
        codigo TEXT, contraparte TEXT NOT NULL, tipo TEXT,
        moneda TEXT DEFAULT 'PEN', monto NUMERIC(12,2) DEFAULT 0, forma_pago TEXT,
        fecha_inicio DATE, fecha_fin DATE, estado TEXT DEFAULT 'vigente', notas TEXT,
        creado_por TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Número propio de la contraparte (el código del sistema es ODACL-CTR-AAAA-NNN)
      ALTER TABLE odacl.contratos_externos ADD COLUMN IF NOT EXISTS referencia_externa TEXT;
      -- Bandeja de asesoría legal: consultas de las áreas y dictámenes de ODACL
      CREATE TABLE IF NOT EXISTS odacl.consultas (
        id SERIAL PRIMARY KEY,
        radicado TEXT UNIQUE NOT NULL,
        asunto TEXT NOT NULL, detalle TEXT, area TEXT, urgencia TEXT DEFAULT 'Media',
        estado TEXT DEFAULT 'pendiente', dictamen TEXT,
        solicitante TEXT, dictaminado_por TEXT, dictaminado_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Matriz de riesgos legales (editable)
      CREATE TABLE IF NOT EXISTS odacl.riesgos (
        id SERIAL PRIMARY KEY,
        dimension TEXT NOT NULL, riesgo TEXT NOT NULL, probabilidad TEXT, impacto TEXT,
        control TEXT, responsable TEXT, nivel TEXT DEFAULT 'Bajo', orden INT DEFAULT 0,
        updated_por TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Ficha societaria oficial de QUBIRA (la usan los contratos de ODN)
      CREATE TABLE IF NOT EXISTS odacl.info_societaria (
        id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        datos JSONB NOT NULL DEFAULT '{}'::jsonb,
        actualizado_por TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
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
    let query = `SELECT id, codigo, creado_por, titulo, tipo_documento, cloudinary_url, cloudinary_public_id, archivo_nombre, autor, estado, version, created_at, updated_at FROM odacl.legal_documents WHERE 1=1`;
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
       (id, titulo, tipo_documento, contenido_html, cloudinary_url, cloudinary_public_id, archivo_nombre, autor, estado, version, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Guardado en Nube', 1, $9)
       RETURNING *`,
      [
        docId,
        titulo,
        tipo_documento || 'Contrato General',
        contenido_html,
        cloudUrl,
        publicId,
        filename,
        autor || req.user?.username || 'ODACL Legal',
        req.user?.username || null
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
    /* Emitido: un contrato no se edita (se anula y se emite otro que lo reemplace);
       un formato sí, como versión nueva con el mismo código, que el texto debe contener. */
    let reg = null;
    if (prev.codigo) {
      reg = await DM.docDe('ODACL', id);
      if (reg && String(reg.tipo).trim() !== 'FMT') {
        return res.status(409).json({ ok: false, error: `${prev.codigo} ya fue emitido: no se edita. Anúlalo y emite uno nuevo que lo reemplace.` });
      }
      if (contenido_html) req.body.contenido_html = DM.ponerCodigo(contenido_html, prev.codigo);
    }
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
        req.body.contenido_html || prev.contenido_html,
        cloudUrl,
        publicId,
        filename,
        autor || req.user?.username || prev.autor,
        newVersion,
        id
      ]
    );

    if (reg) await DM.nuevaVersion(req.user, 'ODACL', id, newVersion, 'Editado en ODACL').catch(() => {});
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

/* Emitir un documento del editor: recibe su código según la contraparte
   (cliente → ODN-CTR, proveedor/tercero → ODACL-CTR «Externo», modelo → ODACL-FMT)
   y el servidor lo escribe en el texto. */
const CLASE_DOC = {
  cliente: { tipo: 'CTR', area: 'ODN', detalle: 'Cliente' },
  externo: { tipo: 'CTR', area: 'ODACL', detalle: 'Externo' },
  formato: { tipo: 'FMT', area: 'ODACL', detalle: null },
};
router.post('/documents/:id/emitir', async (req, res) => {
  try {
    const clase = CLASE_DOC[(req.body || {}).contraparte];
    if (!clase) return res.status(400).json({ ok: false, error: 'Elige la contraparte: cliente, proveedor/tercero o formato (modelo).' });
    const { rows } = await pool.query('SELECT * FROM odacl.legal_documents WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    const d = rows[0];
    if (d.codigo) return res.status(409).json({ ok: false, error: `Este documento ya fue emitido como ${d.codigo}.` });
    const out = await DM.enTransaccion(null, async cx => {
      const doc = await DM.emitirRegistro(req.user, { tipo: clase.tipo, area: clase.area, titulo: d.titulo, detalle: clase.detalle || d.tipo_documento, modulo: 'ODACL', id_origen: d.id }, { cli: cx });
      const html = DM.ponerCodigo(d.contenido_html, doc.codigo);
      const { rows: [act] } = await cx.query("UPDATE odacl.legal_documents SET codigo = $2, contenido_html = $3, estado = 'Emitido', updated_at = NOW() WHERE id = $1 RETURNING *", [d.id, doc.codigo, html]);
      return act;
    });
    res.json({ ok: true, document: out });
  } catch (e) { DM.responder(res, e, '[ODACL] emitir documento:'); }
});

router.post('/documents/:id/anular', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, codigo FROM odacl.legal_documents WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    if (!rows[0].codigo) return res.status(409).json({ ok: false, error: 'Este documento aún no tiene código: es un borrador.' });
    await DM.anular(req.user, 'ODACL', req.params.id, (req.body || {}).motivo);
    const { rows: [act] } = await pool.query("UPDATE odacl.legal_documents SET estado = 'Anulado', updated_at = NOW() WHERE id = $1 RETURNING *", [req.params.id]);
    res.json({ ok: true, document: act });
  } catch (e) { DM.responder(res, e, '[ODACL] anular documento:'); }
});

/* ============================================================
   5. ELIMINAR DOCUMENTO
   ============================================================ */
router.delete('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    /* Solo un borrador (sin código) y solo quien lo creó. Lo emitido se anula. Los documentos
       anteriores a la codificación esperan su clasificación (fase 4) y no se eliminan. */
    const { rows: act } = await pool.query('SELECT codigo, creado_por FROM odacl.legal_documents WHERE id = $1', [id]);
    if (!act.length) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    if (act[0].codigo) return res.status(409).json({ ok: false, error: `${act[0].codigo} ya fue emitido: no se elimina, se anula con su motivo.` });
    if (!act[0].creado_por) return res.status(409).json({ ok: false, error: 'Este documento es anterior a la codificación: se clasificará y recibirá su código en la migración. No se elimina.' });
    if (String(act[0].creado_por).toLowerCase() !== String(req.user?.username || '').toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'Solo quien creó el borrador puede eliminarlo.' });
    }
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
   PLANTILLAS OFICIALES DEL CATÁLOGO
   Un documento editado puede publicarse como la plantilla oficial de su
   tipo; todo el equipo ODACL la ve en el Catálogo con fecha y autor.
   ============================================================ */
/* ============================================================
   INFORMACIÓN SOCIETARIA OFICIAL DE QUBIRA
   ODACL la mantiene; ODN / COMERCIAL la lee para los contratos.
   ============================================================ */
const INFO_SOCIETARIA_BASE = {
  razon_social: 'QUBIRA',
  tipo_sociedad: 'Sociedad Anónima Cerrada (Ley 26887)',
  ruc: '10764275981',
  estado_ruc: 'ACTIVO',
  condicion_ruc: 'HABIDO',
  domicilio: 'Lima, República del Perú',
  distrito: 'Ancón',
  provincia: 'Lima',
  departamento: 'Lima',
  correo: 'qubirasac@gmail.com',
  web: 'www.qubira.vercel.app',
  regimen: 'Régimen MYPE Tributario SUNAT',
};
const CAMPOS_INFO_SOCIETARIA = Object.keys(INFO_SOCIETARIA_BASE);

async function leerInfoSocietaria() {
  const { rows } = await pool.query('SELECT datos, actualizado_por, updated_at FROM odacl.info_societaria WHERE id = 1');
  const r = rows[0];
  return { ...INFO_SOCIETARIA_BASE, ...(r?.datos || {}), actualizado_por: r?.actualizado_por || null, updated_at: r?.updated_at || null };
}

router.get('/info-societaria', async (req, res) => {
  try { res.json({ ok: true, info: await leerInfoSocietaria() }); }
  catch (e) { console.error('[ODACL] info societaria:', e.message); res.status(500).json({ ok: false, error: 'No se pudo leer la información societaria.' }); }
});

router.put('/info-societaria', async (req, res) => {
  try {
    const b = req.body || {};
    const datos = {};
    CAMPOS_INFO_SOCIETARIA.forEach(k => { if (b[k] !== undefined) datos[k] = String(b[k] ?? '').trim().slice(0, 300); });
    if (datos.razon_social === '' || datos.ruc === '') return res.status(400).json({ ok: false, error: 'La razón social y el RUC son obligatorios.' });
    const autor = `${req.user.nombre || ''} ${req.user.apellidos || ''}`.trim() || req.user.username;
    await pool.query(`
      INSERT INTO odacl.info_societaria (id, datos, actualizado_por, updated_at) VALUES (1, $1::jsonb, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET datos = odacl.info_societaria.datos || EXCLUDED.datos, actualizado_por = EXCLUDED.actualizado_por, updated_at = NOW()`,
      [JSON.stringify(datos), autor]);
    res.json({ ok: true, info: await leerInfoSocietaria() });
  } catch (e) {
    console.error('[ODACL] guardar info societaria:', e.message);
    res.status(500).json({ ok: false, error: 'No se pudo guardar la información societaria.' });
  }
});

/* ============================================================
   CONTRATOS (Comercial + registrados por ODACL), ASESORÍA Y RIESGOS
   ============================================================ */
const txt = (v, n = 500) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim().slice(0, n);
const fecha = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const autorDe = req => `${req.user?.nombre || ''} ${req.user?.apellidos || ''}`.trim() || req.user?.username || 'ODACL';

// Contratos reales: los generados en Comercial y los registrados en ODACL
router.get('/contratos', async (req, res) => {
  try {
    let comerciales = [];
    try {
      const { rows } = await pool.query(`
        SELECT id, cliente_nombre AS contraparte, tipo, producto_nombre, moneda, monto, modalidad_pago AS forma_pago,
               fecha_inicio, fecha_fin, estado, plantilla_titulo, plantilla_clave, responsable, created_at, updated_at,
               (contenido_html IS NOT NULL) AS tiene_documento
          FROM comercial.contratos ORDER BY created_at DESC`);
      comerciales = rows.map(r => ({ ...r, codigo: r.id, origen: 'comercial' }));
    } catch (e) { /* el módulo Comercial aún no creó su tabla */ }
    const { rows: ext } = await pool.query('SELECT * FROM odacl.contratos_externos ORDER BY created_at DESC');
    res.json({ ok: true, contratos: [...comerciales, ...ext.map(r => ({ ...r, origen: 'odacl' }))] });
  } catch (e) {
    console.error('[ODACL] contratos:', e.message);
    res.status(500).json({ ok: false, error: 'No se pudo leer los contratos.' });
  }
});

// Documento del contrato generado en Comercial (para leerlo desde ODACL)
router.get('/contratos/:id/documento', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, cliente_nombre, plantilla_titulo, contenido_html FROM comercial.contratos WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    res.json({ ok: true, contrato: rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: 'No se pudo leer el contrato.' }); }
});

// (Los códigos EXT-/ODACL- ya no se calculan aquí: los asigna el registro de documentos)

/* Contratos con proveedores o terceros = ODACL-CTR «Externo» (ruta: ODACL crea → ADG aprueba).
   El código lo asigna el servidor; el número propio de la contraparte va aparte. */
router.post('/contratos-externos', async (req, res) => {
  try {
    const b = req.body || {};
    if (!txt(b.contraparte)) return res.status(400).json({ ok: false, error: 'La contraparte es obligatoria.' });
    const fila = await DM.enTransaccion(null, async cx => {
      const doc = await DM.emitirRegistro(req.user, { tipo: 'CTR', area: 'ODACL', titulo: `Contrato – ${txt(b.contraparte, 200)}`, detalle: 'Externo', modulo: 'ODACL-CTR' }, { cli: cx, idOrigenEsCodigo: true });
      const id = doc.codigo;
      const { rows } = await cx.query(`
        INSERT INTO odacl.contratos_externos (id, codigo, referencia_externa, contraparte, tipo, moneda, monto, forma_pago, fecha_inicio, fecha_fin, estado, notas, creado_por)
        VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [id, txt(b.referencia_externa || b.codigo, 80), txt(b.contraparte, 200), txt(b.tipo, 160), txt(b.moneda, 5) || 'PEN', Number(b.monto) || 0,
         txt(b.forma_pago, 200), fecha(b.fecha_inicio), fecha(b.fecha_fin), txt(b.estado, 30) || 'vigente', txt(b.notas, 2000), autorDe(req)]);
      return rows[0];
    });
    res.status(201).json({ ok: true, contrato: { ...fila, origen: 'odacl' } });
  } catch (e) { DM.responder(res, e, '[ODACL] contrato externo:'); }
});

router.put('/contratos-externos/:id', async (req, res) => {
  try {
    const b = req.body || {};
    if (!txt(b.contraparte)) return res.status(400).json({ ok: false, error: 'La contraparte es obligatoria.' });
    if (b.estado === 'anulado') return res.status(400).json({ ok: false, error: 'Para anular usa «Anular» (pide el motivo).' });
    // El código del sistema no se cambia; solo los datos del registro y el número de la contraparte
    const { rows } = await pool.query(`
      UPDATE odacl.contratos_externos SET referencia_externa=$2, contraparte=$3, tipo=$4, moneda=$5, monto=$6, forma_pago=$7,
        fecha_inicio=$8, fecha_fin=$9, estado=$10, notas=$11, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id, txt(b.referencia_externa ?? (b.codigo !== req.params.id ? b.codigo : null), 80), txt(b.contraparte, 200), txt(b.tipo, 160), txt(b.moneda, 5) || 'PEN', Number(b.monto) || 0,
       txt(b.forma_pago, 200), fecha(b.fecha_inicio), fecha(b.fecha_fin), txt(b.estado, 30) || 'vigente', txt(b.notas, 2000)]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    res.json({ ok: true, contrato: { ...rows[0], origen: 'odacl' } });
  } catch (e) { res.status(500).json({ ok: false, error: 'No se pudo actualizar el contrato.' }); }
});

// No se elimina: se anula con motivo (el número no se reutiliza)
router.delete('/contratos-externos/:id', (req, res) => {
  res.status(409).json({ ok: false, error: 'Un contrato no se elimina: se anula con su motivo.' });
});
router.post('/contratos-externos/:id/anular', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id FROM odacl.contratos_externos WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });
    await DM.anular(req.user, 'ODACL-CTR', req.params.id, (req.body || {}).motivo);
    const { rows: [act] } = await pool.query("UPDATE odacl.contratos_externos SET estado='anulado', updated_at=NOW() WHERE id=$1 RETURNING *", [req.params.id]);
    res.json({ ok: true, contrato: { ...act, origen: 'odacl' } });
  } catch (e) { DM.responder(res, e, '[ODACL] anular contrato:'); }
});

// Asesoría legal
router.get('/consultas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM odacl.consultas ORDER BY created_at DESC');
    res.json({ ok: true, consultas: rows });
  } catch (e) { res.status(500).json({ ok: false, error: 'No se pudo leer las consultas.' }); }
});

router.post('/consultas', async (req, res) => {
  try {
    const b = req.body || {};
    if (!txt(b.asunto)) return res.status(400).json({ ok: false, error: 'El asunto es obligatorio.' });
    // Radicado = código ODACL-CLG-AAAA-NNN del registro de documentos (ruta: ODACL revisa → ODACL aprueba)
    const consulta = await DM.enTransaccion(null, async cx => {
      const doc = await DM.emitirRegistro(req.user, { tipo: 'CLG', area: 'ODACL', titulo: txt(b.asunto, 300), detalle: txt(b.area, 60) ? `Solicitada por ${txt(b.area, 60)}` : null, modulo: 'ODACL-CLG' }, { cli: cx, idOrigenEsCodigo: true });
      const { rows } = await cx.query(`
        INSERT INTO odacl.consultas (radicado, asunto, detalle, area, urgencia, estado, solicitante)
        VALUES ($1,$2,$3,$4,$5,'pendiente',$6) RETURNING *`,
        [doc.codigo, txt(b.asunto, 300), txt(b.detalle, 5000), txt(b.area, 60), txt(b.urgencia, 20) || 'Media', autorDe(req)]);
      return rows[0];
    });
    res.status(201).json({ ok: true, consulta });
  } catch (e) { DM.responder(res, e, '[ODACL] consulta:'); }
});

router.put('/consultas/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const estado = ['pendiente', 'en_analisis', 'dictaminado', 'archivado'].includes(b.estado) ? b.estado : null;
    const { rows } = await pool.query(`
      UPDATE odacl.consultas SET
        estado = COALESCE($2::text, estado), dictamen = COALESCE($3::text, dictamen),
        urgencia = COALESCE($4::text, urgencia),
        dictaminado_por = CASE WHEN $2::text = 'dictaminado' THEN $5::text ELSE dictaminado_por END,
        dictaminado_at = CASE WHEN $2::text = 'dictaminado' THEN NOW() ELSE dictaminado_at END,
        updated_at = NOW()
      WHERE id = $1 RETURNING *`,
      [Number(req.params.id), estado, txt(b.dictamen, 8000), txt(b.urgencia, 20), autorDe(req)]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Consulta no encontrada' });
    res.json({ ok: true, consulta: rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: 'No se pudo actualizar la consulta.' }); }
});

// Matriz de riesgos (la primera vez se carga la matriz base de QUBIRA)
const RIESGOS_BASE = [
  ['Datos Personales', 'Filtración o acceso no autorizado a datos de clientes en la nube', 'Baja', 'Alto', 'Cifrado SSL, variables protegidas, verificación 2FA y bcryptjs', 'OTI & Legal', 'Bajo'],
  ['Propiedad Intelectual', 'Reclamo de titularidad de código por parte de programador independiente', 'Baja', 'Crítico', 'Contratos con Cláusula de Cesión de Derechos Patrimoniales (D.L. 822)', 'ODACL / RRHH', 'Bajo'],
  ['Contratos & Pagos', 'Impago de armadas por cliente una vez culminado el software', 'Media', 'Medio', 'Cobro del 50% al inicio y retención de entrega en producción hasta cancelación final', 'Comercial & ODACL', 'Medio'],
  ['Tributario SUNAT', 'Omisión de depósito de detracción del 12% en el Banco de la Nación', 'Baja', 'Medio', 'Control cruzado con comprobantes de pago de la OPP y portal SUNAT', 'Finanzas & Legal', 'Bajo'],
  ['Seguridad Laboral', 'Reclamos por fatiga ergonómica o desnaturalización de teletrabajo', 'Baja', 'Bajo', 'Convenios de teletrabajo según Ley 31572 y pausas activas recomendadas', 'RRHH', 'Bajo'],
];
router.get('/riesgos', async (req, res) => {
  try {
    let { rows } = await pool.query('SELECT * FROM odacl.riesgos ORDER BY orden, id');
    if (!rows.length) {
      for (const [i, r] of RIESGOS_BASE.entries()) {
        await pool.query('INSERT INTO odacl.riesgos (dimension, riesgo, probabilidad, impacto, control, responsable, nivel, orden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [...r, i]);
      }
      ({ rows } = await pool.query('SELECT * FROM odacl.riesgos ORDER BY orden, id'));
    }
    res.json({ ok: true, riesgos: rows });
  } catch (e) { res.status(500).json({ ok: false, error: 'No se pudo leer la matriz de riesgos.' }); }
});

const datosRiesgo = b => [txt(b.dimension, 120), txt(b.riesgo, 600), txt(b.probabilidad, 20), txt(b.impacto, 20), txt(b.control, 800), txt(b.responsable, 120), txt(b.nivel, 20) || 'Bajo'];
router.post('/riesgos', async (req, res) => {
  try {
    const b = req.body || {};
    if (!txt(b.dimension) || !txt(b.riesgo)) return res.status(400).json({ ok: false, error: 'La dimensión y el riesgo son obligatorios.' });
    const { rows } = await pool.query(`INSERT INTO odacl.riesgos (dimension, riesgo, probabilidad, impacto, control, responsable, nivel, orden, updated_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(MAX(orden),0)+1 FROM odacl.riesgos),$8) RETURNING *`, [...datosRiesgo(b), autorDe(req)]);
    res.status(201).json({ ok: true, riesgo: rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: 'No se pudo agregar el riesgo.' }); }
});
router.put('/riesgos/:id', async (req, res) => {
  try {
    const b = req.body || {};
    if (!txt(b.dimension) || !txt(b.riesgo)) return res.status(400).json({ ok: false, error: 'La dimensión y el riesgo son obligatorios.' });
    const { rows } = await pool.query(`UPDATE odacl.riesgos SET dimension=$2, riesgo=$3, probabilidad=$4, impacto=$5, control=$6, responsable=$7, nivel=$8,
      updated_por=$9, updated_at=NOW() WHERE id=$1 RETURNING *`, [Number(req.params.id), ...datosRiesgo(b), autorDe(req)]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Riesgo no encontrado' });
    res.json({ ok: true, riesgo: rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: 'No se pudo actualizar el riesgo.' }); }
});
router.delete('/riesgos/:id', async (req, res) => {
  try { await pool.query('DELETE FROM odacl.riesgos WHERE id=$1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: 'No se pudo eliminar el riesgo.' }); }
});

const CLAVE_PLANTILLA = /^[a-z0-9_]{2,60}$/;

// Gestión: casos supuestos → documentos que se deben usar (la primera vez, casos base)
const o = (clave, nota = '') => ({ clave, requisito: 'obligatorio', nota });
const a = (clave, nota = '') => ({ clave, requisito: 'si_aplica', nota });
const CASOS_BASE = [
  ['💻', 'Nuevo cliente: desarrollo de software a medida', 'Un cliente contrata a QUBIRA para desarrollar una web, app móvil o sistema a medida con Sprints.',
    [o('desarrollo_software'), o('desarrollo_software_anexo_a', 'Uno por cada Sprint aprobado'), o('desarrollo_software_anexo_b', 'Cuando el cliente pida un cambio'), o('desarrollo_software_anexo_c', 'Al entregar el proyecto'), a('acuerdo_nda', 'Si el cliente comparte información sensible antes de firmar'), a('sla_servicio', 'Si incluye soporte o hosting después de la entrega')]],
  ['☁️', 'Cliente contrata un software por suscripción (SaaS)', 'El cliente usa una plataforma de QUBIRA pagando una licencia mensual o anual.',
    [o('licenciamiento_software'), o('sla_servicio', 'Disponibilidad y tiempos de respuesta'), o('terminos_condiciones'), o('politica_privacidad')]],
  ['🛵', 'Lanzar una app de delivery o marketplace', 'Se publica una plataforma donde usuarios piden, comercios venden y repartidores entregan.',
    [o('terminos_usuarios_app'), o('politica_privacidad_app'), o('afiliacion_comercios', 'Con cada comercio afiliado'), o('servicios_reparto', 'Con cada repartidor')]],
  ['🏪', 'Afiliar un comercio a la plataforma', 'Un restaurante o tienda se une a la app para vender sus productos.',
    [o('afiliacion_comercios'), o('politica_privacidad_app', 'Entregarla junto con el contrato')]],
  ['📦', 'Incorporar un repartidor independiente', 'Una persona se registra para realizar entregas sin relación laboral.',
    [o('servicios_reparto'), o('politica_privacidad_app')]],
  ['👔', 'Contratar a un trabajador en planilla', 'Ingreso de personal dependiente bajo el régimen laboral privado.',
    [o('laboral_dl728'), o('acuerdo_nda', 'Si tendrá acceso a código o datos de clientes')]],
  ['🧑‍💻', 'Contratar a un programador independiente (freelance)', 'Servicios por recibo por honorarios donde QUBIRA debe quedarse con los derechos del código.',
    [o('servicios_profesionales', 'Incluye la cesión de derechos patrimoniales'), o('acuerdo_nda')]],
  ['🎓', 'Incorporar a un practicante', 'Estudiante o egresado que realiza prácticas pre profesionales.',
    [o('servicios_preprofesionales'), a('acuerdo_nda', 'Si tendrá acceso a información confidencial')]],
  ['🖥️', 'Contratar servidores o servicios cloud', 'Proveedor de hosting, base de datos, CDN u otra infraestructura.',
    [o('proveedores_infraestructura'), a('acuerdo_nda'), a('sla_servicio', 'Para exigir disponibilidad al proveedor')]],
  ['🤝', 'Reunión con un posible cliente o socio', 'Antes de mostrar información interna, propuestas técnicas o código.',
    [o('acuerdo_nda')]],
  ['🌐', 'Publicar o actualizar el sitio web de QUBIRA', 'El sitio recoge datos de contacto o permite registrarse.',
    [o('terminos_condiciones'), o('politica_privacidad')]],
  ['🧾', 'Servicio puntual o consultoría', 'Un trabajo específico sin desarrollo por Sprints (asesoría, capacitación, auditoría).',
    [o('prestacion_servicios'), a('acuerdo_nda')]],
];
const datosCaso = b => {
  const docs = (Array.isArray(b.documentos) ? b.documentos : [])
    .filter(d => d && CLAVE_PLANTILLA.test(String(d.clave || '')))
    .slice(0, 40)
    .map(d => ({ clave: d.clave, requisito: d.requisito === 'si_aplica' ? 'si_aplica' : 'obligatorio', nota: String(d.nota || '').trim().slice(0, 200) }));
  return [txt(b.titulo, 200), txt(b.descripcion, 800), txt(b.icono, 8), JSON.stringify(docs)];
};
router.get('/gestion-casos', async (req, res) => {
  try {
    let { rows } = await pool.query('SELECT * FROM odacl.gestion_casos ORDER BY orden, id');
    if (!rows.length) {
      for (const [i, [icono, titulo, descripcion, documentos]] of CASOS_BASE.entries()) {
        await pool.query('INSERT INTO odacl.gestion_casos (titulo, descripcion, icono, documentos, orden) VALUES ($1,$2,$3,$4::jsonb,$5)',
          [titulo, descripcion, icono, JSON.stringify(documentos), i]);
      }
      ({ rows } = await pool.query('SELECT * FROM odacl.gestion_casos ORDER BY orden, id'));
    }
    res.json({ ok: true, casos: rows });
  } catch (e) { console.error('[ODACL] gestion:', e.message); res.status(500).json({ ok: false, error: 'No se pudo leer los casos de gestión.' }); }
});
router.post('/gestion-casos', async (req, res) => {
  try {
    const d = datosCaso(req.body || {});
    if (!d[0]) return res.status(400).json({ ok: false, error: 'El caso necesita un título.' });
    const { rows } = await pool.query(`INSERT INTO odacl.gestion_casos (titulo, descripcion, icono, documentos, orden, updated_por)
      VALUES ($1,$2,$3,$4::jsonb,(SELECT COALESCE(MAX(orden),0)+1 FROM odacl.gestion_casos),$5) RETURNING *`, [...d, autorDe(req)]);
    res.status(201).json({ ok: true, caso: rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: 'No se pudo guardar el caso.' }); }
});
router.put('/gestion-casos/:id', async (req, res) => {
  try {
    const d = datosCaso(req.body || {});
    if (!d[0]) return res.status(400).json({ ok: false, error: 'El caso necesita un título.' });
    const { rows } = await pool.query(`UPDATE odacl.gestion_casos SET titulo=$2, descripcion=$3, icono=$4, documentos=$5::jsonb,
      updated_por=$6, updated_at=NOW() WHERE id=$1 RETURNING *`, [Number(req.params.id), ...d, autorDe(req)]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Caso no encontrado' });
    res.json({ ok: true, caso: rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: 'No se pudo actualizar el caso.' }); }
});
router.delete('/gestion-casos/:id', async (req, res) => {
  try { await pool.query('DELETE FROM odacl.gestion_casos WHERE id=$1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: 'No se pudo eliminar el caso.' }); }
});

router.get('/templates', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT clave, titulo, tipo_documento, contenido_html, origen_doc_id, origen_titulo,
              origen_version, actualizado_por, updated_at, categoria, descripcion, badge, grupo
         FROM odacl.official_templates ORDER BY updated_at DESC`
    );
    res.json({ ok: true, templates: result.rows });
  } catch (err) {
    console.error('[ODACL] Error listando plantillas oficiales:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudieron obtener las plantillas oficiales' });
  }
});

router.put('/templates/:clave', async (req, res) => {
  try {
    const { clave } = req.params;
    if (!CLAVE_PLANTILLA.test(clave)) {
      return res.status(400).json({ ok: false, error: 'Clave de plantilla no válida' });
    }
    const { titulo, tipo_documento, contenido_html, origen_doc_id, origen_titulo, origen_version, categoria, descripcion, badge, grupo } = req.body || {};
    const corto = (v, n) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim().slice(0, n);
    if (!contenido_html || typeof contenido_html !== 'string' || contenido_html.length < 20) {
      return res.status(400).json({ ok: false, error: 'El contenido de la plantilla es requerido' });
    }
    if (contenido_html.length > 950 * 1024) {
      return res.status(413).json({ ok: false, error: 'La plantilla supera el tamaño máximo (1 MB)' });
    }
    const autor = req.user?.username || 'ODACL Legal';
    const result = await pool.query(
      `INSERT INTO odacl.official_templates
         (clave, titulo, tipo_documento, contenido_html, origen_doc_id, origen_titulo, origen_version, actualizado_por, updated_at, categoria, descripcion, badge, grupo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12)
       ON CONFLICT (clave) DO UPDATE SET
         titulo = EXCLUDED.titulo,
         tipo_documento = EXCLUDED.tipo_documento,
         contenido_html = EXCLUDED.contenido_html,
         origen_doc_id = EXCLUDED.origen_doc_id,
         origen_titulo = EXCLUDED.origen_titulo,
         origen_version = EXCLUDED.origen_version,
         actualizado_por = EXCLUDED.actualizado_por,
         updated_at = NOW(),
         -- Si una nueva publicación no los envía, se conservan los datos de catálogo
         categoria = COALESCE(EXCLUDED.categoria, odacl.official_templates.categoria),
         descripcion = COALESCE(EXCLUDED.descripcion, odacl.official_templates.descripcion),
         badge = COALESCE(EXCLUDED.badge, odacl.official_templates.badge),
         grupo = COALESCE(EXCLUDED.grupo, odacl.official_templates.grupo)
       RETURNING *`,
      [clave, titulo || null, tipo_documento || null, contenido_html, origen_doc_id || null,
       origen_titulo || null, Number.isInteger(origen_version) ? origen_version : null, autor,
       corto(categoria, 120), corto(descripcion, 600), corto(badge, 60),
       ['contratos', 'acuerdos', 'politicas', 'terminos'].includes(grupo) ? grupo : null]
    );
    res.json({ ok: true, message: 'Plantilla oficial actualizada', template: result.rows[0] });
  } catch (err) {
    console.error('[ODACL] Error actualizando plantilla oficial:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo actualizar la plantilla oficial' });
  }
});

// Restaurar la plantilla original del sistema (elimina la versión oficial publicada)
router.delete('/templates/:clave', async (req, res) => {
  try {
    const { clave } = req.params;
    if (!CLAVE_PLANTILLA.test(clave)) {
      return res.status(400).json({ ok: false, error: 'Clave de plantilla no válida' });
    }
    await pool.query(`DELETE FROM odacl.official_templates WHERE clave = $1`, [clave]);
    res.json({ ok: true, message: 'Plantilla restaurada a la versión original' });
  } catch (err) {
    console.error('[ODACL] Error restaurando plantilla:', err.message);
    res.status(500).json({ ok: false, error: 'No se pudo restaurar la plantilla' });
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
