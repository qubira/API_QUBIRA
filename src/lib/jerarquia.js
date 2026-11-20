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

// Estructura oficial (lib/estructura.json, versión 2026-11-20): 209 cargos con área, nivel,
// sub-área, jefe inmediato, función, estado «por crear» y suplente temporal, más las
// conexiones entre áreas. Coincide con las páginas «Estructura de Cargos» y «Flujo de Proyectos».
// Es la semilla del catálogo; después lo administra ORH.
const ESTRUCTURA = require('./estructura.json');

// [clave interna del área, nivel, sub-cargos] — derivado de la estructura oficial
const SUBCARGOS = (() => {
  const grupos = new Map();
  for (const c of ESTRUCTURA.cargos) {
    const k = c.area + '|' + c.nivel;
    if (!grupos.has(k)) grupos.set(k, [c.area, c.nivel, []]);
    grupos.get(k)[2].push(c.nombre);
  }
  return [...grupos.values()];
})();

// De qué se encarga cada área (clave interna)
const FUNCIONES = Object.fromEntries(ESTRUCTURA.areas.map(a => [a.clave, a.funcion]));
// El nombre completo de cada área se lee del catálogo de ORH (no se escribe aquí).
// A quién reporta cada área
const REPORTA = { ADG: null, GG: 'ADG', DST: 'ADG' };
const reportaA = clave => (clave in REPORTA ? REPORTA[clave] : 'GG');

const FLUJOS = [
  { pasos: ['OCM', 'ODN', 'OPP', 'GG', 'ODN', 'ODACL', 'ADG'], titulo: 'Venta', texto: 'Marketing atrae al cliente, ODN arma la proforma, OPP valoriza costos y precio, GG la aprueba con OPP (y ADG si es una venta grande), ODN genera el contrato, ODACL lo revisa y ADG lo aprueba.' },
  { pasos: ['ADG/GG', 'GG (PMO)', 'OTI', '⇄ DST · ODACL', 'Comisión de prueba', 'Especialistas', 'Auditorías DST · GG · ODACL', 'OCOS'], titulo: 'Desarrollo', texto: 'ADG/GG aprueba el proyecto y el PMO abre la carpeta y lo asigna a OTI, que lo construye con Scrum mientras DST y ODACL orientan. La versión completa pasa por la comisión de prueba (un representante de OCOS, ODN, OPP, ODACL y DST, más el área usuaria si es de uso interno; OCM y ORH solo si el producto los toca), la reunión de especialistas y tres auditorías en paralelo: seguridad (DST), calidad de software (GG) y reglas de negocio (ODACL). Una observación devuelve el proyecto a OTI; con las tres actas aprobadas, el Jefe de OCOS recibe el traspaso.' },
  { pasos: ['OTI', 'OCOS', '⇄ Cliente'], titulo: 'Entrega y postventa', texto: 'OTI entrega a OCOS, que implementa y da soporte de bajo y alto nivel al cliente; los errores de fondo vuelven a OTI.' },
  { pasos: ['Todas', 'OCOS'], titulo: 'Soporte interno', texto: 'Cualquier área pide ayuda de bajo nivel a OCOS: equipos, accesos y problemas del día a día.' },
  { pasos: ['Todas', 'DST', 'ADG'], titulo: 'Seguridad', texto: 'Cualquier área reporta a DST un incidente o intento de intrusión; DST lo contiene y lo informa a la Alta Dirección.' },
  { pasos: ['Todas', 'GG'], titulo: 'Administración y logística', texto: 'Compras, proveedores, almacén y servicios generales del local.' },
  { pasos: ['Todas', 'ORH'], titulo: 'Personal', texto: 'Las áreas piden a ORH vacantes, altas, bajas, cargos nuevos, practicantes o capacitaciones.' },
  { pasos: ['Todas', 'ODACL'], titulo: 'Legal', texto: 'Consultas jurídicas, revisión de contratos, convenios de prácticas y cumplimiento normativo.' },
  { pasos: ['GG', '⇄ Jefes de oficina'], titulo: 'Coordinación', texto: 'GG reúne a los jefes, reparte prioridades y resuelve cuando dos áreas chocan. El calendario corporativo conecta las reuniones entre áreas.' },
];

const REGLAS = [
  'Cada área se encarga de lo suyo: OTI desarrolla para clientes, DST protege a la empresa, OCOS da soporte. Lo que no le toca lo pide al área responsable.',
  'ORH es la única oficina que crea cargos y sub-cargos; aparecen solos en todo el sistema.',
  'Cada sub-cargo lleva su nivel y su área, y hereda los permisos del nivel de su cargo principal.',
  'Los permisos salen del nivel, no del nombre: un cargo nuevo funciona sin tocar código.',
  'El jefe inmediato debe tener un nivel más alto. Excepción: en N1 (ADG) y N2 (GG) el jefe puede tener el mismo nivel, porque la jerarquía interna la da el cargo (Presidente › CEO › directores; Gerente General › gerentes).',
  'Mando directo: los jefes de oficina reportan solo al Gerente General. Los directores de ADG fijan la política de su ramo y revisan resultados, pero no dan órdenes directas.',
  'Cada oficina tiene al menos un par de practicantes (pre-profesional y profesional), los dos en N9. Las oficinas con más de un frente técnico pueden tener un par por sub-área; por ejemplo, OTI tiene uno en Desarrollo y otro en QA.',
  'ADG y GG no tienen jefes de oficina ni practicantes: solo directivos y gerentes más su equipo de apoyo.',
  'DST reporta al Director General (CEO): vigila la seguridad de todos los sistemas, pero no ve los datos de trabajo de otras áreas. GG solo recibe sus reportes e indicadores de seguridad.',
  'Aprueba desde N3 dentro de su área; revisa desde N5, o desde N6–N7 como revisor técnico de su especialidad cuando el flujo lo designa. Nadie aprueba lo que creó.',
  'Cada paso de un flujo tiene un cargo titular aunque todavía esté por crear. Mientras ORH no lo cubre, lo hace su suplente temporal; cuando entra la persona, el suplente deja de actuar sin cambiar el flujo.',
  'QUBIRA aplica ISO/IEC 27001, ISO/IEC 27002 e ISO 31000. Los accesos se dan por el mínimo necesario según el nivel y el área, y se retiran al cambiar o dejar el cargo (ISO/IEC 27002, 5.15 y 5.18). Cada jefe de oficina es dueño de los riesgos de su área y los reporta al mapa de riesgos de la empresa.',
];

const PERMISOS = [
  { niveles: 'N1', ve: 'Todas las áreas', dirige: 'Toda la empresa', auditoria: 'Todas', revisa: 'Todo', aprueba: 'Todo' },
  { niveles: 'N2', ve: 'Todas las oficinas bajo su mando; de DST, solo reportes e indicadores de seguridad', dirige: 'Jefes de oficina', auditoria: 'Su línea (la de DST, no)', revisa: 'Todo, menos la operación de DST', aprueba: 'Operación' },
  { niveles: 'N3', ve: 'Su oficina', dirige: 'Su oficina', auditoria: 'Su área', revisa: 'Su área', aprueba: 'Su área' },
  { niveles: 'N4', ve: 'Su oficina', dirige: 'Su proceso', auditoria: 'Su área', revisa: 'Su área', aprueba: '—' },
  { niveles: 'N5', ve: 'Su oficina', dirige: 'Su equipo', auditoria: 'Su área', revisa: 'Su área', aprueba: '—' },
  { niveles: 'N6–N7', ve: 'Su oficina', dirige: '—', auditoria: '—', revisa: 'Solo como revisor técnico de su especialidad, cuando el flujo lo designa', aprueba: '—' },
  { niveles: 'N8–N9', ve: 'Lo asignado', dirige: '—', auditoria: '—', revisa: '—', aprueba: '—' },
];

// Normas ISO: las tres primeras se aplican; las demás son propuestas con un cargo ya mapeado
const NORMAS = [
  { norma: 'ISO/IEC 27001', para: 'Sistema de gestión de seguridad de la información (SGSI): política, riesgos, Declaración de Aplicabilidad, auditoría interna y revisión por la dirección.', area: 'DST', cargo: 'Oficial de Seguridad de la Información (ISO 27001), bajo el Jefe de DST (CISO). La revisión por la dirección la hace ADG.', aplica: true },
  { norma: 'ISO/IEC 27002', para: 'Los controles de seguridad: organizacionales, de personas, físicos y tecnológicos.', area: 'DST con todas las áreas', cargo: 'DST: tecnológicos · ORH: de personas · GG: físicos · ODACL: legales y de proveedores · OTI: desarrollo seguro (8.25 a 8.33).', aplica: true },
  { norma: 'ISO 31000', para: 'Gestión del riesgo de toda la empresa: identificar, analizar, valorar, tratar, seguir y reportar.', area: 'ADG fija la política; cada jefe es dueño de los riesgos de su área', cargo: 'Coordinador de Riesgos y Continuidad (DST) consolida el mapa de riesgos; Auditor Interno Senior lo verifica.', aplica: true },
  { norma: 'ISO/IEC 27005', para: 'Método para el riesgo de seguridad de la información; une ISO/IEC 27001 con ISO 31000.', area: 'DST', cargo: 'Analista de Riesgos y Cumplimiento TI', aplica: false },
  { norma: 'ISO 9001', para: 'Sistema de gestión de calidad.', area: 'GG', cargo: 'Especialista en Gestión de Calidad (ISO 9001)', aplica: false },
  { norma: 'ISO/IEC 25010', para: 'Modelo de calidad del producto software.', area: 'GG con OTI', cargo: 'Especialista en Gestión de Calidad (ISO 9001) · Líder de QA', aplica: false },
  { norma: 'ISO/IEC 27701', para: 'Gestión de la privacidad (versión 2025: norma independiente que se integra con el SGSI); apoya el cumplimiento de la Ley 29733.', area: 'ODACL', cargo: 'Oficial de Protección de Datos Personales', aplica: false },
  { norma: 'ISO 22301', para: 'Continuidad del negocio.', area: 'DST', cargo: 'Especialista en Continuidad de Negocio', aplica: false },
  { norma: 'ISO/IEC 20000-1', para: 'Gestión de servicios TI: mesa de ayuda, incidentes y niveles de servicio.', area: 'OCOS', cargo: 'Supervisor de Postventa y Niveles de Servicio (SLA) · Supervisor de Mesa de Ayuda', aplica: false },
  { norma: 'ISO 37301', para: 'Sistema de gestión de compliance.', area: 'ODACL', cargo: 'Oficial de Cumplimiento (Compliance)', aplica: false },
  { norma: 'ISO 45001', para: 'Seguridad y salud en el trabajo, junto con la Ley 29783.', area: 'ORH', cargo: 'Especialista en Seguridad y Salud en el Trabajo (SST)', aplica: false },
  { norma: 'ISO 19011', para: 'Guía para auditar sistemas de gestión.', area: 'ADG', cargo: 'Auditor Interno Senior', aplica: false },
  { norma: 'ISO/IEC 27017 y 27018', para: 'Seguridad y datos personales en la nube.', area: 'DST', cargo: 'Especialista en Seguridad Cloud', aplica: false },
];

/* ─── Esquema y semilla (una sola vez) ─────────────────────────────── */
const uid = () => require('crypto').randomUUID();
let lista = null;
function asegurarJerarquia() {
  if (!lista) lista = (async () => {
    await pool.query(`
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS nivel INT;
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS area TEXT;
      ALTER TABLE rrhh.empleados ADD COLUMN IF NOT EXISTS subcargo_id TEXT;
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS subarea TEXT;
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS jefe TEXT;
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS funcion TEXT;
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS nombre_completo TEXT;
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS por_crear BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE rrhh.catalogos ADD COLUMN IF NOT EXISTS suplente TEXT;`);
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
    await migrarEstructura(porNivel);
    await actualizarEstructura();
  })().catch(e => { lista = null; throw e; });
  return lista;
}

/* ─── Estructura oficial del 19/11/2026 ────────────────────────────────
   Corre UNA sola vez, en UNA transacción, y queda marcada en doc.migraciones:
   - Cada uno de los 209 cargos queda en el catálogo con su nivel, cargo
     principal, sub-área, jefe inmediato y función (se actualiza si ya
     existía con el mismo nombre en su área; si no, se crea).
   - Los «Practicante de …» antiguos se borran si nadie los usa; los que
     tienen empleados se quedan hasta que ORH los pase a pre-profesional
     o profesional.
   - OTI pasa a llamarse «Oficina de Tecnología de la Información».
   No borra ningún sub-cargo que ORH haya creado aparte. */
const CLAVE_MIGRACION = 'estructura-cargos-2026-11-19';
const normNombre = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const ORDEN_OFICIAL = new Map(ESTRUCTURA.cargos.map((c, i) => [c.area + '|' + normNombre(c.nombre), i]));
const ordenOficial = s => (ORDEN_OFICIAL.has(s.area + '|' + normNombre(s.nombre)) ? ORDEN_OFICIAL.get(s.area + '|' + normNombre(s.nombre)) : 1e6);
const esPracticanteAntiguo = n => /^practicante\b/i.test(n) && !/profesional/i.test(n);
async function migrarEstructura(porNivel) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS doc;
    CREATE TABLE IF NOT EXISTS doc.migraciones (clave TEXT PRIMARY KEY, ejecutada_en TIMESTAMPTZ NOT NULL DEFAULT now(), resumen JSONB);`);
  const { rows: hecha } = await pool.query('SELECT 1 FROM doc.migraciones WHERE clave = $1', [CLAVE_MIGRACION]);
  if (hecha.length) return;
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    await cx.query('LOCK TABLE rrhh.catalogos IN SHARE ROW EXCLUSIVE MODE');
    const { rows: otra } = await cx.query('SELECT 1 FROM doc.migraciones WHERE clave = $1', [CLAVE_MIGRACION]);
    if (otra.length) { await cx.query('ROLLBACK'); return; }
    const { rows: subs } = await cx.query("SELECT id, nombre, area FROM rrhh.catalogos WHERE catalogo = 'subcargos'");
    const existentes = new Map(subs.map(r => [canonArea(r.area) + '|' + normNombre(r.nombre), r]));
    const resumen = { actualizados: 0, creados: 0, practicantesAntiguosBorrados: [], practicantesAntiguosConEmpleados: [], nombreOTI: 0 };
    for (const c of ESTRUCTURA.cargos) {
      if (!porNivel[c.nivel]) throw new Error(`No existe el cargo principal de nivel N${c.nivel}`);
      const previo = existentes.get(c.area + '|' + normNombre(c.nombre));
      const vals = [c.nombre, porNivel[c.nivel], c.nivel, c.area, c.subarea, c.jefe, c.funcion];
      if (previo) {
        await cx.query('UPDATE rrhh.catalogos SET nombre = $2, parent_id = $3, nivel = $4, area = $5, subarea = $6, jefe = $7, funcion = $8 WHERE id = $1', [previo.id, ...vals]);
        resumen.actualizados++;
      } else {
        await cx.query("INSERT INTO rrhh.catalogos (id, catalogo, nombre, parent_id, nivel, area, subarea, jefe, funcion) VALUES ($1, 'subcargos', $2, $3, $4, $5, $6, $7, $8)", [uid(), ...vals]);
        resumen.creados++;
      }
    }
    for (const r of subs.filter(r => esPracticanteAntiguo(r.nombre))) {
      const { rows: [uso] } = await cx.query('SELECT COUNT(*)::int AS n FROM rrhh.empleados WHERE subcargo_id = $1', [r.id]);
      if (uso.n) resumen.practicantesAntiguosConEmpleados.push(`${r.nombre} (${uso.n})`);
      else { await cx.query('DELETE FROM rrhh.catalogos WHERE id = $1', [r.id]); resumen.practicantesAntiguosBorrados.push(r.nombre); }
    }
    const oti = await cx.query("UPDATE rrhh.catalogos SET nombre_completo = 'Oficina de Tecnología de la Información' WHERE catalogo = 'areasTrabajo' AND nombre_completo = 'Oficina de Tecnología e Información'");
    resumen.nombreOTI = oti.rowCount;
    await cx.query('INSERT INTO doc.migraciones (clave, resumen) VALUES ($1, $2)', [CLAVE_MIGRACION, JSON.stringify(resumen)]);
    await cx.query('COMMIT');
    console.log('[jerarquia] Estructura oficial aplicada:', JSON.stringify(resumen));
  } catch (e) {
    await cx.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { cx.release(); }
}

/* ─── Estructura del 20/11/2026 ────────────────────────────────────────
   Corre UNA sola vez, en UNA transacción, marcada en doc.migraciones. A cada
   cargo oficial que siga en el catálogo le pone su función actualizada, su
   estado «por crear» y su suplente temporal. No crea ni borra cargos. */
const CLAVE_ESTRUCTURA_V2 = 'estructura-cargos-2026-11-20';
async function actualizarEstructura() {
  const { rows: hecha } = await pool.query('SELECT 1 FROM doc.migraciones WHERE clave = $1', [CLAVE_ESTRUCTURA_V2]);
  if (hecha.length) return;
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    await cx.query('LOCK TABLE rrhh.catalogos IN SHARE ROW EXCLUSIVE MODE');
    const { rows: otra } = await cx.query('SELECT 1 FROM doc.migraciones WHERE clave = $1', [CLAVE_ESTRUCTURA_V2]);
    if (otra.length) { await cx.query('ROLLBACK'); return; }
    const { rows: subs } = await cx.query("SELECT id, nombre, area FROM rrhh.catalogos WHERE catalogo = 'subcargos'");
    const existentes = new Map(subs.map(r => [canonArea(r.area) + '|' + normNombre(r.nombre), r]));
    const resumen = { actualizados: 0, porCrear: 0, conSuplente: 0, noEstan: [] };
    for (const c of ESTRUCTURA.cargos) {
      const previo = existentes.get(c.area + '|' + normNombre(c.nombre));
      if (!previo) { resumen.noEstan.push(c.nombre); continue; }
      await cx.query('UPDATE rrhh.catalogos SET funcion = $2, por_crear = $3, suplente = $4 WHERE id = $1', [previo.id, c.funcion, !!c.porCrear, c.suplente || null]);
      resumen.actualizados++; if (c.porCrear) resumen.porCrear++; if (c.suplente) resumen.conSuplente++;
    }
    await cx.query('INSERT INTO doc.migraciones (clave, resumen) VALUES ($1, $2)', [CLAVE_ESTRUCTURA_V2, JSON.stringify(resumen)]);
    await cx.query('COMMIT');
    console.log('[jerarquia] Estructura 2026-11-20 aplicada:', JSON.stringify(resumen));
  } catch (e) {
    await cx.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { cx.release(); }
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
    pool.query(`SELECT c.id, c.catalogo, c.nombre, c.parent_id, c.nivel, c.area, c.subarea, c.jefe, c.funcion, c.por_crear, c.suplente,
      EXISTS (SELECT 1 FROM rrhh.empleados e WHERE e.subcargo_id = c.id) AS ocupado
      FROM rrhh.catalogos c WHERE c.catalogo IN ('cargos', 'subcargos') ORDER BY c.nivel NULLS LAST, c.nombre`),
    listarAreas(),
  ]);
  const principales = cat.filter(c => c.catalogo === 'cargos');
  const nivelDe = id => (principales.find(p => p.id === id) || {}).nivel;
  const subcargos = cat.filter(c => c.catalogo === 'subcargos').map(s => ({ nombre: s.nombre, nivel: s.nivel || nivelDe(s.parent_id), area: canonArea(s.area), subarea: s.subarea || null, jefe: s.jefe || null, funcion: s.funcion || null, porCrear: !!s.por_crear && !s.ocupado, suplente: (s.por_crear && !s.ocupado && s.suplente) || null }));
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
      ...a, nombre: a.nombre || a.etiqueta, funcion: FUNCIONES[a.clave] || '',
      reporta: reportaA(a.clave), reportaEtiqueta: reportaA(a.clave) ? etiquetaArea(reportaA(a.clave)) : null,
      // Orden de la estructura oficial (así se arman los árboles); los creados después por ORH van al final, por nivel
      cargos: subcargos.filter(s => s.area === a.clave).sort((x, y) => (ordenOficial(x) - ordenOficial(y)) || (x.nivel - y.nivel) || x.nombre.localeCompare(y.nombre)),
    })),
    flujos: FLUJOS, reglas: REGLAS, permisos: PERMISOS, normas: NORMAS,
    // Conexiones de trabajo entre cargos de distintas áreas (solo las de cargos que siguen en el catálogo)
    tiposConexion: ESTRUCTURA.flujos,
    conexiones: ESTRUCTURA.conexiones.filter(c => {
      const hay = (nombre, area) => subcargos.some(s => s.area === area && normNombre(s.nombre) === normNombre(nombre));
      return hay(c.de, c.deArea) && hay(c.a, c.aArea);
    }).map(c => ({ ...c, deEtiqueta: etiquetaArea(c.deArea), aEtiqueta: etiquetaArea(c.aArea) })),
  };
}

/* Valida la ficha de un empleado contra la jerarquía. Devuelve un mensaje de error o null.
   - El sub-cargo debe ser del área del empleado.
   - El jefe inmediato debe tener un nivel más alto (número menor). Excepción: en N1 y N2
     puede tener el mismo nivel (Presidente › CEO › directores; Gerente General › gerentes). */
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
    if (nj && nj === nivel && nivel > 2) return `El jefe inmediato tiene el mismo nivel (N${nivel}) que el empleado. Solo en N1 (ADG) y N2 (GG) el jefe puede ser del mismo nivel; elige a alguien de un nivel más alto.`;
  }
  return null;
}

module.exports = { validarJerarquiaEmpleado, reportaA, NIVELES, nivelDeNombre, asegurarJerarquia, infoCargo, normalizarCargoEmpleado, datosJerarquia };
