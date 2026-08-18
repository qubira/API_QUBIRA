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
const { pool }         = require('../db');
const { requireAuth }  = require('../middleware/auth');
const { getEmployeeArea } = require('../lib/employeeArea');
const ti                = require('./ti'); // reutiliza canAccessProject (misma regla de acceso a proyectos TI/ADG)

const router = express.Router();
router.use(requireAuth);

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
      CREATE INDEX IF NOT EXISTS calendar_meetings_area_date_idx ON calendar.meetings(area, meeting_date);
      CREATE INDEX IF NOT EXISTS calendar_meetings_project_idx ON calendar.meetings(project_id);

      CREATE TABLE IF NOT EXISTS calendar.meeting_participants (
        id TEXT PRIMARY KEY, meeting_id TEXT REFERENCES calendar.meetings(id) ON DELETE CASCADE,
        participant_type TEXT NOT NULL DEFAULT 'internal',
        user_id INTEGER, role TEXT,
        external_name TEXT, external_kind TEXT,
        time_range TSRANGE
      );
      CREATE INDEX IF NOT EXISTS calendar_participants_user_idx ON calendar.meeting_participants(user_id);
      CREATE INDEX IF NOT EXISTS calendar_participants_meeting_idx ON calendar.meeting_participants(meeting_id);

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_no_double_booking') THEN
          ALTER TABLE calendar.meeting_participants
            ADD CONSTRAINT calendar_no_double_booking EXCLUDE USING gist (user_id WITH =, time_range WITH &&);
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
           m.id AS meeting_id, m.title AS meeting_title, m.area, m.created_by,
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
   conserva persona/área/horario (lo mínimo para que sirva la alerta). */
function formatConflicts(rows, ctx) {
  return rows.map(r => {
    const canSeeDetail = ctx.privileged
      || (ctx.viewerArea && r.area && ctx.viewerArea === String(r.area).toUpperCase())
      || String(r.created_by) === String(ctx.viewerId)
      || String(r.user_id) === String(ctx.viewerId); // el que choca es el propio visor -> ya está invitado, ve el nombre real
    return {
      user_id: r.user_id, user_name: r.user_name,
      meeting_id: r.meeting_id,
      meeting_name: canSeeDetail ? r.meeting_title : 'Reunión privada',
      area: r.area,
      date: r.meeting_date, start_time: r.start_time, end_time: r.end_time,
    };
  });
}

function applyVisibility(m, canSeeDetail) {
  if (canSeeDetail) return { ...m, visibility: 'full' };
  return {
    id: m.id, title: 'Ocupado', description: null, motivo: null, meeting_type: null,
    meeting_date: m.meeting_date, start_time: m.start_time, end_time: m.end_time,
    area: m.area, status: m.status, project_id: null,
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
   Reuniones
   ============================================================ */
router.get('/meetings', async (req, res) => {
  try {
    const { area, mine, project_id, participant_id, date_from, date_to, status } = req.query;
    const viewerArea = await getEmployeeArea(req.user.username);
    const privileged = isPrivileged(req);

    const params = []; let where = 'WHERE 1=1';
    if (project_id) { params.push(project_id); where += ` AND m.project_id=$${params.length}`; }
    if (mine === 'true') {
      params.push(req.user.id);
      where += ` AND EXISTS (SELECT 1 FROM calendar.meeting_participants mp WHERE mp.meeting_id=m.id AND mp.user_id=$${params.length} AND mp.participant_type='internal')`;
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
      SELECT m.id, m.title, m.description, m.motivo, to_char(m.meeting_date,'YYYY-MM-DD') AS meeting_date,
             m.start_time, m.end_time, m.area, m.meeting_type, m.project_id, m.status,
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
      SELECT m.id, m.title, m.description, m.motivo, to_char(m.meeting_date,'YYYY-MM-DD') AS meeting_date,
             m.start_time, m.end_time, m.area, m.meeting_type, m.project_id, m.status,
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
    const { date, start_time, end_time, participant_ids, exclude_meeting_id } = req.body;
    if (!date || !start_time || !end_time || !Array.isArray(participant_ids) || !participant_ids.length || end_time <= start_time) {
      return res.json({ conflicts: [] });
    }
    const viewerArea = await getEmployeeArea(req.user.username);
    const privileged = isPrivileged(req);
    const rows = await findScheduleConflicts({
      userIds: participant_ids, date, startTime: start_time, endTime: end_time, excludeMeetingId: exclude_meeting_id,
    });
    res.json({ conflicts: formatConflicts(rows, { viewerArea, viewerId: req.user.id, privileged }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function validateAndBuildMeeting(req, { requireProjectAccess }) {
  const { title, date, start_time, end_time, motivo, description, meeting_type,
          participants, external_participants, project_id, area: bodyArea } = req.body;

  if (!title || !date || !start_time || !end_time) {
    return { error: [400, 'Nombre, fecha, hora de inicio y hora de fin son requeridos'] };
  }
  if (end_time <= start_time) {
    return { error: [400, 'La hora de fin debe ser posterior a la hora de inicio'] };
  }

  if (project_id && requireProjectAccess) {
    if (!(await ti.helpers.canAccessProject(req, project_id))) {
      return { error: [403, 'No tienes acceso a este proyecto'] };
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
              meeting_type: meeting_type || null, project_id: project_id || null, area },
    internalList, externalList, myArea, privileged,
  };
}

router.post('/meetings', async (req, res) => {
  try {
    const v = await validateAndBuildMeeting(req, { requireProjectAccess: true });
    if (v.error) return res.status(v.error[0]).json({ error: v.error[1] });
    const { fields, internalList, externalList, myArea, privileged } = v;
    const ids = internalList.map(p => p.user_id);

    if (ids.length) {
      const rows = await findScheduleConflicts({ userIds: ids, date: fields.date, startTime: fields.start_time, endTime: fields.end_time });
      const conflicts = formatConflicts(rows, { viewerArea: myArea, viewerId: req.user.id, privileged });
      if (conflicts.length) return res.status(409).json({ error: 'Existen conflictos de horario', conflicts });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = uid();
      await client.query(`
        INSERT INTO calendar.meetings (id,title,description,motivo,meeting_date,start_time,end_time,area,meeting_type,project_id,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, fields.title, fields.description, fields.motivo, fields.date, fields.start_time, fields.end_time,
         fields.area, fields.meeting_type, fields.project_id, req.user.id]
      );
      for (const p of internalList) {
        await client.query(`
          INSERT INTO calendar.meeting_participants (id, meeting_id, participant_type, user_id, role, time_range)
          VALUES ($1,$2,'internal',$3,$4, tsrange(($5::date + $6::time)::timestamp, ($5::date + $7::time)::timestamp, '[)'))`,
          [uid(), id, p.user_id, p.role || null, fields.date, fields.start_time, fields.end_time]
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
    const v = await validateAndBuildMeeting(req, { requireProjectAccess: false });
    if (v.error) return res.status(v.error[0]).json({ error: v.error[1] });
    const { fields, internalList, externalList, myArea, privileged } = v;
    const ids = internalList.map(p => p.user_id);

    if (ids.length) {
      const rows = await findScheduleConflicts({
        userIds: ids, date: fields.date, startTime: fields.start_time, endTime: fields.end_time, excludeMeetingId: req.params.id,
      });
      const conflicts = formatConflicts(rows, { viewerArea: myArea, viewerId: req.user.id, privileged });
      if (conflicts.length) return res.status(409).json({ error: 'Existen conflictos de horario', conflicts });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE calendar.meetings SET title=$1, description=$2, motivo=$3, meeting_date=$4, start_time=$5, end_time=$6,
          meeting_type=$7, updated_at=NOW() WHERE id=$8`,
        [fields.title, fields.description, fields.motivo, fields.date, fields.start_time, fields.end_time, fields.meeting_type, req.params.id]
      );
      await client.query('DELETE FROM calendar.meeting_participants WHERE meeting_id=$1', [req.params.id]);
      for (const p of internalList) {
        await client.query(`
          INSERT INTO calendar.meeting_participants (id, meeting_id, participant_type, user_id, role, time_range)
          VALUES ($1,$2,'internal',$3,$4, tsrange(($5::date + $6::time)::timestamp, ($5::date + $7::time)::timestamp, '[)'))`,
          [uid(), req.params.id, p.user_id, p.role || null, fields.date, fields.start_time, fields.end_time]
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
    res.json({ message: 'Eliminada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
