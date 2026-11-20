'use strict';
/* ============================================================
   Casos de soporte derivados a otras áreas (fase 5). La ruta de soporte
   la usa solo el módulo de OCOS; aquí OTI, DST y ODACL ven y atienden lo
   que les llega, sin acceder al resto de casos ni a sus imágenes:
   - OTI: casos escalados por el Especialista N3 (error de fondo) → los
     devuelve a OCOS N3 con la solución.
   - DST: incidentes de seguridad → los contiene y los devuelve a OCOS
     con el informe (DST informa al Director General).
   - ODACL: incidentes con datos personales → registra su evaluación legal
     (Ley 29733). ADG y GG ven todos.
   ============================================================ */
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const DM = require('../lib/docModulo');
const C = require('../lib/codificacion');
const { util: U } = require('./soporteCasos');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { U.asegurar().then(() => next()).catch(next); });

const AREAS = ['OTI', 'DST', 'ODACL'];
const puedeDevolver = (q, c) => (c.area_actual === 'OTI' && (q.sigla === 'OTI' || q.esADG)) || (c.area_actual === 'DST' && ((q.sigla === 'DST' && q.nivel && q.nivel <= 5) || q.esADG));
const puedeNota = (q, c) => c.datos_personales && ((q.sigla === 'ODACL' && q.nivel && q.nivel <= 6) || q.esADG);
const vista = (q, r) => {
  const s = U.salida(r);
  return { id: s.id, titulo: s.titulo, descripcion: String(s.descripcion || '').slice(0, 2000), proyecto: s.proyecto, prioridad: s.prioridad, estado: s.estado,
    nivel: s.nivel, nivelNombre: s.nivelNombre, areaActual: s.areaActual, seguridad: s.seguridad, datosPersonales: s.datosPersonales, escalamiento: s.escalamiento,
    creado: r.created_at, puedo_devolver: puedeDevolver(q, r), puedo_nota: puedeNota(q, r) };
};

router.get('/', async (req, res) => {
  try {
    const q = await C.quienEs(req.user);
    const dir = U.esDireccion(q);
    if (!dir && !AREAS.includes(q.sigla)) return res.status(403).json({ ok: false, error: 'Tu área no recibe casos derivados de soporte.' });
    const hist = req.query.historial === '1';
    let where;
    if (dir) where = hist ? "(escalamiento <> '[]'::jsonb)" : "(area_actual <> 'OCOS')";
    else if (q.sigla === 'OTI') where = hist ? "escalamiento @> '[{\"a_area\": \"OTI\"}]'::jsonb" : "area_actual = 'OTI'";
    else if (q.sigla === 'DST') where = hist ? 'seguridad' : "area_actual = 'DST'";
    else where = hist ? 'datos_personales' : "datos_personales AND NOT (escalamiento @> '[{\"area\": \"ODACL\"}]'::jsonb)";
    const { rows } = await pool.query(`SELECT * FROM soporte.casos WHERE ${where} ORDER BY updated_at DESC LIMIT 300`);
    res.json({ ok: true, area: dir ? 'DIRECCION' : q.sigla, casos: rows.map(r => vista(q, r)) });
  } catch (e) { DM.responder(res, e, '[CASOS] derivados:'); }
});

async function accion(req, res, tipo) {
  try {
    const q = await C.quienEs(req.user);
    const comentario = String((req.body || {}).comentario || '').trim();
    if (!comentario) return res.status(400).json({ ok: false, error: tipo === 'nota' ? 'Escribe la evaluación legal.' : 'Escribe qué se hizo (la solución o la contención).' });
    const out = await DM.enTransaccion(null, async cx => {
      const { rows } = await cx.query('SELECT * FROM soporte.casos WHERE codigo = $1 FOR UPDATE', [req.params.codigo]);
      if (!rows.length) throw new DM.ErrorModulo(404, 'Caso no encontrado');
      const c = rows[0];
      if (tipo === 'devolver') {
        if (!puedeDevolver(q, c)) throw new DM.ErrorModulo(403, c.area_actual === 'DST' ? 'Devuelve el incidente DST (N5 o superior).' : c.area_actual === 'OTI' ? 'Lo devuelve OTI.' : 'El caso ya está en OCOS.');
        const de = c.area_actual;
        const esc = [...(c.escalamiento || []), U.entrada(q, de === 'DST' ? 'INCIDENTE CONTENIDO' : 'CORREGIDO POR OTI', de === 'DST' ? 'DST' : U.NIVEL[4], U.NIVEL[3], comentario, { a_area: 'OCOS' })];
        const { rows: [act] } = await cx.query("UPDATE soporte.casos SET area_actual = 'OCOS', nivel = 3, escalamiento = $2::jsonb, updated_at = NOW() WHERE codigo = $1 RETURNING *", [c.codigo, JSON.stringify(esc)]);
        return act;
      }
      if (!puedeNota(q, c)) throw new DM.ErrorModulo(403, 'La evaluación legal la registra ODACL (N6 o superior) en incidentes con datos personales.');
      const esc = [...(c.escalamiento || []), U.entrada(q, 'EVALUACIÓN LEGAL (LEY 29733)', 'ODACL', null, comentario)];
      const { rows: [act] } = await cx.query('UPDATE soporte.casos SET escalamiento = $2::jsonb, updated_at = NOW() WHERE codigo = $1 RETURNING *', [c.codigo, JSON.stringify(esc)]);
      return act;
    });
    res.json({ ok: true, caso: vista(q, out) });
  } catch (e) { DM.responder(res, e, '[CASOS] acción:'); }
}
router.post('/:codigo/devolver', (req, res) => accion(req, res, 'devolver'));
router.post('/:codigo/nota', (req, res) => accion(req, res, 'nota'));

module.exports = router;
