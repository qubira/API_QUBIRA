'use strict';

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModuleAccess } = require('../lib/moduleAccess');

const router = express.Router();
router.use(requireAuth);
/* OPP: Oficina de Presupuestos y Planeación (también permite acceso
   a cuentas con módulo ADG o CG por retrocompatibilidad/supervisión). */
router.use(requireModuleAccess('OPP', 'CG', 'ADG'));

let schemaReady = null;
function ensureOppSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE SCHEMA IF NOT EXISTS ti;

      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS show_to_comercial BOOLEAN DEFAULT false;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS commercial_offer_type TEXT;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS commercial_price NUMERIC;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS commercial_price_currency TEXT DEFAULT 'PEN';
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS commercial_notes TEXT;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS rental_price NUMERIC;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS sale_price_min NUMERIC;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS rental_price_min NUMERIC;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS opp_cost_base NUMERIC;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS opp_margin_pct NUMERIC;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS opp_roi_months NUMERIC;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS opp_pricing_status TEXT DEFAULT 'pending_pricing';
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS opp_updated_at TIMESTAMPTZ;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS opp_updated_by INTEGER;
    `);
  }
  return schemaReady;
}
router.use((req, res, next) => { ensureOppSchema().then(() => next()).catch(next); });

/* ============================================================
   1. LISTA DE PROYECTOS PARA OPP
   ============================================================ */
router.get('/projects', async (req, res) => {
  try {
    const { status, filter, q } = req.query;
    const conditions = [];
    const params = [];

    // Por defecto OPP revisa proyectos aprobados / activos / completados por ADG
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }

    if (filter === 'pending') {
      conditions.push(`(p.commercial_price IS NULL AND p.rental_price IS NULL)`);
    } else if (filter === 'priced') {
      conditions.push(`(p.commercial_price IS NOT NULL OR p.rental_price IS NOT NULL)`);
    } else if (filter === 'commercial') {
      conditions.push(`p.show_to_comercial = true`);
    } else if (filter === 'commercial_pending') {
      conditions.push(`(p.commercial_price IS NOT NULL OR p.rental_price IS NOT NULL) AND (p.show_to_comercial = false OR p.show_to_comercial IS NULL)`);
    }

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.code ILIKE $${params.length} OR p.client ILIKE $${params.length})`);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const query = `
      SELECT p.id, p.code, p.name, p.client, p.description, p.status, p.progress,
             p.budget, p.currency, p.start_date, p.end_date, p.priority,
             p.company_name, p.company_logo, p.project_type, p.family,
             p.show_to_comercial, p.commercial_offer_type, p.commercial_price, p.commercial_price_currency,
             p.commercial_notes, p.rental_price, p.sale_price_min, p.rental_price_min,
             p.opp_cost_base, p.opp_margin_pct, p.opp_roi_months, p.opp_pricing_status,
             p.opp_updated_at, p.opp_updated_by, p.created_at, p.updated_at,
             u.nombre AS responsible_name,
             opp_u.nombre AS opp_user_name
      FROM ti.projects p
      LEFT JOIN public.usuarios u ON u.id = p.responsible_id
      LEFT JOIN public.usuarios opp_u ON opp_u.id = p.opp_updated_by
      ${whereClause}
      ORDER BY p.updated_at DESC
    `;

    const { rows } = await pool.query(query, params);
    res.json({ projects: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   2. ESTADÍSTICAS Y KPIS FINANCIEROS PARA DASHBOARD DE OPP
   ============================================================ */
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total_projects,
        COUNT(*) FILTER (WHERE status IN ('approved','completed','active','finished_by_ti'))::int AS total_approved,
        COUNT(*) FILTER (WHERE commercial_price IS NULL AND rental_price IS NULL)::int AS pending_pricing,
        COUNT(*) FILTER (WHERE commercial_price IS NOT NULL OR rental_price IS NOT NULL)::int AS priced_count,
        COUNT(*) FILTER (WHERE show_to_comercial = true)::int AS published_commercial,
        COUNT(*) FILTER (WHERE commercial_offer_type = 'venta')::int AS for_sale,
        COUNT(*) FILTER (WHERE commercial_offer_type = 'alquiler')::int AS for_rent,
        COUNT(*) FILTER (WHERE commercial_offer_type = 'venta_alquiler')::int AS for_sale_and_rent,
        COALESCE(ROUND(AVG(opp_margin_pct) FILTER (WHERE opp_margin_pct IS NOT NULL)), 0)::int AS avg_margin_pct,
        COALESCE(SUM(commercial_price) FILTER (WHERE commercial_price_currency = 'PEN'), 0)::numeric AS total_sales_pen,
        COALESCE(SUM(commercial_price) FILTER (WHERE commercial_price_currency = 'USD'), 0)::numeric AS total_sales_usd,
        COALESCE(SUM(rental_price) FILTER (WHERE commercial_price_currency = 'PEN'), 0)::numeric AS total_rent_monthly_pen,
        COALESCE(SUM(rental_price) FILTER (WHERE commercial_price_currency = 'USD'), 0)::numeric AS total_rent_monthly_usd
      FROM ti.projects
    `);
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   3. DETALLE FINANCIERO DE UN PROYECTO ESPECÍFICO
   ============================================================ */
router.get('/projects/:id', async (req, res) => {
  try {
    const { rows: projRows } = await pool.query(
      `SELECT p.*, u.nombre AS responsible_name, opp_u.nombre AS opp_user_name
       FROM ti.projects p
       LEFT JOIN public.usuarios u ON u.id = p.responsible_id
       LEFT JOIN public.usuarios opp_u ON opp_u.id = p.opp_updated_by
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!projRows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });

    // Cargar requisitos para contexto técnico del costeo
    const { rows: reqRows } = await pool.query(
      `SELECT id, type, description, progress FROM ti.requirements WHERE project_id = $1 ORDER BY order_index, created_at`,
      [req.params.id]
    );

    // Cargar contratos de ADG si los hay
    const { rows: contractRows } = await pool.query(
      `SELECT id, type, title, amount, currency, status, signed_date FROM ti.contracts WHERE project_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({
      project: projRows[0],
      requirements: reqRows,
      contracts: contractRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   4. ESTABLECER / ACTUALIZAR PRECIOS Y COSTOS (OPP -> COMERCIAL)
   ============================================================ */
router.put('/projects/:id/pricing', async (req, res) => {
  try {
    const {
      commercial_offer_type,
      commercial_price,
      commercial_price_currency,
      rental_price,
      sale_price_min,
      rental_price_min,
      opp_cost_base,
      opp_margin_pct,
      opp_roi_months,
      commercial_notes,
      show_to_comercial
    } = req.body;

    const show_to_comercial_val = (show_to_comercial === true || show_to_comercial === 'true');
    const price_val = (commercial_price === undefined || commercial_price === '' || commercial_price === null)
      ? null : Number(commercial_price);
    const rent_val = (rental_price === undefined || rental_price === '' || rental_price === null)
      ? null : Number(rental_price);
    const sale_min_val = (sale_price_min === undefined || sale_price_min === '' || sale_price_min === null)
      ? null : Number(sale_price_min);
    const rent_min_val = (rental_price_min === undefined || rental_price_min === '' || rental_price_min === null)
      ? null : Number(rental_price_min);
    const cost_base_val = (opp_cost_base === undefined || opp_cost_base === '' || opp_cost_base === null)
      ? null : Number(opp_cost_base);
    const margin_val = (opp_margin_pct === undefined || opp_margin_pct === '' || opp_margin_pct === null)
      ? null : Number(opp_margin_pct);
    const roi_val = (opp_roi_months === undefined || opp_roi_months === '' || opp_roi_months === null)
      ? null : Number(opp_roi_months);

    const currency_val = commercial_price_currency === 'USD' ? 'USD' : 'PEN';
    const offer_type_val = commercial_offer_type || 'venta';

    const { rows: existing } = await pool.query('SELECT name, code FROM ti.projects WHERE id = $1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Proyecto no encontrado' });

    await pool.query(`
      UPDATE ti.projects SET
        commercial_offer_type = $1,
        commercial_price = $2,
        commercial_price_currency = $3,
        rental_price = $4,
        sale_price_min = $5,
        rental_price_min = $6,
        opp_cost_base = $7,
        opp_margin_pct = $8,
        opp_roi_months = $9,
        commercial_notes = $10,
        show_to_comercial = $11,
        opp_pricing_status = 'priced',
        opp_updated_at = NOW(),
        opp_updated_by = $12,
        updated_at = NOW()
      WHERE id = $13
    `, [
      offer_type_val,
      price_val,
      currency_val,
      rent_val,
      sale_min_val,
      rent_min_val,
      cost_base_val,
      margin_val,
      roi_val,
      commercial_notes || null,
      show_to_comercial_val,
      req.user.id,
      req.params.id
    ]);

    // Registrar actividad en el log de TI/ADG si la tabla existe
    try {
      await pool.query(
        `INSERT INTO ti.activities (id, project_id, user_id, type, description, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'opp_pricing', $3, NOW())`,
        [
          req.params.id,
          req.user.id,
          `OPP valorizó el proyecto: Oferta ${offer_type_val.toUpperCase()} (${currency_val}), ` +
          `Venta: ${price_val != null ? price_val : '—'}, Alquiler: ${rent_val != null ? rent_val : '—'}, ` +
          `Publicado en Comercial: ${show_to_comercial_val ? 'Sí' : 'No'}`
        ]
      );
    } catch (_) {}

    res.json({
      ok: true,
      message: 'Estructura financiera y precios guardados con éxito',
      show_to_comercial: show_to_comercial_val
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   5. CALCULADORA Y SIMULADOR FINANCIERO
   ============================================================ */
router.post('/simulate', (req, res) => {
  try {
    const {
      cost_base = 0,
      margin_pct = 30,
      currency = 'PEN',
      rental_factor_pct = 10, // tasa mensual de alquiler sugerida sobre el costo
      months = 12
    } = req.body;

    const cost = Math.max(0, Number(cost_base) || 0);
    const margin = Math.max(0, Math.min(99, Number(margin_pct) || 0));

    // Precio de venta sugerido = Costo / (1 - Margen%)
    const sale_price = margin < 100 && cost > 0
      ? Math.round((cost / (1 - margin / 100)) * 100) / 100
      : cost;

    const profit = Math.round((sale_price - cost) * 100) / 100;
    const sale_price_with_igv = Math.round((sale_price * 1.18) * 100) / 100;
    const sale_price_min = Math.round((cost * 1.12) * 100) / 100; // Piso mínimo sugerido: 12% sobre costo

    // Alquiler mensual sugerido: % sobre costo base
    const rental_factor = Math.max(1, Number(rental_factor_pct) || 10);
    const rental_price_monthly = Math.round(((cost * (rental_factor / 100))) * 100) / 100;
    const rental_price_with_igv = Math.round((rental_price_monthly * 1.18) * 100) / 100;
    const rental_price_min = Math.round((rental_price_monthly * 0.85) * 100) / 100;

    // Retorno de inversión en meses
    const roi_months = rental_price_monthly > 0
      ? Math.ceil(cost / rental_price_monthly)
      : 0;

    // Ingreso proyectado a N meses
    const rental_projected_total = Math.round((rental_price_monthly * Number(months || 12)) * 100) / 100;
    const rental_net_profit = Math.round((rental_projected_total - cost) * 100) / 100;

    res.json({
      currency,
      cost_base: cost,
      margin_pct: margin,
      sale: {
        price_suggested: sale_price,
        price_with_igv: sale_price_with_igv,
        price_min: sale_price_min,
        profit_amount: profit
      },
      rent: {
        price_monthly_suggested: rental_price_monthly,
        price_monthly_with_igv: rental_price_with_igv,
        price_monthly_min: rental_price_min,
        roi_months: roi_months,
        projected_months: Number(months || 12),
        projected_total: rental_projected_total,
        projected_profit: rental_net_profit
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
