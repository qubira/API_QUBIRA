'use strict';

/* ============================================================
   Codificación de documentos internos — ver CODIFICACION.md
   - Formato:  con año  ÁREA-TIPO-AAAA-NNN   (OTI-INF-2026-027)
               sin año  ÁREA-TIPO-NNNN       (ODN-CLI-0006)
               formatos ÁREA-FMT-NN          (ODACL-FMT-01) + versión aparte
   - Solo el servidor asigna números, al Emitir, con un correlativo
     atómico por área + tipo + año (año 0 = tipo sin año).
   - Año en hora de Lima.
   ============================================================ */

const { pool } = require('../db');
const { canonArea, etiquetaArea, listarAreas, areaPorNombre, asegurarAreas } = require('./employeeArea');
const { infoCargo, reportaA } = require('./jerarquia');

const CLASES = ['DOCUMENTO', 'VERSIONADO', 'REGISTRO'];
const ACCIONES = ['CREA', 'REVISA', 'OBSERVA', 'APRUEBA', 'RECHAZA', 'ARCHIVA', 'ANULA'];

/* Ruta por defecto: lista de pasos { area, accion, nivel_min }.
   area: 'DUENA' (área dueña del documento), 'DESTINO' (área destino) o una sigla.
   Puede ser una lista para todas las áreas o un objeto { SIGLA: [...], '*': [...] }. */
const R = (area, accion, nivel_min) => ({ area, accion, nivel_min });
const TIPOS_INICIALES = [
  ['INF', 'Informe', 'DOCUMENTO', true, [R('DUENA', 'REVISA', 5), R('DUENA', 'APRUEBA', 3)], null, { elevable: true }],
  ['CTR', 'Contrato', 'DOCUMENTO', true, {
    ODN: [R('ODACL', 'REVISA', 5), R('ADG', 'APRUEBA', 3)],
    ODACL: [R('ADG', 'APRUEBA', 3)],
    ORH: [R('ODACL', 'REVISA', 5), R('GG', 'APRUEBA', 3)],
    '*': [R('ODACL', 'REVISA', 5), R('ADG', 'APRUEBA', 3)],
  }, null, {}],
  ['CST', 'Constancia', 'DOCUMENTO', true, [], 3, {}],
  ['ACT', 'Acta', 'DOCUMENTO', true, [R('DUENA', 'APRUEBA', 3)], null, {}],
  ['MEM', 'Memorando', 'DOCUMENTO', true, [R('DUENA', 'APRUEBA', 3)], null, {}],
  ['SOL', 'Solicitud', 'DOCUMENTO', true, [R('DUENA', 'APRUEBA', 3), R('DESTINO', 'REVISA', 5)], null, {}],
  ['PLN', 'Plan', 'DOCUMENTO', true, [R('DUENA', 'REVISA', 3), R('GG', 'APRUEBA', 3)], null, {}],
  ['CLG', 'Consulta legal', 'DOCUMENTO', true, [R('ODACL', 'REVISA', 5), R('ODACL', 'APRUEBA', 3)], null, {}],
  ['PRF', 'Proforma', 'VERSIONADO', true, [R('OPP', 'REVISA', 5), R('DUENA', 'APRUEBA', 3)], null, {}],
  ['FMT', 'Formato', 'VERSIONADO', false, [R('DUENA', 'APRUEBA', 3)], null, {}],
  ['CLI', 'Cliente', 'REGISTRO', false, [], null, {}],
  ['PRY', 'Proyecto', 'REGISTRO', false, [], null, {}],
  ['CAS', 'Caso de soporte', 'REGISTRO', true, [], null, {}],
];
// Áreas dueñas fijas de algunos tipos (el área dueña es la del módulo responsable)
const AREA_DUENA_FIJA = { CST: ['ORH'], CLI: ['ODN'], PRY: ['OTI'], CAS: ['OCOS'], PRF: ['ODN'], CLG: ['ODACL'] };

const EMPRESA_INICIAL = { razon_social: 'QUBIRA', ruc: '10764275981', direccion: 'Lima, Perú', sitio_verificacion: 'qubira.vercel.app/verificar' };

/* ─── Esquema (una sola vez) ───────────────────────────────────────── */
let listo = null;
function asegurarCodificacion() {
  if (!listo) listo = (async () => {
    await asegurarAreas();
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS doc;
      CREATE TABLE IF NOT EXISTS doc.tipos (
        sigla CHAR(3) PRIMARY KEY,
        nombre TEXT NOT NULL,
        clase TEXT NOT NULL CHECK (clase IN ('DOCUMENTO','VERSIONADO','REGISTRO')),
        lleva_anio BOOLEAN NOT NULL,
        ruta_defecto JSONB NOT NULL DEFAULT '[]',
        firmante JSONB,
        emite_nivel_min INT,
        opciones JSONB NOT NULL DEFAULT '{}',
        activo BOOLEAN NOT NULL DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS doc.empresa (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS doc.correlativos (
        area TEXT NOT NULL, tipo CHAR(3) NOT NULL, anio INT NOT NULL, ultimo INT NOT NULL,
        PRIMARY KEY (area, tipo, anio)
      );
      CREATE TABLE IF NOT EXISTS doc.documentos (
        id BIGSERIAL PRIMARY KEY,
        codigo TEXT UNIQUE,
        area TEXT NOT NULL,
        tipo CHAR(3) NOT NULL REFERENCES doc.tipos(sigla),
        anio INT, numero INT,
        version INT NOT NULL DEFAULT 1,
        detalle TEXT,
        titulo TEXT NOT NULL,
        estado TEXT NOT NULL,
        area_destino TEXT,
        elevar_adg BOOLEAN NOT NULL DEFAULT false,
        formato_codigo TEXT, formato_version INT,
        referencia TEXT, referencia_version INT,
        reemplaza_a TEXT, reemplazado_por TEXT,
        codigo_anterior TEXT,
        modulo TEXT, id_origen TEXT,
        enlace_externo TEXT,
        fecha_documento DATE,
        version_aceptada INT,
        motivo_anulacion TEXT,
        creado_por TEXT NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
        emitido_en TIMESTAMPTZ,
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS documentos_codigo_anterior_ix ON doc.documentos (codigo_anterior);
      CREATE INDEX IF NOT EXISTS documentos_area_tipo_ix ON doc.documentos (area, tipo, estado);
      CREATE UNIQUE INDEX IF NOT EXISTS documentos_origen_uq ON doc.documentos (modulo, id_origen) WHERE id_origen IS NOT NULL;
      CREATE TABLE IF NOT EXISTS doc.versiones (
        documento_id BIGINT NOT NULL REFERENCES doc.documentos(id),
        version INT NOT NULL,
        estado TEXT NOT NULL,
        creado_por TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (documento_id, version)
      );
      CREATE TABLE IF NOT EXISTS doc.ruta (
        id BIGSERIAL PRIMARY KEY,
        documento_id BIGINT NOT NULL REFERENCES doc.documentos(id),
        ronda INT NOT NULL DEFAULT 1,
        orden INT NOT NULL,
        area TEXT NOT NULL,
        accion TEXT NOT NULL CHECK (accion IN ('CREA','REVISA','OBSERVA','APRUEBA','RECHAZA','ARCHIVA','ANULA')),
        nivel_min INT,
        planificado BOOLEAN NOT NULL DEFAULT false,
        usuario TEXT,
        usuario_nombre TEXT,
        usuario_cargo TEXT,
        comentario TEXT,
        motivo TEXT,
        fecha TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS ruta_documento_ix ON doc.ruta (documento_id, ronda, orden);`);
    for (const [sigla, nombre, clase, anio, ruta, nivelEmite, opciones] of TIPOS_INICIALES) {
      await pool.query(`INSERT INTO doc.tipos (sigla, nombre, clase, lleva_anio, ruta_defecto, emite_nivel_min, opciones)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (sigla) DO NOTHING`,
        [sigla, nombre, clase, anio, JSON.stringify(ruta), nivelEmite, JSON.stringify(opciones)]);
    }
    // Firmante por defecto de las constancias: el Gerente que hoy las firma
    await pool.query(`UPDATE doc.tipos SET firmante = $1 WHERE sigla = 'CST' AND firmante IS NULL`,
      [JSON.stringify({ nombre: 'Abraham Aranda Cerna', cargo: 'Gerente', area: 'GG' })]);
    for (const [k, v] of Object.entries(EMPRESA_INICIAL)) {
      await pool.query('INSERT INTO doc.empresa (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO NOTHING', [k, v]);
    }
  })().catch(e => { listo = null; throw e; });
  return listo;
}

/* ─── Códigos ──────────────────────────────────────────────────────── */
const pad = (n, d) => String(n).padStart(d, '0');

function anioLima(fecha = new Date()) {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric' }).format(fecha));
}

function formatearCodigo(area, tipo, anio, numero) {
  if (tipo.sigla === 'FMT') return `${area}-FMT-${pad(numero, 2)}`;
  return tipo.lleva_anio ? `${area}-${tipo.sigla}-${anio}-${pad(numero, 3)}` : `${area}-${tipo.sigla}-${pad(numero, 4)}`;
}

/* Valida un código contra la regla de su tipo y el catálogo de áreas.
   Devuelve { ok, area, tipo, anio, numero } o { ok:false, error }. */
async function validarCodigo(codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  const m = /^([A-Z]{2,5})-([A-Z]{3})(?:-(\d{4}))?-(\d{2,})$/.exec(c);
  if (!m) return { ok: false, error: 'El código no tiene la forma ÁREA-TIPO-AAAA-NNN, ÁREA-TIPO-NNNN o ÁREA-FMT-NN.' };
  const [, area, sig, anio, num] = m;
  const tipo = await tipoPorSigla(sig);
  if (!tipo) return { ok: false, error: `El tipo ${sig} no existe en el catálogo de tipos.` };
  const areas = await listarAreas({ incluirInactivas: true });
  if (!areas.some(a => a.sigla === area)) return { ok: false, error: `El área ${area} no existe en el catálogo de ORH.` };
  if (sig === 'FMT') {
    if (anio || num.length < 2) return { ok: false, error: 'Los formatos se codifican ÁREA-FMT-NN (sin año).' };
  } else if (tipo.lleva_anio) {
    if (!anio || num.length < 3) return { ok: false, error: `El tipo ${sig} lleva año: ÁREA-${sig}-AAAA-NNN.` };
  } else if (anio || num.length < 4) {
    return { ok: false, error: `El tipo ${sig} no lleva año: ÁREA-${sig}-NNNN.` };
  }
  return { ok: true, codigo: c, area, tipo: sig, anio: anio ? Number(anio) : 0, numero: Number(num) };
}

/* Siguiente número, atómico: dos personas a la vez nunca reciben el mismo.
   Debe correr dentro de la transacción que guarda el documento. */
async function siguienteNumero(cliente, area, tipo, anio) {
  const { rows } = await cliente.query(`
    INSERT INTO doc.correlativos (area, tipo, anio, ultimo) VALUES ($1, $2, $3, 1)
    ON CONFLICT (area, tipo, anio) DO UPDATE SET ultimo = doc.correlativos.ultimo + 1
    RETURNING ultimo`, [area, tipo, anio]);
  return rows[0].ultimo;
}

/* ─── Catálogos ────────────────────────────────────────────────────── */
async function listarTipos() {
  await asegurarCodificacion();
  const { rows } = await pool.query('SELECT * FROM doc.tipos ORDER BY sigla');
  return rows.map(t => ({ ...t, sigla: t.sigla.trim() }));
}
async function tipoPorSigla(sigla) {
  await asegurarCodificacion();
  const { rows } = await pool.query('SELECT * FROM doc.tipos WHERE sigla = $1', [String(sigla || '').trim().toUpperCase()]);
  return rows.length ? { ...rows[0], sigla: rows[0].sigla.trim() } : null;
}
async function datosEmpresa() {
  await asegurarCodificacion();
  const { rows } = await pool.query('SELECT clave, valor FROM doc.empresa');
  return Object.fromEntries(rows.map(r => [r.clave, r.valor]));
}
/* Siglas de área que ya se usaron en algún código (quedan bloqueadas) */
async function siglasUsadas() {
  try {
    const { rows } = await pool.query("SELECT DISTINCT area FROM doc.correlativos UNION SELECT DISTINCT area FROM doc.documentos WHERE codigo IS NOT NULL");
    return new Set(rows.map(r => r.area));
  } catch { return new Set(); }
}

/* Pasos de la ruta de un tipo para un documento concreto */
function rutaPara(tipo, doc) {
  const def = tipo.ruta_defecto || [];
  let pasos = Array.isArray(def) ? def : (def[doc.area] || def['*'] || []);
  pasos = pasos.map(p => ({ ...p, area: p.area === 'DUENA' ? doc.area : p.area === 'DESTINO' ? doc.area_destino : p.area }))
    .filter(p => p.area);
  if (doc.elevar_adg && (tipo.opciones || {}).elevable && !pasos.some(p => p.area === 'ADG' && p.accion === 'APRUEBA')) {
    pasos.push({ area: 'ADG', accion: 'APRUEBA', nivel_min: 3 });
  }
  return pasos;
}

/* ─── Personas y permisos ──────────────────────────────────────────── */
/* Quién es la cuenta: área (clave interna y sigla), nivel, nombre y puesto.
   Un superadministrador sin ficha de empleado cuenta como ADG nivel 1. */
async function quienEs(user) {
  const info = await infoCargo(user.username).catch(() => null);
  const superadmin = (user.nivel_acceso || 0) >= 100;
  let clave = info && info.area, nivel = info && info.nivel;
  if (superadmin && (!clave || !nivel)) { clave = clave || 'ADG'; nivel = nivel || 1; }
  const { rows } = await pool.query(
    "SELECT trim(concat_ws(' ', nombre, apellidos)) AS nombre FROM usuarios WHERE lower(username) = lower($1)", [user.username]
  ).catch(() => ({ rows: [] }));
  return {
    usuario: user.username, clave: clave || null, sigla: clave ? etiquetaArea(clave) : null, nivel: nivel || null,
    nombre: (rows[0] && rows[0].nombre) || user.username, cargo: (info && (info.subcargo || info.cargo)) || null,
    superadmin, esADG: clave === 'ADG' || superadmin,
  };
}

/* Personas activas de un área con nivel suficiente (sin contar al creador) */
async function personasDelArea(sigla, nivelMin, excluir) {
  const clave = canonArea(sigla);
  const { rows } = await pool.query(`
    SELECT e.usuario, a.nombre AS area, COALESCE(c.nivel, s.nivel) AS nivel
      FROM rrhh.empleados e
      JOIN rrhh.catalogos a ON a.id = e.area_trabajo_id
      LEFT JOIN rrhh.catalogos c ON c.id = e.cargo_id
      LEFT JOIN rrhh.catalogos s ON s.id = e.subcargo_id
     WHERE COALESCE(lower(e.estado), 'activo') = 'activo' AND e.usuario IS NOT NULL AND e.usuario <> ''`);
  return rows.filter(r => canonArea(r.area) === clave && r.nivel && r.nivel <= nivelMin && (!excluir || r.usuario.toLowerCase() !== String(excluir).toLowerCase()));
}

/* ¿Puede esta persona hacer este paso? Devuelve { ok, motivo } o { ok:false, error }.
   Reglas (CODIFICACION.md §6):
   1. Solo personas del área del paso con el nivel pedido, salvo ADG.
   2. Nadie revisa ni aprueba un documento que creó.
   3. Si en el área no hay otra persona con el nivel necesario, actúa el jefe
      inmediato según el Mapa jerárquico (GG, o ADG para DST y GG); si tampoco, ADG. */
async function puedeActuar(quien, paso, doc) {
  const nivelMin = paso.nivel_min || 3;
  if (['REVISA', 'APRUEBA', 'RECHAZA', 'OBSERVA'].includes(paso.accion) && quien.usuario.toLowerCase() === String(doc.creado_por).toLowerCase()) {
    return { ok: false, error: 'No puedes revisar ni aprobar un documento que tú creaste.' };
  }
  const claveArea = canonArea(paso.area);
  if (quien.clave === claveArea) {
    if (quien.nivel && quien.nivel <= nivelMin) return { ok: true, motivo: null };
    return { ok: false, error: `Este paso necesita nivel N${nivelMin} o superior de ${paso.area}.` };
  }
  const otros = await personasDelArea(paso.area, nivelMin, doc.creado_por);
  const verbo = paso.accion === 'REVISA' ? 'Revisado' : 'Aprobado';
  if (!otros.length) {
    const superior = reportaA(claveArea);
    if (superior && quien.clave === superior && quien.nivel && quien.nivel <= 3) {
      return { ok: true, motivo: `${verbo} por jefe inmediato: no hay otro aprobador en el área` };
    }
    const jefes = superior ? await personasDelArea(etiquetaArea(superior), 3, doc.creado_por) : [];
    if (quien.esADG && (quien.superadmin || (quien.nivel && quien.nivel <= nivelMin))) {
      return { ok: true, motivo: jefes.length ? `${verbo} por ADG` : `${verbo} por ADG: no hay otro aprobador en el área ni jefe inmediato` };
    }
    return { ok: false, error: `No hay aprobador en ${paso.area}: le corresponde al jefe inmediato (${superior ? etiquetaArea(superior) : 'ADG'}) o a ADG.` };
  }
  if (quien.esADG && (quien.superadmin || (quien.nivel && quien.nivel <= nivelMin))) return { ok: true, motivo: `${verbo} por ADG` };
  return { ok: false, error: `Este paso le corresponde a ${paso.area} (nivel N${nivelMin} o superior).` };
}

/* ¿Puede emitir documentos de esta área y tipo? */
function puedeEmitir(quien, area, tipo) {
  if (quien.esADG) return { ok: true };
  if (quien.sigla !== area) return { ok: false, error: `Solo el personal de ${area} (o ADG) puede emitir documentos de ${area}.` };
  if (tipo.emite_nivel_min && !(quien.nivel && quien.nivel <= tipo.emite_nivel_min)) {
    return { ok: false, error: `Solo el personal de ${area} con nivel N${tipo.emite_nivel_min} o superior puede emitir ${tipo.nombre.toLowerCase()}s.` };
  }
  return { ok: true };
}

/* Estado al terminar la ruta (o al emitir si el tipo no tiene ruta) */
function estadoFinal(tipo) {
  if (tipo.clase === 'REGISTRO') return tipo.sigla === 'CAS' ? 'ABIERTO' : 'ACTIVO';
  if (tipo.sigla === 'PRF') return 'EMITIDA';
  if (tipo.sigla === 'FMT') return 'VIGENTE';
  return 'APROBADO';
}

module.exports = {
  CLASES, ACCIONES, AREA_DUENA_FIJA, asegurarCodificacion, anioLima, formatearCodigo, validarCodigo, siguienteNumero,
  listarTipos, tipoPorSigla, datosEmpresa, siglasUsadas, rutaPara, quienEs, puedeActuar, puedeEmitir, estadoFinal,
  personasDelArea, areaPorNombre,
};
