'use strict';

/* Verificación pública de constancias de trabajo — sin sesión, mismo
   criterio que jobs-public.js: el sitio público (carpeta QUBIRA, deploy
   aparte en Vercel) le habla a esto de forma anónima para que cualquiera
   pueda confirmar que una constancia es auténtica.
   Acepta tres códigos y los tres llevan a la misma constancia:
   - el código de verificación (el del QR, aleatorio): muestra la constancia completa y el PDF;
   - el número nuevo (ORH-CST-2026-022) o el anterior (CT-2026-0022): como son
     correlativos y cualquiera podría probarlos uno por uno, solo confirman que la
     constancia existe y su estado, sin datos personales (DNI, cargo, función).
     Para ver el detalle se pide el código de verificación impreso bajo el QR.
   El PDF se regenera al vuelo, nunca se guarda como archivo — ver API/src/lib/constanciaPdf.js. */

const express = require('express');
const { pool } = require('../db');
const { ensureSchema, datosPdfConstancia, constanciaToCamel } = require('./rrhh');
const { buildConstanciaPdf } = require('../lib/constanciaPdf');

const router = express.Router();

router.use((req, res, next) => {
  ensureSchema().then(() => next()).catch(err => {
    console.error('[CONSTANCIAS-PUBLIC] Error creando schema:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  });
});

const PUBLIC_SITE_BASE = process.env.QUBIRA_PUBLIC_SITE_BASE || 'https://qubira.vercel.app';
const NO_EXISTE = 'No existe ninguna constancia con ese código';

/* Estado en el registro de documentos (ANULADO, reemplazos) — puede no existir aún */
async function estadoRegistro(numero, anterior) {
  try {
    const { rows } = await pool.query(
      `SELECT codigo, estado, reemplazado_por, codigo_anterior FROM doc.documentos
        WHERE codigo = $1 OR (codigo_anterior IS NOT NULL AND upper(codigo_anterior) = upper($2)) LIMIT 1`, [numero, anterior || numero]);
    return rows[0] || null;
  } catch { return null; }
}

/* Busca por código de verificación, número nuevo o número anterior */
async function buscar(codigo) {
  const c = String(codigo || '').trim();
  const { rows } = await pool.query(
    `SELECT * FROM rrhh.constancias
      WHERE codigo_verificacion = $1 OR upper(numero) = upper($1) OR upper(numero_anterior) = upper($1)
      ORDER BY (codigo_verificacion = $1) DESC LIMIT 1`, [c]);
  if (rows.length) return { fila: rows[0], porVerificacion: rows[0].codigo_verificacion === c };
  // Número antiguo registrado solo en el registro de documentos (migración)
  const reg = await pool.query(
    `SELECT c.* FROM doc.documentos d JOIN rrhh.constancias c ON upper(c.numero) = upper(d.codigo)
      WHERE upper(d.codigo_anterior) = upper($1) LIMIT 1`, [c]).catch(() => ({ rows: [] }));
  return reg.rows.length ? { fila: reg.rows[0], porVerificacion: false } : null;
}

const enmascarar = nombre => String(nombre || '').trim().split(/\s+/).map((p, i) => i === 0 ? p : p[0] + '.').join(' ');

function constanciaToPublic(row, completa, registro) {
  const anterior = row.numero_anterior || (registro && registro.codigo_anterior) || null;
  const anulada = registro && registro.estado === 'ANULADO';
  const base = {
    numero: row.numero, numeroAnterior: anterior,
    estado: anulada ? 'ANULADA' : 'VIGENTE', reemplazadaPor: anulada ? registro.reemplazado_por || null : null,
    fechaEmision: row.fecha_emision, completa,
  };
  if (!completa) return { ...base, nombreCompleto: enmascarar(row.nombre_completo) };
  return {
    ...base, codigoVerificacion: row.codigo_verificacion,
    tratamiento: row.tratamiento, nombreCompleto: row.nombre_completo,
    tipoDocumento: row.tipo_documento, numeroDocumento: row.numero_documento,
    area: row.area, cargo: row.cargo,
    fechaInicio: row.fecha_inicio, fechaFin: row.fecha_fin, funcionPrincipal: row.funcion_principal,
    lugar: row.lugar, firmanteNombre: row.firmante_nombre, firmanteCargo: row.firmante_cargo,
  };
}

router.get('/:codigo', async (req, res) => {
  try {
    const hallado = await buscar(req.params.codigo);
    if (!hallado) return res.status(404).json({ ok: false, error: NO_EXISTE });
    const registro = await estadoRegistro(hallado.fila.numero, hallado.fila.numero_anterior);
    res.json({ ok: true, data: constanciaToPublic(hallado.fila, hallado.porVerificacion, registro) });
  } catch (err) {
    console.error('[CONSTANCIAS-PUBLIC] GET /:codigo error:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// El PDF solo con el código de verificación (el número correlativo no basta)
router.get('/:codigo/pdf', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM rrhh.constancias WHERE codigo_verificacion=$1', [req.params.codigo]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'No existe ninguna constancia con ese código de verificación' });
    const constancia = constanciaToCamel(rows[0]);
    const pdf = await buildConstanciaPdf(
      await datosPdfConstancia(constancia),
      `${PUBLIC_SITE_BASE}/constancia.html?codigo=${encodeURIComponent(constancia.codigoVerificacion)}`
    );
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${constancia.numero}.pdf"` });
    res.send(pdf);
  } catch (err) {
    console.error('[CONSTANCIAS-PUBLIC] GET /:codigo/pdf error:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
