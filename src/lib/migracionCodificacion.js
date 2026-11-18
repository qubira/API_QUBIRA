'use strict';

/* ============================================================
   Migración de los códigos antiguos (CODIFICACION.md, fase 4)
   Corre UNA sola vez al arrancar la API, en UNA transacción:
   o se aplica todo o no se aplica nada. Queda marcada en
   doc.migraciones y no vuelve a ejecutarse.
   Respaldo previo: rama de Neon respaldo-codificacion-2026-11-18.

   Decisiones aplicadas (aprobadas el 18/11/2026):
   - Cada registro conserva su número; el código antiguo queda en codigo_anterior.
   - AUD-CAL-2026-001 era un borrador: queda sin código (BORRADOR-…).
   - Los 23 documentos del editor de ODACL son modelos: 6 formatos con versiones.
   - CLI-003 «Sin especificar» se migra desactivado.
   - Contratos laborales: año de inicio del contrato.
   - Modelos del sistema: ORH-FMT-01 (constancia) y DST-FMT-01 (acta de seguridad).
   ============================================================ */
const { pool } = require('../db');
const C = require('./codificacion');

const CLAVE = 'codificacion-fase4';
const SISTEMA = { usuario: 'migracion', nombre: 'Migración de códigos (fase 4)' };
const pad = (n, d) => String(n).padStart(d, '0');

/* Formatos de ODACL: cada grupo de documentos guardados es un modelo con sus versiones */
const GRUPOS_ODACL = [
  { n: 1, anterior: 'QB-FR-01', titulo: /^Anexo A\b.*Sprint/i, nombre: 'Anexo A — Acta de Aprobación de Sprint' },
  { n: 2, anterior: 'QB-FR-02', titulo: /^Anexo B\b.*Cambio de Alcance/i, nombre: 'Anexo B — Solicitud de Cambio de Alcance' },
  { n: 3, anterior: 'QB-FR-03', titulo: /^Anexo C\b.*Conformidad/i, nombre: 'Anexo C — Acta de Conformidad Final' },
  { n: 4, anterior: null, titulo: /^Contrato de Desarrollo de Software/i, nombre: 'Modelo de Contrato de Desarrollo de Software' },
  { n: 5, anterior: null, titulo: /Confidencialidad|NDA/i, nombre: 'Modelo de Acuerdo de Confidencialidad (NDA bipartito)' },
  { n: 6, anterior: null, titulo: /Nivel de Servicio|SLA/i, nombre: 'Modelo de Acuerdo de Nivel de Servicio (SLA)' },
];

async function existe(cx, tabla) {
  const { rows } = await cx.query('SELECT to_regclass($1) AS t', [tabla]);
  return !!rows[0].t;
}

/* Registra el documento migrado (estado final, sin ruta: ya estaba emitido) */
async function registrar(cx, d) {
  const { rows: [doc] } = await cx.query(`
    INSERT INTO doc.documentos (codigo, area, tipo, anio, numero, version, detalle, titulo, estado, referencia, codigo_anterior, modulo, id_origen, creado_por, creado_en, emitido_en)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'migracion',COALESCE($14::timestamptz, now()),COALESCE($14::timestamptz, now())) RETURNING id`,
    [d.codigo, d.area, d.tipo, d.anio || null, d.numero, d.version || 1, d.detalle || null, d.titulo, d.estado, d.referencia || null,
      d.anterior || null, d.modulo, d.id_origen ? String(d.id_origen) : null, d.fecha || null]);
  await cx.query(`INSERT INTO doc.ruta (documento_id, ronda, orden, area, accion, usuario, usuario_nombre, comentario, fecha)
    VALUES ($1,1,0,$2,'CREA',$3,$4,$5,now())`, [doc.id, d.area, SISTEMA.usuario, SISTEMA.nombre, d.anterior ? `Migrado desde ${d.anterior}` : 'Registrado en la migración']);
  return doc.id;
}
async function piso(cx, area, tipo, anio, n) { await C.pisoCorrelativo(cx, area, tipo, anio, n); }

/* Las claves foráneas hacia una tabla pasan a ON UPDATE CASCADE, para poder cambiar su id (el código) */
async function cascadaAlActualizar(cx, tabla) {
  const { rows } = await cx.query(`
    SELECT conrelid::regclass::text AS hija, conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE contype = 'f' AND confrelid = $1::regclass`, [tabla]);
  for (const r of rows) {
    if (/ON UPDATE CASCADE/i.test(r.def)) continue;
    await cx.query(`ALTER TABLE ${r.hija} DROP CONSTRAINT "${r.conname}"`);
    await cx.query(`ALTER TABLE ${r.hija} ADD CONSTRAINT "${r.conname}" ${r.def} ON UPDATE CASCADE`);
  }
}

/* Plan + ejecución dentro de la transacción cx. Devuelve el resumen. */
async function migrar(cx) {
  const resumen = [];
  const anota = (antes, despues, nota) => resumen.push({ antes, despues, nota: nota || '' });

  // Seguridad: si ya existen códigos que esta migración usaría, no se toca nada
  const { rows: ya } = await cx.query("SELECT codigo FROM doc.documentos WHERE codigo IS NOT NULL AND modulo <> 'SISTEMA' LIMIT 5");
  if (ya.length) throw new Error(`Ya hay documentos emitidos con el sistema nuevo (${ya.map(x => x.codigo).join(', ')}): revisar antes de migrar`);

  // Columnas que los módulos crean al usarse (por si aún nadie entró)
  await cx.query(`
    ALTER TABLE ti.contracts ADD COLUMN IF NOT EXISTS codigo TEXT;
    ALTER TABLE rrhh.contratos ADD COLUMN IF NOT EXISTS codigo TEXT;
    ALTER TABLE rrhh.contratos ADD COLUMN IF NOT EXISTS estado_registro TEXT;
    ALTER TABLE rrhh.constancias ADD COLUMN IF NOT EXISTS numero_anterior TEXT;
    ALTER TABLE rrhh.constancias ADD COLUMN IF NOT EXISTS emisor_nombre TEXT;
    ALTER TABLE rrhh.constancias ADD COLUMN IF NOT EXISTS formato TEXT;
    ALTER TABLE odacl.legal_documents ADD COLUMN IF NOT EXISTS codigo TEXT;
    ALTER TABLE odacl.legal_documents ADD COLUMN IF NOT EXISTS creado_por TEXT;`);

  /* ODN · clientes: CLI-NNN → ODN-CLI-NNNN (el código es el id) */
  await cascadaAlActualizar(cx, 'comercial.clientes');
  const { rows: clientes } = await cx.query("SELECT id, razon_social, ruc, estado, created_at FROM comercial.clientes WHERE id ~ '^CLI-\\d+$' ORDER BY id");
  let maxCli = 0;
  for (const c of clientes) {
    const n = Number(c.id.slice(4)); maxCli = Math.max(maxCli, n);
    const codigo = `ODN-CLI-${pad(n, 4)}`;
    const relleno = /^sin especificar$/i.test(String(c.razon_social).trim());
    await cx.query(`UPDATE comercial.clientes SET id = $2${relleno ? ", estado = 'inactivo'" : ''} WHERE id = $1`, [c.id, codigo]);
    await registrar(cx, { codigo, area: 'ODN', tipo: 'CLI', numero: n, titulo: c.razon_social, detalle: c.ruc ? `RUC ${c.ruc}` : null,
      estado: relleno || c.estado === 'inactivo' ? 'INACTIVO' : 'ACTIVO', anterior: c.id, modulo: 'COMERCIAL', id_origen: codigo, fecha: c.created_at });
    anota(c.id, codigo, relleno ? 'desactivado (registro de relleno)' : c.razon_social);
  }
  await piso(cx, 'ODN', 'CLI', 0, maxCli);

  /* ODN · proformas: PRF-AAAA-NNN → ODN-PRF-AAAA-NNN (mismo número, conserva versiones) */
  await cascadaAlActualizar(cx, 'comercial.proformas');
  const { rows: proformas } = await cx.query("SELECT id, cliente_nombre, estado, version_actual, created_at FROM comercial.proformas WHERE id ~ '^PRF-\\d{4}-\\d+$' ORDER BY id");
  const maxPrf = {};
  for (const p of proformas) {
    const [, anio, num] = p.id.split('-'); const n = Number(num);
    maxPrf[anio] = Math.max(maxPrf[anio] || 0, n);
    const codigo = `ODN-PRF-${anio}-${pad(n, 3)}`;
    await cx.query('UPDATE comercial.proformas SET id = $2 WHERE id = $1', [p.id, codigo]);
    await cx.query('UPDATE comercial.contratos SET proforma_id = $2 WHERE proforma_id = $1', [p.id, codigo]);
    const estado = ['aprobada', 'convertida'].includes(p.estado) ? 'ACEPTADA' : p.estado === 'anulada' ? 'ANULADO' : 'EMITIDA';
    await registrar(cx, { codigo, area: 'ODN', tipo: 'PRF', anio: Number(anio), numero: n, version: p.version_actual || 1, titulo: `Proforma – ${p.cliente_nombre || ''}`,
      estado, anterior: p.id, modulo: 'COMERCIAL', id_origen: codigo, fecha: p.created_at });
    if (estado === 'ACEPTADA') await cx.query('UPDATE doc.documentos SET version_aceptada = version WHERE codigo = $1', [codigo]);
    anota(p.id, `${codigo} v${p.version_actual || 1}`, p.cliente_nombre);
  }
  for (const [anio, n] of Object.entries(maxPrf)) await piso(cx, 'ODN', 'PRF', Number(anio), n);

  /* ODN · contratos generados en el módulo (CTR-AAAA-NNN), si hubiera */
  await cascadaAlActualizar(cx, 'comercial.contratos');
  const { rows: ctrOdn } = await cx.query("SELECT id, cliente_nombre, proforma_id, proforma_version, estado, created_at FROM comercial.contratos WHERE id ~ '^CTR-\\d{4}-\\d+$' ORDER BY id");
  const maxCtrOdn = {};
  for (const c of ctrOdn) {
    const [, anio, num] = c.id.split('-'); const n = Number(num);
    maxCtrOdn[anio] = Math.max(maxCtrOdn[anio] || 0, n);
    const codigo = `ODN-CTR-${anio}-${pad(n, 3)}`;
    await cx.query('UPDATE comercial.contratos SET id = $2 WHERE id = $1', [c.id, codigo]);
    await registrar(cx, { codigo, area: 'ODN', tipo: 'CTR', anio: Number(anio), numero: n, detalle: c.proforma_id ? 'Proyecto' : 'Servicio', titulo: `Contrato – ${c.cliente_nombre || ''}`,
      estado: c.estado === 'cancelado' ? 'ANULADO' : 'APROBADO', referencia: c.proforma_id, anterior: c.id, modulo: 'COMERCIAL', id_origen: codigo, fecha: c.created_at });
    anota(c.id, codigo, c.cliente_nombre);
  }

  /* OTI · proyectos: PROJ-AAAA-NNN → OTI-PRY-NNNN (sin año: número único) */
  const { rows: proyectos } = await cx.query("SELECT id, code, name, client, status, created_at FROM ti.projects WHERE code ~ '^PROJ-\\d{4}-\\d+$' ORDER BY code");
  const usados = new Set(); let maxPry = 0; const codPry = {};
  for (const p of proyectos) {
    let n = Number(p.code.split('-')[2]);
    if (usados.has(n)) { n = Math.max(maxPry, ...usados) + 1; anota(p.code, `OTI-PRY-${pad(n, 4)}`, 'RENUMERADO: número repetido'); }
    usados.add(n); maxPry = Math.max(maxPry, n);
    const codigo = `OTI-PRY-${pad(n, 4)}`; codPry[p.id] = codigo;
    await cx.query('UPDATE ti.projects SET code = $2 WHERE id = $1', [p.id, codigo]);
    await registrar(cx, { codigo, area: 'OTI', tipo: 'PRY', numero: n, titulo: p.name, detalle: p.client, estado: p.status === 'cancelled' ? 'INACTIVO' : 'ACTIVO',
      anterior: p.code, modulo: 'TI', id_origen: p.id, fecha: p.created_at });
    if (!resumen.some(r => r.antes === p.code)) anota(p.code, codigo, p.name);
  }
  await piso(cx, 'OTI', 'PRY', 0, maxPry);

  /* ODN · contratos de proyecto subidos por ADG (sin código) → ODN-CTR (Proyecto) */
  const { rows: ctrTi } = await cx.query('SELECT id, title, project_id, status, created_at FROM ti.contracts WHERE codigo IS NULL ORDER BY created_at, title');
  let nCtr = Math.max(0, ...Object.values(maxCtrOdn).map(Number));
  const anioCtr = C.anioLima();
  for (const c of ctrTi) {
    const anio = new Date(c.created_at).getFullYear() || anioCtr;
    nCtr += 1;
    const codigo = `ODN-CTR-${anio}-${pad(nCtr, 3)}`;
    const anterior = String(c.title || '').replace(/^N[°º.]\s*/i, '').replace(/\s*–\s*/g, '-').trim() || null;
    await cx.query('UPDATE ti.contracts SET codigo = $2 WHERE id = $1', [c.id, codigo]);
    await registrar(cx, { codigo, area: 'ODN', tipo: 'CTR', anio, numero: nCtr, detalle: 'Proyecto', titulo: c.title, referencia: codPry[c.project_id] || null,
      estado: c.status === 'anulado' ? 'ANULADO' : 'APROBADO', anterior, modulo: 'TI-CONTRATOS', id_origen: c.id, fecha: c.created_at });
    anota(c.title, codigo, codPry[c.project_id] ? `proyecto ${codPry[c.project_id]}` : '');
    maxCtrOdn[anio] = Math.max(maxCtrOdn[anio] || 0, nCtr);
  }
  for (const [anio, n] of Object.entries(maxCtrOdn)) await piso(cx, 'ODN', 'CTR', Number(anio), n);

  /* Actas: AUD-SEC → DST-ACT (emitida); las que siguen en borrador quedan sin código */
  if (await existe(cx, 'ti.auditorias_calidad')) {
    const { rows: actas } = await cx.query("SELECT id, codigo, tipo, estado, created_at FROM ti.auditorias_calidad WHERE codigo ~ '^AUD-' ORDER BY codigo");
    const maxAct = {};
    for (const a of actas) {
      if (a.estado === 'borrador') {
        const prov = 'BORRADOR-' + String(a.id).replace(/-/g, '').slice(0, 8).toUpperCase();
        await cx.query('UPDATE ti.auditorias_calidad SET codigo = $2 WHERE id = $1', [a.id, prov]);
        anota(a.codigo, 'sin código (borrador)', 'recibe su código al enviarse a revisión');
        continue;
      }
      const seg = a.tipo === 'seguridad', area = seg ? 'DST' : 'OTI';
      const anio = Number(a.codigo.split('-')[2]);
      const clave = `${area}-${anio}`; maxAct[clave] = (maxAct[clave] || 0) + 1;
      const codigo = `${area}-ACT-${anio}-${pad(maxAct[clave], 3)}`;
      await cx.query('UPDATE ti.auditorias_calidad SET codigo = $2 WHERE id = $1', [a.id, codigo]);
      await registrar(cx, { codigo, area, tipo: 'ACT', anio, numero: maxAct[clave], detalle: seg ? 'Seguridad' : a.tipo === 'calidad' ? 'Calidad' : 'Reglas de negocio',
        titulo: `Acta de auditoría de ${seg ? 'seguridad' : a.tipo === 'calidad' ? 'calidad' : 'reglas de negocio'}`,
        estado: a.estado === 'anulada' ? 'ANULADO' : 'APROBADO', anterior: a.codigo, modulo: 'TI-ACTAS', id_origen: a.id, fecha: a.created_at });
      anota(a.codigo, codigo, seg ? 'Seguridad' : 'Calidad');
    }
    for (const [k, n] of Object.entries(maxAct)) { const [area, anio] = k.split('-'); await piso(cx, area, 'ACT', Number(anio), n); }
    // Dentro del contenido de las actas: referencias a otras actas y a los proyectos auditados
    const mapaActas = resumen.filter(r => /^AUD-/.test(r.antes) && /-ACT-/.test(r.despues));
    for (const m of mapaActas) {
      await cx.query("UPDATE ti.auditorias_calidad SET datos = replace(datos::text, $1, $2)::jsonb WHERE datos::text LIKE $3", [m.antes, m.despues, `%${m.antes}%`]);
    }
    await cx.query("UPDATE ti.auditorias_calidad SET datos = regexp_replace(datos::text, 'PROJ-\\d{4}-(\\d{3})\\M', 'OTI-PRY-0\\1', 'g')::jsonb WHERE datos::text ~ 'PROJ-\\d{4}-\\d{3}'");
  }

  /* ORH · constancias: CT-AAAA-NNNN → ORH-CST-AAAA-NNN (el QR y el código de verificación no cambian) */
  const { rows: cst } = await cx.query("SELECT id, numero, nombre_completo, created_at FROM rrhh.constancias WHERE numero ~ '^CT-\\d{4}-\\d+$' ORDER BY numero");
  const maxCst = {};
  for (const c of cst) {
    const [, anio, num] = c.numero.split('-'); const n = Number(num);
    maxCst[anio] = Math.max(maxCst[anio] || 0, n);
    const codigo = `ORH-CST-${anio}-${pad(n, 3)}`;
    await cx.query('UPDATE rrhh.constancias SET numero = $2, numero_anterior = $1 WHERE id = $3', [c.numero, codigo, c.id]);
    await registrar(cx, { codigo, area: 'ORH', tipo: 'CST', anio: Number(anio), numero: n, titulo: `Constancia de trabajo – ${c.nombre_completo || ''}`,
      estado: 'APROBADO', anterior: c.numero, modulo: 'RRHH', id_origen: c.id, fecha: c.created_at });
    anota(c.numero, codigo, c.nombre_completo);
  }
  // Las constancias 0001-0021 de 2026 se emitieron en papel: el correlativo sigue después
  maxCst['2026'] = Math.max(maxCst['2026'] || 0, 21);
  for (const [anio, n] of Object.entries(maxCst)) await piso(cx, 'ORH', 'CST', Number(anio), n);

  /* ORH · contratos laborales (sin código) → ORH-CTR (año de inicio del contrato) */
  const { rows: lab } = await cx.query(`SELECT c.id, c.tipo, c.fecha_inicio, e.primer_nombre, e.primer_apellido FROM rrhh.contratos c
    LEFT JOIN rrhh.empleados e ON e.id = c.employee_id WHERE c.codigo IS NULL ORDER BY c.fecha_inicio, e.primer_apellido, c.id`);
  const maxLab = {};
  for (const c of lab) {
    const anio = Number(String(c.fecha_inicio || '').slice(0, 4)) || C.anioLima();
    maxLab[anio] = (maxLab[anio] || 0) + 1;
    const codigo = `ORH-CTR-${anio}-${pad(maxLab[anio], 3)}`;
    const nombre = [c.primer_nombre, c.primer_apellido].filter(Boolean).join(' ');
    await cx.query('UPDATE rrhh.contratos SET codigo = $2 WHERE id = $1', [c.id, codigo]);
    await registrar(cx, { codigo, area: 'ORH', tipo: 'CTR', anio, numero: maxLab[anio], detalle: 'Laboral', titulo: `Contrato laboral${nombre ? ' – ' + nombre : ''} (${c.tipo || ''})`,
      estado: 'APROBADO', modulo: 'RRHH-CTR', id_origen: c.id, fecha: c.fecha_inicio ? `${String(c.fecha_inicio).slice(0, 10)}T12:00:00Z` : null });
    anota(`contrato ${c.tipo || ''} de ${nombre}`, codigo, 'Laboral');
  }
  for (const [anio, n] of Object.entries(maxLab)) await piso(cx, 'ORH', 'CTR', Number(anio), n);

  /* ODACL · documentos del editor: 6 formatos con sus versiones (nada se borra) */
  const { rows: docs } = await cx.query('SELECT id, titulo, created_at FROM odacl.legal_documents WHERE codigo IS NULL ORDER BY created_at, id');
  const asignados = new Set();
  let maxFmt = 0;
  for (const g of GRUPOS_ODACL) {
    const grupo = docs.filter(d => !asignados.has(d.id) && g.titulo.test(d.titulo));
    const codigo = `ODACL-FMT-${pad(g.n, 2)}`;
    maxFmt = Math.max(maxFmt, g.n);
    if (!grupo.length && !g.anterior) continue;
    grupo.forEach(d => asignados.add(d.id));
    const vigente = grupo[grupo.length - 1];
    for (let i = 0; i < grupo.length; i++) {
      await cx.query('UPDATE odacl.legal_documents SET codigo = $2, version = $3, estado = $4 WHERE id = $1',
        [grupo[i].id, codigo, i + 1, i === grupo.length - 1 ? 'Vigente' : 'Obsoleto']);
    }
    const docId = await registrar(cx, { codigo, area: 'ODACL', tipo: 'FMT', numero: g.n, version: Math.max(1, grupo.length), titulo: g.nombre, estado: 'VIGENTE',
      anterior: g.anterior, modulo: 'ODACL', id_origen: vigente ? vigente.id : null, fecha: grupo[0] ? grupo[0].created_at : null });
    for (let v = 1; v <= Math.max(1, grupo.length); v++) {
      await cx.query("INSERT INTO doc.versiones (documento_id, version, estado, creado_por) VALUES ($1,$2,$3,'migracion')", [docId, v, v === Math.max(1, grupo.length) ? 'VIGENTE' : 'OBSOLETA']);
    }
    anota(g.anterior || (grupo.length ? `${grupo.length} documento(s) «${grupo[0].titulo}»` : g.nombre), `${codigo} v${Math.max(1, grupo.length)}`, g.nombre);
  }
  const sueltos = docs.filter(d => !asignados.has(d.id));
  if (sueltos.length) throw new Error(`Documentos de ODACL sin clasificar: ${sueltos.map(d => d.titulo).join(' | ')}`);
  await piso(cx, 'ODACL', 'FMT', 0, maxFmt);
  // El código del formato también figura dentro de los anexos (encabezado): QB-FR-0N → ODACL-FMT-0N
  for (const g of GRUPOS_ODACL.filter(x => x.anterior)) {
    const nuevo = `ODACL-FMT-${pad(g.n, 2)}`;
    await cx.query('UPDATE odacl.legal_documents SET contenido_html = replace(contenido_html, $1, $2) WHERE contenido_html LIKE $3', [g.anterior, nuevo, `%${g.anterior}%`]);
    if (await existe(cx, 'odacl.official_templates')) {
      await cx.query('UPDATE odacl.official_templates SET contenido_html = replace(contenido_html, $1, $2) WHERE contenido_html LIKE $3', [g.anterior, nuevo, `%${g.anterior}%`]);
    }
  }

  return resumen;
}

/* Al arrancar: si la migración no se hizo, la ejecuta en una sola transacción */
async function ejecutarUnaVez() {
  await C.asegurarCodificacion();
  await pool.query('CREATE TABLE IF NOT EXISTS doc.migraciones (clave TEXT PRIMARY KEY, ejecutada_en TIMESTAMPTZ NOT NULL DEFAULT now(), resumen JSONB)');
  const { rows } = await pool.query('SELECT 1 FROM doc.migraciones WHERE clave = $1', [CLAVE]);
  if (rows.length) return { yaEjecutada: true };
  for (const t of ['comercial.clientes', 'comercial.proformas', 'comercial.contratos', 'ti.projects', 'ti.contracts', 'rrhh.constancias', 'rrhh.contratos', 'odacl.legal_documents']) {
    if (!(await existe(pool, t))) return { pendiente: `falta la tabla ${t}: se intentará en el próximo arranque` };
  }
  const cx = await pool.connect();
  let resumen;
  try {
    await cx.query('BEGIN');
    await cx.query("SELECT pg_advisory_xact_lock(hashtext('migracion-codificacion'))");
    const otra = await cx.query('SELECT 1 FROM doc.migraciones WHERE clave = $1', [CLAVE]);
    if (otra.rows.length) { await cx.query('ROLLBACK'); return { yaEjecutada: true }; }
    resumen = await migrar(cx);
    await cx.query('INSERT INTO doc.migraciones (clave, resumen) VALUES ($1, $2)', [CLAVE, JSON.stringify(resumen)]);
    await cx.query('COMMIT');
  } catch (e) {
    await cx.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { cx.release(); }
  // Modelos del sistema, ya fuera de la transacción (tienen su propio bloqueo)
  await C.formatoSistema('constancia-trabajo').catch(() => {});
  await C.formatoSistema('acta-seguridad').catch(() => {});
  return { ejecutada: true, cambios: resumen.length };
}

module.exports = { ejecutarUnaVez, migrar, CLAVE };
