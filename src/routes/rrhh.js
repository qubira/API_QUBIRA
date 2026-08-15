'use strict';

const express    = require('express');
const crypto     = require('crypto');
const multer     = require('multer');
const bcrypt     = require('bcryptjs');
const { pool }   = require('../db');
const cloudinary = require('../config/cloudinary');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth); /* toda el area de RRHH exige sesion valida */

function uid() { return crypto.randomUUID(); }

/* ============================================================
   Subida de foto de perfil — Cloudinary (misma cuenta que usa
   QUBIRA para los videos, carpeta separada para no mezclarlos)
   ============================================================ */
const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('El archivo debe ser una imagen'));
    }
    cb(null, true);
  },
});

function subirFotoACloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder: 'qubira/rrhh/empleados',
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

router.post('/empleados/foto', (req, res) => {
  uploadFoto.single('foto')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || 'Error al procesar la imagen' });
    }
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'Debes adjuntar una imagen' });
      }
      const result = await subirFotoACloudinary(req.file.buffer);
      return res.json({ ok: true, data: { url: result.secure_url } });
    } catch (cloudErr) {
      console.error('[RRHH] Error subiendo foto a Cloudinary:', cloudErr.message);
      return res.status(502).json({ ok: false, error: 'No se pudo subir la imagen a Cloudinary' });
    }
  });
});

/* ============================================================
   Esquema — se crea solo si no existe (misma base Neon que QUBIRA,
   pero aislado en su propio schema "rrhh" para no chocar con nada)
   ============================================================ */
let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = pool.query(`
      CREATE SCHEMA IF NOT EXISTS rrhh;

      CREATE TABLE IF NOT EXISTS rrhh.catalogos (
        id TEXT PRIMARY KEY, catalogo TEXT NOT NULL, nombre TEXT NOT NULL, parent_id TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.departamentos (
        id TEXT PRIMARY KEY, nombre TEXT NOT NULL, descripcion TEXT, encargado_id TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.empleados (
        id TEXT PRIMARY KEY,
        primer_nombre TEXT, segundo_nombre TEXT, primer_apellido TEXT, segundo_apellido TEXT,
        nombre TEXT, apellido TEXT,
        tipo_documento_id TEXT, numero_documento TEXT, nacionalidad_id TEXT, estado_civil_id TEXT,
        email_local TEXT, email_dominio_id TEXT, email TEXT,
        telefono TEXT, hijos TEXT,
        departamento_geo_id TEXT, provincia_id TEXT, distrito_id TEXT,
        direccion TEXT, coordenadas TEXT, codigo_postal TEXT,
        cuenta_antecedentes TEXT, tipo_antecedente_id TEXT,
        area_trabajo_id TEXT, cargo_id TEXT, jefe_inmediato_id TEXT REFERENCES rrhh.empleados(id) ON DELETE SET NULL,
        usuario TEXT, contrasena TEXT, foto TEXT,
        contacto_referencia_nombre TEXT, contacto_referencia_tel1 TEXT, contacto_referencia_tel2 TEXT,
        fecha_nacimiento TEXT, cargo TEXT,
        department_id TEXT REFERENCES rrhh.departamentos(id) ON DELETE SET NULL,
        fecha_ingreso TEXT, estado TEXT DEFAULT 'activo', observaciones_baja TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rrhh.contratos (
        id TEXT PRIMARY KEY, employee_id TEXT REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
        tipo TEXT, fecha_inicio TEXT, fecha_fin TEXT, salario NUMERIC,
        jornada TEXT, finalizado_manual BOOLEAN DEFAULT FALSE, observaciones TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.documentos (
        id TEXT PRIMARY KEY, employee_id TEXT REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
        categoria TEXT, nombre_archivo TEXT, tamano BIGINT, fecha_subida TEXT, notas TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.vacantes (
        id TEXT PRIMARY KEY, titulo TEXT, department_id TEXT REFERENCES rrhh.departamentos(id) ON DELETE SET NULL,
        modalidad TEXT, tipo_contrato TEXT, vacantes INTEGER, descripcion TEXT, requisitos TEXT,
        fecha_publicacion TEXT, estado TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.candidatos (
        id TEXT PRIMARY KEY, job_posting_id TEXT REFERENCES rrhh.vacantes(id) ON DELETE CASCADE,
        nombre TEXT, apellido TEXT, email TEXT, telefono TEXT, etapa TEXT,
        fecha_postulacion TEXT, calificacion INTEGER, notas TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.nomina (
        id TEXT PRIMARY KEY, employee_id TEXT REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
        periodo TEXT, salario_base NUMERIC, bonos NUMERIC, descuentos NUMERIC,
        estado TEXT, fecha_pago TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.vacaciones (
        id TEXT PRIMARY KEY, employee_id TEXT REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
        tipo TEXT, fecha_inicio TEXT, fecha_fin TEXT, estado TEXT, notas TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.capacitaciones (
        id TEXT PRIMARY KEY, nombre TEXT, categoria TEXT, modalidad TEXT, instructor TEXT,
        fecha_inicio TEXT, fecha_fin TEXT, cupo INTEGER, estado TEXT, descripcion TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.inscripciones (
        id TEXT PRIMARY KEY, training_id TEXT REFERENCES rrhh.capacitaciones(id) ON DELETE CASCADE,
        employee_id TEXT REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
        estado TEXT, calificacion NUMERIC, fecha_inscripcion TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.evaluaciones (
        id TEXT PRIMARY KEY, employee_id TEXT REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
        periodo TEXT, evaluador TEXT, fecha TEXT,
        puntualidad INTEGER, calidad INTEGER, trabajo_equipo INTEGER, liderazgo INTEGER,
        comentarios TEXT, recomendacion TEXT, estado TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.encuestas_clima (
        id TEXT PRIMARY KEY, titulo TEXT, fecha TEXT, descripcion TEXT, estado TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.respuestas_clima (
        id TEXT PRIMARY KEY, survey_id TEXT REFERENCES rrhh.encuestas_clima(id) ON DELETE CASCADE,
        anonimo BOOLEAN, employee_id TEXT REFERENCES rrhh.empleados(id) ON DELETE SET NULL,
        puntaje INTEGER, comentario TEXT, fecha TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.casos_conflicto (
        id TEXT PRIMARY KEY, fecha TEXT, tipo TEXT, involucrados TEXT, descripcion TEXT,
        mediador TEXT, estado TEXT, resolucion TEXT
      );

      CREATE TABLE IF NOT EXISTS rrhh.auditoria_empleados (
        id TEXT PRIMARY KEY, employee_id TEXT REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
        campo TEXT, valor_anterior TEXT, valor_nuevo TEXT, usuario TEXT, ip TEXT, fecha TEXT
      );
    `).catch(err => { ready = null; throw err; });
  }
  return ready;
}
router.use((req, res, next) => {
  ensureSchema().then(() => next()).catch(err => {
    console.error('[RRHH] Error creando schema:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  });
});

/* Semilla de catalogos base la primera vez que se usan (idioma, ubicaciones, etc.) */
const CATALOG_SEED = {
  tiposDocumento: ['DNI', 'Carné de Extranjería', 'Pasaporte'],
  nacionalidades: ['Peruano(a)', 'Argentino(a)', 'Chileno(a)', 'Colombiano(a)', 'Venezolano(a)'],
  estadosCiviles: ['Soltero(a)', 'Casado(a)', 'Divorciado(a)', 'Conviviente'],
  dominiosEmail: ['gmail.com', 'hotmail.com', 'outlook.com', 'qubira.com'],
  tiposAntecedente: ['Robo', 'Hurto', 'Estafa', 'Homicidio', 'Otro'],
  areasTrabajo: ['ADG', 'GG', 'TI', 'RRHH'],
  cargos: ['Practicante', 'Soporte', 'Analista', 'Supervisor', 'Coordinador', 'Gerente'],
};

/* Ubicación (Perú) — jerárquico: departamento -> provincia -> distrito */
const GEO_SEED = {
  departamentosGeo: ['Lima', 'Arequipa', 'Cusco', 'La Libertad', 'Piura'],
  provincias: {
    Lima: ['Lima', 'Callao', 'Huaral'],
    Arequipa: ['Arequipa'],
    Cusco: ['Cusco'],
    'La Libertad': ['Trujillo'],
    Piura: ['Piura'],
  },
  distritos: {
    Lima: ['Miraflores', 'San Isidro', 'Santiago de Surco', 'Cercado de Lima'],
  },
};

async function seedCatalogsIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM rrhh.catalogos');
  if (rows[0].n > 0) return;

  const values = [];
  const params = [];
  let i = 1;
  const push = (catalogo, nombre, parentId) => {
    values.push(`($${i++}, $${i++}, $${i++}, $${i++})`);
    const id = uid();
    params.push(id, catalogo, nombre, parentId || null);
    return id;
  };

  for (const [catalogo, nombres] of Object.entries(CATALOG_SEED)) {
    for (const nombre of nombres) push(catalogo, nombre, null);
  }

  /* Geo jerárquico: guardamos el id de cada departamento/provincia para encadenar */
  const depGeoIds = {};
  for (const nombre of GEO_SEED.departamentosGeo) {
    depGeoIds[nombre] = push('departamentosGeo', nombre, null);
  }
  const provIds = {};
  for (const [depNombre, provincias] of Object.entries(GEO_SEED.provincias)) {
    for (const provNombre of provincias) {
      provIds[`${depNombre}/${provNombre}`] = push('provincias', provNombre, depGeoIds[depNombre]);
    }
  }
  for (const [depNombre, distritos] of Object.entries(GEO_SEED.distritos)) {
    /* En la data original los distritos cuelgan de la provincia homónima a la capital del depto */
    const provId = provIds[`${depNombre}/${depNombre}`];
    for (const distNombre of distritos) push('distritos', distNombre, provId);
  }

  await pool.query(`INSERT INTO rrhh.catalogos (id, catalogo, nombre, parent_id) VALUES ${values.join(',')}`, params);
}

/* ============================================================
   Mapeo camelCase (frontend) <-> snake_case (Postgres)
   ============================================================ */
const MAPS = {
  departamentos: { table: 'rrhh.departamentos', cols: {
    id:'id', nombre:'nombre', descripcion:'descripcion', encargadoId:'encargado_id',
  }},
  empleados: { table: 'rrhh.empleados', cols: {
    id:'id', primerNombre:'primer_nombre', segundoNombre:'segundo_nombre',
    primerApellido:'primer_apellido', segundoApellido:'segundo_apellido',
    nombre:'nombre', apellido:'apellido',
    tipoDocumentoId:'tipo_documento_id', numeroDocumento:'numero_documento',
    nacionalidadId:'nacionalidad_id', estadoCivilId:'estado_civil_id',
    emailLocal:'email_local', emailDominioId:'email_dominio_id', email:'email',
    telefono:'telefono', hijos:'hijos',
    departamentoGeoId:'departamento_geo_id', provinciaId:'provincia_id', distritoId:'distrito_id',
    direccion:'direccion', coordenadas:'coordenadas', codigoPostal:'codigo_postal',
    cuentaAntecedentes:'cuenta_antecedentes', tipoAntecedenteId:'tipo_antecedente_id',
    areaTrabajoId:'area_trabajo_id', cargoId:'cargo_id', jefeInmediatoId:'jefe_inmediato_id',
    usuario:'usuario', contrasena:'contrasena', foto:'foto',
    contactoReferenciaNombre:'contacto_referencia_nombre',
    contactoReferenciaTel1:'contacto_referencia_tel1', contactoReferenciaTel2:'contacto_referencia_tel2',
    fechaNacimiento:'fecha_nacimiento', cargo:'cargo', departmentId:'department_id',
    fechaIngreso:'fecha_ingreso', estado:'estado', observacionesBaja:'observaciones_baja',
  }},
  contratos: { table: 'rrhh.contratos', cols: {
    id:'id', employeeId:'employee_id', tipo:'tipo', fechaInicio:'fecha_inicio', fechaFin:'fecha_fin',
    salario:'salario', jornada:'jornada', finalizadoManual:'finalizado_manual', observaciones:'observaciones',
  }},
  documentos: { table: 'rrhh.documentos', cols: {
    id:'id', employeeId:'employee_id', categoria:'categoria', nombreArchivo:'nombre_archivo',
    tamano:'tamano', fechaSubida:'fecha_subida', notas:'notas',
  }},
  vacantes: { table: 'rrhh.vacantes', cols: {
    id:'id', titulo:'titulo', departmentId:'department_id', modalidad:'modalidad',
    tipoContrato:'tipo_contrato', vacantes:'vacantes', descripcion:'descripcion',
    requisitos:'requisitos', fechaPublicacion:'fecha_publicacion', estado:'estado',
  }},
  candidatos: { table: 'rrhh.candidatos', cols: {
    id:'id', jobPostingId:'job_posting_id', nombre:'nombre', apellido:'apellido', email:'email',
    telefono:'telefono', etapa:'etapa', fechaPostulacion:'fecha_postulacion',
    calificacion:'calificacion', notas:'notas',
  }},
  nomina: { table: 'rrhh.nomina', cols: {
    id:'id', employeeId:'employee_id', periodo:'periodo', salarioBase:'salario_base',
    bonos:'bonos', descuentos:'descuentos', estado:'estado', fechaPago:'fecha_pago',
  }},
  vacaciones: { table: 'rrhh.vacaciones', cols: {
    id:'id', employeeId:'employee_id', tipo:'tipo', fechaInicio:'fecha_inicio',
    fechaFin:'fecha_fin', estado:'estado', notas:'notas',
  }},
  capacitaciones: { table: 'rrhh.capacitaciones', cols: {
    id:'id', nombre:'nombre', categoria:'categoria', modalidad:'modalidad', instructor:'instructor',
    fechaInicio:'fecha_inicio', fechaFin:'fecha_fin', cupo:'cupo', estado:'estado', descripcion:'descripcion',
  }},
  inscripciones: { table: 'rrhh.inscripciones', cols: {
    id:'id', trainingId:'training_id', employeeId:'employee_id', estado:'estado',
    calificacion:'calificacion', fechaInscripcion:'fecha_inscripcion',
  }},
  evaluaciones: { table: 'rrhh.evaluaciones', cols: {
    id:'id', employeeId:'employee_id', periodo:'periodo', evaluador:'evaluador', fecha:'fecha',
    puntualidad:'puntualidad', calidad:'calidad', trabajoEquipo:'trabajo_equipo', liderazgo:'liderazgo',
    comentarios:'comentarios', recomendacion:'recomendacion', estado:'estado',
  }},
  encuestasClima: { table: 'rrhh.encuestas_clima', cols: {
    id:'id', titulo:'titulo', fecha:'fecha', descripcion:'descripcion', estado:'estado',
  }},
  respuestasClima: { table: 'rrhh.respuestas_clima', cols: {
    id:'id', surveyId:'survey_id', anonimo:'anonimo', employeeId:'employee_id',
    puntaje:'puntaje', comentario:'comentario', fecha:'fecha',
  }},
  casosConflicto: { table: 'rrhh.casos_conflicto', cols: {
    id:'id', fecha:'fecha', tipo:'tipo', involucrados:'involucrados', descripcion:'descripcion',
    mediador:'mediador', estado:'estado', resolucion:'resolucion',
  }},
};

function toRow(mapKey, obj) {
  const { cols } = MAPS[mapKey];
  const row = {};
  for (const [camel, snake] of Object.entries(cols)) {
    if (obj[camel] === undefined) continue;
    let value = obj[camel];
    /* Campos "...Id" vacíos ("") deben guardarse como NULL, no como texto vacío —
       si no, violan las foreign keys (ej. jefeInmediatoId sin seleccionar). */
    if (value === '' && /Id$/.test(camel)) value = null;
    row[snake] = value;
  }
  return row;
}
function toCamel(mapKey, row) {
  const { cols } = MAPS[mapKey];
  const obj = {};
  for (const [camel, snake] of Object.entries(cols)) {
    obj[camel] = row[snake] !== undefined ? row[snake] : null;
  }
  return obj;
}

async function insertRow(mapKey, data) {
  const { table } = MAPS[mapKey];
  const row = toRow(mapKey, data);
  row.id = uid();
  const keys = Object.keys(row);
  const params = keys.map(k => row[k]);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  const { rows } = await pool.query(
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
    params
  );
  return toCamel(mapKey, rows[0]);
}

async function updateRow(mapKey, id, changes) {
  const { table } = MAPS[mapKey];
  const row = toRow(mapKey, changes);
  delete row.id;
  const keys = Object.keys(row);
  if (!keys.length) {
    const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id=$1`, [id]);
    return rows[0] ? toCamel(mapKey, rows[0]) : null;
  }
  const setClause = keys.map((k, i) => `${k}=$${i + 2}`).join(',');
  const params = [id, ...keys.map(k => row[k])];
  const { rows } = await pool.query(
    `UPDATE ${table} SET ${setClause} WHERE id=$1 RETURNING *`,
    params
  );
  return rows[0] ? toCamel(mapKey, rows[0]) : null;
}

async function deleteRow(mapKey, id) {
  const { table } = MAPS[mapKey];
  await pool.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
}

async function listAll(mapKey) {
  const { table } = MAPS[mapKey];
  const { rows } = await pool.query(`SELECT * FROM ${table}`);
  return rows.map(r => toCamel(mapKey, r));
}

/* ============================================================
   Datos sensibles del empleado — solo visibles sin restricción
   para quien, según SU PROPIO registro de empleado, pertenece a
   Área de trabajo "ADG" y Cargo "Gerente". Todos los demás ven
   estos campos como "••••••" hasta que ingresan SU propia
   contraseña de acceso (POST /empleados/:id/unlock).
   ============================================================ */
const EMPLOYEE_SAFE_FIELDS = new Set([
  'id', 'primerNombre', 'primerApellido', 'nombre', 'apellido', 'usuario',
  'departmentId', 'areaTrabajoId', 'cargoId', 'cargo', 'jefeInmediatoId',
  'fechaIngreso', 'email', 'emailLocal', 'emailDominioId', 'estado', 'foto',
]);

function maskEmployee(emp) {
  const masked = { ...emp };
  for (const key of Object.keys(masked)) {
    if (!EMPLOYEE_SAFE_FIELDS.has(key) && masked[key]) masked[key] = '••••••';
  }
  return masked;
}

/* Área/cargo (en mayúsculas) del empleado propio de esta cuenta, según su
   campo `usuario`. Base para las reglas de permisos de RRHH. */
async function getViewerAreaCargo(username) {
  if (!username) return null;
  const { rows } = await pool.query(
    'SELECT area_trabajo_id, cargo_id FROM rrhh.empleados WHERE lower(usuario) = lower($1) LIMIT 1',
    [username]
  );
  if (!rows.length || !rows[0].area_trabajo_id || !rows[0].cargo_id) return null;

  const { rows: cats } = await pool.query(
    'SELECT id, nombre FROM rrhh.catalogos WHERE id = $1 OR id = $2',
    [rows[0].area_trabajo_id, rows[0].cargo_id]
  );
  const area = cats.find(c => c.id === rows[0].area_trabajo_id);
  const cargo = cats.find(c => c.id === rows[0].cargo_id);
  if (!area || !cargo) return null;
  return { area: area.nombre.trim().toUpperCase(), cargo: cargo.nombre.trim().toUpperCase() };
}

async function isPrivilegedViewer(username) {
  const ac = await getViewerAreaCargo(username);
  return !!ac && ac.area === 'ADG' && ac.cargo === 'GERENTE';
}

/* Eliminar empleados: Área ADG o RRHH, y Cargo Coordinador/Supervisor/Gerente */
async function canDeleteEmployees(username) {
  const ac = await getViewerAreaCargo(username);
  return !!ac
    && ['ADG', 'RRHH'].includes(ac.area)
    && ['COORDINADOR', 'SUPERVISOR', 'GERENTE'].includes(ac.cargo);
}

/* ============================================================
   POST /api/rrhh/empleados/:id/unlock
   Verifica LA PROPIA contraseña de quien llama y, si es correcta,
   devuelve ese empleado sin enmascarar. No persiste ningún estado:
   hay que repetirlo cada vez que se quiera ver/editar sin permisos.
   ============================================================ */
router.post('/empleados/:id/unlock', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ ok: false, error: 'Falta la contraseña' });

    const { rows: userRows } = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [req.user.id]);
    if (!userRows.length) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const match = await bcrypt.compare(password, userRows[0].password_hash);
    if (!match) return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });

    const { rows } = await pool.query('SELECT * FROM rrhh.empleados WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });

    return res.json({ ok: true, data: toCamel('empleados', rows[0]) });
  } catch (err) {
    console.error('[RRHH] POST /empleados/:id/unlock error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al verificar la contraseña' });
  }
});

/* ============================================================
   GET /api/rrhh/roles
   Lista de roles disponibles (para asignar al crear/editar la cuenta
   de acceso de un empleado)
   ============================================================ */
router.get('/roles', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT nombre, descripcion, nivel_acceso FROM roles ORDER BY nivel_acceso DESC');
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[RRHH] GET /roles error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener roles' });
  }
});

/* ============================================================
   GET /api/rrhh/bootstrap
   Trae todo el estado de RRHH en un solo request (igual forma
   que el seedData() original del frontend)
   ============================================================ */
router.get('/bootstrap', async (req, res) => {
  try {
    await seedCatalogsIfEmpty();

    const [
      departments, employees, contracts, documents,
      jobPostings, candidates, payrollRecords, vacations,
      trainings, trainingEnrollments, performanceReviews,
      climateSurveys, climateSurveyResponses, conflictCases,
      catalogRows, auditRows, privileged,
    ] = await Promise.all([
      listAll('departamentos'), listAll('empleados'), listAll('contratos'), listAll('documentos'),
      listAll('vacantes'), listAll('candidatos'), listAll('nomina'), listAll('vacaciones'),
      listAll('capacitaciones'), listAll('inscripciones'), listAll('evaluaciones'),
      listAll('encuestasClima'), listAll('respuestasClima'), listAll('casosConflicto'),
      pool.query('SELECT * FROM rrhh.catalogos'),
      pool.query('SELECT * FROM rrhh.auditoria_empleados ORDER BY fecha DESC'),
      isPrivilegedViewer(req.user.username),
    ]);

    const catalogs = {};
    for (const r of catalogRows.rows) {
      if (!catalogs[r.catalogo]) catalogs[r.catalogo] = [];
      catalogs[r.catalogo].push({ id: r.id, nombre: r.nombre, parentId: r.parent_id });
    }

    const auditLog = auditRows.rows.map(a => ({
      id: a.id, employeeId: a.employee_id, campo: a.campo,
      valorAnterior: (privileged || EMPLOYEE_SAFE_FIELDS.has(a.campo)) ? a.valor_anterior : (a.valor_anterior ? '••••••' : a.valor_anterior),
      valorNuevo: (privileged || EMPLOYEE_SAFE_FIELDS.has(a.campo)) ? a.valor_nuevo : (a.valor_nuevo ? '••••••' : a.valor_nuevo),
      usuario: a.usuario, ip: a.ip, fecha: a.fecha,
    }));

    return res.json({
      ok: true,
      data: {
        departments,
        employees: privileged ? employees : employees.map(maskEmployee),
        contracts, documents,
        jobPostings, candidates, payrollRecords, vacations,
        trainings, trainingEnrollments, performanceReviews,
        climateSurveys, climateSurveyResponses, conflictCases,
        catalogs, auditLog, privileged,
      },
    });
  } catch (err) {
    console.error('[RRHH] GET /bootstrap error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al cargar los datos de RRHH' });
  }
});

/* ============================================================
   Router CRUD generico para las entidades "simples"
   (sin logica especial de auditoria / cascada manual —
   las cascadas ya las resuelve Postgres via ON DELETE)
   ============================================================ */
function crud(mapKey, path) {
  router.post(`/${path}`, async (req, res) => {
    try {
      const created = await insertRow(mapKey, req.body || {});
      return res.status(201).json({ ok: true, data: created });
    } catch (err) {
      console.error(`[RRHH] POST /${path} error:`, err.message);
      return res.status(500).json({ ok: false, error: 'Error al crear el registro' });
    }
  });

  router.put(`/${path}/:id`, async (req, res) => {
    try {
      const updated = await updateRow(mapKey, req.params.id, req.body || {});
      if (!updated) return res.status(404).json({ ok: false, error: 'No encontrado' });
      return res.json({ ok: true, data: updated });
    } catch (err) {
      console.error(`[RRHH] PUT /${path} error:`, err.message);
      return res.status(500).json({ ok: false, error: 'Error al actualizar el registro' });
    }
  });

  router.delete(`/${path}/:id`, async (req, res) => {
    try {
      await deleteRow(mapKey, req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error(`[RRHH] DELETE /${path} error:`, err.message);
      return res.status(500).json({ ok: false, error: 'Error al eliminar el registro' });
    }
  });
}

crud('departamentos', 'departamentos');
crud('contratos', 'contratos');
crud('documentos', 'documentos');
crud('vacantes', 'vacantes');
crud('candidatos', 'candidatos');
crud('nomina', 'nomina');
crud('vacaciones', 'vacaciones');
crud('capacitaciones', 'capacitaciones');
crud('evaluaciones', 'evaluaciones');
crud('encuestasClima', 'encuestas-clima');
crud('respuestasClima', 'respuestas-clima');
crud('casosConflicto', 'casos-conflicto');

/* Inscripciones no tiene UPDATE en el frontend original — solo alta y baja */
router.post('/inscripciones', async (req, res) => {
  try {
    const created = await insertRow('inscripciones', req.body || {});
    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    console.error('[RRHH] POST /inscripciones error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear la inscripción' });
  }
});
router.delete('/inscripciones/:id', async (req, res) => {
  try {
    await deleteRow('inscripciones', req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[RRHH] DELETE /inscripciones error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar la inscripción' });
  }
});

/* ============================================================
   Catálogos — alta de items (tipo doc, nacionalidad, cargo, etc.)
   ============================================================ */
router.post('/catalogos/:catalogo', async (req, res) => {
  try {
    const { catalogo } = req.params;
    const { nombre, parentId } = req.body || {};
    if (!nombre) return res.status(400).json({ ok: false, error: 'Falta el nombre' });

    const id = uid();
    await pool.query(
      'INSERT INTO rrhh.catalogos (id, catalogo, nombre, parent_id) VALUES ($1,$2,$3,$4)',
      [id, catalogo, nombre, parentId || null]
    );
    return res.status(201).json({ ok: true, data: { id, nombre, parentId: parentId || null } });
  } catch (err) {
    console.error('[RRHH] POST /catalogos error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear el ítem de catálogo' });
  }
});

/* ============================================================
   PUT /api/rrhh/catalogos/item/:id
   Renombrar un ítem de catálogo
   ============================================================ */
router.put('/catalogos/item/:id', async (req, res) => {
  try {
    const { nombre } = req.body || {};
    if (!nombre) return res.status(400).json({ ok: false, error: 'Falta el nombre' });

    const { rows } = await pool.query(
      'UPDATE rrhh.catalogos SET nombre = $1 WHERE id = $2 RETURNING id, catalogo, nombre, parent_id',
      [nombre, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Ítem no encontrado' });
    return res.json({ ok: true, data: { id: rows[0].id, catalogo: rows[0].catalogo, nombre: rows[0].nombre, parentId: rows[0].parent_id } });
  } catch (err) {
    console.error('[RRHH] PUT /catalogos/item error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al renombrar el ítem de catálogo' });
  }
});

/* ============================================================
   DELETE /api/rrhh/catalogos/item/:id
   Elimina un ítem de catálogo y, si es jerárquico (geo), sus hijos
   en cascada (provincia -> distritos, departamento -> provincias/distritos).
   ============================================================ */
router.delete('/catalogos/item/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const nivel1 = await pool.query('SELECT id FROM rrhh.catalogos WHERE parent_id = $1', [id]);
    for (const { id: hijoId } of nivel1.rows) {
      await pool.query('DELETE FROM rrhh.catalogos WHERE parent_id = $1', [hijoId]);
    }
    await pool.query('DELETE FROM rrhh.catalogos WHERE parent_id = $1', [id]);
    const { rowCount } = await pool.query('DELETE FROM rrhh.catalogos WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Ítem no encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[RRHH] DELETE /catalogos/item error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar el ítem de catálogo' });
  }
});

/* ============================================================
   Credenciales de acceso del empleado — crea o resetea una cuenta
   real en la tabla `usuarios` (la misma que usan todos los paneles
   de Qubira), con rol VIEWER por defecto. La contraseña en texto
   plano nunca se guarda: solo se usa para generar el hash.
   ============================================================ */
async function upsertEmployeeAccount({ usuario, contrasena, correo, nombre, apellidos, rol }) {
  const username = usuario.trim().toLowerCase();
  const email = (correo || '').trim().toLowerCase() || `${username}@qubira.local`;
  const hash = await bcrypt.hash(contrasena, 12);

  const { rows: existing } = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);

  if (existing.length) {
    await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, existing[0].id]);
    await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [existing[0].id]);
    return username;
  }

  const { rows: correoTaken } = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [email]);
  if (correoTaken.length) {
    throw new Error('Ya existe una cuenta con ese correo. Usa otro correo o un nombre de usuario distinto.');
  }

  const { rows: rolRows } = await pool.query('SELECT id FROM roles WHERE nombre = $1', [(rol || 'VIEWER').toUpperCase()]);
  const rolId = rolRows.length ? rolRows[0].id : (await pool.query(`SELECT id FROM roles WHERE nombre = 'VIEWER'`)).rows[0].id;

  await pool.query(
    `INSERT INTO usuarios (nombre, apellidos, correo, username, password_hash, rol_id, estado)
     VALUES ($1,$2,$3,$4,$5,$6,'activo')`,
    [nombre || username, apellidos || '', email, username, hash, rolId]
  );
  return username;
}

/* ============================================================
   Empleados — alta/edición con auditoría de cambios campo a campo
   (misma lógica que recordAudit() del storage.js original)
   ============================================================ */
router.post('/empleados', async (req, res) => {
  try {
    const data = { ...req.body, estado: req.body.estado || 'activo' };

    if (data.usuario && data.contrasena) {
      try {
        data.usuario = await upsertEmployeeAccount({
          usuario: data.usuario,
          contrasena: data.contrasena,
          correo: data.email,
          nombre: data.primerNombre,
          apellidos: `${data.primerApellido || ''} ${data.segundoApellido || ''}`.trim(),
          rol: data.rol,
        });
      } catch (accErr) {
        return res.status(409).json({ ok: false, error: accErr.message });
      }
    } else {
      data.usuario = data.usuario || '';
    }
    data.contrasena = '';
    delete data.rol;

    const created = await insertRow('empleados', data);

    await pool.query(
      `INSERT INTO rrhh.auditoria_empleados (id, employee_id, campo, valor_anterior, valor_nuevo, usuario, ip, fecha)
       VALUES ($1,$2,'(alta)',NULL,'Registro creado',$3,$4,$5)`,
      [uid(), created.id, req.user.nombre || req.user.username, req.body?.meta?.ip || 'No disponible', new Date().toISOString()]
    );

    return res.status(201).json({ ok: true, data: created });
  } catch (err) {
    console.error('[RRHH] POST /empleados error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear el empleado' });
  }
});

router.put('/empleados/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { rows } = await pool.query('SELECT * FROM rrhh.empleados WHERE id=$1', [id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
    const before = toCamel('empleados', rows[0]);

    /* Editar un empleado NUNCA toca usuario/contraseña — la cuenta se crea
       una sola vez, al dar de alta (POST /empleados), y restablecer la
       contraseña de ahí en más es exclusivo del panel de Soporte. El ROL
       sí se puede cambiar acá (es un dato organizacional, no un secreto). */
    const { meta, usuario, contrasena, password, rol, ...changes } = req.body || {};

    /* Editar campos sensibles exige ser ADG/Gerente o confirmar la propia
       contraseña en este mismo request (igual criterio que para verlos). */
    const touchesSensitive = Object.keys(changes)
      .some(field => field in MAPS.empleados.cols && !EMPLOYEE_SAFE_FIELDS.has(field));
    if (touchesSensitive && !(await isPrivilegedViewer(req.user.username))) {
      if (!password) {
        return res.status(403).json({ ok: false, error: 'Se requiere tu contraseña para editar estos datos' });
      }
      const { rows: userRows } = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [req.user.id]);
      const match = userRows.length && await bcrypt.compare(password, userRows[0].password_hash);
      if (!match) return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
    }

    if (rol && before.usuario) {
      const { rows: rolRows } = await pool.query('SELECT id FROM roles WHERE nombre = $1', [rol.toUpperCase()]);
      if (rolRows.length) {
        await pool.query('UPDATE usuarios SET rol_id = $1 WHERE lower(username) = lower($2)', [rolRows[0].id, before.usuario]);
      }
    }

    const updated = await updateRow('empleados', id, changes);

    const entries = [];
    for (const field of Object.keys(changes)) {
      if (!(field in MAPS.empleados.cols)) continue;
      const antes = before[field];
      const despues = changes[field];
      if (antes !== despues) {
        entries.push([uid(), id, field, antes == null ? null : String(antes), despues == null ? null : String(despues),
          req.user.nombre || req.user.username, meta?.ip || 'No disponible', new Date().toISOString()]);
      }
    }
    if (entries.length) {
      const values = entries.map((_, i) => `($${i * 8 + 1},$${i * 8 + 2},$${i * 8 + 3},$${i * 8 + 4},$${i * 8 + 5},$${i * 8 + 6},$${i * 8 + 7},$${i * 8 + 8})`).join(',');
      await pool.query(
        `INSERT INTO rrhh.auditoria_empleados (id, employee_id, campo, valor_anterior, valor_nuevo, usuario, ip, fecha) VALUES ${values}`,
        entries.flat()
      );
    }

    return res.json({ ok: true, data: updated });
  } catch (err) {
    console.error('[RRHH] PUT /empleados error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al actualizar el empleado' });
  }
});

router.delete('/empleados/:id', async (req, res) => {
  try {
    if (!(await canDeleteEmployees(req.user.username))) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para eliminar empleados (requiere Área ADG o RRHH, y Cargo Coordinador, Supervisor o Gerente)' });
    }

    const { rows } = await pool.query('SELECT usuario FROM rrhh.empleados WHERE id = $1', [req.params.id]);
    const username = rows[0]?.usuario;

    /* Si el empleado tiene cuenta de acceso vinculada, se elimina también
       de la tabla `usuarios` compartida por todo Qubira. No se puede
       eliminar la propia cuenta de quien está haciendo el borrado. */
    if (username) {
      const { rows: acc } = await pool.query('SELECT id FROM usuarios WHERE lower(username) = lower($1)', [username]);
      if (acc.length) {
        if (acc[0].id === req.user.id) {
          return res.status(400).json({ ok: false, error: 'No puedes eliminar tu propio empleado/cuenta' });
        }
        await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [acc[0].id]);
        await pool.query('DELETE FROM usuarios WHERE id = $1', [acc[0].id]);
      }
    }

    await deleteRow('empleados', req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[RRHH] DELETE /empleados error:', err.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar el empleado' });
  }
});

module.exports = router;
