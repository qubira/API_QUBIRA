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
  var TIPOS = ['estrategico', 'operativo', 'seguridad', 'legal', 'financiero', 'tecnologico', 'personas'];
  var EST = { aplica: 'Aplica', guia: 'Guía', no: 'Por ahora no' };
  var CSS = [
    '.qbg{--g-borde:rgba(127,127,140,.28);--g-suave:rgba(127,127,140,.07);--g-tenue:rgba(127,127,140,.95);--g-acento:#5b4fe0;--g-ok:#0f8f6e;--g-mal:#c0392b;--g-med:#b7791f;color:inherit;font-size:14px;line-height:1.5;display:grid;gap:14px;min-width:0}',
    '.qbg *{box-sizing:border-box}.qbg h3{margin:0;font-size:17px}.qbg h4{margin:0;font-size:14.5px}.qbg p{margin:0}.qbg button,.qbg input,.qbg select,.qbg textarea{font:inherit;color:inherit}',
    '.qbg-sub{color:var(--g-tenue);font-size:13px}.qbg-caja{border:1px solid var(--g-borde);border-radius:12px;padding:14px;display:grid;gap:10px;min-width:0}',
    '.qbg-fila{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}.qbg-tabla{overflow-x:auto}.qbg table{border-collapse:collapse;width:100%;font-size:13px}.qbg th,.qbg td{border-bottom:1px solid var(--g-borde);padding:6px 8px;text-align:left;vertical-align:top}',
    '.qbg-chip{font-size:11px;font-weight:700;line-height:18px;padding:0 7px;border-radius:999px;border:1px solid var(--g-borde);white-space:nowrap}.qbg-chip.a{color:var(--g-mal);border-color:var(--g-mal)}.qbg-chip.m{color:var(--g-med);border-color:var(--g-med)}.qbg-chip.b{color:var(--g-ok);border-color:var(--g-ok)}',
    '.qbg-b{border:1px solid var(--g-borde);background:transparent;border-radius:8px;padding:5px 11px;cursor:pointer}.qbg-b.p{background:var(--g-acento);border-color:var(--g-acento);color:#fff}',
    '.qbg input,.qbg select,.qbg textarea{border:1px solid var(--g-borde);border-radius:8px;padding:5px 8px;background:transparent;max-width:100%}.qbg textarea{width:100%;min-height:70px}',
    '.qbg-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.qbg-kpi{background:var(--g-suave);border-radius:10px;padding:8px 10px}.qbg-kpi b{display:block;font-size:20px}',
    '.qbg-alerta{border:1px solid var(--g-mal);color:var(--g-mal);border-radius:10px;padding:8px 12px;font-weight:600}.qbg-err{color:var(--g-mal);font-size:13px}.qbg-ok{color:var(--g-ok);font-size:13px;font-weight:600}',
  ].join('');
  function estilos() { if (document.getElementById('qbg-estilos')) return; var st = document.createElement('style'); st.id = 'qbg-estilos'; st.textContent = CSS; document.head.appendChild(st); }
  function pedir(op, metodo, ruta, cuerpo) {
    var t = op.token ? op.token() : null;
    return fetch(API + '/api/sgi' + ruta, { method: metodo, cache: 'no-store', headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}), body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401) throw new Error('Tu sesión venció.'); if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo completar la operación.'); return j.data; }); });
  }
  function nivel(r) { var n = r.probabilidad * r.impacto; return '<span class="qbg-chip ' + (n >= 15 ? 'a' : n >= 8 ? 'm' : 'b') + '">' + n + (n >= 15 ? ' alto' : n >= 8 ? ' medio' : ' bajo') + '</span>'; }
  var opts = function (lista, sel, etq) { return lista.map(function (x) { return '<option value="' + x + '"' + (x === sel ? ' selected' : '') + '>' + esc(etq ? etq[x] || x : x) + '</option>'; }).join(''); };
  var n15 = function (nombre, v) { return '<select data-c="' + nombre + '">' + [1, 2, 3, 4, 5].map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>'; };

  function entradasHtml(e) {
    if (!e || !e.anio) return '';
    var k = function (t, v) { return '<div class="qbg-kpi"><span class="qbg-sub">' + esc(t) + '</span><b>' + esc(v) + '</b></div>'; };
    var h = e.auditorias.hallazgos_abiertos || {};
    return '<div class="qbg-kpis">' + k('Proyectos en el flujo', e.proyectos.total) + k('Riesgos altos abiertos', e.riesgos.altos_abiertos) + k('Riesgos de proyectos', e.riesgos.proyectos_abiertos) + k('Riesgos corporativos', e.riesgos.corporativos_abiertos) +
      k('Actas de auditoría', e.auditorias.actas) + k('Hallazgos abiertos (crít./alto)', (h.critico || 0) + ' / ' + (h.alto || 0)) + k('Incidentes de seguridad', e.seguridad.incidentes) + k('Con datos personales', e.seguridad.con_datos_personales) +
      k('Casos de soporte', e.soporte.casos) + k('Escalados a OTI', e.soporte.escalados_oti) + k('Cambios de alcance aprobados', e.cambios_alcance.aprobados) + k('Facturas por cobrar', e.cobros.por_cobrar) + k('Documentos en ruta', e.documentos_en_ruta) + '</div>' +
      '<p class="qbg-sub">Datos reunidos solos el ' + esc(String(e.generado || '').slice(0, 10)) + '.</p>';
  }
  function revisionHtml(r, p) {
    var borr = r.estado === 'borrador' && p.revision;
    var dec = (r.decisiones || []);
    return '<div class="qbg-caja" data-rev="' + esc(r.id) + '"><div class="qbg-fila"><h4>Revisión ' + r.anio + '</h4><span class="qbg-chip' + (r.estado === 'emitida' ? ' b' : ' m') + '">' + (r.estado === 'emitida' ? 'Emitida ' + esc(r.codigo || '') : 'Borrador') + '</span><span class="qbg-sub">' + esc(r.fecha) + ' · ' + esc(r.creado_por || '') + '</span></div>' +
      entradasHtml(r.entradas) +
      (borr ? '<label class="qbg-sub">Conclusiones de la dirección</label><textarea data-c="conclusiones">' + esc(r.conclusiones || '') + '</textarea>' +
        '<h4>Decisiones</h4><div data-decs="1">' + dec.concat([{}]).map(function (d) { return '<div class="qbg-fila" data-dec="1"><input data-c="decision" placeholder="Decisión" style="flex:1;min-width:220px" value="' + esc(d.decision || '') + '"><select data-c="area"><option value="">Área</option>' + opts(AREAS, d.area) + '</select><input type="date" data-c="fecha_limite" value="' + esc(d.fecha_limite || '') + '"></div>'; }).join('') + '</div>' +
        '<div class="qbg-fila"><button class="qbg-b" data-acc="mas">+ Decisión</button><button class="qbg-b" data-acc="guardar">Guardar</button><button class="qbg-b" data-acc="refrescar">Guardar y actualizar datos</button>' + (p.emitir ? '<button class="qbg-b p" data-acc="emitir">Emitir (informe ADG-INF)</button>' : '') + '</div>'
        : (r.conclusiones ? '<p><b>Conclusiones:</b> ' + esc(r.conclusiones) + '</p>' : '') + (dec.length ? '<ul>' + dec.map(function (d) { return '<li>' + esc(d.decision) + (d.area ? ' · <b>' + esc(d.area) + '</b>' : '') + (d.fecha_limite ? ' · hasta ' + esc(d.fecha_limite) : '') + '</li>'; }).join('') + '</ul>' : '')) +
      '<span class="qbg-msg"></span></div>';
  }

  function pintar(el, op, d, msg) {
    var p = d.permisos;
    var puedeAlguno = p.riesgos_todos || p.riesgos_area;
    var areasAlta = p.riesgos_todos ? AREAS : [p.riesgos_area];
    el.innerHTML = '<div class="qbg">' +
      (d.revision_vencida ? '<div class="qbg-alerta">' + (d.ultima_revision ? 'La última revisión por la dirección es del ' + esc(d.ultima_revision) + ': ya pasó un año.' : 'Aún no hay una revisión por la dirección emitida.') + ' ISO/IEC 27001 pide al menos una al año.</div>' : '') +
      (msg ? '<p class="qbg-ok">' + esc(msg) + '</p>' : '') +
      '<section class="qbg-caja"><div><h3>Mapa de riesgos de la empresa</h3><p class="qbg-sub">ISO 31000 · ISO/IEC 27005. Cada jefe es dueño de los riesgos de su área; DST (Coordinador de Riesgos) consolida. Nivel = probabilidad × impacto (alto ≥ 15).</p></div>' +
      '<div class="qbg-tabla"><table><thead><tr><th>Riesgo</th><th>Área</th><th>Tipo</th><th>P</th><th>I</th><th>Nivel</th><th>Tratamiento</th><th>Estado</th>' + (puedeAlguno ? '<th></th>' : '') + '</tr></thead><tbody>' +
      (d.riesgos.length ? d.riesgos.map(function (r) {
        var ed = p.riesgos_todos || p.riesgos_area === r.area;
        return '<tr data-r="' + esc(r.id) + '"><td>' + esc(r.riesgo) + (r.responsable ? '<br><small class="qbg-sub">' + esc(r.responsable) + '</small>' : '') + '</td><td>' + esc(r.area) + '</td><td>' + esc(r.tipo) + '</td>' +
          (ed ? '<td>' + n15('probabilidad', r.probabilidad) + '</td><td>' + n15('impacto', r.impacto) + '</td><td>' + nivel(r) + '</td><td><textarea data-c="tratamiento" style="min-height:40px">' + esc(r.tratamiento || '') + '</textarea></td><td><select data-c="estado">' + opts(['abierto', 'mitigado', 'cerrado'], r.estado) + '</select></td><td><button class="qbg-b" data-acc="riesgo">Guardar</button></td>'
            : '<td>' + r.probabilidad + '</td><td>' + r.impacto + '</td><td>' + nivel(r) + '</td><td>' + esc(r.tratamiento || '—') + '</td><td>' + esc(r.estado) + '</td>' + (puedeAlguno ? '<td></td>' : '')) + '</tr>';
      }).join('') : '<tr><td colspan="9" class="qbg-sub">Sin riesgos corporativos registrados.</td></tr>') + '</tbody></table></div>' +
      (puedeAlguno ? '<div class="qbg-fila" data-nuevo="1"><input data-c="riesgo" placeholder="Nuevo riesgo" style="flex:1;min-width:220px"><select data-c="area">' + opts(areasAlta) + '</select><select data-c="tipo">' + opts(TIPOS) + '</select>P ' + n15('probabilidad', 3) + ' I ' + n15('impacto', 3) + '<input data-c="tratamiento" placeholder="Tratamiento"><input data-c="responsable" placeholder="Responsable"><button class="qbg-b p" data-acc="nuevo">Agregar</button></div>' : '') +
      (d.riesgos_proyectos.length ? '<details><summary>Riesgos abiertos de los proyectos (' + d.riesgos_proyectos.length + ')</summary><div class="qbg-tabla"><table><tbody>' + d.riesgos_proyectos.map(function (r) { return '<tr><td>' + esc(r.proyecto) + '</td><td>' + esc(r.riesgo) + '</td><td>' + nivel(r) + '</td><td>' + esc(r.tratamiento || 'Sin tratamiento') + '</td></tr>'; }).join('') + '</tbody></table></div></details>' : '') +
      '<span class="qbg-msg"></span></section>' +
      '<section class="qbg-caja"><div><h3>Revisión por la dirección</h3><p class="qbg-sub">ISO/IEC 27001 9.3 · ISO 9001 9.3. Una vez al año como mínimo. La preparan ADG o GG; la emite ADG y la aprueba otra persona de ADG.</p></div>' +
      (p.revision ? '<div class="qbg-fila"><input type="number" data-c="anio" value="' + new Date().getFullYear() + '" style="width:90px"><button class="qbg-b p" data-acc="crear">Nueva revisión</button></div>' : '') +
      (d.revisiones.length ? d.revisiones.map(function (r) { return revisionHtml(r, p); }).join('') : '<p class="qbg-sub">Todavía no hay revisiones.</p>') + '<span class="qbg-msg"></span></section>' +
      '<section class="qbg-caja"><div><h3>Normas ISO de QUBIRA</h3><p class="qbg-sub">Decisión de la dirección sobre cada norma, con su área y cargo responsable.</p></div><div class="qbg-tabla"><table><thead><tr><th>Norma</th><th>Estado</th><th>Para qué</th><th>Responsable</th><th>Motivo</th></tr></thead><tbody>' +
      (d.normas || []).map(function (n) { var e = n.estado || (n.aplica ? 'aplica' : 'no'); return '<tr><td><b>' + esc(n.norma) + '</b></td><td><span class="qbg-chip ' + (e === 'aplica' ? 'b' : e === 'guia' ? 'm' : '') + '">' + EST[e] + '</span></td><td>' + esc(n.para) + '</td><td>' + esc(n.area) + '<br><small class="qbg-sub">' + esc(n.cargo) + '</small></td><td>' + esc(n.motivo || '') + '</td></tr>'; }).join('') +
      '</tbody></table></div></section></div>';

    var val = function (cont, c) { var x = cont.querySelector('[data-c="' + c + '"]'); return x ? x.value : undefined; };
    function correr(boton, promesa, ok) {
      var m = boton.closest('section,.qbg-caja').querySelector('.qbg-msg');
      boton.disabled = true;
      promesa.then(function (nd) { pintar(el, op, nd, ok); }).catch(function (e) { boton.disabled = false; if (m) { m.className = 'qbg-msg qbg-err'; m.textContent = e.message; } });
    }
    function datosRev(c) {
      return { conclusiones: val(c, 'conclusiones'), decisiones: [].map.call(c.querySelectorAll('[data-dec]'), function (f) { return { decision: val(f, 'decision'), area: val(f, 'area'), fecha_limite: val(f, 'fecha_limite') }; }) };
    }
    el.querySelector('.qbg').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-acc]'); if (!b) return;
      var a = b.getAttribute('data-acc');
      if (a === 'nuevo') { var f = b.closest('[data-nuevo]'); return correr(b, pedir(op, 'POST', '/riesgos', { riesgo: val(f, 'riesgo'), area: val(f, 'area'), tipo: val(f, 'tipo'), probabilidad: val(f, 'probabilidad'), impacto: val(f, 'impacto'), tratamiento: val(f, 'tratamiento'), responsable: val(f, 'responsable') }), 'Riesgo agregado.'); }
      if (a === 'riesgo') { var t = b.closest('[data-r]'); return correr(b, pedir(op, 'PUT', '/riesgos/' + encodeURIComponent(t.getAttribute('data-r')), { probabilidad: val(t, 'probabilidad'), impacto: val(t, 'impacto'), tratamiento: val(t, 'tratamiento'), estado: val(t, 'estado') }), 'Riesgo actualizado.'); }
      if (a === 'crear') return correr(b, pedir(op, 'POST', '/revisiones', { anio: val(b.parentNode, 'anio') }), 'Revisión creada con los datos del año.');
      var c = b.closest('[data-rev]'); if (!c) return;
      var id = encodeURIComponent(c.getAttribute('data-rev'));
      if (a === 'mas') { var lista = c.querySelector('[data-decs]'); var nueva = lista.lastElementChild.cloneNode(true); [].forEach.call(nueva.querySelectorAll('input,select'), function (x) { x.value = ''; }); lista.appendChild(nueva); return; }
      if (a === 'guardar' || a === 'refrescar') { var d2 = datosRev(c); d2.actualizar_entradas = a === 'refrescar'; return correr(b, pedir(op, 'PUT', '/revisiones/' + id, d2), 'Revisión guardada.'); }
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
