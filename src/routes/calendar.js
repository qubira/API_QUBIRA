'use strict';

/* ============================================================
   Calendario Corporativo — fuente central de reuniones para RR.HH.,
   ADG, TI y Soporte. Cada panel tiene su propia vista/filtros, pero
   la disponibilidad de un participante se valida SIEMPRE contra
   todas las áreas (no solo la que está viendo el usuario).

   Privacidad: el contenido de una reunión (título, motivo, descripción,
   participantes) solo se devuelve completo a quien sea de la misma área,
   participante interno de esa reunión específica, o tenga
   nivel_acceso >= 100. Cualquier otro visor solo recibe "ocupado" + el
   horario + el área — nunca el contenido.
   ============================================================ */

const express          = require('express');
const crypto           = require('crypto');
const multer           = require('multer');
const { pool }         = require('../db');
const cloudinary       = require('../config/cloudinary');
const { requireAuth }  = require('../middleware/auth');
const { getEmployeeArea } = require('../lib/employeeArea');
const { requireModuleAccess } = require('../lib/moduleAccess');
const ti                = require('./ti'); // reutiliza canAccessProject (misma regla de acceso a proyectos TI/ADG)

const router = express.Router();
router.use(requireAuth);

const uploadMeetingImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('El archivo debe ser una imagen'));
    cb(null, true);
  },
});

/* Sube la imagen antes de crear/editar la reunión — el formulario
   manda el archivo acá primero, guarda la URL que devuelve, y la
   incluye en el POST/PUT normal de /meetings (mismo patrón que la
   foto de perfil en RRHH). */
router.post('/meetings/image', (req, res) => {
  uploadMeetingImage.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Error al procesar la imagen' });
    try {
      if (!req.file) return res.status(400).json({ error: 'Debes adjuntar una imagen' });
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'image', folder: 'qubira/calendar/meetings' },
          (e, r) => (e ? reject(e) : resolve(r))
        );
        stream.end(req.file.buffer);
      });
      res.json({ url: result.secure_url });
    } catch (cloudErr) {
      console.error('[CALENDAR] Error subiendo imagen a Cloudinary:', cloudErr.message);
      res.status(502).json({ error: 'No se pudo subir la imagen' });
    }
  });
});

function uid() { return crypto.randomUUID(); }
function isPrivileged(req) { return req.user.nivel_acceso >= 100; }

/* ============================================================
   Esquema — se crea solo si no existe
   ============================================================ */
let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = pool.query(`
      CREATE SCHEMA IF NOT EXISTS calendar;
      CREATE EXTENSION IF NOT EXISTS btree_gist;

      CREATE TABLE IF NOT EXISTS calendar.meetings (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, motivo TEXT,
        meeting_date DATE NOT NULL, start_time TIME NOT NULL, end_time TIME NOT NULL,
        area TEXT NOT NULL, meeting_type TEXT,
        project_id TEXT REFERENCES ti.projects(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'scheduled',
        created_by INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE calendar.meetings ADD COLUMN IF NOT EXISTS location TEXT;
      ALTER TABLE calendar.meetings ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE calendar.meetings ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'presencial';
      CREATE INDEX IF NOT EXISTS calendar_meetings_area_date_idx ON calendar.meetings(area, meeting_date);
      CREATE INDEX IF NOT EXISTS calendar_meetings_project_idx ON calendar.meetings(project_id);
      -- Una reunión puede tratar varios proyectos (revisiones, auditorías, comités)
      ALTER TABLE calendar.meetings ADD COLUMN IF NOT EXISTS related_project_ids TEXT[] NOT NULL DEFAULT '{}';
      CREATE INDEX IF NOT EXISTS calendar_meetings_related_projects_idx ON calendar.meetings USING GIN (related_project_ids);

      CREATE TABLE IF NOT EXISTS calendar.meeting_participants (
        id TEXT PRIMARY KEY, meeting_id TEXT REFERENCES calendar.meetings(id) ON DELETE CASCADE,
        participant_type TEXT NOT NULL DEFAULT 'internal',
        user_id INTEGER, role TEXT,
        external_name TEXT, external_kind TEXT,
        time_range TSRANGE
      );
      ALTER TABLE calendar.meeting_participants ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'presencial';
      CREATE INDEX IF NOT EXISTS calendar_participants_user_idx ON calendar.meeting_participants(user_id);
      CREATE INDEX IF NOT EXISTS calendar_participants_meeting_idx ON calendar.meeting_participants(meeting_id);

      /* El choque de horario solo se bloquea a nivel de base de datos
         cuando AMBAS reuniones son presenciales — una persona sí puede
         estar anotada en una presencial y una virtual (o dos virtuales)
         que se crucen en horario, eso se permite y solo se advierte en
         el frontend. modality se denormaliza en meeting_participants
         (copiado de la reunión al guardar) porque un EXCLUDE no puede
         mirar otra tabla. */
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_no_double_booking') THEN
          ALTER TABLE calendar.meeting_participants DROP CONSTRAINT calendar_no_double_booking;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_no_double_booking_presencial') THEN
          ALTER TABLE calendar.meeting_participants
            ADD CONSTRAINT calendar_no_double_booking_presencial
            EXCLUDE USING gist (user_id WITH =, time_range WITH &&) WHERE (modality = 'presencial');
        END IF;
      END $$;
    `);
  }
  return ready;
}
router.use((req, res, next) => { ensureSchema().then(() => next()).catch(next); });

/* ============================================================
   Disponibilidad global — misma lógica de solapamiento ya probada
   (con test de concurrencia real) en el Cronograma de proyecto.
   ============================================================ */
async function findScheduleConflicts({ userIds, date, startTime, endTime, excludeMeetingId }) {
  if (!userIds || !userIds.length) return [];
  const { rows } = await pool.query(`
    SELECT mp.user_id, u.nombre AS user_name,
           m.id AS meeting_id, m.title AS meeting_title, m.area, m.created_by, m.modality,
           to_char(m.meeting_date,'YYYY-MM-DD') AS meeting_date, m.start_time, m.end_time
    FROM calendar.meeting_participants mp
    JOIN calendar.meetings m ON m.id = mp.meeting_id
    LEFT JOIN public.usuarios u ON u.id = mp.user_id
    WHERE mp.user_id = ANY($1)
      AND m.meeting_date = $2
      AND m.start_time < $3
      AND m.end_time > $4
      AND ($5::text IS NULL OR m.id <> $5)
    ORDER BY m.start_time ASC
  `, [userIds, date, endTime, startTime, excludeMeetingId || null]);
  return rows;
}

/* El detalle de la reunión con la que se choca solo se revela si el que
   está agendando puede ver esa reunión (misma área, la creó él, o es
   privilegiado) — si no, se muestra como "Reunión privada" pero se
   conserva persona/área/horario (lo mínimo para que sirva la alerta).

   Modalidad: si ambas reuniones son presenciales, el cruce es "hard"
   (bloquea guardar). Si una es presencial y la otra virtual, es un
   cruce "soft" (se avisa pero se puede guardar igual). Si ambas son
   virtuales, no se considera cruce — una persona sí puede estar en dos
   reuniones virtuales al mismo tiempo — y se descarta directamente. */
function formatConflicts(rows, ctx, requestModality) {
  return rows
    .filter(r => !(requestModality === 'virtual' && r.modality === 'virtual'))
    .map(r => {
      const canSeeDetail = ctx.privileged
        || (ctx.viewerArea && r.area && ctx.viewerArea === String(r.area).toUpperCase())
        || String(r.created_by) === String(ctx.viewerId)
        || String(r.user_id) === String(ctx.viewerId); // el que choca es el propio visor -> ya está invitado, ve el nombre real
      return {
        user_id: r.user_id, user_name: r.user_name,
        meeting_id: r.meeting_id,
        meeting_name: canSeeDetail ? r.meeting_title : 'Reunión privada',
        area: r.area, modality: r.modality,
        hard: requestModality === 'presencial' && r.modality === 'presencial',
        date: r.meeting_date, start_time: r.start_time, end_time: r.end_time,
      };
    });
}

function applyVisibility(m, canSeeDetail) {
  if (canSeeDetail) return { ...m, visibility: 'full' };
  return {
    id: m.id, title: 'Ocupado', description: null, motivo: null, meeting_type: null, location: null, image_url: null,
    meeting_date: m.meeting_date, start_time: m.start_time, end_time: m.end_time,
    area: m.area, status: m.status, project_id: null, modality: m.modality,
    created_by: null, created_by_name: null, participants: [],
    visibility: 'busy_only',
  };
}

async function canManageMeeting(req, meeting) {
  if (meeting.project_id) return ti.helpers.canAccessProject(req, meeting.project_id);
  if (isPrivileged(req)) return true;
  if (String(meeting.created_by) === String(req.user.id)) return true;
  const myArea = await getEmployeeArea(req.user.username);
  return !!(myArea && meeting.area && myArea === String(meeting.area).toUpperCase());
}

/* ============================================================
   Directorio — buscar personas de cualquier área por nombre/apellido/
   cargo/área. Cualquier usuario autenticado puede consultarlo (mismo
   criterio que /api/ti/users hoy).
   ============================================================ */
router.get('/directory', async (req, res) => {
  try {
    const { q, area } = req.query;
    const params = []; let where = "WHERE u.estado='activo'";
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      where += ` AND (u.nombre ILIKE $${n} OR u.apellidos ILIKE $${n} OR e.cargo ILIKE $${n})`;
    }
    if (area) { params.push(area.toUpperCase()); where += ` AND upper(c.nombre) = $${params.length}`; }
    const { rows } = await pool.query(`
      SELECT u.id AS user_id, u.nombre, u.apellidos, e.cargo, c.nombre AS area
      FROM public.usuarios u
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      ${where}
      ORDER BY u.nombre ASC LIMIT 50
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Disponibilidad de un equipo (p. ej. OTI = área TI) en un rango de
   fechas: integrantes activos del área + sus bloques ocupados según
   CUALQUIER reunión del calendario corporativo (de cualquier área).
   Lo usa Comercial al proponer el inicio de sprints para no cruzarse
   con la agenda de OTI. El contenido de cada reunión solo se revela a
   quien ya podría verlo (misma área, participante/creador, o
   privilegiado); al resto se le muestra "Reunión privada".
   ============================================================ */
router.get('/team-availability', async (req, res) => {
  try {
    const area = String(req.query.area || 'TI').toUpperCase();
    const { from, to } = req.query;
    const fechaValida = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
    if (!fechaValida(from) || !fechaValida(to) || to < from) {
      return res.status(400).json({ error: 'Rango de fechas inválido (from/to en formato YYYY-MM-DD)' });
    }
    if ((new Date(to) - new Date(from)) / 86400000 > 62) {
      return res.status(400).json({ error: 'El rango máximo es de 62 días' });
    }

    const { rows: members } = await pool.query(`
      SELECT u.id AS user_id, u.nombre, u.apellidos, e.cargo
      FROM public.usuarios u
      JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      WHERE u.estado = 'activo' AND upper(trim(c.nombre)) = $1
      ORDER BY u.nombre ASC
    `, [area]);
    if (!members.length) return res.json({ area, from, to, members: [], busy: [], generated_at: new Date().toISOString() });

    const { rows } = await pool.query(`
      SELECT mp.user_id, m.id AS meeting_id, m.title, m.area, m.modality, m.created_by,
             to_char(m.meeting_date,'YYYY-MM-DD') AS date,
             to_char(m.start_time,'HH24:MI') AS start_time, to_char(m.end_time,'HH24:MI') AS end_time
      FROM calendar.meeting_participants mp
      JOIN calendar.meetings m ON m.id = mp.meeting_id
      WHERE mp.participant_type = 'internal'
        AND mp.user_id = ANY($1)
        AND m.status <> 'cancelled'
        AND m.meeting_date BETWEEN $2 AND $3
      ORDER BY m.meeting_date, m.start_time
    `, [members.map(m => m.user_id), from, to]);

    const viewerArea = await getEmployeeArea(req.user.username);
    const privileged = isPrivileged(req);
    const ids = [...new Set(rows.map(r => r.meeting_id))];
    let misReuniones = new Set();
    if (ids.length) {
      const { rows: mine } = await pool.query(
        "SELECT meeting_id FROM calendar.meeting_participants WHERE user_id=$1 AND participant_type='internal' AND meeting_id = ANY($2)",
        [req.user.id, ids]
      );
      misReuniones = new Set(mine.map(r => r.meeting_id));
    }

    const busy = rows.map(r => {
      const canSeeDetail = privileged
        || (viewerArea && r.area && viewerArea === String(r.area).toUpperCase())
        || String(r.created_by) === String(req.user.id)
        || misReuniones.has(r.meeting_id);
      return {
        // meeting_id: al editar una reunión, el panel no la cuenta como ocupación propia
        meeting_id: r.meeting_id,
        user_id: r.user_id, date: r.date, start_time: r.start_time, end_time: r.end_time,
        area: r.area, modality: r.modality,
        title: canSeeDetail ? r.title : 'Reunión privada',
      };
    });

    res.json({ area, from, to, members, busy, generated_at: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Plan de proyecto → reuniones en la agenda de un equipo (OTI).
   Comercial, al guardar una proforma, envía el inicio y cada entregable
   (sprint) con su hora y los integrantes de OTI elegidos. Se crean como
   reuniones del área del equipo (TI) para que aparezcan en
   "Calendario — OTI" y en "Mi agenda" de cada participante.
   Solo cuentas con acceso a Comercial/ODN/ADG (o privilegiadas).
   ============================================================ */
const HORA_RE = /^\d{2}:\d{2}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

router.post('/team-plan', requireModuleAccess('COMERCIAL', 'ODN', 'ADG'), async (req, res) => {
  try {
    const area = String(req.body.area || 'TI').toUpperCase();
    const modality = req.body.modality === 'presencial' ? 'presencial' : 'virtual';
    const origen = String(req.body.origen || '').slice(0, 120);
    const proyecto = String(req.body.proyecto || '').slice(0, 160);
    const resumen = String(req.body.resumen || '').slice(0, 2000);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'No hay reuniones para agendar' });
    if (items.length > 40) return res.status(400).json({ error: 'Máximo 40 reuniones por plan' });

    for (const it of items) {
      if (!FECHA_RE.test(it.fecha || '') || !HORA_RE.test(it.hora_inicio || '') || !HORA_RE.test(it.hora_fin || '') || it.hora_fin <= it.hora_inicio) {
        return res.status(400).json({ error: 'Fecha u hora inválida en el plan' });
      }
      if (!Array.isArray(it.participantes) || !it.participantes.length) {
        return res.status(400).json({ error: `Elige al menos un integrante de ${area} para la reunión del ${it.fecha}` });
      }
    }

    // Los participantes deben ser integrantes activos del área destino
    const todos = [...new Set(items.flatMap(it => it.participantes.map(Number)))];
    const { rows: validos } = await pool.query(`
      SELECT u.id FROM public.usuarios u
      JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      WHERE u.estado = 'activo' AND upper(trim(c.nombre)) = $1 AND u.id = ANY($2)
    `, [area, todos]);
    if (validos.length !== todos.length) {
      return res.status(400).json({ error: `Algún participante no es un integrante activo de ${area}` });
    }

    // Cruces de horario (mismo criterio que al crear una reunión)
    const viewerArea = await getEmployeeArea(req.user.username);
    const ctx = { viewerArea, viewerId: req.user.id, privileged: isPrivileged(req) };
    const conflictos = [];
    for (const it of items) {
      const rows = await findScheduleConflicts({ userIds: it.participantes.map(Number), date: it.fecha, startTime: it.hora_inicio, endTime: it.hora_fin });
      conflictos.push(...formatConflicts(rows, ctx, modality));
    }
    if (conflictos.some(c => c.hard)) {
      return res.status(409).json({ error: 'Existen cruces de horario con reuniones presenciales', conflicts: conflictos });
    }

    const client = await pool.connect();
    const creadas = [];
    try {
      await client.query('BEGIN');
      for (const it of items) {
        const id = uid();
        const esInicio = it.tipo === 'inicio';
        const etiqueta = esInicio ? 'Inicio del proyecto' : `Entrega Sprint ${Number(it.numero) || ''}${it.final ? ' (entrega final)' : ''}`.trim();
        const title = `${etiqueta}${proyecto ? ' — ' + proyecto : ''}`.slice(0, 200);
        await client.query(`
          INSERT INTO calendar.meetings (id,title,description,motivo,modality,meeting_date,start_time,end_time,area,meeting_type,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [id, title, resumen || null, origen ? `Plan de ${origen} (Comercial)` : 'Plan de proyecto (Comercial)', modality,
           it.fecha, it.hora_inicio, it.hora_fin, area, esInicio ? 'Planificación' : 'Revisión', req.user.id]
        );
        for (const uidPart of it.participantes.map(Number)) {
          await client.query(`
            INSERT INTO calendar.meeting_participants (id, meeting_id, participant_type, user_id, role, time_range, modality)
            VALUES ($1,$2,'internal',$3,$4, tsrange(($5::date + $6::time)::timestamp, ($5::date + $7::time)::timestamp, '[)'), $8)`,
            [uid(), id, uidPart, esInicio ? 'Equipo de inicio' : 'Equipo de entrega', it.fecha, it.hora_inicio, it.hora_fin, modality]
          );
        }
        creadas.push({ id, fecha: it.fecha, hora_inicio: it.hora_inicio, title });
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23P01') {
        return res.status(409).json({ error: 'Un integrante quedó ocupado en ese horario justo ahora. Revisa la agenda e intenta de nuevo.' });
      }
      throw e;
    } finally { client.release(); }

    res.status(201).json({ created: creadas, warnings: conflictos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Reuniones
   ============================================================ */
router.get('/meetings', async (req, res) => {
  try {
    const { area, mine, project_id, participant_id, date_from, date_to, status } = req.query;
    const viewerArea = await getEmployeeArea(req.user.username);
    const privileged = isPrivileged(req);

    const params = []; let where = 'WHERE 1=1';
    if (project_id) { params.push(project_id); where += ` AND (m.project_id=$${params.length} OR $${params.length} = ANY(m.related_project_ids))`; }
    if (mine === 'true') {
      params.push(req.user.id);
      where += ` AND (EXISTS (SELECT 1 FROM calendar.meeting_participants mp WHERE mp.meeting_id=m.id AND mp.user_id=$${params.length} AND mp.participant_type='internal') OR m.created_by=$${params.length})`;
    } else if (!project_id) {
      if (area === 'ALL') {
        if (!privileged) return res.status(403).json({ error: 'No tienes permiso para ver todas las áreas' });
      } else if (area) {
        params.push(area.toUpperCase()); where += ` AND upper(m.area)=$${params.length}`;
      } else {
        if (!viewerArea) return res.json([]);
        params.push(viewerArea); where += ` AND upper(m.area)=$${params.length}`;
      }
    }
    if (participant_id) {
      params.push(participant_id);
      where += ` AND EXISTS (SELECT 1 FROM calendar.meeting_participants mp2 WHERE mp2.meeting_id=m.id AND mp2.user_id=$${params.length})`;
    }
    if (date_from) { params.push(date_from); where += ` AND m.meeting_date >= $${params.length}`; }
    if (date_to)   { params.push(date_to);   where += ` AND m.meeting_date <= $${params.length}`; }
    if (status)    { params.push(status);    where += ` AND m.status=$${params.length}`; }

    const { rows: meetings } = await pool.query(`
      SELECT m.id, m.title, m.description, m.motivo, m.location, m.image_url, m.modality, to_char(m.meeting_date,'YYYY-MM-DD') AS meeting_date,
             m.start_time, m.end_time, m.area, m.meeting_type, m.project_id, m.status,
             (SELECT array_agg(DISTINCT x) FROM unnest(array_remove(array_prepend(m.project_id, m.related_project_ids), NULL)) x) AS project_ids,
             m.created_by, u.nombre AS created_by_name, m.created_at, m.updated_at
      FROM calendar.meetings m
      LEFT JOIN public.usuarios u ON u.id = m.created_by
      ${where}
      ORDER BY m.meeting_date ASC, m.start_time ASC
    `, params);
    if (!meetings.length) return res.json([]);

    const ids = meetings.map(m => m.id);
    const { rows: participants } = await pool.query(`
      SELECT mp.meeting_id, mp.user_id, mp.role, mp.participant_type, mp.external_name, mp.external_kind,
             u.nombre AS user_name, c.nombre AS user_area, e.cargo AS user_cargo
      FROM calendar.meeting_participants mp
      LEFT JOIN public.usuarios u ON u.id = mp.user_id
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      WHERE mp.meeting_id = ANY($1)
    `, [ids]);
    const byMeeting = {};
    participants.forEach(p => { (byMeeting[p.meeting_id] ||= []).push(p); });

    const { rows: myParticipations } = await pool.query(
      "SELECT meeting_id FROM calendar.meeting_participants WHERE user_id=$1 AND participant_type='internal' AND meeting_id = ANY($2)",
      [req.user.id, ids]
    );
    const myMeetingIds = new Set(myParticipations.map(r => r.meeting_id));

    const result = [];
    for (const m of meetings) {
      m.participants = byMeeting[m.id] || [];
      // Las reuniones ligadas a un proyecto TI/ADG heredan la misma regla de
      // acceso que ya rige documentos/contratos/tecnologías de ese proyecto
      // (responsable, equipo Scrum, o ADG/privilegiado) — no la regla de área,
      // que dejaría a alguien de ADG viendo "Ocupado" en un proyecto al que sí
      // tiene acceso.
      const canSeeDetail = m.project_id
        ? await ti.helpers.canAccessProject(req, m.project_id)
        : (privileged || (viewerArea && m.area && viewerArea === String(m.area).toUpperCase()) || myMeetingIds.has(m.id));
      result.push(applyVisibility(m, canSeeDetail));
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/meetings/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.id, m.title, m.description, m.motivo, m.location, m.image_url, m.modality, to_char(m.meeting_date,'YYYY-MM-DD') AS meeting_date,
             m.start_time, m.end_time, m.area, m.meeting_type, m.project_id, m.status,
             (SELECT array_agg(DISTINCT x) FROM unnest(array_remove(array_prepend(m.project_id, m.related_project_ids), NULL)) x) AS project_ids,
             m.created_by, u.nombre AS created_by_name, m.created_at, m.updated_at
      FROM calendar.meetings m LEFT JOIN public.usuarios u ON u.id = m.created_by
      WHERE m.id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const m = rows[0];

    const { rows: participants } = await pool.query(`
      SELECT mp.meeting_id, mp.user_id, mp.role, mp.participant_type, mp.external_name, mp.external_kind,
             u.nombre AS user_name, c.nombre AS user_area, e.cargo AS user_cargo
      FROM calendar.meeting_participants mp
      LEFT JOIN public.usuarios u ON u.id = mp.user_id
      LEFT JOIN rrhh.empleados e ON lower(e.usuario) = lower(u.username)
      LEFT JOIN rrhh.catalogos c ON c.id = e.area_trabajo_id
      WHERE mp.meeting_id = $1`, [req.params.id]);
    m.participants = participants;

    const myArea = await getEmployeeArea(req.user.username);
    const privileged = isPrivileged(req);
    const amParticipant = participants.some(p => p.participant_type === 'internal' && String(p.user_id) === String(req.user.id));
    const canSeeDetail = m.project_id
      ? await ti.helpers.canAccessProject(req, m.project_id)
      : (privileged || (myArea && m.area && myArea === String(m.area).toUpperCase()) || amParticipant);
    res.json(applyVisibility(m, canSeeDetail));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/check-availability', async (req, res) => {
  try {
    const { date, start_time, end_time, participant_ids, exclude_meeting_id, modality } = req.body;
    if (!date || !start_time || !end_time || !Array.isArray(participant_ids) || !participant_ids.length || end_time <= start_time) {
      return res.json({ conflicts: [] });
    }
    const viewerArea = await getEmployeeArea(req.user.username);
    const privileged = isPrivileged(req);
    const rows = await findScheduleConflicts({
      userIds: participant_ids, date, startTime: start_time, endTime: end_time, excludeMeetingId: exclude_meeting_id,
    });
    res.json({ conflicts: formatConflicts(rows, { viewerArea, viewerId: req.user.id, privileged }, modality || 'presencial') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function validateAndBuildMeeting(req, { requireProjectAccess }) {
  const { title, date, start_time, end_time, motivo, description, meeting_type, location, image_url, modality,
          participants, external_participants, project_id, project_ids, area: bodyArea } = req.body;

  if (!title || !date || !start_time || !end_time) {
    return { error: [400, 'Nombre, fecha, hora de inicio y hora de fin son requeridos'] };
  }
  if (end_time <= start_time) {
    return { error: [400, 'La hora de fin debe ser posterior a la hora de inicio'] };
  }
  if (modality && !['presencial', 'virtual'].includes(modality)) {
    return { error: [400, 'Modalidad inválida'] };
  }

  if (project_id && requireProjectAccess) {
    if (!(await ti.helpers.canAccessProject(req, project_id))) {
      return { error: [403, 'No tienes acceso a este proyecto'] };
    }
  }
  // Proyectos relacionados: solo los que existen y a los que se tiene acceso
  const relatedIds = [...new Set((Array.isArray(project_ids) ? project_ids : []).map(x => String(x || '').trim()).filter(Boolean))].slice(0, 20);
  if (relatedIds.length) {
    const { rows: existentes } = await pool.query('SELECT id FROM ti.projects WHERE id = ANY($1)', [relatedIds]);
    if (existentes.length !== relatedIds.length) return { error: [400, 'Uno de los proyectos relacionados no existe'] };
    const yaTenia = new Set(req._proyectosPrevios || []);
    for (const pid of relatedIds) {
      if (yaTenia.has(pid)) continue;
      if (!(await ti.helpers.canAccessProject(req, pid))) return { error: [403, 'No tienes acceso a uno de los proyectos relacionados'] };
    }
  }

  const myArea = await getEmployeeArea(req.user.username);
  const privileged = isPrivileged(req);
  if (!myArea && !privileged) {
    return { error: [400, 'Tu cuenta no tiene un área asignada; contacta a RR.HH.'] };
  }
  const area = (privileged && bodyArea) ? String(bodyArea).toUpperCase() : (myArea || String(bodyArea || '').toUpperCase());

  const internalList = Array.isArray(participants) ? participants : [];
  const externalList = Array.isArray(external_participants) ? external_participants : [];
  if (!internalList.length && !externalList.length) {
    return { error: [400, 'Selecciona al menos un participante'] };
  }
  const ids = internalList.map(p => p.user_id);
  if (new Set(ids).size !== ids.length) {
    return { error: [400, 'Hay participantes duplicados'] };
  }
  if (ids.length) {
    const { rows: validUsers } = await pool.query("SELECT id FROM public.usuarios WHERE id = ANY($1) AND estado='activo'", [ids]);
    if (validUsers.length !== ids.length) {
      return { error: [400, 'Uno de los participantes no existe o está inactivo'] };
    }
  }
  for (const ext of externalList) {
    if (!ext.name || !ext.kind) return { error: [400, 'Cada participante externo requiere nombre y tipo'] };
  }

  return {
    fields: { title, date, start_time, end_time, motivo: motivo || null, description: description || null,
              meeting_type: meeting_type || null, location: location || null, image_url: image_url || null,
              modality: modality || 'presencial', project_id: project_id || null, area,
              related_project_ids: relatedIds },
    internalList, externalList, myArea, privileged,
  };
}

router.post('/meetings', async (req, res) => {
  try {
    if (!req.body.project_id && Array.isArray(req.body.project_ids) && req.body.project_ids.length) req.body.project_id = req.body.project_ids[0];
    const v = await validateAndBuildMeeting(req, { requireProjectAccess: true });
    if (v.error) return res.status(v.error[0]).json({ error: v.error[1] });
    const { fields, internalList, externalList, myArea, privileged } = v;
    const ids = internalList.map(p => p.user_id);

    if (ids.length) {
      const rows = await findScheduleConflicts({ userIds: ids, date: fields.date, startTime: fields.start_time, endTime: fields.end_time });
      const conflicts = formatConflicts(rows, { viewerArea: myArea, viewerId: req.user.id, privileged }, fields.modality);
      if (conflicts.some(c => c.hard)) return res.status(409).json({ error: 'Existen conflictos de horario', conflicts });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = uid();
      await client.query(`
        INSERT INTO calendar.meetings (id,title,description,motivo,location,image_url,modality,meeting_date,start_time,end_time,area,meeting_type,project_id,created_by,related_project_ids)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [id, fields.title, fields.description, fields.motivo, fields.location, fields.image_url, fields.modality, fields.date, fields.start_time, fields.end_time,
         fields.area, fields.meeting_type, fields.project_id, req.user.id, fields.related_project_ids.filter(x => x !== fields.project_id)]
      );
      for (const p of internalList) {
        await client.query(`
          INSERT INTO calendar.meeting_participants (id, meeting_id, participant_type, user_id, role, time_range, modality)
          VALUES ($1,$2,'internal',$3,$4, tsrange(($5::date + $6::time)::timestamp, ($5::date + $7::time)::timestamp, '[)'), $8)`,
          [uid(), id, p.user_id, p.role || null, fields.date, fields.start_time, fields.end_time, fields.modality]
        );
      }
      for (const ext of externalList) {
        await client.query(`
          INSERT INTO calendar.meeting_participants (id, meeting_id, participant_type, external_name, external_kind)
          VALUES ($1,$2,'external',$3,$4)`,
          [uid(), id, ext.name, ext.kind]
        );
      }
      await client.query('COMMIT');
      for (const pid of [...new Set([fields.project_id, ...fields.related_project_ids].filter(Boolean))]) {
        await ti.helpers.logActivity(pid, req.user.id, 'meeting_scheduled',
          `${req.user.nombre || req.user.username} agendó la reunión "${fields.title}" (${fields.date} ${fields.start_time.slice(0,5)}–${fields.end_time.slice(0,5)})`);
      }
      res.status(201).json({ id });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23P01') {
        return res.status(409).json({ error: 'Uno de los participantes quedó ocupado en ese horario justo ahora. Intenta de nuevo.' });
      }
      throw e;
    } finally { client.release(); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/meetings/:id', async (req, res) => {
  try {
    const { rows: oldRows } = await pool.query('SELECT * FROM calendar.meetings WHERE id=$1', [req.params.id]);
    if (!oldRows.length) return res.status(404).json({ error: 'No encontrado' });
    const old = oldRows[0];
    if (!(await canManageMeeting(req, old))) {
      return res.status(403).json({ error: 'No tienes permiso para editar esta reunión' });
    }

    req.body.project_id = old.project_id; // el área/proyecto de origen no se reasigna al editar
    const previos = [old.project_id, ...(old.related_project_ids || [])].filter(Boolean);
    req._proyectosPrevios = previos;
    if (!Array.isArray(req.body.project_ids)) req.body.project_ids = previos; // clientes antiguos: se conservan
    const v = await validateAndBuildMeeting(req, { requireProjectAccess: false });
    if (v.error) return res.status(v.error[0]).json({ error: v.error[1] });
    const { fields, internalList, externalList, myArea, privileged } = v;
    const ids = internalList.map(p => p.user_id);

    if (ids.length) {
      const rows = await findScheduleConflicts({
        userIds: ids, date: fields.date, startTime: fields.start_time, endTime: fields.end_time, excludeMeetingId: req.params.id,
      });
      const conflicts = formatConflicts(rows, { viewerArea: myArea, viewerId: req.user.id, privileged }, fields.modality);
      if (conflicts.some(c => c.hard)) return res.status(409).json({ error: 'Existen conflictos de horario', conflicts });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE calendar.meetings SET title=$1, description=$2, motivo=$3, meeting_date=$4, start_time=$5, end_time=$6,
          meeting_type=$7, location=$8, image_url=$9, modality=$10, related_project_ids=$12, updated_at=NOW() WHERE id=$11`,
        [fields.title, fields.description, fields.motivo, fields.date, fields.start_time, fields.end_time, fields.meeting_type, fields.location, fields.image_url, fields.modality, req.params.id,
         fields.related_project_ids.filter(x => x !== fields.project_id)]
      );
      await client.query('DELETE FROM calendar.meeting_participants WHERE meeting_id=$1', [req.params.id]);
      for (const p of internalList) {
        await client.query(`
          INSERT INTO calendar.meeting_participants (id, meeting_id, participant_type, user_id, role, time_range, modality)
          VALUES ($1,$2,'internal',$3,$4, tsrange(($5::date + $6::time)::timestamp, ($5::date + $7::time)::timestamp, '[)'), $8)`,
          [uid(), req.params.id, p.user_id, p.role || null, fields.date, fields.start_time, fields.end_time, fields.modality]
        );
      }
      for (const ext of externalList) {
        await client.query(`
          INSERT INTO calendar.meeting_participants (id, meeting_id, participant_type, external_name, external_kind)
          VALUES ($1,$2,'external',$3,$4)`,
          [uid(), req.params.id, ext.name, ext.kind]
        );
      }
      await client.query('COMMIT');
      for (const pid of [...new Set([fields.project_id, ...fields.related_project_ids].filter(Boolean))]) {
        await ti.helpers.logActivity(pid, req.user.id, previos.includes(pid) ? 'meeting_updated' : 'meeting_scheduled',
          `${req.user.nombre || req.user.username} ${previos.includes(pid) ? 'editó' : 'vinculó'} la reunión "${fields.title}" (${fields.date} ${fields.start_time.slice(0,5)}–${fields.end_time.slice(0,5)})`);
      }
      res.json({ message: 'Actualizado' });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23P01') {
        return res.status(409).json({ error: 'Uno de los participantes quedó ocupado en ese horario justo ahora. Intenta de nuevo.' });
      }
      throw e;
    } finally { client.release(); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/meetings/:id/cancel', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM calendar.meetings WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    if (!(await canManageMeeting(req, rows[0]))) {
      return res.status(403).json({ error: 'No tienes permiso para cancelar esta reunión' });
    }
    await pool.query("UPDATE calendar.meetings SET status='cancelled', updated_at=NOW() WHERE id=$1", [req.params.id]);
    await pool.query('DELETE FROM calendar.meeting_participants WHERE meeting_id=$1', [req.params.id]);
    for (const pid of [...new Set([rows[0].project_id, ...(rows[0].related_project_ids || [])].filter(Boolean))]) {
      await ti.helpers.logActivity(pid, req.user.id, 'meeting_cancelled',
        `${req.user.nombre || req.user.username} canceló la reunión "${rows[0].title}"`);
    }
    res.json({ message: 'Cancelada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/meetings/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM calendar.meetings WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    if (!(await canManageMeeting(req, rows[0]))) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta reunión' });
    }
    await pool.query('DELETE FROM calendar.meetings WHERE id=$1', [req.params.id]);
    if (rows[0].project_id) {
      await ti.helpers.logActivity(rows[0].project_id, req.user.id, 'meeting_deleted',
        `${req.user.nombre || req.user.username} eliminó la reunión "${rows[0].title}"`);
    }
    res.json({ message: 'Eliminada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
