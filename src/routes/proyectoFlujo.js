'use strict';
/* API del flujo de proyectos (etapas y puertas). La usan ADG, GG, OTI, OPP, ODACL,
   DST, OCOS y ODN desde sus módulos; cada acción revisa área y nivel en lib/proyectoFlujo. */
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const F = require('../lib/proyectoFlujo');
const multer = require('multer');
const crypto = require('crypto');
const cloudinary = require('../config/cloudinary');
const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const TIPOS_ACTA = { 'application/pdf': 'raw', 'image/png': 'image', 'image/jpeg': 'image' };

const router = express.Router();
router.use(requireAuth);
// La configuración no necesita la tabla de proyectos (se puede ajustar aunque todavía no haya ninguno)
router.use((req, res, next) => { if (req.path === '/config') return next(); F.asegurarFlujo().then(() => next()).catch(next); });

const quienDe = async req => ({ ...(await F.C.quienEs(req.user)), id: req.user.id });
const manejar = fn => async (req, res) => {
  try {
    const quien = await quienDe(req);
    if (!(await F.puedeVer(quien))) return res.status(403).json({ ok: false, error: 'Tu área no participa en el flujo de proyectos' });
    await fn(req, res, quien);
  } catch (e) {
    if (e instanceof F.Rechazo) return res.status(e.status).json({ ok: false, error: e.message });
    console.error('[FLUJO]', e.message);
    res.status(500).json({ ok: false, error: 'No se pudo completar la operación' });
  }
};
const detalle = async (res, id, quien) => res.json({ ok: true, data: await F.vista(await F.cargar(id), quien) });

router.get('/config', manejar(async (req, res, quien) => res.json({ ok: true, data: { ...(await F.config()), etapas: F.ETAPAS, puedo_config: !!(quien.esADG && quien.nivel <= 2) } })));
router.put('/config', manejar(async (req, res, quien) => res.json({ ok: true, data: await F.guardarConfig(quien, req.body || {}) })));

// Proyectos en el flujo (los anteriores se piden con ?anteriores=1)
router.get('/', manejar(async (req, res, quien) => {
  const { rows } = await pool.query(`SELECT * FROM ti.projects WHERE ${req.query.anteriores ? 'flujo_etapa IS NULL' : 'flujo_etapa IS NOT NULL'} AND status <> 'cancelled' ORDER BY updated_at DESC LIMIT 300`);
  const data = []; for (const p of rows) data.push(await F.vista(p, quien, false));
  res.json({ ok: true, data });
}));
router.get('/:id', manejar(async (req, res, quien) => detalle(res, req.params.id, quien)));
router.post('/:id/avanzar', manejar(async (req, res, quien) => { await F.avanzar(req.params.id, quien, req.body || {}); F.avisar('avanzar', req.params.id, quien).catch(() => {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/devolver', manejar(async (req, res, quien) => { await F.devolver(req.params.id, quien, (req.body || {}).comentario); F.avisar('devolver', req.params.id, quien, req.body || {}).catch(() => {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/retroceder', manejar(async (req, res, quien) => { await F.retroceder(req.params.id, quien, req.body || {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/incorporar', manejar(async (req, res, quien) => { await F.incorporar(req.params.id, quien, req.body || {}); await detalle(res, req.params.id, quien); }));
router.put('/:id/costos', manejar(async (req, res, quien) => { await F.costos(req.params.id, quien, req.body || {}); F.avisar('costos', req.params.id, quien).catch(() => {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/exceso', manejar(async (req, res, quien) => { await F.exceso(req.params.id, quien, req.body || {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/traspaso/:accion', manejar(async (req, res, quien) => { await F.traspaso(req.params.id, quien, req.params.accion, req.body || {}); F.avisar('traspaso', req.params.id, quien, { accion: req.params.accion }).catch(() => {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/comision', manejar(async (req, res, quien) => { await F.registro(req.params.id, quien, 'comision', req.body || {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/reunion', manejar(async (req, res, quien) => { await F.registro(req.params.id, quien, 'reunion', req.body || {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/cambios', manejar(async (req, res, quien) => { await F.cambio(req.params.id, quien, 'solicitar', req.body || {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/cambios/:cid/:accion', manejar(async (req, res, quien) => { await F.cambio(req.params.id, quien, req.params.accion, req.body || {}, req.params.cid); await detalle(res, req.params.id, quien); }));
router.post('/:id/facturas', manejar(async (req, res, quien) => { await F.factura(req.params.id, quien, 'registrar', req.body || {}); await detalle(res, req.params.id, quien); }));
router.post('/:id/facturas/:fid/cobro', manejar(async (req, res, quien) => { await F.factura(req.params.id, quien, 'cobro', req.body || {}, req.params.fid); await detalle(res, req.params.id, quien); }));
// Acta de conformidad firmada: PDF o imagen, privada en Cloudinary
router.post('/:id/acta-conformidad', (req, res, next) => subir.single('archivo')(req, res, e => (e ? res.status(400).json({ ok: false, error: e.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera 10 MB' : 'No se pudo leer el archivo' }) : next())),
  manejar(async (req, res, quien) => {
    const f = req.file;
    if (!f || !TIPOS_ACTA[f.mimetype]) throw new F.Rechazo(400, 'Sube el acta firmada en PDF, PNG o JPG');
    const tipo = TIPOS_ACTA[f.mimetype];
    const r = await new Promise((ok, mal) => cloudinary.uploader.upload_stream({ resource_type: tipo, type: tipo === 'raw' ? 'upload' : 'private', folder: 'qubira/flujo/actas',
      public_id: `${crypto.randomUUID()}${tipo === 'raw' ? '.pdf' : ''}` }, (e, x) => (e ? mal(e) : ok(x))).end(f.buffer));
    await F.guardarActa(req.params.id, quien, { url: r.secure_url, public_id: r.public_id, tipo, formato: r.format || null, nombre: String(f.originalname || 'acta').slice(0, 120) });
    await detalle(res, req.params.id, quien);
  }));
// Enlace firmado y temporal para ver el acta (no es pública)
router.get('/:id/acta-conformidad', manejar(async (req, res) => {
  const p = await F.cargar(req.params.id);
  const a = p.acta_conformidad_archivo;
  if (!a || !a.public_id) throw new F.Rechazo(404, 'El proyecto no tiene acta de conformidad subida');
  const url = cloudinary.utils.private_download_url(a.public_id, a.tipo === 'raw' ? null : (a.formato || 'jpg'), { resource_type: a.tipo, type: a.tipo === 'raw' ? 'upload' : 'private', expires_at: Math.floor(Date.now() / 1000) + 600 });
  res.json({ ok: true, data: { url, nombre: a.nombre } });
}));
router.post('/:id/riesgos', manejar(async (req, res, quien) => { const b = req.body || {}; await F.riesgo(req.params.id, quien, b); F.avisar('riesgo', req.params.id, quien, { alto: (Number(b.probabilidad) * Number(b.impacto)) >= 15, texto: b.riesgo }).catch(() => {}); await detalle(res, req.params.id, quien); }));
router.put('/:id/riesgos/:rid', manejar(async (req, res, quien) => { await F.riesgo(req.params.id, quien, req.body || {}, req.params.rid); await detalle(res, req.params.id, quien); }));

module.exports = router;
