'use strict';

const express  = require('express');
const crypto   = require('crypto');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');
const { getApprovedTemplates, getApprovedTemplateByKey } = require('../lib/legalTemplates');

function uid() { return crypto.randomUUID(); }

const router = express.Router();

router.use(requireAuth);
router.use(requireModuleAccess('COMERCIAL', 'ODN'));

/* ============================================================
   Esquema — Clientes, Contratos y Proformas de ODN/Comercial.
   Antes vivían solo en localStorage del navegador (nunca llegaban a
   Postgres); esto les da persistencia real compartida entre usuarios.
   Los contratos/proformas guardan una "foto" de los datos del cliente
   al momento de crearse (cliente_nombre, cliente_ruc, etc.) además de
   la referencia — así conservan su historial aunque el cliente se
   edite o elimine después (cliente_id queda en NULL, no se borra el
   contrato/proforma).
   ============================================================ */
let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = pool.query(`
      CREATE SCHEMA IF NOT EXISTS comercial;

      CREATE TABLE IF NOT EXISTS comercial.clientes (
        id TEXT PRIMARY KEY,
        razon_social TEXT NOT NULL,
        ruc TEXT NOT NULL,
        sector TEXT,
        direccion TEXT,
        ciudad TEXT,
        contacto_nombre TEXT,
        contacto_cargo TEXT,
        telefono TEXT,
        email TEXT,
        tipo TEXT NOT NULL DEFAULT 'pyme',
        estado TEXT NOT NULL DEFAULT 'activo',
        origen TEXT,
        notas TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS comercial_clientes_ruc_idx ON comercial.clientes(ruc);
      -- "ciudad" queda sin usar (reemplazado por pais/provincia/distrito,
      -- separados) — se deja la columna para no romper filas viejas.
      ALTER TABLE comercial.clientes ADD COLUMN IF NOT EXISTS pais TEXT;
      ALTER TABLE comercial.clientes ADD COLUMN IF NOT EXISTS provincia TEXT;
      ALTER TABLE comercial.clientes ADD COLUMN IF NOT EXISTS distrito TEXT;

      CREATE TABLE IF NOT EXISTS comercial.contratos (
        id TEXT PRIMARY KEY,
        cliente_id TEXT REFERENCES comercial.clientes(id) ON DELETE SET NULL,
        cliente_nombre TEXT, cliente_ruc TEXT, cliente_contacto TEXT, cliente_cargo TEXT, cliente_direccion TEXT,
        tipo TEXT, producto_nombre TEXT,
        moneda TEXT NOT NULL DEFAULT 'USD',
        monto NUMERIC(12,2) NOT NULL DEFAULT 0,
        modalidad_pago TEXT,
        fecha_inicio DATE, fecha_fin DATE,
        garantia TEXT, objeto TEXT, entregables TEXT,
        estado TEXT NOT NULL DEFAULT 'borrador',
        responsable TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE comercial.contratos ADD COLUMN IF NOT EXISTS metodo_trabajo TEXT;
      ALTER TABLE comercial.contratos ADD COLUMN IF NOT EXISTS plantilla_clave TEXT;
      ALTER TABLE comercial.contratos ADD COLUMN IF NOT EXISTS plantilla_titulo TEXT;
      ALTER TABLE comercial.contratos ADD COLUMN IF NOT EXISTS plantilla_version INT;
      ALTER TABLE comercial.contratos ADD COLUMN IF NOT EXISTS contenido_html TEXT;
      ALTER TABLE comercial.contratos ADD COLUMN IF NOT EXISTS campos_rellenos JSONB;
      CREATE INDEX IF NOT EXISTS comercial_contratos_cliente_idx ON comercial.contratos(cliente_id);

      CREATE TABLE IF NOT EXISTS comercial.proformas (
        id TEXT PRIMARY KEY,
        cliente_id TEXT REFERENCES comercial.clientes(id) ON DELETE SET NULL,
        cliente_nombre TEXT, cliente_ruc TEXT, cliente_contacto TEXT, cliente_cargo TEXT,
        cliente_email TEXT, cliente_telefono TEXT, cliente_direccion TEXT,
        tipo TEXT, producto_nombre TEXT,
        moneda TEXT NOT NULL DEFAULT 'USD',
        items JSONB NOT NULL DEFAULT '[]',
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        descuento_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        descuento_monto NUMERIC(12,2) NOT NULL DEFAULT 0,
        subtotal_neto NUMERIC(12,2) NOT NULL DEFAULT 0,
        igv_tipo TEXT NOT NULL DEFAULT 'igv_18',
        igv_monto NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL DEFAULT 0,
        modalidad_pago TEXT, tiempo_entrega TEXT, garantia TEXT, alcance TEXT, observaciones TEXT,
        metodo_trabajo TEXT, metodo_sprint TEXT, metodo_reuniones TEXT, metodo_herramientas TEXT, metodo_roles TEXT, metodo_detalle TEXT,
        fecha_emision DATE, validez_dias INTEGER NOT NULL DEFAULT 30, fecha_vencimiento DATE,
        estado TEXT NOT NULL DEFAULT 'borrador',
        responsable TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE comercial.proformas 
        ADD COLUMN IF NOT EXISTS metodo_trabajo TEXT,
        ADD COLUMN IF NOT EXISTS metodo_sprint TEXT,
        ADD COLUMN IF NOT EXISTS metodo_reuniones TEXT,
        ADD COLUMN IF NOT EXISTS metodo_herramientas TEXT,
        ADD COLUMN IF NOT EXISTS metodo_roles TEXT,
        ADD COLUMN IF NOT EXISTS metodo_detalle TEXT;
      -- Tipo de cambio de OPP usado al emitir (soles por 1 unidad de la moneda)
      ALTER TABLE comercial.proformas ADD COLUMN IF NOT EXISTS tipo_cambio NUMERIC(18,6);
      ALTER TABLE comercial.proformas ADD COLUMN IF NOT EXISTS tipo_cambio_info JSONB;
      ALTER TABLE comercial.contratos ADD COLUMN IF NOT EXISTS tipo_cambio NUMERIC(18,6);
      ALTER TABLE comercial.contratos ADD COLUMN IF NOT EXISTS tipo_cambio_info JSONB;
      CREATE INDEX IF NOT EXISTS comercial_proformas_cliente_idx ON comercial.proformas(cliente_id);

      -- Catálogo genérico de valores agregados a mano desde los combobox
      -- de Cliente (Rubro, País, Provincia, Distrito, Cargo, y cualquier
      -- otro que se sume después — "tipo" los distingue, sin necesitar
      -- una tabla nueva cada vez). Las listas base de cada uno viven en
      -- el frontend, texto fijo; acá solo lo que el equipo escribió a
      -- mano. Los campos correspondientes en comercial.clientes siguen
      -- siendo texto libre, no una FK — renombrar/eliminar acá nunca
      -- deja a un cliente roto. Reemplaza a las tablas previas
      -- sectores_custom/ubicaciones_custom (quedan huérfanas, sin usar).
      CREATE TABLE IF NOT EXISTS comercial.catalogos_custom (
        id SERIAL PRIMARY KEY,
        tipo TEXT NOT NULL,
        nombre TEXT NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS comercial_catalogos_custom_idx ON comercial.catalogos_custom (tipo, lower(nombre));
    `);
  }
  return ready;
}
router.use((req, res, next) => { ensureSchema().then(() => next()).catch(next); });

/* Reintenta una vez si el id auto-generado choca con uno ya insertado
   por otra petición concurrente (colisión de PK, código 23505). Con
   el volumen de uso de este panel es un caso raro, pero así queda
   cubierto sin necesitar un lock explícito. */
async function withIdRetry(genId, insert) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = await genId();
    try {
      return await insert(id);
    } catch (e) {
      if (e.code === '23505' && attempt === 0) continue;
      throw e;
    }
  }
}

/* ============================================================
   CLIENTES
   ============================================================ */
router.get('/clients', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comercial.clientes ORDER BY created_at DESC');
    res.json({ clients: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function nextClientId() {
  const { rows } = await pool.query(`
    SELECT COALESCE(MAX((regexp_match(id, '^CLI-(\\d+)$'))[1]::int), 0) + 1 AS n
    FROM comercial.clientes
  `);
  return `CLI-${String(rows[0].n).padStart(3, '0')}`;
}

router.post('/clients', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.razon_social || !b.ruc || !b.contacto_nombre || !b.telefono || !b.email) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (razón social, RUC, contacto, teléfono, correo).' });
    }
    const { rows: dupe } = await pool.query('SELECT razon_social FROM comercial.clientes WHERE ruc = $1', [b.ruc]);
    if (dupe.length) return res.status(409).json({ error: `El cliente con RUC ${b.ruc} ya existe como ${dupe[0].razon_social}.` });

    const client = await withIdRetry(nextClientId, (id) => pool.query(`
      INSERT INTO comercial.clientes
        (id, razon_social, ruc, sector, direccion, pais, provincia, distrito, contacto_nombre, contacto_cargo, telefono, email, tipo, estado, origen, notas, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      id, b.razon_social, b.ruc, b.sector || null, b.direccion || null,
      b.pais || 'Perú', b.provincia || null, b.distrito || null,
      b.contacto_nombre, b.contacto_cargo || null, b.telefono, b.email,
      b.tipo || 'pyme', b.estado || 'activo', b.origen || 'Prospección Directa', b.notas || null, req.user.id,
    ]).then(r => r.rows[0]));

    res.status(201).json({ client });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/clients/:id', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.razon_social || !b.ruc || !b.contacto_nombre || !b.telefono || !b.email) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (razón social, RUC, contacto, teléfono, correo).' });
    }
    const { rows: dupe } = await pool.query('SELECT razon_social FROM comercial.clientes WHERE ruc = $1 AND id != $2', [b.ruc, req.params.id]);
    if (dupe.length) return res.status(409).json({ error: `El RUC ${b.ruc} ya está registrado para ${dupe[0].razon_social}.` });

    const { rows } = await pool.query(`
      UPDATE comercial.clientes SET
        razon_social=$1, ruc=$2, sector=$3, direccion=$4, pais=$5, provincia=$6, distrito=$7,
        contacto_nombre=$8, contacto_cargo=$9, telefono=$10, email=$11, tipo=$12, estado=$13, notas=$14, updated_at=NOW()
      WHERE id=$15 RETURNING *
    `, [b.razon_social, b.ruc, b.sector || null, b.direccion || null, b.pais || 'Perú', b.provincia || null, b.distrito || null,
        b.contacto_nombre, b.contacto_cargo || null, b.telefono, b.email, b.tipo, b.estado, b.notas || null, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Las copias "foto" en contratos/proformas ya emitidos se mantienen tal cual (historial),
    // salvo los que sigan en borrador — ahí sí conviene reflejar la corrección.
    await pool.query(`
      UPDATE comercial.contratos SET cliente_nombre=$1, cliente_ruc=$2, cliente_contacto=$3, cliente_cargo=$4, cliente_direccion=$5, updated_at=NOW()
      WHERE cliente_id=$6 AND estado='borrador'
    `, [b.razon_social, b.ruc, b.contacto_nombre, b.contacto_cargo || null, b.direccion || null, req.params.id]);

    res.json({ client: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/clients/:id/toggle-status', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      UPDATE comercial.clientes SET estado = CASE WHEN estado='activo' THEN 'inactivo' ELSE 'activo' END, updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ client: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/clients/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM comercial.clientes WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   PLANTILLAS LEGALES OFICIALES (CATÁLOGO APROBADO POR ODACL)
   El equipo de ODN jala directamente las plantillas corporativas
   aprobadas por ODACL con sus cláusulas oficiales completas.
   Cualquier actualización publicada en ODACL se refleja de inmediato
   para nuevos contratos, mientras los ya emitidos conservan su copia fiel.
   ============================================================ */
router.get('/contract-templates', async (req, res) => {
  try {
    const templates = await getApprovedTemplates(pool);
    res.json({ ok: true, templates });
  } catch (e) {
    console.error('[COMERCIAL] Error obteniendo plantillas de contratos:', e.message);
    res.status(500).json({ ok: false, error: 'No se pudieron obtener las plantillas legales aprobadas' });
  }
});

router.get('/contract-templates/:clave', async (req, res) => {
  try {
    const template = await getApprovedTemplateByKey(pool, req.params.clave);
    if (!template) return res.status(404).json({ ok: false, error: 'Plantilla legal no encontrada' });
    res.json({ ok: true, template });
  } catch (e) {
    console.error('[COMERCIAL] Error obteniendo plantilla:', e.message);
    res.status(500).json({ ok: false, error: 'No se pudo obtener la plantilla' });
  }
});

/* ============================================================
   CONTRATOS
   ============================================================ */
router.get('/contracts', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comercial.contratos ORDER BY created_at DESC');
    res.json({ contracts: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/contracts/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comercial.contratos WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Contrato no encontrado' });
    res.json({ contract: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function nextContractId() {
  const year = new Date().getFullYear();
  const { rows } = await pool.query(`
    SELECT COALESCE(MAX((regexp_match(id, '^CTR-' || $1 || '-(\\d+)$'))[1]::int), 0) + 1 AS n
    FROM comercial.contratos
  `, [year]);
  return `CTR-${year}-${String(rows[0].n).padStart(3, '0')}`;
}

router.post('/contracts', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.cliente_id || !b.monto) {
      return res.status(400).json({ error: 'Falta el cliente o el monto del contrato.' });
    }
    const { rows: cliRows } = await pool.query('SELECT * FROM comercial.clientes WHERE id=$1', [b.cliente_id]);
    if (!cliRows.length) return res.status(400).json({ error: 'El cliente seleccionado no existe.' });
    const cli = cliRows[0];

    const contract = await withIdRetry(nextContractId, (id) => pool.query(`
      INSERT INTO comercial.contratos
        (id, cliente_id, cliente_nombre, cliente_ruc, cliente_contacto, cliente_cargo, cliente_direccion,
         tipo, producto_nombre, moneda, monto, modalidad_pago, fecha_inicio, fecha_fin, garantia, objeto,
         entregables, metodo_trabajo, estado, responsable, created_by,
         plantilla_clave, plantilla_titulo, plantilla_version, contenido_html, campos_rellenos,
         tipo_cambio, tipo_cambio_info)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
      RETURNING *
    `, [
      id, cli.id, cli.razon_social, cli.ruc, cli.contacto_nombre, cli.contacto_cargo, cli.direccion,
      b.tipo || 'Venta de Licencia', b.producto_nombre || null, b.moneda || 'USD', b.monto,
      b.modalidad_pago || null, b.fecha_inicio || null, b.fecha_fin || null, b.garantia || null, b.objeto || null,
      b.entregables || null, b.metodo_trabajo || 'SCRUM (Desarrollo Ágil por Sprints)', b.estado || 'borrador', b.responsable || null, req.user.id,
      b.plantilla_clave || null, b.plantilla_titulo || null, b.plantilla_version || 1, b.contenido_html || null,
      b.campos_rellenos ? JSON.stringify(b.campos_rellenos) : null,
      Number(b.tipo_cambio) > 0 ? Number(b.tipo_cambio) : null,
      b.tipo_cambio_info ? JSON.stringify(b.tipo_cambio_info) : null
    ]).then(r => r.rows[0]));

    res.status(201).json({ contract });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/contracts/:id/status', async (req, res) => {
  try {
    const { estado } = req.body || {};
    if (!estado) return res.status(400).json({ error: 'Falta el nuevo estado.' });
    const { rows } = await pool.query(
      'UPDATE comercial.contratos SET estado=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [estado, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Contrato no encontrado' });
    res.json({ contract: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/contracts/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM comercial.contratos WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Contrato no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   PROFORMAS
   ============================================================ */
router.get('/proformas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comercial.proformas ORDER BY created_at DESC');
    res.json({ proformas: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function nextProformaId() {
  const year = new Date().getFullYear();
  const { rows } = await pool.query(`
    SELECT COALESCE(MAX((regexp_match(id, '^PRF-' || $1 || '-(\\d+)$'))[1]::int), 0) + 1 AS n
    FROM comercial.proformas
  `, [year]);
  return `PRF-${year}-${String(rows[0].n).padStart(3, '0')}`;
}

// Ítems y totales de una proforma, calculados en el servidor. Los ítems de
// tecnología conservan sus datos de Tech Stack para poder reeditarlos.
const CAMPOS_TECH = ['is_tech_variable', 'tech_id', 'category', 'name', 'plan_name', 'costo_base', 'margen_min', 'margen_max', 'propuesta', 'moneda', 'periodo', 'image_url'];
function calcularProforma(b) {
  const items = b.items.map(it => {
    const cantidad = Number(it.cantidad) || 1;
    const precio = Number(it.precio) || 0;
    const base = { descripcion: it.descripcion || 'Servicio de desarrollo / software', cantidad, precio, subtotal: cantidad * precio };
    if (it.is_tech_variable) CAMPOS_TECH.forEach(k => { if (it[k] !== undefined) base[k] = it[k]; });
    return base;
  });
  const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
  const descuentoPct = Number(b.descuento_pct) || 0;
  const descuentoMonto = subtotal * (descuentoPct / 100);
  const subtotalNeto = Math.max(0, subtotal - descuentoMonto);
  const igvTipo = b.igv_tipo || 'igv_18';
  const igvMonto = igvTipo === 'igv_18' ? subtotalNeto * 0.18 : 0;
  const total = subtotalNeto + igvMonto;
  return { items, subtotal, descuentoPct, descuentoMonto, subtotalNeto, igvTipo, igvMonto, total };
}

router.post('/proformas', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.cliente_id || !Array.isArray(b.items) || !b.items.length) {
      return res.status(400).json({ error: 'Falta el cliente o al menos un ítem de la cotización.' });
    }
    const { rows: cliRows } = await pool.query('SELECT * FROM comercial.clientes WHERE id=$1', [b.cliente_id]);
    if (!cliRows.length) return res.status(400).json({ error: 'El cliente seleccionado no existe.' });
    const cli = cliRows[0];

    const { items, subtotal, descuentoPct, descuentoMonto, subtotalNeto, igvTipo, igvMonto, total } = calcularProforma(b);

    const proforma = await withIdRetry(nextProformaId, (id) => pool.query(`
      INSERT INTO comercial.proformas
        (id, cliente_id, cliente_nombre, cliente_ruc, cliente_contacto, cliente_cargo, cliente_email, cliente_telefono, cliente_direccion,
         tipo, producto_nombre, moneda, items, subtotal, descuento_pct, descuento_monto, subtotal_neto, igv_tipo, igv_monto, total,
         modalidad_pago, tiempo_entrega, garantia, alcance, observaciones,
         metodo_trabajo, metodo_sprint, metodo_reuniones, metodo_herramientas, metodo_roles, metodo_detalle,
         fecha_emision, validez_dias, fecha_vencimiento,
         estado, responsable, created_by, tipo_cambio, tipo_cambio_info)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)
      RETURNING *
    `, [
      id, cli.id, cli.razon_social, cli.ruc, b.cliente_contacto || cli.contacto_nombre, cli.contacto_cargo,
      b.cliente_email || cli.email, b.cliente_telefono || cli.telefono, cli.direccion,
      b.tipo || 'Venta de Licencia', b.producto_nombre || null, b.moneda || 'USD', JSON.stringify(items),
      subtotal, descuentoPct, descuentoMonto, subtotalNeto, igvTipo, igvMonto, total,
      b.modalidad_pago || null, b.tiempo_entrega || null, b.garantia || null, b.alcance || null, b.observaciones || null,
      b.metodo_trabajo || null,
      b.metodo_sprint || null,
      b.metodo_reuniones || null,
      b.metodo_herramientas || null,
      b.metodo_roles || null,
      b.metodo_detalle || null,
      b.fecha_emision || null, b.validez_dias || 30, b.fecha_vencimiento || null,
      b.estado || 'enviada', b.responsable || null, req.user.id,
      Number(b.tipo_cambio) > 0 ? Number(b.tipo_cambio) : null,
      b.tipo_cambio_info ? JSON.stringify(b.tipo_cambio_info) : null,
    ]).then(r => r.rows[0]));

    res.status(201).json({ proforma });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/proformas/:id', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.cliente_id || !Array.isArray(b.items) || !b.items.length) {
      return res.status(400).json({ error: 'Falta el cliente o al menos un ítem de la cotización.' });
    }
    const { rows: existe } = await pool.query('SELECT id FROM comercial.proformas WHERE id=$1', [req.params.id]);
    if (!existe.length) return res.status(404).json({ error: 'Proforma no encontrada' });
    const { rows: cliRows } = await pool.query('SELECT * FROM comercial.clientes WHERE id=$1', [b.cliente_id]);
    if (!cliRows.length) return res.status(400).json({ error: 'El cliente seleccionado no existe.' });
    const cli = cliRows[0];
    const { items, subtotal, descuentoPct, descuentoMonto, subtotalNeto, igvTipo, igvMonto, total } = calcularProforma(b);

    const { rows } = await pool.query(`
      UPDATE comercial.proformas SET
        cliente_id=$2, cliente_nombre=$3, cliente_ruc=$4, cliente_contacto=$5, cliente_cargo=$6, cliente_email=$7, cliente_telefono=$8, cliente_direccion=$9,
        tipo=$10, producto_nombre=$11, moneda=$12, items=$13, subtotal=$14, descuento_pct=$15, descuento_monto=$16, subtotal_neto=$17,
        igv_tipo=$18, igv_monto=$19, total=$20, modalidad_pago=$21, tiempo_entrega=$22, garantia=$23, alcance=$24, observaciones=$25,
        metodo_trabajo=$26, metodo_sprint=$27, metodo_reuniones=$28, metodo_herramientas=$29, metodo_roles=$30, metodo_detalle=$31,
        fecha_emision=$32, validez_dias=$33, fecha_vencimiento=$34, estado=$35, responsable=$36,
        tipo_cambio=$37, tipo_cambio_info=$38, updated_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [
      req.params.id, cli.id, cli.razon_social, cli.ruc, b.cliente_contacto || cli.contacto_nombre, cli.contacto_cargo,
      b.cliente_email || cli.email, b.cliente_telefono || cli.telefono, cli.direccion,
      b.tipo || 'Venta de Licencia', b.producto_nombre || null, b.moneda || 'USD', JSON.stringify(items),
      subtotal, descuentoPct, descuentoMonto, subtotalNeto, igvTipo, igvMonto, total,
      b.modalidad_pago || null, b.tiempo_entrega || null, b.garantia || null, b.alcance || null, b.observaciones || null,
      b.metodo_trabajo || null, b.metodo_sprint || null, b.metodo_reuniones || null,
      b.metodo_herramientas || null, b.metodo_roles || null, b.metodo_detalle || null,
      b.fecha_emision || null, b.validez_dias || 30, b.fecha_vencimiento || null, b.estado || 'enviada', b.responsable || null,
      Number(b.tipo_cambio) > 0 ? Number(b.tipo_cambio) : null,
      b.tipo_cambio_info ? JSON.stringify(b.tipo_cambio_info) : null,
    ]);
    res.json({ proforma: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/proformas/:id', async (req, res) => {
  try {
    const { estado } = req.body || {};
    if (!estado) return res.status(400).json({ error: 'Falta el nuevo estado.' });
    const { rows } = await pool.query(
      'UPDATE comercial.proformas SET estado=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [estado, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proforma no encontrada' });
    res.json({ proforma: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/proformas/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM comercial.proformas WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Proforma no encontrada' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   CATÁLOGO GENÉRICO — valores agregados a mano desde los combobox de
   Cliente (Rubro, País, Provincia, Distrito, Cargo), administrables
   desde Configuración. :tipo solo acepta los whitelisteados abajo —
   CATALOG_FIELD_MAP además lo traduce a la columna real de
   comercial.clientes que se actualiza en cascada al renombrar (para
   la mayoría el nombre coincide, "cargo" es la excepción porque la
   columna real se llama contacto_cargo). Todos son texto libre en
   comercial.clientes, nunca una FK — renombrar o eliminar acá nunca
   deja a un cliente con una referencia rota.
   ============================================================ */
const CATALOG_FIELD_MAP = { sector: 'sector', pais: 'pais', provincia: 'provincia', distrito: 'distrito', cargo: 'contacto_cargo' };
function requireCatalogType(req, res, next) {
  if (!CATALOG_FIELD_MAP[req.params.tipo]) return res.status(400).json({ error: 'Tipo de catálogo inválido' });
  next();
}

router.get('/catalog/:tipo', requireCatalogType, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comercial.catalogos_custom WHERE tipo=$1 ORDER BY nombre ASC', [req.params.tipo]);
    res.json({ items: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/catalog/:tipo', requireCatalogType, async (req, res) => {
  try {
    const nombre = (req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre.' });

    const { rows: existing } = await pool.query('SELECT * FROM comercial.catalogos_custom WHERE tipo=$1 AND lower(nombre) = lower($2)', [req.params.tipo, nombre]);
    if (existing.length) return res.status(200).json({ item: existing[0] });

    const { rows } = await pool.query(
      'INSERT INTO comercial.catalogos_custom (tipo, nombre, created_by) VALUES ($1,$2,$3) RETURNING *',
      [req.params.tipo, nombre, req.user.id]
    );
    res.status(201).json({ item: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/catalog/:tipo/:id', requireCatalogType, async (req, res) => {
  try {
    const nombre = (req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Falta el nuevo nombre.' });

    const { rows: dupe } = await pool.query('SELECT id FROM comercial.catalogos_custom WHERE tipo=$1 AND lower(nombre) = lower($2) AND id != $3', [req.params.tipo, nombre, req.params.id]);
    if (dupe.length) return res.status(409).json({ error: `Ya existe "${nombre}" en esta lista.` });

    const { rows: before } = await pool.query('SELECT nombre FROM comercial.catalogos_custom WHERE id=$1 AND tipo=$2', [req.params.id, req.params.tipo]);
    if (!before.length) return res.status(404).json({ error: 'No encontrado' });

    const { rows } = await pool.query('UPDATE comercial.catalogos_custom SET nombre=$1 WHERE id=$2 RETURNING *', [nombre, req.params.id]);
    // req.params.tipo ya pasó por requireCatalogType (whitelist), seguro de traducir e interpolar como columna.
    const column = CATALOG_FIELD_MAP[req.params.tipo];
    await pool.query(
      `UPDATE comercial.clientes SET ${column}=$1, updated_at=NOW() WHERE lower(${column}) = lower($2)`,
      [nombre, before[0].nombre]
    );

    res.json({ item: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/catalog/:tipo/:id', requireCatalogType, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM comercial.catalogos_custom WHERE id=$1 AND tipo=$2 RETURNING id', [req.params.id, req.params.tipo]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Solo lectura. Columnas whitelisteadas a propósito: nunca se expone
   cliente, presupuesto, responsable interno ni nº de documento — esos
   datos son de ADG/TI, no del área Comercial. */
router.get('/products', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, code, name, description, status, progress, family, project_type,
             company_logo, commercial_offer_type, commercial_price, commercial_price_currency, commercial_notes,
             rental_price, sale_price_min, rental_price_min,
             updated_at
      FROM ti.projects
      WHERE show_to_comercial = true
      ORDER BY updated_at DESC
    `);
    res.json({ products: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Catálogo de lenguajes/herramientas con su costo y margen de propuesta
   (lo fijan ADG u OPP, ver ti.js/opp.js) — ODN solo lo consulta, de
   referencia; no tiene endpoint de escritura en este router. */
router.get('/tech-catalog', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ti.technology_catalog ORDER BY category ASC, name ASC'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* CATÁLOGO DE TECNOLOGÍAS & PLANES (Solo lectura para ODN) */
router.get('/technology-catalog', async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM ti.technology_catalog';
    const params = [];
    if (category) {
      params.push(category);
      query += ' WHERE category = $1';
    }
    query += ' ORDER BY name ASC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* INFO TÉCNICO (Solo lectura para ODN)
   Permite a ODN consultar rápidamente las especificaciones técnicas,
   límites y políticas por plan de las herramientas y lenguajes del catálogo. */
router.get('/tech-plan-info', async (req, res) => {
  try {
    const { producto, category, search, tech_id } = req.query;
    let query = `
      SELECT 
        tpi.*,
        COALESCE(tc.image_url, '') AS image_url,
        COALESCE(tpi.category, tc.category, 'tool') AS category,
        COALESCE(tpi.tech_name, tc.name, tpi.producto_nombre) AS tech_name,
        COALESCE(tc.plans, '[]'::jsonb) AS catalog_plans
      FROM ti.tech_plan_info tpi
      LEFT JOIN ti.technology_catalog tc ON (tpi.tech_id = tc.id OR LOWER(tpi.tech_name) = LOWER(tc.name) OR LOWER(tpi.producto_nombre) = LOWER(tc.name))
    `;
    const conditions = [];
    const params = [];

    if (tech_id) {
      params.push(tech_id);
      conditions.push(`(tpi.tech_id = $${params.length} OR tc.id = $${params.length})`);
    }

    if (category && category !== 'all') {
      params.push(category);
      conditions.push(`COALESCE(tpi.category, tc.category) = $${params.length}`);
    }

    const term = search || producto;
    if (term && term.trim()) {
      params.push(`%${term.trim().toLowerCase()}%`);
      conditions.push(`(
        LOWER(COALESCE(tpi.tech_name, tc.name, tpi.producto_nombre)) LIKE $${params.length}
        OR LOWER(tpi.plan_nombre) LIKE $${params.length}
        OR LOWER(tpi.descripcion) LIKE $${params.length}
      )`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY tpi.orden ASC, LOWER(COALESCE(tpi.tech_name, tc.name, tpi.producto_nombre)) ASC, LOWER(tpi.plan_nombre) ASC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE commercial_offer_type = 'venta')::int AS en_venta,
             COUNT(*) FILTER (WHERE commercial_offer_type = 'alquiler')::int AS en_alquiler,
             COUNT(*) FILTER (WHERE commercial_offer_type = 'venta_alquiler')::int AS venta_o_alquiler,
             COALESCE(ROUND(AVG(progress)), 0)::int AS avg_progress
      FROM ti.projects
      WHERE show_to_comercial = true
    `);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   TECH STACKS & COTIZACIONES (ODN / COMERCIAL)
   ============================================================ */
router.get('/tech-stacks', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ti.tech_stacks ORDER BY is_quotation ASC, created_at ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tech-stacks', async (req, res) => {
  try {
    const { name, project_type, description, stages, is_quotation, quotation_margin } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nombre de Tech Stack o Cotización requerido' });
    const id = uid();
    const pType = project_type || 'Web';
    const stg = Array.isArray(stages) ? JSON.stringify(stages) : '[]';
    await pool.query(
      `INSERT INTO ti.tech_stacks (id, name, project_type, description, stages, is_quotation, quotation_margin, created_by, created_area)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ODN')`,
      [id, name.trim(), pType, description || '', stg, !!is_quotation, Number(quotation_margin) || 0, req.user.username || 'comercial']
    );
    const { rows } = await pool.query('SELECT * FROM ti.tech_stacks WHERE id=$1', [id]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/tech-stacks/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ti.tech_stacks WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });

    const { name, project_type, description, stages, is_quotation, quotation_margin } = req.body;
    await pool.query(
      `UPDATE ti.tech_stacks SET
         name = COALESCE($1, name),
         project_type = COALESCE($2, project_type),
         description = COALESCE($3, description),
         stages = COALESCE($4, stages),
         is_quotation = COALESCE($5, is_quotation),
         quotation_margin = COALESCE($6, quotation_margin),
         updated_at = NOW()
       WHERE id = $7`,
      [
        name !== undefined ? name.trim() : null,
        project_type !== undefined ? project_type : null,
        description !== undefined ? description : null,
        stages !== undefined ? JSON.stringify(stages) : null,
        is_quotation !== undefined ? !!is_quotation : null,
        quotation_margin !== undefined ? Number(quotation_margin) : null,
        req.params.id
      ]
    );
    res.json({ message: 'Actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/tech-stacks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ti.tech_stacks WHERE id=$1', [req.params.id]);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
