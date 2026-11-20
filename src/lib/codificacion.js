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
  ['PRF', 'Proforma', 'VERSIONADO', true, [R('OPP', 'REVISA', 5), R('GG', 'APRUEBA', 3)], null, { elevable: true }], // venta grande: + ADG
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
      -- Áreas que revisan elegidas al crear (informes y planes): arman la ruta de ese documento
      ALTER TABLE doc.documentos ADD COLUMN IF NOT EXISTS revisores TEXT[];
      ALTER TABLE doc.documentos ADD COLUMN IF NOT EXISTS no_aprueba TEXT;
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
      CREATE INDEX IF NOT EXISTS ruta_documento_ix ON doc.ruta (documento_id, ronda, orden);
      ALTER TABLE doc.ruta ADD COLUMN IF NOT EXISTS cargo TEXT;`);
    for (const [sigla, nombre, clase, anio, ruta, nivelEmite, opciones] of TIPOS_INICIALES) {
      await pool.query(`INSERT INTO doc.tipos (sigla, nombre, clase, lleva_anio, ruta_defecto, emite_nivel_min, opciones)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (sigla) DO NOTHING`,
        [sigla, nombre, clase, anio, JSON.stringify(ruta), nivelEmite, JSON.stringify(opciones)]);
    }
    // 20/11/2026: la proforma la revisa OPP y la aprueba GG; si es venta grande, también ADG (Flujo de Proyectos)
    await pool.query(`UPDATE doc.tipos SET ruta_defecto = $1, opciones = COALESCE(opciones, '{}'::jsonb) || '{"elevable": true}'::jsonb
      WHERE sigla = 'PRF' AND NOT ruta_defecto @> '[{"area": "GG"}]'::jsonb`, [JSON.stringify([R('OPP', 'REVISA', 5), R('GG', 'APRUEBA', 3)])]);
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

/* Piso del correlativo: el próximo número será mayor que `n` (para no chocar
   con números ya usados fuera del sistema, p. ej. constancias en papel). */
async function pisoCorrelativo(cliente, area, tipo, anio, n) {
  if (!(n > 0)) return;
  await cliente.query(`
    INSERT INTO doc.correlativos (area, tipo, anio, ultimo) VALUES ($1, $2, $3, $4)
    ON CONFLICT (area, tipo, anio) DO UPDATE SET ultimo = GREATEST(doc.correlativos.ultimo, EXCLUDED.ultimo)`, [area, tipo, anio, n]);
}

/* ─── Membrete, línea de ruta y firmas (plantilla común) ───────────── */
const TIPOS_EXTERNOS = ['CST', 'CTR', 'PRF']; // se entregan a personas de fuera: sin línea de ruta
const VERBO = { CREA: 'crea', REVISA: 'revisa', APRUEBA: 'aprueba', OBSERVA: 'observa', RECHAZA: 'rechaza', ARCHIVA: 'archiva', ANULA: 'anula' };

function datosMembrete(doc, ruta, tipo, empresa) {
  const area = areaPorNombre(doc.area) || { sigla: doc.area, nombre: doc.area };
  const ronda = Math.max(1, ...ruta.map(p => p.ronda || 1));
  const pasos = ruta.filter(p => p.ronda === ronda && (p.planificado || p.accion === 'CREA') && p.orden < 900).sort((a, b) => a.orden - b.orden || a.id - b.id);
  const unicos = []; // la línea de ruta muestra cada paso una vez (el reenvío no repite «crea»)
  for (const p of pasos) if (!unicos.some(u => u.orden === p.orden && u.accion === p.accion)) unicos.push(p);
  const lineaRuta = TIPOS_EXTERNOS.includes(tipo.sigla) ? null
    : 'Ruta: ' + unicos.map(p => `${p.area} ${VERBO[p.accion] || p.accion.toLowerCase()}`).join(' → ');
  const firmas = unicos.filter(p => p.fecha && p.usuario && ['CREA', 'REVISA', 'APRUEBA'].includes(p.accion))
    .map(p => ({ accion: p.accion, area: p.area, nombre: p.usuario_nombre || p.usuario, cargo: p.usuario_cargo || '', fecha: p.fecha, motivo: p.motivo || null }));
  const leyendas = [];
  if (doc.estado === 'ANULADO') leyendas.push(doc.reemplazado_por ? `Anulado – reemplazado por ${doc.reemplazado_por}` : `Anulado${doc.motivo_anulacion ? ': ' + doc.motivo_anulacion : ''}`);
  if (doc.reemplaza_a) leyendas.push(`Reemplaza a ${doc.reemplaza_a}`);
  if (doc.referencia) leyendas.push(String(doc.detalle || '').toLowerCase() === 'adenda' ? `Adenda de ${doc.referencia}` : `Basado en ${doc.referencia}${doc.referencia_version ? ' v' + doc.referencia_version : ''}`);
  if (doc.formato_codigo) leyendas.push(`Formato ${doc.formato_codigo}${doc.formato_version ? ' v' + doc.formato_version : ''}`);
  if (doc.codigo_anterior) leyendas.push(`Código anterior: ${doc.codigo_anterior}`);
  return {
    codigo: doc.codigo, version: tipo.clase === 'VERSIONADO' ? doc.version : null, titulo: doc.titulo, detalle: doc.detalle,
    tipo: { sigla: tipo.sigla, nombre: tipo.nombre }, estado: doc.estado,
    area: { sigla: area.sigla, nombre: area.nombre },
    empresa: { razonSocial: empresa.razon_social, ruc: empresa.ruc, direccion: empresa.direccion },
    encabezado: `${doc.codigo || 'BORRADOR'}${tipo.clase === 'VERSIONADO' ? ' v' + doc.version : ''} · ${area.nombre}`,
    lineaRuta, firmas, leyendas, emitido: doc.emitido_en,
  };
}

/* Formato base de un modelo del sistema (p. ej. el modelo de constancia = ORH-FMT-01).
   Se registra una sola vez y devuelve su código y versión vigente. */
const FORMATOS_SISTEMA = {
  'constancia-trabajo': { area: 'ORH', titulo: 'Modelo de constancia de trabajo' },
  'acta-seguridad': { area: 'DST', titulo: 'Modelo de acta de auditoría de seguridad' },
};
async function formatoSistema(clave) {
  const def = FORMATOS_SISTEMA[clave];
  if (!def) return null;
  await asegurarCodificacion();
  const buscar = async cli => (await cli.query("SELECT codigo, version FROM doc.documentos WHERE modulo = 'SISTEMA' AND id_origen = $1", [clave])).rows[0];
  const ya = await buscar(pool);
  if (ya) return ya;
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    await cli.query("SELECT pg_advisory_xact_lock(hashtext('formato-sistema'))");
    const otra = await buscar(cli);
    if (otra) { await cli.query('COMMIT'); return otra; }
    const tipo = await tipoPorSigla('FMT');
    const numero = await siguienteNumero(cli, def.area, 'FMT', 0);
    const codigo = formatearCodigo(def.area, tipo, 0, numero);
    const { rows: [d] } = await cli.query(`INSERT INTO doc.documentos (codigo, area, tipo, anio, numero, version, titulo, estado, modulo, id_origen, creado_por, emitido_en)
      VALUES ($1,$2,'FMT',NULL,$3,1,$4,'VIGENTE','SISTEMA',$5,'sistema',now()) RETURNING id, codigo, version`, [codigo, def.area, numero, def.titulo, clave]);
    await cli.query("INSERT INTO doc.versiones (documento_id, version, estado, creado_por) VALUES ($1, 1, 'VIGENTE', 'sistema')", [d.id]);
    await cli.query("INSERT INTO doc.ruta (documento_id, ronda, orden, area, accion, usuario, usuario_nombre, comentario, fecha) VALUES ($1,1,0,$2,'CREA','sistema','Sistema','Modelo registrado al implementar la codificación',now())", [d.id, def.area]);
    await cli.query('COMMIT');
    return { codigo: d.codigo, version: d.version };
  } catch (e) { await cli.query('ROLLBACK').catch(() => {}); throw e; }
  finally { cli.release(); }
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
/* Datos de la empresa. Razón social y RUC tienen una sola fuente: la ficha societaria
   de ODACL (odacl.info_societaria), la misma que usan los contratos de ODN. Si ODACL
   aún no la editó, valen los de doc.empresa. */
async function datosEmpresa() {
  await asegurarCodificacion();
  const { rows } = await pool.query('SELECT clave, valor FROM doc.empresa');
  const e = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
  try {
    const { rows: s } = await pool.query('SELECT datos FROM odacl.info_societaria WHERE id = 1');
    const d = (s[0] && s[0].datos) || {};
    if (d.razon_social) e.razon_social = d.razon_social;
    if (d.ruc) e.ruc = d.ruc;
  } catch { /* ODACL aún no creó su ficha */ }
  return e;
}
/* Guarda razón social y RUC en la ficha societaria (fuente única) y el resto en doc.empresa */
async function guardarEmpresa(datos, autor) {
  await asegurarCodificacion();
  const soc = {};
  for (const [k, v] of Object.entries(datos)) {
    if (!/^[a-z_]{2,40}$/.test(k) || v === undefined || v === null || String(v).trim() === '') continue;
    const val = String(v).trim().slice(0, 300);
    if (k === 'razon_social' || k === 'ruc') soc[k] = val;
    await pool.query('INSERT INTO doc.empresa (clave, valor) VALUES ($1,$2) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor', [k, val]);
  }
  if (Object.keys(soc).length) {
    await pool.query(`
      INSERT INTO odacl.info_societaria (id, datos, actualizado_por, updated_at) VALUES (1, $1::jsonb, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET datos = odacl.info_societaria.datos || EXCLUDED.datos, actualizado_por = EXCLUDED.actualizado_por, updated_at = NOW()`,
      [JSON.stringify(soc), autor || 'Registro de documentos']).catch(() => {});
  }
  return datosEmpresa();
}
/* Siglas de área que ya se usaron en algún código (quedan bloqueadas) */
async function siglasUsadas() {
  try {
    const { rows } = await pool.query("SELECT DISTINCT area FROM doc.correlativos UNION SELECT DISTINCT area FROM doc.documentos WHERE codigo IS NOT NULL");
    return new Set(rows.map(r => r.area));
  } catch { return new Set(); }
}

/* Pasos de la ruta de un tipo para un documento concreto */
// Tipos en los que quien crea puede elegir las áreas que revisan
const TIPOS_CON_REVISORES = ['INF', 'PLN'];

function rutaPara(tipo, doc) {
  /* Ruta elegida al crear: cada área revisora revisa (N5+) en el orden indicado y al final
     aprueba ADG (si se eleva) o el N3+ del área dueña. Ej.: OTI crea → ODN revisa → OPP revisa → ADG aprueba */
  if (TIPOS_CON_REVISORES.includes(tipo.sigla) && Array.isArray(doc.revisores) && doc.revisores.length) {
    const pasos = doc.revisores.map(a => ({ area: a, accion: 'REVISA', nivel_min: 5 }));
    pasos.push(doc.elevar_adg ? { area: 'ADG', accion: 'APRUEBA', nivel_min: 3 } : { area: doc.area, accion: 'APRUEBA', nivel_min: 3 });
    return pasos;
  }
  const def = tipo.ruta_defecto || [];
  let pasos = Array.isArray(def) ? def : (def[doc.area] || def['*'] || []);
  pasos = pasos.map(p => ({ ...p, area: p.area === 'DUENA' ? doc.area : p.area === 'DESTINO' ? doc.area_destino : p.area }))
    .filter(p => p.area);
  // Acta elevada: la aprobación del área dueña pasa a ADG (ej. calidad de un proyecto que pidió GG → la aprueba el CTO)
  if (doc.elevar_adg && tipo.sigla === 'ACT') pasos = pasos.map(p => (p.accion === 'APRUEBA' && p.area === doc.area ? { ...p, area: 'ADG', cargo: 'Director de Tecnología (CTO)' } : p));
  if (doc.elevar_adg && (tipo.opciones || {}).elevable && !pasos.some(p => p.area === 'ADG' && p.accion === 'APRUEBA')) {
    pasos.push({ area: 'ADG', accion: 'APRUEBA', nivel_min: 3, ...(tipo.sigla === 'PRF' ? { cargo: 'Director Comercial (CCO)' } : {}) }); // venta grande: el Director Comercial
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
  // Quien aprobó la venta grande (ADG) no aprueba su contrato: lo aprueba otra persona de ADG (Director General)
  if (paso.accion === 'APRUEBA' && doc.no_aprueba && quien.usuario.toLowerCase() === String(doc.no_aprueba).toLowerCase()) {
    return { ok: false, error: 'Quien aprobó la venta grande no aprueba su contrato: lo aprueba el Director General (otra persona de ADG).' };
  }
  /* Paso con cargo exacto (CTO, Director Comercial, Director General…): si el cargo está cubierto,
     solo su titular; si no, actúa quien corresponda por área y nivel (suplente). */
  if (paso.cargo) {
    const tit = await require('./notificar').titulares(paso.cargo, doc.creado_por);
    if (tit.length && !tit.some(u => u.toLowerCase() === quien.usuario.toLowerCase())) {
      return { ok: false, error: `Este paso le corresponde al ${paso.cargo}.` };
    }
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
  listarTipos, tipoPorSigla, datosEmpresa, guardarEmpresa, siglasUsadas, rutaPara, quienEs, puedeActuar, puedeEmitir, estadoFinal,
  personasDelArea, areaPorNombre, pisoCorrelativo, TIPOS_CON_REVISORES, datosMembrete, formatoSistema, TIPOS_EXTERNOS,
};
