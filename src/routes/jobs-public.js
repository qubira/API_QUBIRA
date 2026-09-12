'use strict';

/* ============================================================
   Bolsa de trabajo pública — lee las ofertas que RRHH publicó como
   "Abierta" en rrhh.vacantes y recibe postulaciones (CV + respuestas
   a las preguntas de filtro que RRHH definió por oferta), sin sesión
   — mismo criterio que analytics.js: el sitio público (carpeta QUBIRA,
   deploy aparte en Vercel) le habla a esto de forma anónima.

   Todo lo que escribe acá es "candidato nuevo, etapa Postulado, origen
   publico" — el resto del pipeline (entrevistas, calificación, etc.)
   lo sigue manejando RRHH desde su panel como siempre.
   ============================================================ */

const express = require('express');
const multer  = require('multer');
const crypto  = require('crypto');
const { pool } = require('../db');
const { ensureSchema, subirCvACloudinary } = require('./rrhh');

const router = express.Router();

function uid() { return crypto.randomUUID(); }

router.use((req, res, next) => {
  ensureSchema().then(() => next()).catch(err => {
    console.error('[JOBS-PUBLIC] Error creando schema:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  });
});

const uploadCv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.mimetype)) return cb(new Error('El CV debe ser un PDF o un documento de Word'));
    cb(null, true);
  },
});

const JOB_SELECT = `
  SELECT v.id, v.titulo, v.modalidad, v.tipo_contrato, v.vacantes, v.descripcion,
         v.requisitos, v.fecha_publicacion, v.fecha_limite, v.nivel_experiencia,
         v.salario_min, v.salario_max, v.beneficios, v.habilidades, d.nombre AS departamento
  FROM rrhh.vacantes v
  LEFT JOIN rrhh.departamentos d ON d.id = v.department_id
`;
/* Una oferta ya no debe aparecer en la bolsa pública si RRHH le puso
   fecha límite y esa fecha ya pasó — sin necesidad de un cron que la
   cierre, se resuelve solo al filtrar (fecha_limite es TEXT en
   formato ISO YYYY-MM-DD, comparable como texto). */
const OPEN_CLAUSE = `v.estado = 'Abierta' AND (v.fecha_limite IS NULL OR v.fecha_limite = '' OR v.fecha_limite >= to_char(NOW(), 'YYYY-MM-DD'))`;

function jobToApi(r) {
  return {
    id: r.id, titulo: r.titulo, departamento: r.departamento, modalidad: r.modalidad,
    tipoContrato: r.tipo_contrato, vacantes: r.vacantes, descripcion: r.descripcion,
    requisitos: r.requisitos, fechaPublicacion: r.fecha_publicacion, fechaLimite: r.fecha_limite,
    nivelExperiencia: r.nivel_experiencia, salarioMin: r.salario_min, salarioMax: r.salario_max,
    beneficios: r.beneficios, habilidades: r.habilidades,
  };
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${JOB_SELECT} WHERE ${OPEN_CLAUSE} ORDER BY v.fecha_publicacion DESC NULLS LAST, v.id DESC`
    );
    res.json({ ok: true, data: rows.map(jobToApi) });
  } catch (err) {
    console.error('[JOBS-PUBLIC] GET / error:', err.message);
    res.status(500).json({ ok: false, error: 'Error al cargar las ofertas' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`${JOB_SELECT} WHERE v.id = $1 AND ${OPEN_CLAUSE}`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Oferta no encontrada' });
    const { rows: preguntas } = await pool.query(
      'SELECT id, pregunta FROM rrhh.vacante_preguntas WHERE vacante_id = $1 ORDER BY orden ASC',
      [rows[0].id]
    );
    res.json({ ok: true, data: { ...jobToApi(rows[0]), preguntas: preguntas.map(p => ({ id: p.id, pregunta: p.pregunta })) } });
  } catch (err) {
    console.error('[JOBS-PUBLIC] GET /:id error:', err.message);
    res.status(500).json({ ok: false, error: 'Error al cargar la oferta' });
  }
});

router.post('/:id/postular', (req, res) => {
  uploadCv.single('cv')(req, res, async (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message || 'Error al procesar el CV' });
    try {
      const { id } = req.params;
      const nombre = (req.body.nombre || '').trim();
      const apellido = (req.body.apellido || '').trim();
      const email = (req.body.email || '').trim();
      const telefono = (req.body.telefono || '').trim() || null;
      if (!nombre || !apellido || !email) {
        return res.status(400).json({ ok: false, error: 'Faltan tus datos de contacto' });
      }
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'Debes adjuntar tu CV' });
      }

      const { rows: vacRows } = await pool.query(`SELECT v.id FROM rrhh.vacantes v WHERE v.id = $1 AND ${OPEN_CLAUSE}`, [id]);
      if (!vacRows.length) return res.status(404).json({ ok: false, error: 'Esta oferta ya no está disponible' });

      const { rows: preguntas } = await pool.query(
        'SELECT id, pregunta FROM rrhh.vacante_preguntas WHERE vacante_id = $1 ORDER BY orden ASC', [id]
      );

      let respuestas;
      try { respuestas = JSON.parse(req.body.respuestas || '[]'); } catch { respuestas = null; }
      if (!Array.isArray(respuestas)) return res.status(400).json({ ok: false, error: 'Respuestas inválidas' });

      const answerMap = new Map(respuestas.map(r => [String(r.preguntaId), String(r.respuesta || '').trim()]));
      for (const p of preguntas) {
        if (!answerMap.get(p.id)) return res.status(400).json({ ok: false, error: 'Debes responder todas las preguntas' });
      }

      const cvResult = await subirCvACloudinary(req.file.buffer, req.file.originalname);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const candidatoId = uid();
        await client.query(
          `INSERT INTO rrhh.candidatos
             (id, job_posting_id, nombre, apellido, email, telefono, etapa, fecha_postulacion, origen, cv_url, cv_nombre_archivo)
           VALUES ($1,$2,$3,$4,$5,$6,'Postulado',$7,'publico',$8,$9)`,
          [candidatoId, id, nombre, apellido, email, telefono, new Date().toISOString().slice(0, 10), cvResult.secure_url, req.file.originalname]
        );
        for (const p of preguntas) {
          await client.query(
            `INSERT INTO rrhh.candidato_respuestas (id, candidato_id, pregunta_id, pregunta_texto, respuesta)
             VALUES ($1,$2,$3,$4,$5)`,
            [uid(), candidatoId, p.id, p.pregunta, answerMap.get(p.id)]
          );
        }
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[JOBS-PUBLIC] POST /:id/postular error:', err.message);
      res.status(500).json({ ok: false, error: 'No se pudo enviar tu postulación' });
    }
  });
});

module.exports = router;
