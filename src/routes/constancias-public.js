'use strict';

/* Verificación pública de constancias de trabajo — sin sesión, mismo
   criterio que jobs-public.js: el sitio público (carpeta QUBIRA, deploy
   aparte en Vercel) le habla a esto de forma anónima para que cualquiera
   pueda confirmar que una constancia (escaneando el QR o tecleando el
   código de verificación a mano) es auténtica. Se busca por
   codigo_verificacion, NO por el número de constancia (ese es
   secuencial y visible en el propio documento; el código es aleatorio,
   para que nadie pueda enumerar números y ver datos de otros
   empleados). El PDF se regenera al vuelo, nunca se guarda como
   archivo — ver API/src/lib/constanciaPdf.js. */

const express = require('express');
const { pool } = require('../db');
const { ensureSchema, getFirmaUrlForSigner, getSelloEmpresaUrl } = require('./rrhh');
const { buildConstanciaPdf } = require('../lib/constanciaPdf');

const router = express.Router();

router.use((req, res, next) => {
  ensureSchema().then(() => next()).catch(err => {
    console.error('[CONSTANCIAS-PUBLIC] Error creando schema:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  });
});

const PUBLIC_SITE_BASE = process.env.QUBIRA_PUBLIC_SITE_BASE || 'https://qubira.vercel.app';

function constanciaToPublic(row) {
  return {
    numero: row.numero, codigoVerificacion: row.codigo_verificacion,
    tratamiento: row.tratamiento, nombreCompleto: row.nombre_completo,
    tipoDocumento: row.tipo_documento, numeroDocumento: row.numero_documento,
    area: row.area, cargo: row.cargo,
    fechaInicio: row.fecha_inicio, fechaFin: row.fecha_fin, funcionPrincipal: row.funcion_principal,
    lugar: row.lugar, fechaEmision: row.fecha_emision,
    firmanteNombre: row.firmante_nombre, firmanteCargo: row.firmante_cargo,
  };
}

router.get('/:codigo', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM rrhh.constancias WHERE codigo_verificacion=$1', [req.params.codigo]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'No existe ninguna constancia con ese código de verificación' });
    res.json({ ok: true, data: constanciaToPublic(rows[0]) });
  } catch (err) {
    console.error('[CONSTANCIAS-PUBLIC] GET /:codigo error:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

router.get('/:codigo/pdf', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM rrhh.constancias WHERE codigo_verificacion=$1', [req.params.codigo]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'No existe ninguna constancia con ese código de verificación' });
    const constancia = constanciaToPublic(rows[0]);
    const [firmaUrl, selloUrl] = await Promise.all([
      getFirmaUrlForSigner(constancia.firmanteNombre),
      getSelloEmpresaUrl(),
    ]);
    const pdf = await buildConstanciaPdf(
      { ...constancia, firmaUrl, selloUrl },
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
