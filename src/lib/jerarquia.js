'use strict';

/* ============================================================
   Jerarquía de QUBIRA — 9 niveles (aprobada por la dirección).
   ADG (Alta Dirección Gerencial) en la cúspide, GG (Gerencia General)
   debajo y las oficinas de N3 a N9. DST reporta directo a ADG.

   Datos en rrhh.catalogos (lo administra ORH):
   - catalogo 'cargos'    → cargos principales, columna `nivel` (1..9)
   - catalogo 'subcargos' → cuelgan de un cargo principal (parent_id) y
                            pertenecen a un área (columna `area`, clave interna)
   El empleado guarda cargo_id (principal) y subcargo_id. Los permisos
   salen del NIVEL, no del nombre: un cargo nuevo funciona sin tocar código.
   ============================================================ */
const { pool } = require('../db');
const { canonArea, etiquetaArea, listarAreas } = require('./employeeArea');

const NIVELES = [
  { n: 1, base: 'Director', zona: 'Alta Dirección Gerencial (ADG)' },
  { n: 2, base: 'Gerente', zona: 'Gerencia General (GG)' },
  { n: 3, base: 'Jefe de Oficina', zona: 'Dirige una oficina' },
  { n: 4, base: 'Coordinador', zona: 'Organiza proyectos o procesos' },
  { n: 5, base: 'Supervisor / Líder', zona: 'Dirige un equipo' },
  { n: 6, base: 'Especialista', zona: 'Experto senior' },
  { n: 7, base: 'Analista', zona: 'Trabajo principal' },
  { n: 8, base: 'Asistente / Técnico', zona: 'Apoyo operativo' },
  { n: 9, base: 'Practicante', zona: 'Pre profesional o profesional (Ley 28518)' },
];

// Nivel de los cargos principales por nombre (incluye los nombres anteriores)
const NIVEL_POR_NOMBRE = {
  'DIRECTOR': 1, 'GERENTE': 2, 'JEFE DE OFICINA': 3, 'COORDINADOR': 4, 'SUPERVISOR': 5, 'SUPERVISOR / LÍDER': 5,
  'ESPECIALISTA': 6, 'ANALISTA': 7, 'ASISTENTE / TÉCNICO': 8, 'SOPORTE': 8, 'PRACTICANTE': 9,
};
const nivelDeNombre = n => NIVEL_POR_NOMBRE[String(n || '').trim().toUpperCase()] || null;

// [clave interna del área, nivel, sub-cargos]
const SUBCARGOS = [
  ['ADG', 1, ['Presidente del Directorio', 'Director General (CEO)', 'Director de Operaciones (COO)', 'Director Financiero (CFO)', 'Director de Tecnología (CTO)', 'Director Comercial (CCO)']],
  ['ADG', 6, ['Asesor de Dirección']], ['ADG', 8, ['Secretaria de Dirección']],
  ['GG', 2, ['Gerente General', 'Gerente Adjunto', 'Gerente de Operaciones']],
  ['GG', 6, ['Especialista en Gestión de Proyectos (PMO)']], ['GG', 7, ['Analista de Control de Gestión']], ['GG', 8, ['Asistente de Gerencia']],
  ['TI', 3, ['Jefe de OTI']], ['TI', 4, ['Coordinador de Proyectos TI', 'Product Owner']], ['TI', 5, ['Líder Técnico (Tech Lead)', 'Scrum Master', 'Líder de QA']],
  ['TI', 6, ['Arquitecto de Software', 'Desarrollador Senior', 'Ingeniero DevOps / Cloud', 'Administrador de Base de Datos (DBA)']],
  ['TI', 7, ['Desarrollador Full Stack', 'Desarrollador Frontend', 'Desarrollador Backend', 'Desarrollador Móvil', 'Analista QA', 'Analista de Sistemas', 'Diseñador UX/UI']],
  ['TI', 8, ['Desarrollador Junior', 'Técnico de Infraestructura']], ['TI', 9, ['Practicante de Desarrollo', 'Practicante de QA']],
  ['RRHH', 3, ['Jefe de ORH']], ['RRHH', 4, ['Coordinador de Talento Humano', 'Coordinador de Bienestar']],
  ['RRHH', 6, ['Especialista en Compensaciones', 'Especialista en Seguridad y Salud en el Trabajo (SST)']],
  ['RRHH', 7, ['Analista de Reclutamiento y Selección', 'Analista de Planillas', 'Analista de Capacitación', 'Analista de Clima Laboral']],
  ['RRHH', 8, ['Asistente de Recursos Humanos']], ['RRHH', 9, ['Practicante de Recursos Humanos']],
  ['SOPORTE', 3, ['Jefe de OCOS']], ['SOPORTE', 4, ['Coordinador de Servicios al Cliente', 'Coordinador de Soporte Interno']],
  ['SOPORTE', 5, ['Supervisor de Mesa de Ayuda', 'Supervisor de Postventa y Niveles de Servicio (SLA)']],
  ['SOPORTE', 6, ['Especialista de Soporte Nivel 3 (clientes)', 'Especialista en Implementación']],
  ['SOPORTE', 7, ['Analista de Soporte Nivel 2', 'Analista de Implementación', 'Analista de Servicios en Alquiler']],
  ['SOPORTE', 8, ['Técnico de Soporte Nivel 1', 'Técnico de Soporte Interno', 'Agente de Mesa de Ayuda']], ['SOPORTE', 9, ['Practicante de Soporte']],
  ['COMERCIAL', 3, ['Jefe Comercial']], ['COMERCIAL', 4, ['Coordinador de Cuentas', 'Coordinador de Preventa']], ['COMERCIAL', 5, ['Supervisor de Ventas']],
  ['COMERCIAL', 6, ['Ejecutivo de Cuentas Senior (KAM)', 'Consultor de Preventa']], ['COMERCIAL', 7, ['Ejecutivo de Ventas', 'Analista Comercial']],
  ['COMERCIAL', 8, ['Asistente Comercial', 'Asesor de Atención al Cliente']], ['COMERCIAL', 9, ['Practicante Comercial']],
  ['OPP', 3, ['Jefe de OPP']], ['OPP', 4, ['Coordinador de Presupuestos']], ['OPP', 6, ['Especialista en Costos', 'Especialista en Planeamiento']],
  ['OPP', 7, ['Analista Financiero', 'Analista de Presupuestos', 'Analista de Facturación']], ['OPP', 8, ['Asistente Contable', 'Asistente de Tesorería']], ['OPP', 9, ['Practicante de Finanzas']],
  ['OCM', 3, ['Jefe de OCM']], ['OCM', 4, ['Coordinador de Marketing', 'Coordinador de Comunicaciones']], ['OCM', 5, ['Supervisor de Contenidos']],
  ['OCM', 6, ['Estratega Digital', 'Especialista en SEO/SEM y Pauta']], ['OCM', 7, ['Community Manager', 'Diseñador Gráfico', 'Creador de Contenido Audiovisual', 'Analista de Marketing']],
  ['OCM', 8, ['Asistente de Marketing']], ['OCM', 9, ['Practicante de Marketing']],
  ['ODACL', 3, ['Jefe Legal']], ['ODACL', 4, ['Coordinador Legal y de Cumplimiento']],
  ['ODACL', 6, ['Abogado Senior', 'Oficial de Cumplimiento (Compliance)', 'Oficial de Protección de Datos Personales']],
  ['ODACL', 7, ['Abogado Corporativo', 'Analista de Contratos', 'Analista de Cumplimiento']], ['ODACL', 8, ['Asistente Legal']], ['ODACL', 9, ['Practicante de Derecho']],
  ['DST', 3, ['Jefe de DST (CISO)']], ['DST', 4, ['Coordinador de Ciberseguridad', 'Coordinador de Desarrollo Seguro']],
  ['DST', 5, ['Supervisor del Centro de Operaciones de Seguridad (SOC)', 'Líder de Respuesta a Incidentes']],
  ['DST', 6, ['Arquitecto de Seguridad', 'Especialista en Ciberseguridad', 'Pentester (Hacking Ético)', 'Especialista en Identidades y Accesos (IAM)', 'Ingeniero DevSecOps']],
  ['DST', 7, ['Desarrollador de Sistemas de Seguridad', 'Analista de Seguridad (SOC)', 'Analista Forense Digital', 'Analista de Riesgos y Cumplimiento TI']],
  ['DST', 8, ['Técnico de Monitoreo', 'Técnico de Respaldo y Continuidad']], ['DST', 9, ['Practicante de Ciberseguridad']],
];

// De qué se encarga cada área (clave interna)
const FUNCIONES = {
  ADG: 'Cúspide de la empresa: define la estrategia, aprueba proyectos e inversiones y supervisa a la Gerencia General y a DST.',
  GG: 'Ejecuta la estrategia de ADG, dirige a los jefes de oficina y coordina la comunicación entre todas las áreas.',
  TI: 'Desarrolla las herramientas, sistemas y aplicaciones que QUBIRA entrega a sus clientes.',
  RRHH: 'Personal: selección, contratos, planillas, capacitación, bienestar y el catálogo de áreas y cargos.',
  SOPORTE: 'Soporte de bajo nivel dentro de la empresa, y de bajo y alto nivel a los servicios que QUBIRA presta, vende o alquila a sus clientes.',
  COMERCIAL: 'Vende y alquila los productos y servicios: clientes, proformas y contratos comerciales.',
  OPP: 'Presupuestos, costos y precios: valoriza cada proyecto antes de venderlo y controla el gasto.',
  OCM: 'Comunicación interna y externa, marca, redes sociales y campañas de marketing.',
  ODACL: 'Asuntos legales: contratos, cumplimiento normativo, protección de datos y consultas jurídicas.',
  DST: 'Desarrollo de Seguridad y Tecnología: seguridad e integridad de alto nivel. Crea los sistemas de seguridad y ciberseguridad y defiende los activos y sistemas internos frente a intrusiones y robo de información.',
};
const NOMBRES_AREA = {
  ADG: 'Alta Dirección Gerencial', GG: 'Gerencia General', TI: 'Oficina de Tecnología e Información', RRHH: 'Oficina de Recursos Humanos',
  SOPORTE: 'Oficina de Centro de Operaciones y Servicios', COMERCIAL: 'Oficina de Desarrollo de Negocios', OPP: 'Oficina de Presupuestos y Planeación',
  OCM: 'Oficina de Comunicación y Marketing', ODACL: 'Oficina de Asuntos Corporativos y Legales', DST: 'Desarrollo de Seguridad y Tecnología',
};
// A quién reporta cada área
const REPORTA = { ADG: null, GG: 'ADG', DST: 'ADG' };
const reportaA = clave => (clave in REPORTA ? REPORTA[clave] : 'GG');

const FLUJOS = [
  { pasos: ['OCM', 'ODN', 'OPP', 'ODACL', 'ADG'], titulo: 'Venta', texto: 'Marketing atrae al cliente, ODN arma la proforma, OPP valoriza costos y precio, ODACL redacta el contrato y ADG aprueba.' },
  { pasos: ['ADG', 'GG', 'OTI', '⇄ DST'], titulo: 'Desarrollo', texto: 'GG asigna el proyecto aprobado a OTI, que construye la herramienta del cliente; DST revisa su seguridad antes de entregarla.' },
  { pasos: ['OTI', 'OCOS', '⇄ Cliente'], titulo: 'Entrega y postventa', texto: 'OTI entrega a OCOS, que implementa y da soporte de bajo y alto nivel al cliente; los errores de fondo vuelven a OTI.' },
  { pasos: ['Todas', 'OCOS'], titulo: 'Soporte interno', texto: 'Cualquier área pide ayuda de bajo nivel a OCOS: equipos, accesos y problemas del día a día.' },
  { pasos: ['Todas', 'DST', 'ADG'], titulo: 'Seguridad', texto: 'Cualquier área reporta a DST un incidente o intento de intrusión; DST lo contiene y lo informa a la Alta Dirección.' },
  { pasos: ['Todas', 'ORH'], titulo: 'Personal', texto: 'Las áreas piden a ORH vacantes, altas, bajas, cargos nuevos o capacitaciones.' },
  { pasos: ['Todas', 'ODACL'], titulo: 'Legal', texto: 'Consultas jurídicas, revisión de contratos y cumplimiento normativo.' },
  { pasos: ['GG', '⇄ Jefes de oficina'], titulo: 'Coordinación', texto: 'GG reúne a los jefes, reparte prioridades y resuelve cuando dos áreas chocan. El calendario corporativo conecta las reuniones entre áreas.' },
];

const REGLAS = [
  'Cada área se encarga de lo suyo: OTI desarrolla para clientes, DST protege a la empresa, OCOS da soporte. Lo que no le toca lo pide al área responsable.',
  'ORH es la única oficina que crea cargos y sub-cargos; aparecen solos en todo el sistema.',
  'Cada sub-cargo lleva su nivel y su área, y hereda los permisos del nivel de su cargo principal.',
  'Los permisos salen del nivel, no del nombre: un cargo nuevo funciona sin tocar código.',
  'El jefe inmediato debe tener un nivel más alto que el empleado.',
  'ADG y GG no tienen jefes de oficina ni practicantes: solo directivos y gerentes más su equipo de apoyo.',
  'DST reporta directo a ADG: vigila la seguridad de todos los sistemas, pero no ve los datos de trabajo de otras áreas.',
];

const PERMISOS = [
  { niveles: 'N1', ve: 'Todas las áreas', dirige: 'Toda la empresa', auditoria: 'Todas', aprueba: 'Todo' },
  { niveles: 'N2', ve: 'Todas las oficinas', dirige: 'Jefes de oficina', auditoria: 'Todas', aprueba: 'Operación' },
  { niveles: 'N3', ve: 'Su oficina', dirige: 'Su oficina', auditoria: 'Su área', aprueba: 'Su área' },
  { niveles: 'N4', ve: 'Su oficina', dirige: 'Su proceso', auditoria: 'Su área', aprueba: '—' },
  { niveles: 'N5', ve: 'Su oficina', dirige: 'Su equipo', auditoria: 'Su área', aprueba: '—' },
  { niveles: 'N6–N7', ve: 'Su oficina', dirige: '—', auditoria: '—', aprueba: '—' },
  { niveles: 'N8–N9', ve: 'Lo asignado', dirige: '—', auditoria: '—', aprueba: '—' },
];

/* ─── Esquema y semilla (una sola vez) ─────────────────────────────── */
const uid = () => require('crypto').randomUUID();
let lista = null;
function asegurarJerarquia() {
  if (!lista) lista = (async () => {
    await pool.query(`
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS nivel INT;
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS area TEXT;
      ALTER TABLE rrhh.empleados ADD COLUMN IF NOT EXISTS subcargo_id TEXT;`);
    // Cargos principales: los existentes reciben su nivel; los que faltan se crean
    const { rows: cargos } = await pool.query("SELECT id, nombre, nivel FROM rrhh.catalogos WHERE catalogo = 'cargos'");
    const porNivel = {};
    for (const c of cargos) {
      const n = c.nivel || nivelDeNombre(c.nombre);
      if (n && !c.nivel) await pool.query('UPDATE rrhh.catalogos SET nivel = $1 WHERE id = $2', [n, c.id]);
      if (String(c.nombre).trim().toUpperCase() === 'SUPERVISOR') await pool.query("UPDATE rrhh.catalogos SET nombre = 'Supervisor / Líder' WHERE id = $1", [c.id]);
      if (n && String(c.nombre).trim().toUpperCase() !== 'SOPORTE' && !porNivel[n]) porNivel[n] = c.id;
    }
    for (const l of NIVELES) {
      if (porNivel[l.n]) continue;
      const id = uid();
      await pool.query("INSERT INTO rrhh.catalogos (id, catalogo, nombre, parent_id, nivel) VALUES ($1, 'cargos', $2, NULL, $3)", [id, l.base, l.n]);
      porNivel[l.n] = id;
    }
    // Sub-cargos: solo la primera vez; después los administra ORH
    const { rows: [{ n }] } = await pool.query("SELECT COUNT(*)::int AS n FROM rrhh.catalogos WHERE catalogo = 'subcargos'");
    if (!n) {
      for (const [area, nivel, nombres] of SUBCARGOS) {
        for (const nombre of nombres) {
          await pool.query("INSERT INTO rrhh.catalogos (id, catalogo, nombre, parent_id, nivel, area) VALUES ($1, 'subcargos', $2, $3, $4, $5)", [uid(), nombre, porNivel[nivel], nivel, area]);
        }
      }
    }
  })().catch(e => { lista = null; throw e; });
  return lista;
}

/* ─── Cargo y nivel de una cuenta ──────────────────────────────────── */
async function infoCargo(username) {
  if (!username) return null;
  try { await asegurarJerarquia(); } catch { /* sin tabla rrhh todavía */ }
  const { rows } = await pool.query(`
    SELECT a.nombre AS area, c.nombre AS cargo, c.nivel AS nivel, s.nombre AS subcargo, s.nivel AS nivel_sub
    FROM rrhh.empleados e
    LEFT JOIN rrhh.catalogos a ON a.id = e.area_trabajo_id
    LEFT JOIN rrhh.catalogos c ON c.id = e.cargo_id
    LEFT JOIN rrhh.catalogos s ON s.id = e.subcargo_id
    WHERE lower(e.usuario) = lower($1) LIMIT 1`, [username]).catch(() => ({ rows: [] }));
  if (!rows.length) return null;
  const r = rows[0];
  const nivel = r.nivel || r.nivel_sub || nivelDeNombre(r.cargo);
  return { area: canonArea(r.area), cargo: r.cargo ? r.cargo.trim().toUpperCase() : null, subcargo: r.subcargo || null, nivel: nivel || null };
}

/* Si el empleado elige un sub-cargo, su cargo principal es el padre de ese sub-cargo */
async function normalizarCargoEmpleado(data) {
  if (!data || !data.subcargoId) return data;
  const { rows } = await pool.query("SELECT parent_id FROM rrhh.catalogos WHERE id = $1 AND catalogo = 'subcargos'", [data.subcargoId]);
  if (rows.length && rows[0].parent_id) data.cargoId = rows[0].parent_id;
  return data;
}

/* ─── Datos para el mapa jerárquico (públicos: sin nombres de personas) ─ */
async function datosJerarquia() {
  await asegurarJerarquia();
  const [{ rows: cat }, areas] = await Promise.all([
    pool.query("SELECT id, catalogo, nombre, parent_id, nivel, area FROM rrhh.catalogos WHERE catalogo IN ('cargos', 'subcargos') ORDER BY nivel NULLS LAST, nombre"),
    listarAreas(),
  ]);
  const principales = cat.filter(c => c.catalogo === 'cargos');
  const nivelDe = id => (principales.find(p => p.id === id) || {}).nivel;
  const subcargos = cat.filter(c => c.catalogo === 'subcargos').map(s => ({ nombre: s.nombre, nivel: s.nivel || nivelDe(s.parent_id), area: canonArea(s.area) }));
  const claves = new Set(areas.map(a => a.clave));
  // Las áreas con sub-cargos se muestran aunque no estén en el catálogo de áreas (ej. GG)
  subcargos.forEach(s => { if (s.area && !claves.has(s.area)) { claves.add(s.area); areas.push({ clave: s.area, etiqueta: etiquetaArea(s.area) }); } });
  const orden = ['ADG', 'GG', 'DST', 'TI', 'SOPORTE', 'COMERCIAL', 'OPP', 'ODACL', 'RRHH', 'OCM'];
  areas.sort((a, b) => ((orden.indexOf(a.clave) + 1) || 99) - ((orden.indexOf(b.clave) + 1) || 99));
  return {
    // Nombre del cargo principal de cada nivel: el oficial si existe (no el antiguo «Soporte»)
    niveles: NIVELES.map(l => {
      const delNivel = principales.filter(p => p.nivel === l.n);
      const p = delNivel.find(x => x.nombre.trim().toUpperCase() === l.base.toUpperCase()) || delNivel.find(x => x.nombre.trim().toUpperCase() !== 'SOPORTE') || delNivel[0];
      return { ...l, principal: p ? p.nombre : l.base };
    }),
    areas: areas.map(a => ({
      ...a, nombre: NOMBRES_AREA[a.clave] || a.etiqueta, funcion: FUNCIONES[a.clave] || '',
      reporta: reportaA(a.clave), reportaEtiqueta: reportaA(a.clave) ? etiquetaArea(reportaA(a.clave)) : null,
      cargos: subcargos.filter(s => s.area === a.clave).sort((x, y) => x.nivel - y.nivel),
    })),
    flujos: FLUJOS, reglas: REGLAS, permisos: PERMISOS,
  };
}

/* Valida la ficha de un empleado contra la jerarquía. Devuelve un mensaje de error o null.
   - El sub-cargo debe ser del área del empleado.
   - El jefe inmediato no puede tener un nivel inferior (número mayor) al del empleado. */
async function validarJerarquiaEmpleado(ficha, empleadoId) {
  const ids = [ficha.areaTrabajoId, ficha.cargoId, ficha.subcargoId].filter(Boolean);
  const { rows: cat } = ids.length ? await pool.query('SELECT id, catalogo, nombre, nivel, area FROM rrhh.catalogos WHERE id = ANY($1)', [ids]) : { rows: [] };
  const de = id => cat.find(c => c.id === id);
  const sub = de(ficha.subcargoId), area = de(ficha.areaTrabajoId);
  if (sub && area && canonArea(sub.area) !== canonArea(area.nombre)) return `El puesto «${sub.nombre}» es de ${etiquetaArea(canonArea(sub.area))}, pero el empleado está en ${area.nombre}.`;
  const nivel = (de(ficha.cargoId) || {}).nivel || (sub || {}).nivel;
  if (ficha.jefeInmediatoId && nivel) {
    if (ficha.jefeInmediatoId === empleadoId) return 'Un empleado no puede ser su propio jefe inmediato.';
    const { rows: j } = await pool.query(`SELECT COALESCE(c.nivel, s.nivel) AS nivel FROM rrhh.empleados e
      LEFT JOIN rrhh.catalogos c ON c.id = e.cargo_id LEFT JOIN rrhh.catalogos s ON s.id = e.subcargo_id WHERE e.id = $1`, [ficha.jefeInmediatoId]);
    const nj = j.length && j[0].nivel;
    if (nj && nj > nivel) return `El jefe inmediato (N${nj}) tiene un nivel inferior al del empleado (N${nivel}). Elige a alguien de un nivel más alto.`;
  }
  return null;
}

module.exports = { validarJerarquiaEmpleado, NIVELES, nivelDeNombre, asegurarJerarquia, infoCargo, normalizarCargoEmpleado, datosJerarquia };
