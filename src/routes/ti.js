'use strict';

const express    = require('express');
const crypto     = require('crypto');
const multer     = require('multer');
const { pool }   = require('../db');
const cloudinary = require('../config/cloudinary');
const { requireAuth } = require('../middleware/auth');
const { getEmployeeArea } = require('../lib/employeeArea');

const router = express.Router();
router.use(requireAuth);

function uid() { return crypto.randomUUID(); }

/* ============================================================
   Esquema — proyectos, contratos, documentos, whatsapp, emails,
   actividad y requerimientos del área de TI. Las referencias a
   "usuario" (responsible_id, created_by, user_id) apuntan al id
   de la tabla `usuarios` compartida (schema public), no a una
   tabla propia — TI ya no tiene su propia lista de cuentas.
   ============================================================ */
let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = pool.query(`
      CREATE SCHEMA IF NOT EXISTS ti;

      CREATE TABLE IF NOT EXISTS ti.projects (
        id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, client TEXT NOT NULL,
        description TEXT, status TEXT DEFAULT 'pending', progress INTEGER DEFAULT 0,
        budget NUMERIC DEFAULT 0, currency TEXT DEFAULT 'USD', start_date TEXT, end_date TEXT,
        responsible_id INTEGER, priority TEXT DEFAULT 'medium', created_by INTEGER,
        company_name TEXT, company_logo TEXT, id_document_type TEXT, id_document_number TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ti.document_types (
        id TEXT PRIMARY KEY, label TEXT NOT NULL,
        created_by INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ti.contracts (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES ti.projects(id) ON DELETE CASCADE,
        type TEXT DEFAULT 'contract', title TEXT NOT NULL, amount NUMERIC DEFAULT 0, currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'draft', file_path TEXT, file_name TEXT, notes TEXT, signed_date TEXT,
        created_by INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ti.documents (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES ti.projects(id) ON DELETE CASCADE,
        category TEXT DEFAULT 'general', title TEXT NOT NULL, description TEXT,
        file_path TEXT, file_name TEXT, file_size INTEGER, mime_type TEXT, tags TEXT,
        created_by INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ti.whatsapp_messages (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES ti.projects(id) ON DELETE CASCADE,
        contact_name TEXT NOT NULL, phone TEXT, direction TEXT DEFAULT 'received', content TEXT NOT NULL,
        msg_date TIMESTAMPTZ, starred INTEGER DEFAULT 0, created_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ti.emails (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES ti.projects(id) ON DELETE CASCADE,
        subject TEXT NOT NULL, from_name TEXT, from_email TEXT, to_email TEXT, body TEXT,
        direction TEXT DEFAULT 'received', email_date TIMESTAMPTZ, starred INTEGER DEFAULT 0, attachments TEXT,
        created_by INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ti.activities (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES ti.projects(id) ON DELETE CASCADE,
        user_id INTEGER, type TEXT NOT NULL, description TEXT NOT NULL, metadata TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ti.requirements (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES ti.projects(id) ON DELETE CASCADE,
        type TEXT DEFAULT 'functional', description TEXT NOT NULL, progress INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ti.scrum_roles (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES ti.projects(id) ON DELETE CASCADE,
        role TEXT NOT NULL, user_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ti.project_technologies (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES ti.projects(id) ON DELETE CASCADE,
        category TEXT NOT NULL, name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS claimed_by INTEGER;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS project_type TEXT;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS github_url TEXT;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS website_url TEXT;
      ALTER TABLE ti.projects ADD COLUMN IF NOT EXISTS family TEXT;
    `);
  }
  return ready;
}
router.use((req, res, next) => { ensureSchema().then(() => next()).catch(next); });

/* ============================================================
   Flujo ADG <-> TI:
   - ADG crea el proyecto (status "pending") y sube contrato/proforma.
   - TI ve los "pending", los reclama (claim) y pasa a trabajar en él.
   - TI marca "finished_by_ti" cuando termina.
   - ADG revisa y recién ahí pasa a "completed" (a partir de ahí TI ya
     no puede editar nada de ese proyecto).
   Solo ADG puede crear proyectos, subir contratos/proformas y aprobar
   el cierre. Solo TI puede reclamar proyectos y marcarlos finalizados.
   ============================================================ */
async function requireArea(req, res, area) {
  const mine = await getEmployeeArea(req.user.username);
  if (mine !== area && req.user.nivel_acceso < 100) {
    res.status(403).json({ error: `Esta acción es exclusiva del área ${area}` });
    return false;
  }
  return true;
}

async function isProjectLockedForTi(projectId) {
  const { rows } = await pool.query('SELECT status FROM ti.projects WHERE id = $1', [projectId]);
  return rows.length ? rows[0].status === 'completed' : false;
}

/* ============================================================
   Visibilidad por proyecto (lado TI): para que no cualquier persona
   de TI pueda ver la documentación/requisitos/etc. de un proyecto
   ajeno, solo puede entrar al detalle de un proyecto quien:
   - es de área ADG (o tiene nivel_acceso >= 100), o
   - es el Responsable del proyecto, o
   - está inscrito en algún rol Scrum de ese proyecto.
   El listado general de /projects (vista superficial: nombre, cliente,
   estado, familia, responsable, avance) NO se restringe.
   ============================================================ */
async function isPrivilegedViewer(req) {
  const myArea = await getEmployeeArea(req.user.username);
  return myArea === 'ADG' || req.user.nivel_acceso >= 100;
}

async function canAccessProject(req, projectId) {
  if (await isPrivilegedViewer(req)) return true;
  const { rows } = await pool.query('SELECT responsible_id FROM ti.projects WHERE id=$1', [projectId]);
  if (!rows.length) return false;
  if (rows[0].responsible_id != null && String(rows[0].responsible_id) === String(req.user.id)) return true;
  const { rows: sc } = await pool.query(
    'SELECT 1 FROM ti.scrum_roles WHERE project_id=$1 AND user_id=$2 LIMIT 1', [projectId, req.user.id]
  );
  return sc.length > 0;
}

async function isProjectResponsible(req, projectId) {
  if (await isPrivilegedViewer(req)) return true;
  const { rows } = await pool.query('SELECT responsible_id FROM ti.projects WHERE id=$1', [projectId]);
  return rows.length > 0 && rows[0].responsible_id != null && String(rows[0].responsible_id) === String(req.user.id);
}

/* Ids de proyectos donde el usuario es Responsable o está en el equipo
   Scrum — usado para filtrar los listados "sin proyecto" (Documentos,
   WhatsApp, Correos) cuando el que pregunta no es privilegiado. */
async function getAccessibleProjectIds(userId) {
  const { rows } = await pool.query(`
    SELECT id FROM ti.projects WHERE responsible_id = $1
    UNION
    SELECT project_id AS id FROM ti.scrum_roles WHERE user_id = $1
  `, [userId]);
  return rows.map(r => r.id);
}

/* Lista liviana de cuentas para los selects de "responsable" — cualquier
   usuario autenticado la necesita, no solo ADMIN/CEO (a diferencia de
   /api/usuarios, que sí exige nivel >= 80). */
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, TRIM(nombre || ' ' || COALESCE(apellidos, '')) AS name
      FROM public.usuarios WHERE estado = 'activo' ORDER BY nombre`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Tipos de documento personalizados — el set base (DNI/CE/Pasaporte/RUC)
   vive fijo en el frontend; acá solo se guardan los que ADG agrega con
   el "+" cuando necesita uno que no está en la lista.
   ============================================================ */
router.get('/document-types', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ti.document_types ORDER BY label');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/document-types', async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'ADG'))) return;
    const { label } = req.body;
    if (!label || !label.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    const id = uid();
    await pool.query('INSERT INTO ti.document_types (id, label, created_by) VALUES ($1,$2,$3)', [id, label.trim(), req.user.id]);
    res.status(201).json({ id, label: label.trim() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/document-types/:id', async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'ADG'))) return;
    const { label } = req.body;
    if (!label || !label.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    await pool.query('UPDATE ti.document_types SET label=$1 WHERE id=$2', [label.trim(), req.params.id]);
    res.json({ message: 'Actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/document-types/:id', async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'ADG'))) return;
    await pool.query('DELETE FROM ti.document_types WHERE id=$1', [req.params.id]);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function logActivity(projectId, userId, type, description) {
  if (!projectId) return Promise.resolve();
  return pool.query(
    'INSERT INTO ti.activities (id, project_id, user_id, type, description) VALUES ($1,$2,$3,$4,$5)',
    [uid(), projectId, userId, type, description]
  );
}

/* ============================================================
   Subida de archivos — Cloudinary (misma cuenta que usa QUBIRA)
   ============================================================ */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function uploadToCloudinary(buffer, folder, resourceType, originalName) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder,
        public_id: `${uid()}_${(originalName || 'archivo').replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

/* ============================================================
   Proyectos
   ============================================================ */
const STATUS_LABEL   = { pending:'Pendiente', active:'Activo', paused:'Pausado', finished_by_ti:'Finalizado (por revisar)', completed:'Completado', cancelled:'Cancelado' };
const PRIORITY_LABEL = { low:'Baja', medium:'Media', high:'Alta', urgent:'Urgente' };
const DOC_LABEL       = { dni:'DNI', ce:'CE', pasaporte:'Pasaporte', ruc:'RUC' };
const PROJECT_TYPE_LABEL = { web:'Web', mobile:'Aplicativo Móvil', desktop:'Aplicativo de Escritorio' };
const FIELD_LABEL = {
  name:'Nombre', client:'Cliente', description:'Descripción', status:'Estado',
  budget:'Presupuesto', currency:'Moneda', start_date:'Fecha de Inicio', end_date:'Fecha de Entrega',
  responsible_id:'Responsable', priority:'Prioridad', company_name:'Nombre de Empresa',
  id_document_type:'Tipo de Documento', id_document_number:'Número de Documento',
  project_type:'Tipo de Proyecto', github_url:'Link de GitHub', website_url:'Link de la Página',
  family:'Familia de Proyecto',
};

router.get('/projects', async (req, res) => {
  try {
    const { status, search, family } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (status) { params.push(status); where += ` AND p.status = $${params.length}`; }
    if (family) { params.push(family); where += ` AND p.family = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      where += ` AND (p.name ILIKE $${n} OR p.client ILIKE $${n} OR p.code ILIKE $${n})`;
    }
    const { rows } = await pool.query(`
      SELECT p.*, u.nombre AS responsible_name, cu.nombre AS claimed_by_name,
        (SELECT COUNT(*) FROM ti.contracts  c WHERE c.project_id = p.id)::int AS contracts_count,
        (SELECT COUNT(*) FROM ti.documents  d WHERE d.project_id = p.id)::int AS documents_count,
        (SELECT COUNT(*) FROM ti.whatsapp_messages w WHERE w.project_id = p.id)::int AS messages_count
      FROM ti.projects p
      LEFT JOIN public.usuarios u  ON u.id = p.responsible_id
      LEFT JOIN public.usuarios cu ON cu.id = p.claimed_by
      ${where} ORDER BY p.created_at DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projects/families', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT family, COUNT(*)::int AS count FROM ti.projects WHERE family IS NOT NULL AND family <> '' GROUP BY family ORDER BY family`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projects/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const one = (q, p = []) => pool.query(q, p).then(r => r.rows[0]);
    const [total, active, pending, finishedByTi, completed, overdue, budget] = await Promise.all([
      one("SELECT COUNT(*)::int AS c FROM ti.projects"),
      one("SELECT COUNT(*)::int AS c FROM ti.projects WHERE status = 'active'"),
      one("SELECT COUNT(*)::int AS c FROM ti.projects WHERE status = 'pending'"),
      one("SELECT COUNT(*)::int AS c FROM ti.projects WHERE status = 'finished_by_ti'"),
      one("SELECT COUNT(*)::int AS c FROM ti.projects WHERE status = 'completed'"),
      one(
        "SELECT COUNT(*)::int AS c FROM ti.projects WHERE end_date IS NOT NULL AND end_date <> '' AND end_date < $1 AND status NOT IN ('completed','cancelled')",
        [today]
      ),
      one("SELECT COALESCE(SUM(budget),0) AS s FROM ti.projects WHERE status != 'cancelled'"),
    ]);
    res.json({ total: total.c, active: active.c, pending: pending.c, finishedByTi: finishedByTi.c, completed: completed.c, overdue: overdue.c, budget: budget.s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projects/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.nombre AS responsible_name, cu.nombre AS claimed_by_name
       FROM ti.projects p
       LEFT JOIN public.usuarios u  ON u.id = p.responsible_id
       LEFT JOIN public.usuarios cu ON cu.id = p.claimed_by
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (!(await isPrivilegedViewer(req)) && String(rows[0].responsible_id) !== String(req.user.id)) {
      const { rows: sc } = await pool.query(
        'SELECT 1 FROM ti.scrum_roles WHERE project_id=$1 AND user_id=$2 LIMIT 1', [req.params.id, req.user.id]
      );
      if (!sc.length) return res.status(403).json({ error: 'No tienes acceso a este proyecto — solo el responsable y el equipo Scrum asignado pueden verlo' });
    }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/projects', upload.single('logo_file'), async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'ADG'))) return;
    const { name, client, description, status, budget, currency, start_date, end_date,
            responsible_id, priority, company_name, id_document_type, id_document_number,
            project_type, github_url, website_url, family } = req.body;
    if (!name || !client) return res.status(400).json({ error: 'Nombre y cliente son requeridos' });

    const id = uid();
    const year = new Date().getFullYear();
    const { rows: seqRows } = await pool.query(
      "SELECT COUNT(*)+1 AS n FROM ti.projects WHERE code LIKE $1", [`PROJ-${year}-%`]
    );
    const code = `PROJ-${year}-${String(parseInt(seqRows[0].n)).padStart(3, '0')}`;

    let company_logo = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'qubira/ti/logos', 'image', req.file.originalname);
      company_logo = result.secure_url;
    }

    await pool.query(`
      INSERT INTO ti.projects (id,code,name,client,description,status,progress,budget,currency,start_date,end_date,responsible_id,priority,created_by,company_name,company_logo,id_document_type,id_document_number,project_type,github_url,website_url,family)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [id, code, name, client, description || null, status || 'pending', 0,
       budget || 0, currency || 'USD', start_date || null, end_date || null,
       responsible_id || null, priority || 'medium', req.user.id,
       company_name || null, company_logo, id_document_type || null, id_document_number || null,
       project_type || null, github_url || null, website_url || null, family || null]
    );
    await logActivity(id, req.user.id, 'created', `Proyecto "${name}" creado por ${req.user.nombre || req.user.username}`);
    res.status(201).json({ id, code, name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/projects/:id', upload.single('logo_file'), async (req, res) => {
  try {
    const { name, client, description, status, budget, currency, start_date, end_date,
            responsible_id, priority, company_name, id_document_type, id_document_number,
            project_type, github_url, website_url, family } = req.body;
    const { rows: oldRows } = await pool.query('SELECT * FROM ti.projects WHERE id = $1', [req.params.id]);
    if (!oldRows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    const old = oldRows[0];

    const myArea = await getEmployeeArea(req.user.username);
    const privileged = req.user.nivel_acceso >= 100;

    if (old.status === 'completed' && myArea !== 'ADG' && !privileged) {
      return res.status(403).json({ error: 'Este proyecto ya fue completado y aprobado por ADG — TI ya no puede modificarlo' });
    }

    if (status && status !== old.status) {
      if (status === 'finished_by_ti') {
        if (myArea !== 'TI' && !privileged) return res.status(403).json({ error: 'Solo TI puede marcar un proyecto como finalizado' });
        if (!['active', 'paused'].includes(old.status)) return res.status(400).json({ error: 'Solo se puede finalizar un proyecto activo o pausado' });
      } else if (status === 'completed') {
        if (myArea !== 'ADG' && !privileged) return res.status(403).json({ error: 'Solo ADG puede aprobar y completar un proyecto' });
        if (old.status !== 'finished_by_ti') return res.status(400).json({ error: 'El proyecto todavía no fue marcado como finalizado por TI' });
      }
    }

    let company_logo = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'qubira/ti/logos', 'image', req.file.originalname);
      company_logo = result.secure_url;
    }

    await pool.query(`
      UPDATE ti.projects SET
        name=COALESCE($1,name), client=COALESCE($2,client), description=COALESCE($3,description),
        status=COALESCE($4,status), budget=COALESCE($5,budget),
        currency=COALESCE($6,currency), start_date=COALESCE($7,start_date), end_date=COALESCE($8,end_date),
        responsible_id=COALESCE($9,responsible_id), priority=COALESCE($10,priority),
        company_name=COALESCE($11,company_name), company_logo=COALESCE($12,company_logo),
        id_document_type=COALESCE($13,id_document_type), id_document_number=COALESCE($14,id_document_number),
        project_type=COALESCE($15,project_type), github_url=COALESCE($16,github_url), website_url=COALESCE($17,website_url),
        family=COALESCE($18,family),
        updated_at=NOW()
      WHERE id=$19`,
      [name||null, client||null, description||null, status||null,
       budget??null, currency||null, start_date||null, end_date||null,
       responsible_id||null, priority||null, company_name||null, company_logo,
       id_document_type||null, id_document_number||null,
       project_type||null, github_url||null, website_url||null, family||null, req.params.id]
    );

    const submitted = { name, client, description, status, budget, currency, start_date, end_date,
      responsible_id, priority, company_name, id_document_type, id_document_number,
      project_type, github_url, website_url, family, company_logo };
    const changes = [];
    for (const [field, label] of Object.entries(FIELD_LABEL)) {
      const newVal = submitted[field];
      if (newVal === undefined || newVal === null || newVal === '') continue;
      const oldVal = old[field];
      if (String(oldVal ?? '') === String(newVal)) continue;

      let oldDisplay = oldVal ?? '—';
      let newDisplay = newVal;
      if (field === 'status') {
        oldDisplay = STATUS_LABEL[oldVal] || oldDisplay; newDisplay = STATUS_LABEL[newVal] || newVal;
      } else if (field === 'priority') {
        oldDisplay = PRIORITY_LABEL[oldVal] || oldDisplay; newDisplay = PRIORITY_LABEL[newVal] || newVal;
      } else if (field === 'id_document_type') {
        oldDisplay = DOC_LABEL[oldVal] || oldDisplay; newDisplay = DOC_LABEL[newVal] || newVal;
      } else if (field === 'project_type') {
        oldDisplay = PROJECT_TYPE_LABEL[oldVal] || oldDisplay; newDisplay = PROJECT_TYPE_LABEL[newVal] || newVal;
      } else if (field === 'budget') {
        oldDisplay = oldVal != null ? `$${Number(oldVal).toLocaleString()}` : '—';
        newDisplay = `$${Number(newVal).toLocaleString()}`;
      } else if (field === 'responsible_id') {
        const [oldU, newU] = await Promise.all([
          oldVal ? pool.query('SELECT nombre FROM public.usuarios WHERE id=$1', [oldVal]).then(r => r.rows[0]) : null,
          pool.query('SELECT nombre FROM public.usuarios WHERE id=$1', [newVal]).then(r => r.rows[0]),
        ]);
        oldDisplay = oldU?.nombre || 'Sin asignar'; newDisplay = newU?.nombre || newVal;
      }
      changes.push(`${label}: "${oldDisplay}" → "${newDisplay}"`);
    }
    if (company_logo) changes.push('Logo: nueva imagen');

    if (changes.length > 0) {
      await logActivity(req.params.id, req.user.id, 'updated', `${req.user.nombre || req.user.username} actualizó — ${changes.join(' · ')}`);
    }
    res.json({ message: 'Proyecto actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* TI reclama un proyecto pendiente creado por ADG */
router.post('/projects/:id/claim', async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'TI'))) return;
    const { rows } = await pool.query('SELECT status, name FROM ti.projects WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (rows[0].status !== 'pending') return res.status(400).json({ error: 'Este proyecto ya fue reclamado o no está pendiente' });

    await pool.query(
      `UPDATE ti.projects SET status = 'active', claimed_by = $1, claimed_at = NOW(), responsible_id = $1, updated_at = NOW() WHERE id = $2`,
      [req.user.id, req.params.id]
    );
    await logActivity(req.params.id, req.user.id, 'claimed', `${req.user.nombre || req.user.username} (TI) anexó el proyecto "${rows[0].name}" a su área y quedó como responsable`);
    res.json({ message: 'Proyecto anexado a TI' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'ADG'))) return;
    await pool.query('DELETE FROM ti.projects WHERE id = $1', [req.params.id]);
    res.json({ message: 'Proyecto eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Contratos / proformas
   ============================================================ */
router.get('/contracts', async (req, res) => {
  try {
    const { project_id, type, status } = req.query;
    const params = []; let where = 'WHERE 1=1';
    if (project_id) { params.push(project_id); where += ` AND c.project_id=$${params.length}`; }
    if (type)       { params.push(type);       where += ` AND c.type=$${params.length}`; }
    if (status)     { params.push(status);     where += ` AND c.status=$${params.length}`; }
    const { rows } = await pool.query(`
      SELECT c.*, p.name AS project_name, p.code AS project_code, u.nombre AS created_by_name
      FROM ti.contracts c
      LEFT JOIN ti.projects p ON p.id = c.project_id
      LEFT JOIN public.usuarios u ON u.id = c.created_by
      ${where} ORDER BY c.created_at DESC`, params);

    /* TI ve toda la información del contrato/proforma menos el archivo en
       sí — eso queda exclusivo de ADG. */
    const myArea = await getEmployeeArea(req.user.username);
    if (myArea !== 'ADG' && req.user.nivel_acceso < 100) {
      rows.forEach(r => { r.file_path = null; });
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/contracts', upload.single('file'), async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'ADG'))) return;
    const { project_id, type, title, amount, currency, status, notes, signed_date } = req.body;
    if (!title) return res.status(400).json({ error: 'Título requerido' });

    let file_path = null, file_name = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'qubira/ti/contracts', 'raw', req.file.originalname);
      file_path = result.secure_url;
      file_name = req.file.originalname;
    }

    const id = uid();
    await pool.query(`
      INSERT INTO ti.contracts (id,project_id,type,title,amount,currency,status,file_path,file_name,notes,signed_date,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, project_id||null, type||'contract', title, amount||0, currency||'USD',
       status||'draft', file_path, file_name, notes||null, signed_date||null, req.user.id]
    );
    await logActivity(project_id, req.user.id, 'contract_uploaded',
      `Contrato/Proforma "${title}" agregado por ${req.user.nombre || req.user.username}`);
    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/contracts/:id', upload.single('file'), async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'ADG'))) return;
    const { title, amount, currency, status, notes, signed_date } = req.body;
    const sets = []; const params = [];
    const add = (col, val) => { if (val !== undefined && val !== null) { params.push(val); sets.push(`${col}=$${params.length}`); } };
    add('title', title); add('amount', amount); add('currency', currency);
    add('status', status); add('notes', notes); add('signed_date', signed_date);
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'qubira/ti/contracts', 'raw', req.file.originalname);
      params.push(result.secure_url); sets.push(`file_path=$${params.length}`);
      params.push(req.file.originalname); sets.push(`file_name=$${params.length}`);
    }
    if (sets.length) {
      params.push(req.params.id);
      await pool.query(`UPDATE ti.contracts SET ${sets.join(',')} WHERE id=$${params.length}`, params);
    }
    res.json({ message: 'Actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/contracts/:id', async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'ADG'))) return;
    await pool.query('DELETE FROM ti.contracts WHERE id=$1', [req.params.id]);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Documentos
   ============================================================ */
router.get('/documents', async (req, res) => {
  try {
    const { project_id, category, search } = req.query;
    if (project_id && !(await canAccessProject(req, project_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
    const params = []; let where = 'WHERE 1=1';
    if (project_id) { params.push(project_id); where += ` AND d.project_id=$${params.length}`; }
    else if (!(await isPrivilegedViewer(req))) {
      const ids = await getAccessibleProjectIds(req.user.id);
      if (!ids.length) return res.json([]);
      params.push(ids); where += ` AND d.project_id = ANY($${params.length})`;
    }
    if (category)   { params.push(category);   where += ` AND d.category=$${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      where += ` AND (d.title ILIKE $${n} OR d.description ILIKE $${n} OR d.tags ILIKE $${n})`;
    }
    const { rows } = await pool.query(`
      SELECT d.*, p.name AS project_name, u.nombre AS created_by_name
      FROM ti.documents d
      LEFT JOIN ti.projects p ON p.id = d.project_id
      LEFT JOIN public.usuarios u ON u.id = d.created_by
      ${where} ORDER BY d.created_at DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/documents', upload.single('file'), async (req, res) => {
  try {
    const { project_id, category, title, description, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'Título requerido' });
    if (!(await isPrivilegedViewer(req))) {
      if (!project_id) return res.status(403).json({ error: 'Selecciona un proyecto' });
      if (!(await isProjectResponsible(req, project_id))) {
        return res.status(403).json({ error: 'Solo el responsable del proyecto puede subir documentos' });
      }
    }

    let file_path = null, file_name = null, file_size = null, mime_type = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'qubira/ti/documents', 'raw', req.file.originalname);
      file_path = result.secure_url;
      file_name = req.file.originalname;
      file_size = req.file.size;
      mime_type = req.file.mimetype;
    }

    const id = uid();
    await pool.query(`
      INSERT INTO ti.documents (id,project_id,category,title,description,file_path,file_name,file_size,mime_type,tags,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, project_id||null, category||'general', title, description||null,
       file_path, file_name, file_size, mime_type, tags||null, req.user.id]
    );
    await logActivity(project_id, req.user.id, 'document_uploaded',
      `Documento "${title}" subido por ${req.user.nombre || req.user.username}`);
    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT project_id FROM ti.documents WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    if (!(await isPrivilegedViewer(req)) && !(await isProjectResponsible(req, rows[0].project_id))) {
      return res.status(403).json({ error: 'Solo el responsable del proyecto puede eliminar documentos' });
    }
    await pool.query('DELETE FROM ti.documents WHERE id=$1', [req.params.id]);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   WhatsApp
   ============================================================ */
router.get('/whatsapp', async (req, res) => {
  try {
    const { project_id, contact_name, starred } = req.query;
    if (project_id && !(await canAccessProject(req, project_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
    const params = []; let where = 'WHERE 1=1';
    if (project_id)   { params.push(project_id);         where += ` AND w.project_id=$${params.length}`; }
    else if (!(await isPrivilegedViewer(req))) {
      const ids = await getAccessibleProjectIds(req.user.id);
      if (!ids.length) return res.json([]);
      params.push(ids); where += ` AND w.project_id = ANY($${params.length})`;
    }
    if (contact_name) { params.push(`%${contact_name}%`); where += ` AND w.contact_name ILIKE $${params.length}`; }
    if (starred)      { where += ' AND w.starred=1'; }
    const { rows } = await pool.query(`
      SELECT w.*, p.name AS project_name, p.code AS project_code, u.nombre AS created_by_name
      FROM ti.whatsapp_messages w
      LEFT JOIN ti.projects p ON p.id = w.project_id
      LEFT JOIN public.usuarios u ON u.id = w.created_by
      ${where} ORDER BY w.msg_date DESC, w.created_at DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/whatsapp/contacts', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT contact_name, phone, COUNT(*)::int AS message_count, MAX(msg_date) AS last_message
      FROM ti.whatsapp_messages
      GROUP BY contact_name, phone
      ORDER BY last_message DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/whatsapp', async (req, res) => {
  try {
    const { project_id, contact_name, phone, direction, content, msg_date } = req.body;
    if (!contact_name || !content) return res.status(400).json({ error: 'Contacto y contenido requeridos' });
    const id = uid();
    await pool.query(`
      INSERT INTO ti.whatsapp_messages (id,project_id,contact_name,phone,direction,content,msg_date,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, project_id||null, contact_name, phone||null, direction||'received',
       content, msg_date||new Date().toISOString(), req.user.id]
    );
    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/whatsapp/bulk', async (req, res) => {
  try {
    const { project_id, messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: 'Se requiere un array de mensajes' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const m of messages) {
        await client.query(`
          INSERT INTO ti.whatsapp_messages (id,project_id,contact_name,phone,direction,content,msg_date,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [uid(), project_id||null, m.contact_name, m.phone||null,
           m.direction||'received', m.content, m.msg_date||new Date().toISOString(), req.user.id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.status(201).json({ inserted: messages.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/whatsapp/:id/star', async (req, res) => {
  try {
    await pool.query('UPDATE ti.whatsapp_messages SET starred = CASE WHEN starred=1 THEN 0 ELSE 1 END WHERE id=$1', [req.params.id]);
    res.json({ message: 'Actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/whatsapp/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ti.whatsapp_messages WHERE id=$1', [req.params.id]);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Emails
   ============================================================ */
router.get('/emails', async (req, res) => {
  try {
    const { project_id, direction, starred, search } = req.query;
    if (project_id && !(await canAccessProject(req, project_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
    const params = []; let where = 'WHERE 1=1';
    if (project_id) { params.push(project_id);   where += ` AND e.project_id=$${params.length}`; }
    else if (!(await isPrivilegedViewer(req))) {
      const ids = await getAccessibleProjectIds(req.user.id);
      if (!ids.length) return res.json([]);
      params.push(ids); where += ` AND e.project_id = ANY($${params.length})`;
    }
    if (direction)  { params.push(direction);     where += ` AND e.direction=$${params.length}`; }
    if (starred)    { where += ' AND e.starred=1'; }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      where += ` AND (e.subject ILIKE $${n} OR e.from_email ILIKE $${n} OR e.body ILIKE $${n})`;
    }
    const { rows } = await pool.query(`
      SELECT e.*, p.name AS project_name, p.code AS project_code, u.nombre AS created_by_name
      FROM ti.emails e
      LEFT JOIN ti.projects p ON p.id = e.project_id
      LEFT JOIN public.usuarios u ON u.id = e.created_by
      ${where} ORDER BY e.email_date DESC, e.created_at DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/emails', async (req, res) => {
  try {
    const { project_id, subject, from_name, from_email, to_email, body, direction, email_date, attachments } = req.body;
    if (!subject) return res.status(400).json({ error: 'Asunto requerido' });
    const id = uid();
    await pool.query(`
      INSERT INTO ti.emails (id,project_id,subject,from_name,from_email,to_email,body,direction,email_date,attachments,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, project_id||null, subject, from_name||null, from_email||null, to_email||null,
       body||null, direction||'received', email_date||new Date().toISOString(),
       attachments ? JSON.stringify(attachments) : null, req.user.id]
    );
    await logActivity(project_id, req.user.id, 'email_added',
      `Email "${subject}" registrado por ${req.user.nombre || req.user.username}`);
    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/emails/:id/star', async (req, res) => {
  try {
    await pool.query('UPDATE ti.emails SET starred = CASE WHEN starred=1 THEN 0 ELSE 1 END WHERE id=$1', [req.params.id]);
    res.json({ message: 'Actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/emails/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ti.emails WHERE id=$1', [req.params.id]);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Actividad (historial)
   ============================================================ */
router.get('/activities', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (project_id && !(await canAccessProject(req, project_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const params = []; let where = 'WHERE 1=1';
    if (project_id) { params.push(project_id); where += ` AND a.project_id=$${params.length}`; }
    else if (!(await isPrivilegedViewer(req))) {
      const ids = await getAccessibleProjectIds(req.user.id);
      if (!ids.length) return res.json([]);
      params.push(ids); where += ` AND a.project_id = ANY($${params.length})`;
    }
    params.push(limit);
    const { rows } = await pool.query(`
      SELECT a.*, u.nombre AS user_name, p.name AS project_name, p.code AS project_code
      FROM ti.activities a
      LEFT JOIN public.usuarios u ON u.id = a.user_id
      LEFT JOIN ti.projects p ON p.id = a.project_id
      ${where} ORDER BY a.created_at DESC LIMIT $${params.length}`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Requerimientos
   ============================================================ */
const REQ_TYPE_LABEL = { functional: 'Funcional', non_functional: 'No Funcional' };

/* El avance del proyecto ya no se escribe a mano — se calcula como el
   promedio del avance de todos sus requisitos (funcionales y no
   funcionales juntos), y se recalcula cada vez que uno cambia. */
async function recalcProjectProgress(projectId) {
  const { rows } = await pool.query(
    'SELECT COALESCE(ROUND(AVG(progress)),0)::int AS avg FROM ti.requirements WHERE project_id=$1', [projectId]
  );
  await pool.query('UPDATE ti.projects SET progress=$1, updated_at=NOW() WHERE id=$2', [rows[0].avg, projectId]);
}

router.get('/requirements', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (project_id && !(await canAccessProject(req, project_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
    const params = []; let where = 'WHERE 1=1';
    if (project_id) { params.push(project_id); where += ` AND project_id=$${params.length}`; }
    else if (!(await isPrivilegedViewer(req))) {
      const ids = await getAccessibleProjectIds(req.user.id);
      if (!ids.length) return res.json([]);
      params.push(ids); where += ` AND project_id = ANY($${params.length})`;
    }
    const { rows } = await pool.query(`SELECT * FROM ti.requirements ${where} ORDER BY created_at ASC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/requirements', async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'ADG'))) return;
    const { project_id, type, description } = req.body;
    if (!project_id || !description) return res.status(400).json({ error: 'Proyecto y descripción son requeridos' });
    const id = uid();
    const finalType = type === 'non_functional' ? 'non_functional' : 'functional';
    await pool.query(
      'INSERT INTO ti.requirements (id,project_id,type,description,progress) VALUES ($1,$2,$3,$4,$5)',
      [id, project_id, finalType, description, 0]
    );
    await logActivity(project_id, req.user.id, 'requirement_change',
      `${req.user.nombre || req.user.username} agregó el requerimiento ${REQ_TYPE_LABEL[finalType]} "${description}"`);
    await recalcProjectProgress(project_id);
    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/requirements/:id', async (req, res) => {
  try {
    const { description, type, progress } = req.body;
    const { rows: oldRows } = await pool.query('SELECT * FROM ti.requirements WHERE id=$1', [req.params.id]);
    if (!oldRows.length) return res.status(404).json({ error: 'Requerimiento no encontrado' });
    const old = oldRows[0];

    if (description !== undefined || type !== undefined) {
      if (!(await requireArea(req, res, 'ADG'))) return;
    }
    if (progress !== undefined && !(await isProjectResponsible(req, old.project_id))) {
      return res.status(403).json({ error: 'Solo el responsable del proyecto puede actualizar el avance' });
    }

    const sets = []; const params = [];
    const add = (col, val) => { if (val !== undefined) { params.push(val); sets.push(`${col}=$${params.length}`); } };
    add('description', description);
    add('type', type);
    const clampedProgress = progress !== undefined ? Math.max(0, Math.min(100, parseInt(progress) || 0)) : undefined;
    if (clampedProgress !== undefined) add('progress', clampedProgress);
    if (sets.length) {
      params.push(req.params.id);
      await pool.query(`UPDATE ti.requirements SET ${sets.join(',')} WHERE id=$${params.length}`, params);
    }

    const label = old.type === 'non_functional' ? 'No Funcional' : 'Funcional';
    const who = req.user.nombre || req.user.username;
    if (clampedProgress !== undefined && clampedProgress !== old.progress) {
      await logActivity(old.project_id, req.user.id, 'requirement_change',
        `${who} actualizó el avance de "${old.description}" (${label}) de ${old.progress||0}% a ${clampedProgress}%`);
    }
    if (description !== undefined && description !== old.description) {
      await logActivity(old.project_id, req.user.id, 'requirement_change',
        `${who} cambió la descripción del requerimiento "${old.description}" a "${description}"`);
    }
    if (clampedProgress !== undefined && clampedProgress !== old.progress) {
      await recalcProjectProgress(old.project_id);
    }
    res.json({ message: 'Actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/requirements/:id', async (req, res) => {
  try {
    if (!(await requireArea(req, res, 'ADG'))) return;
    const { rows: oldRows } = await pool.query('SELECT * FROM ti.requirements WHERE id=$1', [req.params.id]);
    if (!oldRows.length) return res.status(404).json({ error: 'Requerimiento no encontrado' });
    const old = oldRows[0];
    await pool.query('DELETE FROM ti.requirements WHERE id=$1', [req.params.id]);
    const label = old.type === 'non_functional' ? 'No Funcional' : 'Funcional';
    await logActivity(old.project_id, req.user.id, 'requirement_change',
      `${req.user.nombre || req.user.username} eliminó el requerimiento ${label} "${old.description}"`);
    await recalcProjectProgress(old.project_id);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Roles Scrum — quién representa cada rol (Product Owner, Scrum
   Master, Equipo de Desarrollo) en el proyecto. Un mismo trabajador
   puede repetirse en más de un rol, y un rol puede tener más de un
   trabajador (ej: varios devs).
   ============================================================ */
const SCRUM_ROLE_LABEL = { product_owner: 'Product Owner', scrum_master: 'Scrum Master', developer: 'Equipo de Desarrollo' };

router.get('/scrum-roles', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (project_id && !(await canAccessProject(req, project_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
    const params = []; let where = 'WHERE 1=1';
    if (project_id) { params.push(project_id); where += ` AND s.project_id=$${params.length}`; }
    else if (!(await isPrivilegedViewer(req))) {
      const ids = await getAccessibleProjectIds(req.user.id);
      if (!ids.length) return res.json([]);
      params.push(ids); where += ` AND s.project_id = ANY($${params.length})`;
    }
    const { rows } = await pool.query(`
      SELECT s.*, u.nombre AS user_name
      FROM ti.scrum_roles s
      LEFT JOIN public.usuarios u ON u.id = s.user_id
      ${where} ORDER BY s.created_at ASC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/scrum-roles', async (req, res) => {
  try {
    const { project_id, role, user_id } = req.body;
    if (!project_id || !role || !user_id) return res.status(400).json({ error: 'Proyecto, rol y trabajador son requeridos' });
    if (!(await isProjectResponsible(req, project_id))) {
      return res.status(403).json({ error: 'Solo el responsable del proyecto puede armar el equipo Scrum' });
    }
    if (!SCRUM_ROLE_LABEL[role]) return res.status(400).json({ error: 'Rol inválido' });
    const { rows: userRows } = await pool.query('SELECT nombre FROM public.usuarios WHERE id=$1', [user_id]);
    if (!userRows.length) return res.status(400).json({ error: 'Trabajador no encontrado' });
    const id = uid();
    await pool.query('INSERT INTO ti.scrum_roles (id,project_id,role,user_id) VALUES ($1,$2,$3,$4)', [id, project_id, role, user_id]);
    await logActivity(project_id, req.user.id, 'scrum_role_change',
      `${req.user.nombre || req.user.username} inscribió a ${userRows[0].nombre} como ${SCRUM_ROLE_LABEL[role]}`);
    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/scrum-roles/:id', async (req, res) => {
  try {
    const { rows: oldRows } = await pool.query(`
      SELECT s.*, u.nombre AS user_name FROM ti.scrum_roles s
      LEFT JOIN public.usuarios u ON u.id = s.user_id WHERE s.id=$1`, [req.params.id]);
    if (!oldRows.length) return res.status(404).json({ error: 'No encontrado' });
    const old = oldRows[0];
    if (!(await isProjectResponsible(req, old.project_id))) {
      return res.status(403).json({ error: 'Solo el responsable del proyecto puede modificar el equipo Scrum' });
    }
    await pool.query('DELETE FROM ti.scrum_roles WHERE id=$1', [req.params.id]);
    await logActivity(old.project_id, req.user.id, 'scrum_role_change',
      `${req.user.nombre || req.user.username} quitó a ${old.user_name} de ${SCRUM_ROLE_LABEL[old.role] || old.role}`);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============================================================
   Tecnologías del proyecto — lenguajes y herramientas usados.
   Tanto TI como ADG pueden agregarlas, editarlas y borrarlas;
   solo se exige tener acceso de visualización al proyecto.
   ============================================================ */
router.get('/technologies', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (project_id && !(await canAccessProject(req, project_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
    const params = []; let where = 'WHERE 1=1';
    if (project_id) { params.push(project_id); where += ` AND project_id=$${params.length}`; }
    else if (!(await isPrivilegedViewer(req))) {
      const ids = await getAccessibleProjectIds(req.user.id);
      if (!ids.length) return res.json([]);
      params.push(ids); where += ` AND project_id = ANY($${params.length})`;
    }
    const { rows } = await pool.query(`SELECT * FROM ti.project_technologies ${where} ORDER BY created_at ASC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/technologies', async (req, res) => {
  try {
    const { project_id, category, name } = req.body;
    if (!project_id || !category || !name) return res.status(400).json({ error: 'Proyecto, categoría y nombre son requeridos' });
    if (!(await canAccessProject(req, project_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
    const finalCategory = category === 'tool' ? 'tool' : 'language';
    const id = uid();
    await pool.query(
      'INSERT INTO ti.project_technologies (id,project_id,category,name) VALUES ($1,$2,$3,$4)',
      [id, project_id, finalCategory, name]
    );
    await logActivity(project_id, req.user.id, 'technology_change',
      `${req.user.nombre || req.user.username} agregó ${finalCategory === 'tool' ? 'la herramienta' : 'el lenguaje'} "${name}"`);
    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/technologies/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows: oldRows } = await pool.query('SELECT * FROM ti.project_technologies WHERE id=$1', [req.params.id]);
    if (!oldRows.length) return res.status(404).json({ error: 'No encontrado' });
    const old = oldRows[0];
    if (!(await canAccessProject(req, old.project_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
    await pool.query('UPDATE ti.project_technologies SET name=$1 WHERE id=$2', [name, req.params.id]);
    await logActivity(old.project_id, req.user.id, 'technology_change',
      `${req.user.nombre || req.user.username} cambió "${old.name}" a "${name}"`);
    res.json({ message: 'Actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/technologies/:id', async (req, res) => {
  try {
    const { rows: oldRows } = await pool.query('SELECT * FROM ti.project_technologies WHERE id=$1', [req.params.id]);
    if (!oldRows.length) return res.status(404).json({ error: 'No encontrado' });
    const old = oldRows[0];
    if (!(await canAccessProject(req, old.project_id))) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }
    await pool.query('DELETE FROM ti.project_technologies WHERE id=$1', [req.params.id]);
    await logActivity(old.project_id, req.user.id, 'technology_change',
      `${req.user.nombre || req.user.username} quitó ${old.category === 'tool' ? 'la herramienta' : 'el lenguaje'} "${old.name}"`);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
