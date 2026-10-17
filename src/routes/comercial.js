'use strict';

const express  = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');

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
        fecha_emision DATE, validez_dias INTEGER NOT NULL DEFAULT 30, fecha_vencimiento DATE,
        estado TEXT NOT NULL DEFAULT 'borrador',
        responsable TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS comercial_proformas_cliente_idx ON comercial.proformas(cliente_id);

      -- Rubros/sectores agregados a mano desde el combobox de Cliente
      -- (los 16 de base viven en el frontend, texto fijo). "sector" en
      -- comercial.clientes sigue siendo texto libre, no una FK — así
      -- renombrar/eliminar acá nunca puede dejar a un cliente roto.
      CREATE TABLE IF NOT EXISTS comercial.sectores_custom (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS comercial_sectores_custom_nombre_idx ON comercial.sectores_custom (lower(nombre));
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
        (id, razon_social, ruc, sector, direccion, ciudad, contacto_nombre, contacto_cargo, telefono, email, tipo, estado, origen, notas, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      id, b.razon_social, b.ruc, b.sector || null, b.direccion || 'Lima, Perú', b.ciudad || 'Lima, Perú',
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
        razon_social=$1, ruc=$2, sector=$3, direccion=$4, contacto_nombre=$5, contacto_cargo=$6,
        telefono=$7, email=$8, tipo=$9, estado=$10, notas=$11, updated_at=NOW()
      WHERE id=$12 RETURNING *
    `, [b.razon_social, b.ruc, b.sector || null, b.direccion || null, b.contacto_nombre, b.contacto_cargo || null,
        b.telefono, b.email, b.tipo, b.estado, b.notas || null, req.params.id]);
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
   CONTRATOS
   ============================================================ */
router.get('/contracts', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comercial.contratos ORDER BY created_at DESC');
    res.json({ contracts: rows });
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
         entregables, estado, responsable, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *
    `, [
      id, cli.id, cli.razon_social, cli.ruc, cli.contacto_nombre, cli.contacto_cargo, cli.direccion,
      b.tipo || 'Venta de Licencia', b.producto_nombre || null, b.moneda || 'USD', b.monto,
      b.modalidad_pago || null, b.fecha_inicio || null, b.fecha_fin || null, b.garantia || null, b.objeto || null,
      b.entregables || null, b.estado || 'borrador', b.responsable || null, req.user.id,
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

router.post('/proformas', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.cliente_id || !Array.isArray(b.items) || !b.items.length) {
      return res.status(400).json({ error: 'Falta el cliente o al menos un ítem de la cotización.' });
    }
    const { rows: cliRows } = await pool.query('SELECT * FROM comercial.clientes WHERE id=$1', [b.cliente_id]);
    if (!cliRows.length) return res.status(400).json({ error: 'El cliente seleccionado no existe.' });
    const cli = cliRows[0];

    const items = b.items.map(it => {
      const cantidad = Number(it.cantidad) || 1;
      const precio = Number(it.precio) || 0;
      return { descripcion: it.descripcion || 'Servicio de desarrollo / software', cantidad, precio, subtotal: cantidad * precio };
    });
    const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
    const descuentoPct = Number(b.descuento_pct) || 0;
    const descuentoMonto = subtotal * (descuentoPct / 100);
    const subtotalNeto = Math.max(0, subtotal - descuentoMonto);
    const igvTipo = b.igv_tipo || 'igv_18';
    const igvMonto = igvTipo === 'igv_18' ? subtotalNeto * 0.18 : 0;
    const total = subtotalNeto + igvMonto;

    const proforma = await withIdRetry(nextProformaId, (id) => pool.query(`
      INSERT INTO comercial.proformas
        (id, cliente_id, cliente_nombre, cliente_ruc, cliente_contacto, cliente_cargo, cliente_email, cliente_telefono, cliente_direccion,
         tipo, producto_nombre, moneda, items, subtotal, descuento_pct, descuento_monto, subtotal_neto, igv_tipo, igv_monto, total,
         modalidad_pago, tiempo_entrega, garantia, alcance, observaciones, fecha_emision, validez_dias, fecha_vencimiento,
         estado, responsable, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
      RETURNING *
    `, [
      id, cli.id, cli.razon_social, cli.ruc, b.cliente_contacto || cli.contacto_nombre, cli.contacto_cargo,
      b.cliente_email || cli.email, b.cliente_telefono || cli.telefono, cli.direccion,
      b.tipo || 'Venta de Licencia', b.producto_nombre || null, b.moneda || 'USD', JSON.stringify(items),
      subtotal, descuentoPct, descuentoMonto, subtotalNeto, igvTipo, igvMonto, total,
      b.modalidad_pago || null, b.tiempo_entrega || null, b.garantia || null, b.alcance || null, b.observaciones || null,
      b.fecha_emision || null, b.validez_dias || 30, b.fecha_vencimiento || null,
      b.estado || 'enviada', b.responsable || null, req.user.id,
    ]).then(r => r.rows[0]));

    res.status(201).json({ proforma });
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
   SECTORES PERSONALIZADOS — rubros agregados a mano desde el
   combobox de Cliente, administrables desde Configuración.
   "sector" en comercial.clientes es texto libre, así que renombrar
   o eliminar acá nunca deja a un cliente con una referencia rota.
   ============================================================ */
router.get('/sectors', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comercial.sectores_custom ORDER BY nombre ASC');
    res.json({ sectors: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/sectors', async (req, res) => {
  try {
    const nombre = (req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre del rubro.' });

    const { rows: existing } = await pool.query('SELECT * FROM comercial.sectores_custom WHERE lower(nombre) = lower($1)', [nombre]);
    if (existing.length) return res.status(200).json({ sector: existing[0] });

    const { rows } = await pool.query(
      'INSERT INTO comercial.sectores_custom (nombre, created_by) VALUES ($1,$2) RETURNING *',
      [nombre, req.user.id]
    );
    res.status(201).json({ sector: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/sectors/:id', async (req, res) => {
  try {
    const nombre = (req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Falta el nuevo nombre.' });

    const { rows: dupe } = await pool.query('SELECT id FROM comercial.sectores_custom WHERE lower(nombre) = lower($1) AND id != $2', [nombre, req.params.id]);
    if (dupe.length) return res.status(409).json({ error: `Ya existe un rubro llamado "${nombre}".` });

    const { rows: before } = await pool.query('SELECT nombre FROM comercial.sectores_custom WHERE id=$1', [req.params.id]);
    if (!before.length) return res.status(404).json({ error: 'Rubro no encontrado' });

    const { rows } = await pool.query('UPDATE comercial.sectores_custom SET nombre=$1 WHERE id=$2 RETURNING *', [nombre, req.params.id]);
    // Los clientes que ya usaban el nombre anterior quedan con el nuevo — es texto libre, no una FK.
    await pool.query('UPDATE comercial.clientes SET sector=$1, updated_at=NOW() WHERE lower(sector) = lower($2)', [nombre, before[0].nombre]);

    res.json({ sector: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/sectors/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM comercial.sectores_custom WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Rubro no encontrado' });
    // Los clientes que ya tenían ese rubro conservan el texto — solo desaparece de la lista de sugerencias.
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

module.exports = router;
