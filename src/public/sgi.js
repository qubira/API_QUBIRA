/* ============================================================
   Sistema de gestión integrado — componente compartido (lo sirve la API).
   Normas ISO adoptadas, mapa de riesgos de la empresa (ISO 31000) y
   revisión por la dirección (ISO/IEC 27001 9.3 · ISO 9001 9.3).
   Uso: qbSgi.render(el, { token: fn })
   ============================================================ */
(function () {
  'use strict';
  var SRC = (document.currentScript && document.currentScript.src) || '';
  var API = SRC.replace(/\/api\/public\/sgi\.js.*$/, '') || 'https://api-qubira.onrender.com';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var AREAS = ['ADG', 'GG', 'OTI', 'OPP', 'ODACL', 'DST', 'OCOS', 'ODN', 'OCM', 'ORH'];
  var TIPOS = { estrategico: 'Estratégico', operativo: 'Operativo', seguridad: 'Seguridad', legal: 'Legal', financiero: 'Financiero', tecnologico: 'Tecnológico', personas: 'Personas' };
  var EST = { aplica: 'Aplica', guia: 'Guía', no: 'Por ahora no' };
  var ESTR = { abierto: 'Abierto', mitigado: 'Mitigado', cerrado: 'Cerrado' };
  var CSS = [
    '.qbg{--g-borde:rgba(127,127,140,.22);--g-suave:rgba(127,127,140,.06);--g-tenue:rgba(110,110,125,.95);--g-acento:#5b4fe0;--g-acento-s:rgba(91,79,224,.1);--g-ok:#0f8f6e;--g-ok-s:rgba(15,143,110,.12);--g-mal:#c0392b;--g-mal-s:rgba(192,57,43,.1);--g-med:#b7791f;--g-med-s:rgba(183,121,31,.12);color:inherit;font-size:14px;line-height:1.5;display:grid;gap:16px;min-width:0}',
    '.qbg *{box-sizing:border-box}.qbg h2{margin:0;font-size:22px;letter-spacing:-.01em}.qbg h3{margin:0;font-size:16px}.qbg h4{margin:0;font-size:14px}.qbg p{margin:0}.qbg button,.qbg input,.qbg select,.qbg textarea{font:inherit;color:inherit}',
    '.qbg-sub{color:var(--g-tenue);font-size:13px}.qbg-caja{border:1px solid var(--g-borde);border-radius:14px;padding:18px;display:grid;gap:14px;min-width:0;background:var(--g-fondo,transparent)}',
    '.qbg-cab{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}',
    '.qbg-alerta{display:flex;gap:10px;align-items:flex-start;background:var(--g-mal-s);border:1px solid rgba(192,57,43,.25);color:var(--g-mal);border-radius:12px;padding:10px 14px;font-weight:600;font-size:13.5px}.qbg-alerta i{font-style:normal;font-size:16px;line-height:1.3}',
    '.qbg-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.qbg-kpi{border:1px solid var(--g-borde);border-radius:12px;padding:12px 14px;display:grid;gap:2px}.qbg-kpi span{font-size:12px;color:var(--g-tenue)}.qbg-kpi b{font-size:24px;line-height:1.2}.qbg-kpi.a b{color:var(--g-mal)}.qbg-kpi.b b{color:var(--g-ok)}',
    '.qbg-tabs{display:flex;gap:4px;border-bottom:1px solid var(--g-borde);overflow-x:auto}.qbg-tab{border:0;background:none;padding:9px 14px;cursor:pointer;color:var(--g-tenue);font-weight:600;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}.qbg-tab.on{color:var(--g-acento);border-bottom-color:var(--g-acento)}.qbg-tab em{font-style:normal;font-size:11px;background:var(--g-suave);border-radius:999px;padding:1px 7px;margin-left:6px}',
    '.qbg-panel{display:none;gap:16px}.qbg-panel.on{display:grid}',
    '.qbg-dos{display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);gap:16px;align-items:start}@media (max-width:860px){.qbg-dos{grid-template-columns:1fr}}',
    '.qbg-mat{display:grid;grid-template-columns:22px repeat(5,1fr);gap:4px;font-size:12px}.qbg-mat div{aspect-ratio:1;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700}.qbg-mat .e{aspect-ratio:auto;color:var(--g-tenue);font-weight:600}',
    '.qbg-mat .z1{background:var(--g-ok-s);color:var(--g-ok)}.qbg-mat .z2{background:var(--g-med-s);color:var(--g-med)}.qbg-mat .z3{background:var(--g-mal-s);color:var(--g-mal)}.qbg-mat .n{outline:2px solid currentColor;outline-offset:-2px}',
    '.qbg-ley{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--g-tenue)}.qbg-ley i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}',
    '.qbg-tabla{overflow-x:auto}.qbg table{border-collapse:collapse;width:100%;font-size:13px}.qbg th{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--g-tenue);font-weight:600}.qbg th,.qbg td{border-bottom:1px solid var(--g-borde);padding:9px 8px;text-align:left;vertical-align:top}.qbg tbody tr:hover{background:var(--g-suave)}',
    '.qbg-chip{display:inline-block;font-size:11px;font-weight:700;line-height:20px;padding:0 9px;border-radius:999px;background:var(--g-suave);white-space:nowrap}.qbg-chip.a{color:var(--g-mal);background:var(--g-mal-s)}.qbg-chip.m{color:var(--g-med);background:var(--g-med-s)}.qbg-chip.b{color:var(--g-ok);background:var(--g-ok-s)}.qbg-chip.x{color:var(--g-acento);background:var(--g-acento-s)}',
    '.qbg-b{border:1px solid var(--g-borde);background:transparent;border-radius:9px;padding:7px 14px;cursor:pointer;font-weight:600;font-size:13px}.qbg-b:hover{background:var(--g-suave)}.qbg-b.p{background:var(--g-acento);border-color:var(--g-acento);color:#fff}.qbg-b.p:hover{filter:brightness(1.08)}.qbg-b:disabled{opacity:.55;cursor:default}',
    '.qbg input,.qbg select,.qbg textarea{border:1px solid var(--g-borde);border-radius:9px;padding:7px 10px;background:transparent;width:100%;min-width:0}.qbg input:focus,.qbg select:focus,.qbg textarea:focus{outline:2px solid var(--g-acento-s);border-color:var(--g-acento)}.qbg textarea{min-height:76px;resize:vertical}',
    '.qbg-form{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;align-items:end}.qbg-form label{display:grid;gap:4px;font-size:12px;color:var(--g-tenue);font-weight:600}.qbg-form .c2{grid-column:span 2}.qbg-form .c3{grid-column:span 3}.qbg-form .c6{grid-column:1/-1}@media (max-width:760px){.qbg-form{grid-template-columns:1fr 1fr}.qbg-form .c2,.qbg-form .c3{grid-column:1/-1}}',
    '.qbg-rie td select{width:auto}.qbg-rie td textarea{min-height:38px;font-size:12.5px}',
    '.qbg-fila{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center}.qbg-dec{display:grid;grid-template-columns:minmax(0,1fr) 110px 150px;gap:8px}@media (max-width:640px){.qbg-dec{grid-template-columns:1fr}}',
    '.qbg-normas{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}.qbg-norma{border:1px solid var(--g-borde);border-radius:12px;padding:14px;display:grid;gap:8px;align-content:start;border-top:3px solid var(--g-borde)}.qbg-norma.aplica{border-top-color:var(--g-ok)}.qbg-norma.guia{border-top-color:var(--g-med)}.qbg-norma.no{opacity:.85}',
    '.qbg-norma .r{font-size:12px;color:var(--g-tenue)}.qbg-norma .m{font-size:12.5px;background:var(--g-suave);border-radius:8px;padding:6px 9px}',
    '.qbg-vacio{border:1px dashed var(--g-borde);border-radius:12px;padding:22px;text-align:center;color:var(--g-tenue);font-size:13px}',
    '.qbg-err{color:var(--g-mal);font-size:13px}.qbg-ok{color:var(--g-ok);font-size:13px;font-weight:600}.qbg-msg:empty{display:none}',
    'details.qbg-caja summary{cursor:pointer;font-weight:600}',
  ].join('');
  function estilos() { if (document.getElementById('qbg-estilos')) return; var st = document.createElement('style'); st.id = 'qbg-estilos'; st.textContent = CSS; document.head.appendChild(st); }
  function pedir(op, metodo, ruta, cuerpo) {
    var t = op.token ? op.token() : null;
    return fetch(API + '/api/sgi' + ruta, { method: metodo, cache: 'no-store', headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}), body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401) throw new Error('Tu sesión venció.'); if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo completar la operación.'); return j.data; }); });
  }
  var zona = function (n) { return n >= 15 ? 3 : n >= 8 ? 2 : 1; };
  function nivel(r) { var n = r.probabilidad * r.impacto, z = zona(n); return '<span class="qbg-chip ' + ['', 'b', 'm', 'a'][z] + '">' + n + ' · ' + ['', 'bajo', 'medio', 'alto'][z] + '</span>'; }
  var opts = function (lista, sel, etq) { return lista.map(function (x) { return '<option value="' + x + '"' + (x === sel ? ' selected' : '') + '>' + esc(etq ? etq[x] || x : x) + '</option>'; }).join(''); };
  var n15 = function (nombre, v) { return '<select data-c="' + nombre + '">' + [1, 2, 3, 4, 5].map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>'; };
  var kpi = function (t, v, c) { return '<div class="qbg-kpi' + (c ? ' ' + c : '') + '"><span>' + esc(t) + '</span><b>' + esc(v) + '</b></div>'; };

  /* Matriz 5×5: probabilidad (filas, de 5 a 1) × impacto (columnas) con el número de riesgos abiertos */
  function matriz(todos) {
    var h = '<div class="qbg-mat" role="img" aria-label="Matriz de riesgos abiertos por probabilidad e impacto">';
    for (var p = 5; p >= 1; p--) {
      h += '<div class="e">' + p + '</div>';
      for (var i = 1; i <= 5; i++) {
        var n = todos.filter(function (r) { return r.probabilidad === p && r.impacto === i; }).length;
        h += '<div class="z' + zona(p * i) + (n ? ' n' : '') + '" title="P' + p + ' × I' + i + ' = ' + (p * i) + '">' + (n || '') + '</div>';
      }
    }
    h += '<div class="e"></div>' + [1, 2, 3, 4, 5].map(function (i) { return '<div class="e">' + i + '</div>'; }).join('') + '</div>';
    return h + '<p class="qbg-sub" style="text-align:center">Impacto → · Probabilidad ↑</p><div class="qbg-ley"><span><i style="background:var(--g-ok-s);outline:1px solid var(--g-ok)"></i>Bajo (1–7)</span><span><i style="background:var(--g-med-s);outline:1px solid var(--g-med)"></i>Medio (8–14)</span><span><i style="background:var(--g-mal-s);outline:1px solid var(--g-mal)"></i>Alto (15–25)</span></div>';
  }

  function entradasHtml(e) {
    if (!e || !e.anio) return '';
    var h = e.auditorias.hallazgos_abiertos || {};
    return '<div class="qbg-kpis">' + kpi('Proyectos en el flujo', e.proyectos.total) + kpi('Riesgos altos abiertos', e.riesgos.altos_abiertos, e.riesgos.altos_abiertos ? 'a' : '') + kpi('Riesgos de proyectos', e.riesgos.proyectos_abiertos) + kpi('Riesgos corporativos', e.riesgos.corporativos_abiertos) +
      kpi('Actas de auditoría', e.auditorias.actas) + kpi('Hallazgos crít. / altos', (h.critico || 0) + ' / ' + (h.alto || 0), (h.critico || h.alto) ? 'a' : '') + kpi('Incidentes de seguridad', e.seguridad.incidentes) + kpi('Con datos personales', e.seguridad.con_datos_personales) +
      kpi('Casos de soporte', e.soporte.casos) + kpi('Escalados a OTI', e.soporte.escalados_oti) + kpi('Cambios aprobados', e.cambios_alcance.aprobados) + kpi('Facturas por cobrar', e.cobros.por_cobrar) + kpi('Documentos en ruta', e.documentos_en_ruta) + '</div>' +
      '<p class="qbg-sub">Datos reunidos automáticamente el ' + esc(String(e.generado || '').slice(0, 10)) + '.</p>';
  }
  function filaDec(d) {
    return '<div class="qbg-dec" data-dec="1"><input data-c="decision" placeholder="Decisión o acción de mejora" value="' + esc(d.decision || '') + '"><select data-c="area"><option value="">Área</option>' + opts(AREAS, d.area) + '</select><input type="date" data-c="fecha_limite" value="' + esc(d.fecha_limite || '') + '" title="Fecha límite"></div>';
  }
  function revisionHtml(r, p) {
    var borr = r.estado === 'borrador' && p.revision;
    var dec = (r.decisiones || []);
    return '<div class="qbg-caja" data-rev="' + esc(r.id) + '"><div class="qbg-cab"><div><h3>Revisión ' + r.anio + '</h3><p class="qbg-sub">' + esc(r.fecha) + ' · preparada por ' + esc(r.creado_por || '—') + '</p></div><span class="qbg-chip ' + (r.estado === 'emitida' ? 'b' : 'm') + '">' + (r.estado === 'emitida' ? 'Emitida · ' + esc(r.codigo || '') : 'Borrador') + '</span></div>' +
      entradasHtml(r.entradas) +
      (borr ? '<label class="qbg-form"><span class="c6" style="display:grid;gap:4px">Conclusiones de la dirección<textarea data-c="conclusiones" placeholder="¿El sistema de gestión sigue siendo adecuado y eficaz? ¿Qué cambió en el año?">' + esc(r.conclusiones || '') + '</textarea></span></label>' +
        '<div style="display:grid;gap:8px"><h4>Decisiones</h4><div data-decs="1" style="display:grid;gap:8px">' + dec.concat([{}]).map(filaDec).join('') + '</div></div>' +
        '<div class="qbg-fila"><button class="qbg-b" data-acc="mas">+ Decisión</button><span style="flex:1"></span><button class="qbg-b" data-acc="refrescar">Actualizar datos</button><button class="qbg-b" data-acc="guardar">Guardar</button>' + (p.emitir ? '<button class="qbg-b p" data-acc="emitir">Emitir informe ADG-INF</button>' : '') + '</div>'
        : (r.conclusiones ? '<div><h4>Conclusiones</h4><p>' + esc(r.conclusiones) + '</p></div>' : '') + (dec.length ? '<div><h4>Decisiones</h4><ul style="margin:6px 0 0;padding-left:18px">' + dec.map(function (d) { return '<li>' + esc(d.decision) + (d.area ? ' · <b>' + esc(d.area) + '</b>' : '') + (d.fecha_limite ? ' · hasta ' + esc(d.fecha_limite) : '') + '</li>'; }).join('') + '</ul></div>' : '')) +
      '<span class="qbg-msg"></span></div>';
  }

  function pintar(el, op, d, msg) {
    var p = d.permisos;
    var puedeAlguno = p.riesgos_todos || p.riesgos_area;
    var areasAlta = p.riesgos_todos ? AREAS : [p.riesgos_area];
    var abiertos = d.riesgos.filter(function (r) { return r.estado === 'abierto'; });
    var todosAb = abiertos.concat(d.riesgos_proyectos);
    var altos = todosAb.filter(function (r) { return r.probabilidad * r.impacto >= 15; }).length;
    var aplican = (d.normas || []).filter(function (n) { return (n.estado || (n.aplica ? 'aplica' : 'no')) === 'aplica'; }).length;
    var tab = op._tab || 'riesgos';
    var T = function (k, t, n) { return '<button class="qbg-tab' + (tab === k ? ' on' : '') + '" data-tab="' + k + '">' + t + (n != null ? '<em>' + n + '</em>' : '') + '</button>'; };

    el.innerHTML = '<div class="qbg">' +
      '<div class="qbg-cab"><div><h2>Sistema de gestión</h2><p class="qbg-sub">Riesgos (ISO 31000 · ISO/IEC 27005), revisión por la dirección (ISO/IEC 27001 · ISO 9001) y normas ISO de QUBIRA.</p></div></div>' +
      (d.revision_vencida ? '<div class="qbg-alerta"><i>⚠</i><span>' + (d.ultima_revision ? 'La última revisión por la dirección es del ' + esc(d.ultima_revision) + ': ya pasó un año.' : 'Aún no hay una revisión por la dirección emitida.') + ' ISO/IEC 27001 pide al menos una al año.</span></div>' : '') +
      '<div class="qbg-kpis">' + kpi('Riesgos abiertos', todosAb.length) + kpi('Riesgos altos', altos, altos ? 'a' : 'b') + kpi('Última revisión', d.ultima_revision || 'Ninguna', d.revision_vencida ? 'a' : 'b') + kpi('Normas que aplican', aplican + ' de ' + (d.normas || []).length) + '</div>' +
      (msg ? '<p class="qbg-ok">✓ ' + esc(msg) + '</p>' : '') +
      '<div class="qbg-tabs" role="tablist">' + T('riesgos', 'Mapa de riesgos', todosAb.length) + T('revision', 'Revisión por la dirección', d.revisiones.length) + T('normas', 'Normas ISO', (d.normas || []).length) + '</div>' +

      /* ---- Riesgos ---- */
      '<section class="qbg-panel' + (tab === 'riesgos' ? ' on' : '') + '" data-panel="riesgos">' +
      '<div class="qbg-dos"><div class="qbg-caja"><h3>Matriz de calor</h3>' + matriz(todosAb) + '</div>' +
      '<div class="qbg-caja"><div><h3>Mapa de riesgos de la empresa</h3><p class="qbg-sub">Cada jefe es dueño de los riesgos de su área; DST (Coordinador de Riesgos) los consolida. Nivel = probabilidad × impacto.</p></div>' +
      (d.riesgos.length ? '<div class="qbg-tabla qbg-rie"><table><thead><tr><th>Riesgo</th><th>Área</th><th>P</th><th>I</th><th>Nivel</th><th>Tratamiento</th><th>Estado</th>' + (puedeAlguno ? '<th></th>' : '') + '</tr></thead><tbody>' +
        d.riesgos.map(function (r) {
          var ed = p.riesgos_todos || p.riesgos_area === r.area;
          return '<tr data-r="' + esc(r.id) + '"><td><b>' + esc(r.riesgo) + '</b><br><span class="qbg-sub">' + esc(TIPOS[r.tipo] || r.tipo) + (r.responsable ? ' · ' + esc(r.responsable) : '') + '</span></td><td><span class="qbg-chip x">' + esc(r.area) + '</span></td>' +
            (ed ? '<td>' + n15('probabilidad', r.probabilidad) + '</td><td>' + n15('impacto', r.impacto) + '</td><td>' + nivel(r) + '</td><td><textarea data-c="tratamiento" placeholder="Cómo se trata">' + esc(r.tratamiento || '') + '</textarea></td><td><select data-c="estado">' + opts(['abierto', 'mitigado', 'cerrado'], r.estado, ESTR) + '</select></td><td><button class="qbg-b" data-acc="riesgo">Guardar</button></td>'
              : '<td>' + r.probabilidad + '</td><td>' + r.impacto + '</td><td>' + nivel(r) + '</td><td>' + esc(r.tratamiento || '—') + '</td><td>' + esc(ESTR[r.estado] || r.estado) + '</td>' + (puedeAlguno ? '<td></td>' : '')) + '</tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="qbg-vacio">Todavía no hay riesgos corporativos registrados.' + (puedeAlguno ? ' Registra el primero abajo.' : '') + '</div>') +
      '<span class="qbg-msg"></span></div></div>' +
      (puedeAlguno ? '<div class="qbg-caja" data-nuevo="1"><h3>Registrar un riesgo</h3><div class="qbg-form">' +
        '<label class="c3">Riesgo<input data-c="riesgo" placeholder="Ej.: caída del proveedor de base de datos"></label>' +
        '<label>Área dueña<select data-c="area">' + opts(areasAlta) + '</select></label><label>Tipo<select data-c="tipo">' + opts(Object.keys(TIPOS), 'operativo', TIPOS) + '</select></label>' +
        '<label>Responsable<input data-c="responsable" placeholder="Cargo o persona"></label>' +
        '<label>Probabilidad (1–5)' + n15('probabilidad', 3) + '</label><label>Impacto (1–5)' + n15('impacto', 3) + '</label>' +
        '<label class="c3">Tratamiento<input data-c="tratamiento" placeholder="Evitar, reducir, transferir o aceptar: cómo"></label>' +
        '<div style="display:flex;justify-content:flex-end"><button class="qbg-b p" data-acc="nuevo">Agregar riesgo</button></div></div><span class="qbg-msg"></span></div>' : '') +
      (d.riesgos_proyectos.length ? '<details class="qbg-caja"><summary>Riesgos abiertos de los proyectos (' + d.riesgos_proyectos.length + ')</summary><div class="qbg-tabla"><table><thead><tr><th>Proyecto</th><th>Riesgo</th><th>Nivel</th><th>Tratamiento</th></tr></thead><tbody>' + d.riesgos_proyectos.map(function (r) { return '<tr><td>' + esc(r.proyecto) + '</td><td>' + esc(r.riesgo) + '</td><td>' + nivel(r) + '</td><td>' + esc(r.tratamiento || 'Sin tratamiento') + '</td></tr>'; }).join('') + '</tbody></table></div></details>' : '') +
      '</section>' +

      /* ---- Revisión ---- */
      '<section class="qbg-panel' + (tab === 'revision' ? ' on' : '') + '" data-panel="revision">' +
      '<div class="qbg-caja"><div class="qbg-cab"><div><h3>Revisión por la dirección</h3><p class="qbg-sub">ISO/IEC 27001 9.3 · ISO 9001 9.3. Al menos una al año. La preparan ADG o GG; la emite ADG y la aprueba otra persona de ADG.</p></div>' +
      (p.revision ? '<div class="qbg-fila"><input type="number" data-c="anio" value="' + new Date().getFullYear() + '" min="2020" style="width:96px" aria-label="Año"><button class="qbg-b p" data-acc="crear">Nueva revisión</button></div>' : '') + '</div><span class="qbg-msg"></span></div>' +
      (d.revisiones.length ? d.revisiones.map(function (r) { return revisionHtml(r, p); }).join('') : '<div class="qbg-vacio">Todavía no hay revisiones. Al crear una, el sistema reúne solo los datos del año: riesgos, auditorías, incidentes, soporte, cambios y cobros.</div>') +
      '</section>' +

      /* ---- Normas ---- */
      '<section class="qbg-panel' + (tab === 'normas' ? ' on' : '') + '" data-panel="normas"><div class="qbg-normas">' +
      (d.normas || []).map(function (n) {
        var e = n.estado || (n.aplica ? 'aplica' : 'no');
        return '<article class="qbg-norma ' + e + '"><div class="qbg-cab"><h4>' + esc(n.norma) + '</h4><span class="qbg-chip ' + (e === 'aplica' ? 'b' : e === 'guia' ? 'm' : '') + '">' + EST[e] + '</span></div><p>' + esc(n.para) + '</p>' +
          '<p class="r"><b>' + esc(n.area) + '</b><br>' + esc(n.cargo) + '</p>' + (n.motivo ? '<p class="m">' + esc(n.motivo) + '</p>' : '') + '</article>';
      }).join('') + '</div></section></div>';

    var val = function (cont, c) { var x = cont.querySelector('[data-c="' + c + '"]'); return x ? x.value : undefined; };
    function correr(boton, promesa, ok) {
      var m = boton.closest('.qbg-caja,section').querySelector('.qbg-msg');
      boton.disabled = true;
      promesa.then(function (nd) { pintar(el, op, nd, ok); }).catch(function (e) { boton.disabled = false; if (m) { m.className = 'qbg-msg qbg-err'; m.textContent = e.message; } });
    }
    function datosRev(c) {
      return { conclusiones: val(c, 'conclusiones'), decisiones: [].map.call(c.querySelectorAll('[data-dec]'), function (f) { return { decision: val(f, 'decision'), area: val(f, 'area'), fecha_limite: val(f, 'fecha_limite') }; }) };
    }
    el.querySelector('.qbg').addEventListener('click', function (ev) {
      var tb = ev.target.closest('[data-tab]');
      if (tb) {
        op._tab = tb.getAttribute('data-tab');
        [].forEach.call(el.querySelectorAll('[data-tab]'), function (x) { x.classList.toggle('on', x === tb); });
        [].forEach.call(el.querySelectorAll('[data-panel]'), function (x) { x.classList.toggle('on', x.getAttribute('data-panel') === op._tab); });
        return;
      }
      var b = ev.target.closest('[data-acc]'); if (!b) return;
      var a = b.getAttribute('data-acc');
      if (a === 'nuevo') { var f = b.closest('[data-nuevo]'); return correr(b, pedir(op, 'POST', '/riesgos', { riesgo: val(f, 'riesgo'), area: val(f, 'area'), tipo: val(f, 'tipo'), probabilidad: val(f, 'probabilidad'), impacto: val(f, 'impacto'), tratamiento: val(f, 'tratamiento'), responsable: val(f, 'responsable') }), 'Riesgo agregado.'); }
      if (a === 'riesgo') { var t = b.closest('[data-r]'); return correr(b, pedir(op, 'PUT', '/riesgos/' + encodeURIComponent(t.getAttribute('data-r')), { probabilidad: val(t, 'probabilidad'), impacto: val(t, 'impacto'), tratamiento: val(t, 'tratamiento'), estado: val(t, 'estado') }), 'Riesgo actualizado.'); }
      if (a === 'crear') return correr(b, pedir(op, 'POST', '/revisiones', { anio: val(b.parentNode, 'anio') }), 'Revisión creada con los datos del año.');
      var c = b.closest('[data-rev]'); if (!c) return;
      var id = encodeURIComponent(c.getAttribute('data-rev'));
      if (a === 'mas') { c.querySelector('[data-decs]').insertAdjacentHTML('beforeend', filaDec({})); return; }
      if (a === 'guardar' || a === 'refrescar') { var d2 = datosRev(c); d2.actualizar_entradas = a === 'refrescar'; return correr(b, pedir(op, 'PUT', '/revisiones/' + id, d2), a === 'refrescar' ? 'Revisión guardada con los datos al día.' : 'Revisión guardada.'); }
      if (a === 'emitir') {
        if (!confirm('¿Emitir la revisión por la dirección? Se genera el informe ADG-INF y ya no se podrá editar.')) return;
        return correr(b, pedir(op, 'PUT', '/revisiones/' + id, datosRev(c)).then(function () { return pedir(op, 'POST', '/revisiones/' + id + '/emitir', {}); }), 'Revisión emitida: queda en la bandeja de ADG para su aprobación.');
      }
    });
  }
  function render(el, op) {
    estilos(); op = op || {};
    el.innerHTML = '<div class="qbg"><p class="qbg-sub">Cargando el sistema de gestión…</p></div>';
    return pedir(op, 'GET', '/').then(function (d) { pintar(el, op, d); }).catch(function (e) { el.innerHTML = '<div class="qbg"><p class="qbg-err">' + esc(e.message) + '</p></div>'; });
  }
  window.qbSgi = { render: render };
  try { document.dispatchEvent(new CustomEvent('qb-sgi-listo')); } catch (e) { /* navegadores antiguos */ }
})();
