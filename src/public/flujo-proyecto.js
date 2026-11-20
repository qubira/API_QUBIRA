/* ============================================================
   Flujo de proyectos de QUBIRA — componente compartido (lo sirve la API).
   Etapas y puertas de cada proyecto: quién aprueba, qué falta, costos con
   alerta, actas, registro de riesgos (ISO 31000) e historial.
   Uso:
     <script src="https://api-qubira.onrender.com/api/public/flujo-proyecto.js" defer></script>
     qbFlujo.lista(el, { token: fn })                 → proyectos del flujo
     qbFlujo.detalle(el, { token: fn, id: '…' })      → un proyecto
   ============================================================ */
(function () {
  'use strict';
  var SRC = (document.currentScript && document.currentScript.src) || '';
  var API = SRC.replace(/\/api\/public\/flujo-proyecto\.js.*$/, '') || 'https://api-qubira.onrender.com';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fecha = function (f) { if (!f) return ''; var d = new Date(f); return isNaN(d) ? '' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }); };
  var dinero = function (v) { return v == null || v === '' ? '—' : Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var MODAL = { venta: 'Venta', alquiler: 'Alquiler', ambos: 'Venta y alquiler', interno: 'Uso interno' };
  var RUTA = { A: 'Ruta A · producto propio', B: 'Ruta B · para un cliente' };
  var ACTA = { comision: 'Comisión de prueba (OTI-INF)', seguridad: 'Seguridad (DST-ACT)', calidad: 'Calidad de software (GG-ACT)', reglas: 'Reglas de negocio (ODACL-ACT)' };
  var TIPO_R = { negocio: 'Negocio', legal: 'Legal', seguridad: 'Seguridad', tecnico: 'Técnico', financiero: 'Financiero' };
  var AREAS = ['ADG', 'GG', 'OTI', 'OPP', 'ODACL', 'DST', 'OCOS', 'ODN', 'OCM', 'ORH'];
  var NOMBRE = { evaluacion: 'Evaluación', venta: 'Venta', apertura: 'Apertura', desarrollo: 'Desarrollo Scrum', comision: 'Comisión de prueba', especialistas: 'Reunión de especialistas', auditorias: 'Auditorías finales', precio: 'Precio', liberacion: 'Liberación', entrega: 'Entrega', postventa: 'Postventa' };
  function secuencia(ruta, mod) {
    if (ruta === 'B') return ['venta', 'apertura', 'desarrollo', 'comision', 'especialistas', 'auditorias', 'entrega', 'postventa'];
    if (mod === 'interno') return ['evaluacion', 'apertura', 'desarrollo', 'comision', 'especialistas', 'auditorias', 'entrega', 'postventa'];
    return ['evaluacion', 'apertura', 'desarrollo', 'comision', 'especialistas', 'auditorias', 'precio', 'liberacion', 'postventa'];
  }

  var CSS = [
    '.qbf{--f-borde:rgba(127,127,140,.28);--f-suave:rgba(127,127,140,.08);--f-tenue:rgba(127,127,140,.95);--f-acento:#5b4fe0;--f-ok:#0f8f6e;--f-mal:#c0392b;--f-aviso:#b45309;',
    'color:inherit;font-size:14px;line-height:1.55;display:grid;gap:16px;min-width:0}',
    '.qbf *{box-sizing:border-box}.qbf h3{margin:0;font-size:17px;font-weight:700}.qbf h4{margin:0;font-size:14.5px;font-weight:700}.qbf p{margin:0}.qbf button,.qbf input,.qbf select,.qbf textarea{font:inherit;color:inherit}',
    '.qbf-sub{color:var(--f-tenue);font-size:13px}.qbf-caja{border:1px solid var(--f-borde);border-radius:12px;padding:16px;display:grid;gap:12px;min-width:0}',
    '.qbf-fila{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}.qbf-dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:14px;align-items:start}',
    '.qbf-chip{display:inline-block;font-size:11.5px;font-weight:600;line-height:20px;padding:0 8px;border-radius:999px;border:1px solid var(--f-borde);white-space:nowrap}',
    '.qbf-chip.ac{background:var(--f-acento);border-color:var(--f-acento);color:#fff}.qbf-chip.al{color:var(--f-mal);border-color:var(--f-mal)}.qbf-chip.tt{color:var(--f-acento);border-color:var(--f-acento)}',
    '.qbf-cod{font:600 12.5px ui-monospace,Consolas,monospace;color:var(--f-acento)}',
    '.qbf-et{display:flex;flex-wrap:wrap;gap:6px}.qbf-et span{font-size:12px;font-weight:600;padding:5px 10px;border-radius:8px;border:1px solid var(--f-borde);color:var(--f-tenue)}',
    '.qbf-et span.h{color:var(--f-ok);border-color:var(--f-ok)}.qbf-et span.a{background:var(--f-acento);border-color:var(--f-acento);color:#fff}',
    '.qbf-req{list-style:none;margin:0;padding:0;display:grid;gap:5px;font-size:13.5px}.qbf-req li{display:flex;gap:8px}.qbf-req .s{color:var(--f-ok);font-weight:700}.qbf-req .n{color:var(--f-mal);font-weight:700}',
    '.qbf-b{border:1px solid var(--f-borde);background:transparent;border-radius:8px;padding:6px 13px;font-weight:600;font-size:13px;cursor:pointer}.qbf-b:hover{border-color:var(--f-acento)}.qbf-b:disabled{opacity:.5;cursor:not-allowed}',
    '.qbf-b.pri{background:var(--f-acento);border-color:var(--f-acento);color:#fff}.qbf-b.mal{color:var(--f-mal);border-color:var(--f-mal)}',
    '.qbf input,.qbf select,.qbf textarea{border:1px solid var(--f-borde);border-radius:8px;padding:6px 9px;background:transparent;min-width:0}.qbf textarea{width:100%;min-height:60px;resize:vertical}',
    '.qbf select option{color:#111}.qbf label{display:grid;gap:4px;font-size:12.5px;font-weight:600}',
    '.qbf-b:focus-visible,.qbf input:focus-visible,.qbf select:focus-visible,.qbf textarea:focus-visible,.qbf tr[data-id]:focus-visible{outline:2px solid var(--f-acento);outline-offset:2px}',
    '.qbf-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:10px;align-items:end}',
    '.qbf-err{color:var(--f-mal);font-size:13px}.qbf-ok{color:var(--f-ok);font-size:13px;font-weight:600}',
    '.qbf-alerta{border:1px solid var(--f-mal);border-radius:10px;padding:10px 12px;color:var(--f-mal);font-size:13.5px;display:grid;gap:8px}',
    '.qbf-tabla{overflow-x:auto;border:1px solid var(--f-borde);border-radius:10px}.qbf table{border-collapse:collapse;width:100%;font-size:13px;min-width:640px}',
    '.qbf th,.qbf td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--f-borde);vertical-align:top}.qbf tr:last-child td{border-bottom:0}',
    '.qbf th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--f-tenue);font-weight:600}.qbf tr[data-id]{cursor:pointer}.qbf tr[data-id]:hover td{background:var(--f-suave)}',
    '.qbf-niv{font-weight:800;font-variant-numeric:tabular-nums}.qbf-niv.r{color:var(--f-mal)}.qbf-niv.m{color:var(--f-aviso)}.qbf-niv.b{color:var(--f-ok)}',
    '.qbf-hist{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:13px;max-height:280px;overflow:auto}',
    '.qbf-cifras{display:flex;flex-wrap:wrap;gap:6px 22px}.qbf-cifras b{display:block;font-size:19px;font-weight:800;font-variant-numeric:tabular-nums}.qbf-cifras span{color:var(--f-tenue);font-size:12px}',
  ].join('');
  function estilos() { if (document.getElementById('qbf-estilos')) return; var st = document.createElement('style'); st.id = 'qbf-estilos'; st.textContent = CSS; document.head.appendChild(st); }

  function pedir(op, metodo, ruta, cuerpo) {
    var t = op.token ? op.token() : null;
    return fetch(API + '/api/proyecto-flujo' + ruta, {
      method: metodo, cache: 'no-store',
      headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}),
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
        if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo completar la operación. Inténtalo de nuevo.');
        return j.data;
      });
    });
  }
  var v = function (el, sel) { var x = el.querySelector(sel); return x ? x.value : ''; };

  /* ─── Lista ─── */
  function lista(el, op) {
    if (!el) return; op = op || {}; estilos();
    var filtro = op._filtro || 'todos';
    el.innerHTML = '<div class="qbf"><p class="qbf-sub">Cargando los proyectos…</p></div>';
    Promise.all([pedir(op, 'GET', filtro === 'anteriores' ? '/?anteriores=1' : '/'), pedir(op, 'GET', '/config').catch(function () { return {}; })]).then(function (res) {
      var ps = res[0], cfg = res[1] || {};
      var mios = ps.filter(function (p) { return p.puedo_aprobar; });
      var ver = filtro === 'mios' ? mios : ps;
      el.innerHTML = '<div class="qbf">' +
        '<div class="qbf-fila" style="justify-content:space-between"><div><h3>Flujo de proyectos</h3><p class="qbf-sub">Cada proyecto avanza de etapa solo cuando quien corresponde aprueba su puerta.</p></div>' +
        '<div class="qbf-fila">' + [['mios', 'Me toca aprobar (' + mios.length + ')'], ['todos', 'En el flujo'], ['anteriores', 'Anteriores al flujo']].map(function (f) {
          return '<button type="button" class="qbf-b' + (filtro === f[0] ? ' pri' : '') + '" data-filtro="' + f[0] + '">' + esc(f[1]) + '</button>'; }).join('') + '</div></div>' +
        (ver.length ? '<div class="qbf-tabla"><table><thead><tr><th>Código</th><th>Proyecto</th><th>Ruta</th><th>Etapa</th><th>Pendiente</th></tr></thead><tbody>' +
          ver.map(function (p) {
            return '<tr data-id="' + esc(p.id) + '" tabindex="0"><td><span class="qbf-cod">' + esc(p.code) + '</span></td><td><b>' + esc(p.name) + '</b><div class="qbf-sub">' + esc(p.client || '') + '</div></td>' +
              '<td>' + (p.ruta ? esc(p.ruta) + (p.modalidad ? ' · ' + esc(MODAL[p.modalidad]) : '') : '—') + '</td>' +
              '<td>' + (p.etapa ? '<span class="qbf-chip ac">' + esc(p.etapa_nombre) + '</span>' : '<span class="qbf-chip">Sin flujo</span>') + (p.costo && p.costo.activa ? ' <span class="qbf-chip al">Exceso de costo</span>' : '') + '</td>' +
              '<td>' + (p.puedo_aprobar ? '<span class="qbf-chip tt">Te toca</span> ' : '') + '<span class="qbf-sub">' + esc(p.pendiente || (p.etapa ? 'Etapa final' : 'Incorporar al flujo')) + '</span></td></tr>';
          }).join('') + '</tbody></table></div>'
          : '<div class="qbf-caja"><p class="qbf-sub">' + (filtro === 'mios' ? 'No tienes puertas por aprobar.' : filtro === 'anteriores' ? 'No hay proyectos anteriores al flujo.' : 'Todavía no hay proyectos en el flujo. Los proyectos nuevos entran solos; los anteriores se incorporan desde «Anteriores al flujo».') + '</p></div>') +
        (cfg.puedo_config ? '<details class="qbf-caja"><summary style="cursor:pointer;font-weight:700">Configuración del flujo (ADG)</summary>' +
          '<div class="qbf-form" style="margin-top:10px"><label>Alerta de exceso de costo (%)<input data-c="cfg_pct" type="number" min="0" max="100" value="' + esc(cfg.alerta_pct) + '"></label>' +
          '<label>Venta grande desde (vacío = desactivada)<input data-c="cfg_vg" type="number" min="0" step="0.01" value="' + esc(cfg.venta_grande == null ? '' : cfg.venta_grande) + '"></label>' +
          '<label>Moneda del monto<select data-c="cfg_mon"><option' + (cfg.venta_grande_moneda !== 'PEN' ? ' selected' : '') + '>USD</option><option' + (cfg.venta_grande_moneda === 'PEN' ? ' selected' : '') + '>PEN</option></select></label>' +
          '<button type="button" class="qbf-b pri" data-cfg="1">Guardar configuración</button></div>' +
          '<p class="qbf-sub" style="margin-top:8px">Una proforma con total igual o mayor que la venta grande la aprueba también ADG (Director Comercial), después de GG.</p><div data-msg="cfg"></div></details>' : '') +
        '</div>';
      var bc = el.querySelector('[data-cfg]');
      if (bc) bc.addEventListener('click', function () {
        bc.disabled = true;
        pedir(op, 'PUT', '/config', { alerta_pct: v(el, '[data-c="cfg_pct"]'), venta_grande: v(el, '[data-c="cfg_vg"]') === '' ? null : v(el, '[data-c="cfg_vg"]'), venta_grande_moneda: v(el, '[data-c="cfg_mon"]') })
          .then(function () { el.querySelector('[data-msg="cfg"]').innerHTML = '<p class="qbf-ok">Configuración guardada.</p>'; bc.disabled = false; })
          .catch(function (e) { el.querySelector('[data-msg="cfg"]').innerHTML = '<p class="qbf-err">' + esc(e.message) + '</p>'; bc.disabled = false; });
      });
      el.querySelectorAll('[data-filtro]').forEach(function (b) { b.addEventListener('click', function () { op._filtro = b.dataset.filtro; lista(el, op); }); });
      el.querySelectorAll('tr[data-id]').forEach(function (tr) {
        var abrir = function () { detalle(el, Object.assign({}, op, { id: tr.dataset.id, volver: function () { lista(el, op); } })); };
        tr.addEventListener('click', abrir);
        tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
      });
    }).catch(function (e) { el.innerHTML = '<div class="qbf"><p class="qbf-err">' + esc(e.message) + '</p></div>'; });
  }

  /* ─── Detalle ─── */
  function detalle(el, op) {
    if (!el || !op || !op.id) return; estilos();
    el.innerHTML = '<div class="qbf"><p class="qbf-sub">Cargando el flujo del proyecto…</p></div>';
    pedir(op, 'GET', '/' + encodeURIComponent(op.id)).then(function (p) { pintar(el, op, p); })
      .catch(function (e) { el.innerHTML = '<div class="qbf"><p class="qbf-err">' + esc(e.message) + '</p></div>'; });
  }

  function puerta(p) {
    if (!p.etapa) return '';
    var seq = p.secuencia.map(function (s) { return s.clave; }), i = seq.indexOf(p.etapa), sig = seq[i + 1];
    var campos = '';
    if (p.etapa === 'evaluacion') campos = '<label>Modalidad<select data-c="modalidad"><option value="">Elige…</option>' + ['venta', 'alquiler', 'ambos', 'interno'].map(function (m) { return '<option value="' + m + '"' + (p.modalidad === m ? ' selected' : '') + '>' + MODAL[m] + '</option>'; }).join('') + '</select></label>' +
      '<label>Presupuesto máximo<input data-c="presupuesto_max" type="number" min="0" step="0.01" value="' + esc(p.presupuesto_max || '') + '"></label>';
    if (p.etapa === 'venta') campos = '<label>Código del contrato<input data-c="contrato_codigo" placeholder="ODN-CTR-AAAA-NNN" value="' + esc(p.contrato_codigo || '') + '"></label>';
    if (p.etapa === 'apertura') campos = '<label>Plazo de entrega<input data-c="end_date" type="date" value="' + esc(String(p.end_date || '').slice(0, 10)) + '"></label>';
    if (p.etapa === 'entrega') campos = '<label>Acta de conformidad (código o referencia)<input data-c="acta_conformidad" placeholder="ODACL-FMT-03 firmada el …" value="' + esc(p.acta_conformidad || '') + '"></label>' +
      (p.puedo_acta ? '<label>Archivo del acta firmada (PDF, PNG o JPG, máx. 10 MB)<input data-c="acta_archivo" type="file" accept="application/pdf,image/png,image/jpeg"></label><button type="button" class="qbf-b" data-subir-acta="1">Subir archivo</button>' : '');
    var faltan = p.requisitos.filter(function (r) { return !r.ok; }).length;
    return '<section class="qbf-caja"><div><h4>Puerta actual: ' + esc(NOMBRE[p.etapa]) + (sig ? ' → ' + esc(NOMBRE[sig]) : '') + '</h4>' +
      (p.pendiente ? '<p class="qbf-sub">La aprueba: ' + esc(p.pendiente) + '.</p>' : '<p class="qbf-sub">Etapa final del flujo.</p>') +
      (p.titular ? '<p class="qbf-sub">Titular: <b>' + esc(p.titular.cargo) + '</b>' + (p.titular.cubierto ? '' : ' (cargo sin persona asignada' + (p.titular.suplente ? '; mientras se cubre actúa: <b>' + esc(p.titular.suplente) + '</b>' : '; actúa quien corresponda por área y nivel') + ')') + '</p>' : '') + '</div>' +
      (p.acta_archivo ? '<p class="qbf-sub">Acta firmada: ' + esc(p.acta_archivo.nombre) + ' · subió ' + esc(p.acta_archivo.subido_por || '') + ' <button type="button" class="qbf-b" data-ver-acta="1">Ver acta</button></p>' : '') +
      (p.requisitos.length ? '<ul class="qbf-req">' + p.requisitos.map(function (r) { return '<li><span class="' + (r.ok ? 's' : 'n') + '">' + (r.ok ? '✓' : '✗') + '</span>' + esc(r.texto) + '</li>'; }).join('') + '</ul>' : '') +
      (sig && (p.puedo_aprobar || p.puedo_devolver) ? (campos ? '<div class="qbf-form">' + campos + '</div>' : '') +
        '<label>Comentario' + (p.etapa === 'especialistas' ? ' (resumen de la reunión)' : '') + '<textarea data-c="comentario"></textarea></label>' +
        '<div class="qbf-fila">' + (p.puedo_aprobar ? '<button type="button" class="qbf-b pri" data-accion="avanzar">Aprobar puerta y pasar a ' + esc(NOMBRE[sig]) + '</button>' : '') +
        (p.puedo_devolver ? '<button type="button" class="qbf-b mal" data-accion="devolver">Devolver a OTI</button>' : '') + '</div>' +
        (p.puedo_aprobar && faltan ? '<p class="qbf-sub">Al aprobar se vuelven a revisar los requisitos; los marcados con ✗ deben cumplirse.</p>' : '')
        : (sig ? '<p class="qbf-sub">No te toca aprobar esta puerta.</p>' : '')) +
      '<div data-msg="puerta"></div></section>';
  }

  function costos(p) {
    var c = p.costo || {};
    return '<section class="qbf-caja"><h4>Presupuesto y costo</h4>' +
      '<div class="qbf-cifras"><div><b>' + dinero(c.presupuesto_max) + '</b><span>presupuesto máximo</span></div><div><b>' + dinero(c.costo_real) + '</b><span>costo real (OPP)</span></div>' +
      '<div><b>' + dinero(c.limite) + '</b><span>límite (+' + esc(c.pct) + ' %)</span></div></div>' +
      (c.activa ? '<div class="qbf-alerta"><b>Exceso de costo: el costo real supera el presupuesto máximo en más de ' + esc(c.pct) + ' %.</b><span>El proyecto no avanza hasta que GG o ADG decidan si continúa o se detiene.</span>' +
        (p.puedo_exceso ? '<label>Motivo de la decisión<textarea data-c="exceso_comentario"></textarea></label><div class="qbf-fila"><button type="button" class="qbf-b pri" data-exceso="continuar">Continuar con el nuevo costo</button><button type="button" class="qbf-b mal" data-exceso="detener">Detener (pausar el proyecto)</button></div>' : '') + '</div>' : '') +
      ((p.puedo_costo || p.puedo_presupuesto) ? '<div class="qbf-form">' + (p.puedo_costo ? '<label>Costo real a la fecha<input data-c="costo_real" type="number" min="0" step="0.01" value="' + esc(c.costo_real || '') + '"></label>' : '') +
        (p.puedo_presupuesto && p.etapa !== 'evaluacion' ? '<label>Presupuesto máximo<input data-c="presupuesto_edit" type="number" min="0" step="0.01" value="' + esc(c.presupuesto_max || '') + '"></label>' : '') +
        '<button type="button" class="qbf-b" data-accion="costos">Guardar</button></div>' : '') +
      '<div data-msg="costos"></div></section>';
  }

  function actas(p) {
    return '<section class="qbf-caja"><h4>Actas del proyecto</h4><ul class="qbf-req">' + ['comision', 'seguridad', 'calidad', 'reglas'].map(function (k) {
      var a = p.actas && p.actas[k];
      return '<li><span class="' + (a && a.aprobada ? 's' : 'n') + '">' + (a && a.aprobada ? '✓' : '○') + '</span><span>' + esc(ACTA[k]) + ': ' +
        (a ? '<span class="qbf-cod">' + esc(a.codigo) + '</span> · ' + esc(a.aprobada ? 'aprobada' : (a.doc_estado || a.estado || '').toLowerCase().replace('_', ' ')) : '<span class="qbf-sub">sin acta todavía</span>') + '</span></li>';
    }).join('') + '</ul>' +
      (p.ruta === 'B' ? '<p class="qbf-sub">Contrato: ' + (p.contrato ? '<span class="qbf-cod">' + esc(p.contrato.codigo) + '</span> · ' + esc(p.contrato.estado ? p.contrato.estado.toLowerCase() : 'no está en el registro') : 'sin registrar') + '</p>' : '') +
      '<p class="qbf-sub">Las actas se crean en la sección Calidad (ADG, GG u OTI) y se aprueban en «Pendientes» del área que audita.</p></section>';
  }

  function traspaso(p) {
    var t = p.traspaso;
    if (!t && !p.puedo_entregar_traspaso) return '';
    var estado = t && t.recibido_en ? '<span class="qbf-chip" style="color:var(--f-ok);border-color:var(--f-ok)">Recibido por OCOS</span>' : t && t.entregado_en ? '<span class="qbf-chip tt">Entregado, falta que OCOS lo reciba</span>' : '<span class="qbf-chip al">Pendiente de OTI</span>';
    return '<section class="qbf-caja"><div class="qbf-fila" style="justify-content:space-between"><h4>Traspaso de OTI a OCOS</h4>' + estado + '</div>' +
      '<p class="qbf-sub">Sin el traspaso recibido no se libera ni se entrega el producto: OCOS necesita el manual, los accesos y la guía para dar soporte.</p>' +
      (t && t.observacion ? '<p class="qbf-err">Observación de OCOS: ' + esc(t.observacion) + '</p>' : '') +
      (t && t.entregado_en ? '<ul class="qbf-req"><li><b>Manual:</b>&nbsp;' + esc(t.manual) + '</li><li><b>Accesos:</b>&nbsp;' + esc(t.accesos) + '</li><li><b>Guía de soporte:</b>&nbsp;' + esc(t.guia) + '</li></ul>' +
        '<p class="qbf-sub">Entregó ' + esc(t.entregado_por || '') + ' · ' + esc(fecha(t.entregado_en)) + (t.recibido_en ? ' · recibió ' + esc(t.recibido_por || '') + ' · ' + esc(fecha(t.recibido_en)) : '') + '</p>' : '') +
      (p.puedo_entregar_traspaso && !(t && t.entregado_en) ? '<div class="qbf-form"><label style="grid-column:1/-1">Manual de usuario (enlace o ubicación)<input data-c="t_manual" value="' + esc(t && t.manual || '') + '"></label>' +
        '<label style="grid-column:1/-1">Accesos: cómo y a quién se entregan (no escribas contraseñas)<input data-c="t_accesos" value="' + esc(t && t.accesos || '') + '"></label>' +
        '<label style="grid-column:1/-1">Guía de soporte (errores conocidos, contactos de OTI)<input data-c="t_guia" value="' + esc(t && t.guia || '') + '"></label>' +
        '<button type="button" class="qbf-b pri" data-traspaso="entregar">Entregar a OCOS</button></div>' : '') +
      (p.puedo_recibir_traspaso ? '<label>Comentario (obligatorio si lo observas)<textarea data-c="t_com"></textarea></label><div class="qbf-fila"><button type="button" class="qbf-b pri" data-traspaso="recibir">Recibir el traspaso</button><button type="button" class="qbf-b mal" data-traspaso="observar">Observar (devolver a OTI)</button></div>' : '') +
      '<div data-msg="traspaso"></div></section>';
  }

  /* ─── Comisión de prueba y reunión de especialistas ─── */
  var AREAS_P = ['OCOS', 'ODN', 'OPP', 'ODACL', 'DST', 'OTI', 'GG', 'OCM', 'ORH', 'ADG', 'USUARIA'];
  var NOMBRE_AREA = function (a) { return a === 'USUARIA' ? 'Área usuaria' : a; };
  function filaPersona(x, conRes) {
    return '<div class="qbf-form" data-fila="1" style="margin-bottom:6px"><label>Área<select data-f="area">' + AREAS_P.map(function (a) { return '<option value="' + a + '"' + (x.area === a ? ' selected' : '') + '>' + NOMBRE_AREA(a) + '</option>'; }).join('') + '</select></label>' +
      '<label>Nombre<input data-f="nombre" value="' + esc(x.nombre || '') + '"></label><label>Cargo<input data-f="cargo" value="' + esc(x.cargo || '') + '"></label>' +
      (conRes ? '<label>Resultado<select data-f="resultado"><option value="conforme"' + (x.resultado === 'observaciones' ? '' : ' selected') + '>Conforme</option><option value="observaciones"' + (x.resultado === 'observaciones' ? ' selected' : '') + '>Con observaciones</option></select></label><label>Comentario<input data-f="comentario" value="' + esc(x.comentario || '') + '"></label>' : '') + '</div>';
  }
  function personas(clave, lista, base, conRes) {
    var filas = lista && lista.length ? lista : base.map(function (a) { return { area: a }; });
    return '<div data-pers="' + clave + '">' + filas.map(function (x) { return filaPersona(x, conRes); }).join('') + '</div><button type="button" class="qbf-b" data-mas="' + clave + '" data-res="' + (conRes ? 1 : 0) + '">+ Agregar persona</button>';
  }
  function leerPersonas(el, clave) {
    return [].slice.call(el.querySelectorAll('[data-pers="' + clave + '"] [data-fila]')).map(function (fl) {
      var o = {}; fl.querySelectorAll('[data-f]').forEach(function (i) { o[i.dataset.f] = i.value; }); return o; });
  }
  function listaPersonas(lista) {
    return '<ul class="qbf-req">' + lista.map(function (x) { return '<li><b>' + esc(NOMBRE_AREA(x.area)) + ':</b>&nbsp;' + esc(x.nombre) + (x.cargo ? ' · ' + esc(x.cargo) : '') + (x.resultado ? ' · ' + (x.resultado === 'conforme' ? 'conforme' : 'con observaciones') : '') + (x.comentario ? ' — ' + esc(x.comentario) : '') + '</li>'; }).join('') + '</ul>';
  }
  function comision(p) {
    if (p.etapa !== 'comision' && !p.comision) return '';
    var c = p.comision || {}, base = ['OCOS', 'ODN', 'OPP', 'ODACL', 'DST'].concat(p.modalidad === 'interno' ? ['USUARIA'] : []);
    return '<section class="qbf-caja"><div><h4>Comisión de prueba</h4><p class="qbf-sub">Un representante de OCOS, ODN, OPP, ODACL y DST' + (p.modalidad === 'interno' ? ' y del área usuaria' : '') + ', designado por su jefe para este proyecto. OCM y ORH, si el producto los toca. Prueban con datos anonimizados.</p></div>' +
      (c.integrantes ? listaPersonas(c.integrantes) + '<p class="qbf-sub">Registró ' + esc(c.registrado_por || '') + ' · ' + esc(fecha(c.fecha)) + '</p>' : '') +
      (p.puedo_comision ? personas('comision', c.integrantes, base, true) + '<div><button type="button" class="qbf-b pri" data-guardar="comision">Guardar integrantes</button></div>' : '') +
      '<div data-msg="comision"></div></section>';
  }
  function reunion(p) {
    if (p.etapa !== 'especialistas' && !p.reunion) return '';
    var r = p.reunion || {};
    return '<section class="qbf-caja"><div><h4>Reunión previa de especialistas</h4><p class="qbf-sub">GG (Gestión de Calidad), ODACL (Cumplimiento), DST y OTI acuerdan qué verificará cada auditoría.</p></div>' +
      (r.asistentes ? listaPersonas(r.asistentes) + '<p><b>Acuerdos (' + esc(r.fecha || '') + '):</b> ' + esc(r.acuerdos || '') + '</p>' : '') +
      (p.puedo_reunion ? personas('reunion', r.asistentes, ['GG', 'ODACL', 'DST', 'OTI'], false) +
        '<div class="qbf-form"><label>Fecha<input data-c="re_fecha" type="date" value="' + esc(r.fecha || '') + '"></label><label style="grid-column:1/-1">Acuerdos<textarea data-c="re_acuerdos">' + esc(r.acuerdos || '') + '</textarea></label></div>' +
        '<div><button type="button" class="qbf-b pri" data-guardar="reunion">Guardar reunión</button></div>' : '') +
      '<div data-msg="reunion"></div></section>';
  }

  /* ─── Cambios de alcance (ODACL-FMT-02) ─── */
  var ESTADO_C = { solicitado: 'Por valorizar (OPP)', valorizado: 'Por decidir (GG)', aprobado: 'Aprobado', rechazado: 'Rechazado' };
  function cambios(p) {
    var lista = p.cambios || [];
    if (!lista.length && !p.puedo_cambio_solicitar) return '';
    return '<section class="qbf-caja"><div><h4>Cambios de alcance (ODACL-FMT-02)</h4><p class="qbf-sub">ODN u OTI lo solicitan, OPP lo valoriza y GG decide. Aprobado: suma el costo al presupuesto y los días al plazo' + (p.ruta === 'B' ? '; si cambia el precio al cliente, ODN firma una adenda' : '') + '.</p></div>' +
      lista.map(function (c) {
        return '<div class="qbf-caja" style="padding:12px" data-cambio="' + esc(c.id) + '"><div class="qbf-fila" style="justify-content:space-between"><b>' + esc(c.descripcion) + '</b><span class="qbf-chip' + (c.estado === 'aprobado' ? '' : c.estado === 'rechazado' ? ' al' : ' tt') + '">' + esc(ESTADO_C[c.estado] || c.estado) + '</span></div>' +
          '<p class="qbf-sub">' + esc(c.solicitado_por || '') + ' (' + esc(c.area || '') + ') · ' + esc(fecha(c.fecha)) + (c.motivo ? ' · ' + esc(c.motivo) : '') + (c.dias ? ' · +' + esc(c.dias) + ' días' : '') +
          (c.costo != null ? ' · costo ' + dinero(c.costo) : '') + (c.precio_cliente ? ' · precio al cliente ' + dinero(c.precio_cliente) : '') + (c.adenda ? ' · adenda ' + esc(c.adenda) : '') + (c.comentario ? ' · ' + esc(c.comentario) : '') + '</p>' +
          (c.estado === 'solicitado' && p.puedo_cambio_valorizar ? '<div class="qbf-form"><label>Costo<input data-c="cv_costo" type="number" min="0" step="0.01"></label><label>Precio al cliente (0 si no cambia)<input data-c="cv_precio" type="number" min="0" step="0.01" value="0"></label><button type="button" class="qbf-b pri" data-cambio-acc="valorizar">Valorizar</button></div>' : '') +
          (c.estado === 'valorizado' && p.puedo_cambio_decidir ? '<label>Comentario (obligatorio si se rechaza)<input data-c="cv_com"></label><div class="qbf-fila"><button type="button" class="qbf-b pri" data-cambio-acc="aprobar">Aprobar</button><button type="button" class="qbf-b mal" data-cambio-acc="rechazar">Rechazar</button></div>' : '') +
          (c.estado === 'aprobado' && c.requiere_adenda && !c.adenda_aprobada && p.puedo_adenda ? '<div class="qbf-form"><label>Código de la adenda (contrato nuevo aprobado)<input data-c="cv_adenda" placeholder="ODN-CTR-AAAA-NNN"></label><button type="button" class="qbf-b pri" data-cambio-acc="adenda">Registrar adenda</button></div>' : '') +
          '</div>';
      }).join('') +
      (p.puedo_cambio_solicitar ? '<div class="qbf-form"><label style="grid-column:1/-1">Cambio solicitado<input data-c="cs_desc" placeholder="Qué se agrega, quita o modifica"></label><label>Motivo<input data-c="cs_motivo"></label><label>Días adicionales<input data-c="cs_dias" type="number" min="0" value="0"></label><button type="button" class="qbf-b" data-guardar="cambio">Solicitar cambio</button></div>' : '') +
      '<div data-msg="cambios"></div></section>';
  }

  /* ─── Facturación por etapa (Ruta B) ─── */
  var HITO = { adelanto: 'Adelanto', saldo: 'Saldo', adenda: 'Adenda' };
  function facturas(p) {
    if (p.ruta !== 'B') return '';
    var lista = p.facturas || [];
    return '<section class="qbf-caja"><div><h4>Facturación del proyecto</h4><p class="qbf-sub">OPP registra el adelanto antes de abrir el proyecto, el saldo con la entrega y una factura por cada adenda; después, el cobro.</p></div>' +
      (lista.length ? '<div class="qbf-tabla"><table><thead><tr><th>Hito</th><th>Factura</th><th>Monto</th><th>Fecha</th><th>Cobro</th></tr></thead><tbody>' + lista.map(function (x) {
        return '<tr><td>' + esc(HITO[x.hito] || x.hito) + '</td><td>' + (x.sin_monto ? '<span class="qbf-sub">Sin adelanto</span>' : esc(x.numero)) + '</td><td>' + (x.sin_monto ? '—' : esc(x.moneda) + ' ' + dinero(x.monto)) + '</td><td>' + esc(x.fecha) + '</td><td>' +
          (x.cobrada ? (x.sin_monto ? '—' : '<span class="qbf-chip" style="color:var(--f-ok);border-color:var(--f-ok)">Cobrada ' + esc(x.cobrada_en || '') + '</span>') : (p.puedo_facturar ? '<button type="button" class="qbf-b" data-cobro="' + esc(x.id) + '">Registrar cobro</button>' : '<span class="qbf-chip al">Por cobrar</span>')) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="qbf-sub">Sin facturas registradas.</p>') +
      (p.puedo_facturar ? '<div class="qbf-form"><label>Hito<select data-c="fa_hito"><option value="adelanto">Adelanto</option><option value="saldo">Saldo</option><option value="adenda">Adenda</option></select></label><label>N.° de factura<input data-c="fa_num" placeholder="F001-000123"></label>' +
        '<label>Monto<input data-c="fa_monto" type="number" min="0" step="0.01"></label><label>Moneda<select data-c="fa_mon"><option>USD</option><option>PEN</option></select></label><label>Fecha<input data-c="fa_fecha" type="date"></label>' +
        '<label style="display:flex;gap:6px;align-items:center;font-weight:500"><input type="checkbox" data-c="fa_sin"> El contrato no tiene adelanto</label><button type="button" class="qbf-b pri" data-guardar="factura">Registrar</button></div>' : '') +
      '<div data-msg="facturas"></div></section>';
  }

  function riesgos(p) {
    var nivel = function (r) { var n = r.probabilidad * r.impacto; return '<span class="qbf-niv ' + (n >= 15 ? 'r' : n >= 8 ? 'm' : 'b') + '">' + n + '</span>'; };
    return '<section class="qbf-caja"><div><h4>Registro de riesgos (ISO 31000)</h4><p class="qbf-sub">Nivel = probabilidad × impacto (1 a 5). Un riesgo de nivel 15 o más, abierto y sin tratamiento, bloquea las auditorías finales.</p></div>' +
      (p.riesgos.length ? '<div class="qbf-tabla"><table><thead><tr><th>Riesgo</th><th>Tipo</th><th>P × I</th><th>Tratamiento</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>' +
        p.riesgos.map(function (r) {
          return '<tr><td>' + esc(r.riesgo) + '<div class="qbf-sub">' + esc(r.registrado_por || '') + ' · ' + esc(fecha(r.fecha)) + '</div></td><td>' + esc(TIPO_R[r.tipo] || r.tipo) + '</td><td>' + r.probabilidad + ' × ' + r.impacto + ' = ' + nivel(r) + '</td>' +
            '<td>' + (p.puedo_riesgos ? '<input data-trat="' + esc(r.id) + '" value="' + esc(r.tratamiento || '') + '" placeholder="Cómo se trata" style="width:100%">' : esc(r.tratamiento || '—')) + '</td><td>' + esc(r.responsable || '') + '</td>' +
            '<td>' + (p.puedo_riesgos ? '<select data-est="' + esc(r.id) + '">' + ['abierto', 'mitigado', 'cerrado'].map(function (e) { return '<option' + (r.estado === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select> <button type="button" class="qbf-b" data-guardar-r="' + esc(r.id) + '">Guardar</button>' : esc(r.estado)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="qbf-sub">Sin riesgos registrados.</p>') +
      (p.puedo_riesgos ? '<div class="qbf-form"><label style="grid-column:1/-1">Riesgo nuevo<input data-c="r_riesgo" placeholder="Ej. el cliente cambia el alcance a mitad del desarrollo"></label>' +
        '<label>Tipo<select data-c="r_tipo">' + Object.keys(TIPO_R).map(function (k) { return '<option value="' + k + '">' + TIPO_R[k] + '</option>'; }).join('') + '</select></label>' +
        '<label>Probabilidad (1–5)<input data-c="r_p" type="number" min="1" max="5" value="3"></label><label>Impacto (1–5)<input data-c="r_i" type="number" min="1" max="5" value="3"></label>' +
        '<label>Responsable<select data-c="r_resp">' + AREAS.map(function (a) { return '<option' + (a === p.mi_area ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select></label>' +
        '<label style="grid-column:1/-1">Tratamiento<input data-c="r_trat" placeholder="Qué se hará para evitarlo o reducirlo"></label>' +
        '<button type="button" class="qbf-b pri" data-accion="riesgo">Agregar riesgo</button></div>' : '') +
      '<div data-msg="riesgos"></div></section>';
  }

  function incorporar(p) {
    return '<section class="qbf-caja"><div><h4>Proyecto anterior al flujo</h4><p class="qbf-sub">Se creó antes de las etapas y puertas. ADG o GG lo incorporan indicando su ruta y la etapa en la que está hoy.</p></div>' +
      (p.puedo_incorporar ? '<div class="qbf-form"><label>Ruta<select data-c="i_ruta"><option value="A">Ruta A · producto propio</option><option value="B">Ruta B · para un cliente</option></select></label>' +
        '<label>Modalidad<select data-c="i_mod"><option value="">Por definir</option>' + ['venta', 'alquiler', 'ambos', 'interno'].map(function (m) { return '<option value="' + m + '">' + MODAL[m] + '</option>'; }).join('') + '</select></label>' +
        '<label>Etapa actual<select data-c="i_etapa"></select></label><label>Contrato (Ruta B)<input data-c="i_ctr" placeholder="ODN-CTR-AAAA-NNN"></label>' +
        '<button type="button" class="qbf-b pri" data-accion="incorporar">Incorporar al flujo</button></div>' : '<p class="qbf-sub">No tienes permiso para incorporarlo.</p>') +
      '<div data-msg="incorporar"></div></section>';
  }

  function pintar(el, op, p) {
    var seq = (p.secuencia || []).map(function (s) { return s.clave; }), i = seq.indexOf(p.etapa);
    el.innerHTML = '<div class="qbf">' +
      (op.volver ? '<div><button type="button" class="qbf-b" data-volver="1">← Volver a la lista</button></div>' : '') +
      '<div><div class="qbf-fila"><span class="qbf-cod">' + esc(p.code) + '</span>' + (p.ruta ? '<span class="qbf-chip">' + esc(RUTA[p.ruta]) + '</span>' : '') + (p.modalidad ? '<span class="qbf-chip">' + esc(MODAL[p.modalidad]) + '</span>' : '') +
        (p.status === 'paused' ? '<span class="qbf-chip al">Pausado</span>' : '') + '</div><h3>' + esc(p.name) + '</h3><p class="qbf-sub">' + esc(p.client || '') + '</p></div>' +
      (p.etapa ? '<div class="qbf-et">' + seq.map(function (k, j) { return '<span class="' + (j < i ? 'h' : j === i ? 'a' : '') + '">' + (j < i ? '✓ ' : '') + esc(NOMBRE[k]) + '</span>'; }).join('') + '</div>' + puerta(p) : incorporar(p)) +
      comision(p) + reunion(p) + '<div class="qbf-dos">' + costos(p) + actas(p) + '</div>' + cambios(p) + facturas(p) + traspaso(p) + riesgos(p) +
      '<section class="qbf-caja"><h4>Historial</h4><ul class="qbf-hist">' + (p.historial.length ? p.historial.map(function (h) {
        return '<li><b>' + esc(h.accion) + '</b> · ' + esc(h.usuario_nombre || '') + (h.area ? ' (' + esc(h.area) + ')' : '') + ' · ' + esc(fecha(h.fecha)) +
          (h.a_etapa ? ' · → ' + esc(NOMBRE[h.a_etapa] || h.a_etapa) : '') + (h.comentario ? '<div class="qbf-sub">' + esc(h.comentario) + '</div>' : '') + '</li>'; }).join('') : '<li class="qbf-sub">Sin movimientos.</li>') + '</ul></section>' +
      '</div>';
    enlazar(el, op, p);
  }

  function enlazar(el, op, p) {
    var msg = function (k, texto, ok) { var m = el.querySelector('[data-msg="' + k + '"]'); if (m) m.innerHTML = '<p class="' + (ok ? 'qbf-ok' : 'qbf-err') + '">' + esc(texto) + '</p>'; };
    var accion = function (k, metodo, ruta, cuerpo, okTxt, btn) {
      if (btn) btn.disabled = true;
      pedir(op, metodo, '/' + encodeURIComponent(p.id) + ruta, cuerpo).then(function (np) { pintar(el, op, np); msg(k === 'puerta' && !np.etapa ? 'incorporar' : k, okTxt, true); if (op.cambio) op.cambio(np); })
        .catch(function (e) { msg(k, e.message, false); if (btn) btn.disabled = false; });
    };
    var vol = el.querySelector('[data-volver]'); if (vol) vol.addEventListener('click', op.volver);
    el.querySelectorAll('[data-accion]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.accion;
        if (a === 'avanzar') {
          var c = { etapa: p.etapa, comentario: v(el, '[data-c="comentario"]') };
          ['modalidad', 'presupuesto_max', 'contrato_codigo', 'end_date', 'acta_conformidad'].forEach(function (k) { var x = el.querySelector('[data-c="' + k + '"]'); if (x && x.value) c[k] = x.value; });
          accion('puerta', 'POST', '/avanzar', c, 'Puerta aprobada.', b);
        } else if (a === 'devolver') {
          var com = v(el, '[data-c="comentario"]');
          if (!com.trim()) return msg('puerta', 'Escribe en el comentario qué debe corregir OTI.', false);
          accion('puerta', 'POST', '/devolver', { comentario: com }, 'Proyecto devuelto a OTI.', b);
        } else if (a === 'costos') {
          var cc = {}, cr = el.querySelector('[data-c="costo_real"]'), pe = el.querySelector('[data-c="presupuesto_edit"]');
          if (cr && cr.value !== '') cc.costo_real = cr.value; if (pe && pe.value !== '') cc.presupuesto_max = pe.value;
          accion('costos', 'PUT', '/costos', cc, 'Costos guardados.', b);
        } else if (a === 'riesgo') {
          accion('riesgos', 'POST', '/riesgos', { riesgo: v(el, '[data-c="r_riesgo"]'), tipo: v(el, '[data-c="r_tipo"]'), probabilidad: v(el, '[data-c="r_p"]'), impacto: v(el, '[data-c="r_i"]'), responsable: v(el, '[data-c="r_resp"]'), tratamiento: v(el, '[data-c="r_trat"]') }, 'Riesgo agregado.', b);
        } else if (a === 'incorporar') {
          accion('incorporar', 'POST', '/incorporar', { ruta: v(el, '[data-c="i_ruta"]'), modalidad: v(el, '[data-c="i_mod"]') || undefined, etapa: v(el, '[data-c="i_etapa"]'), contrato_codigo: v(el, '[data-c="i_ctr"]') }, 'Proyecto incorporado al flujo.', b);
        }
      });
    });
    el.querySelectorAll('[data-mas]').forEach(function (b) {
      b.addEventListener('click', function () { var cont = el.querySelector('[data-pers="' + b.dataset.mas + '"]'); cont.insertAdjacentHTML('beforeend', filaPersona({ area: 'OCM' }, b.dataset.res === '1')); });
    });
    el.querySelectorAll('[data-guardar]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.dataset.guardar;
        if (g === 'comision') accion('comision', 'POST', '/comision', { integrantes: leerPersonas(el, 'comision') }, 'Comisión guardada.', b);
        if (g === 'reunion') accion('reunion', 'POST', '/reunion', { asistentes: leerPersonas(el, 'reunion'), acuerdos: v(el, '[data-c="re_acuerdos"]'), fecha: v(el, '[data-c="re_fecha"]') }, 'Reunión guardada.', b);
        if (g === 'cambio') accion('cambios', 'POST', '/cambios', { descripcion: v(el, '[data-c="cs_desc"]'), motivo: v(el, '[data-c="cs_motivo"]'), dias: v(el, '[data-c="cs_dias"]') }, 'Cambio solicitado: OPP lo valoriza.', b);
        if (g === 'factura') { var sin = el.querySelector('[data-c="fa_sin"]'); accion('facturas', 'POST', '/facturas', { hito: v(el, '[data-c="fa_hito"]'), numero: v(el, '[data-c="fa_num"]'), monto: v(el, '[data-c="fa_monto"]'), moneda: v(el, '[data-c="fa_mon"]'), fecha: v(el, '[data-c="fa_fecha"]'), sin_monto: !!(sin && sin.checked) }, 'Factura registrada.', b); }
      });
    });
    el.querySelectorAll('[data-cambio-acc]').forEach(function (b) {
      b.addEventListener('click', function () {
        var caja = b.closest('[data-cambio]'), a = b.dataset.cambioAcc, q = function (sel) { var x = caja.querySelector(sel); return x ? x.value : ''; };
        var cuerpo = a === 'valorizar' ? { costo: q('[data-c="cv_costo"]'), precio_cliente: q('[data-c="cv_precio"]') } : a === 'adenda' ? { codigo: q('[data-c="cv_adenda"]') } : { comentario: q('[data-c="cv_com"]') };
        accion('cambios', 'POST', '/cambios/' + encodeURIComponent(caja.dataset.cambio) + '/' + a, cuerpo, 'Cambio de alcance actualizado.', b);
      });
    });
    el.querySelectorAll('[data-cobro]').forEach(function (b) {
      b.addEventListener('click', function () { accion('facturas', 'POST', '/facturas/' + encodeURIComponent(b.dataset.cobro) + '/cobro', {}, 'Cobro registrado.', b); });
    });
    var sa = el.querySelector('[data-subir-acta]');
    if (sa) sa.addEventListener('click', function () {
      var inp = el.querySelector('[data-c="acta_archivo"]'), fl = inp && inp.files && inp.files[0];
      if (!fl) return msg('puerta', 'Elige el archivo del acta firmada.', false);
      var fd = new FormData(); fd.append('archivo', fl); sa.disabled = true;
      var t = op.token ? op.token() : null;
      fetch(API + '/api/proyecto-flujo/' + encodeURIComponent(p.id) + '/acta-conformidad', { method: 'POST', headers: t ? { Authorization: 'Bearer ' + t } : {}, body: fd })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo subir el archivo'); return j.data; }); })
        .then(function (np) { pintar(el, op, np); msg('puerta', 'Acta subida.', true); })
        .catch(function (e) { msg('puerta', e.message, false); sa.disabled = false; });
    });
    var va = el.querySelector('[data-ver-acta]');
    if (va) va.addEventListener('click', function () {
      pedir(op, 'GET', '/' + encodeURIComponent(p.id) + '/acta-conformidad').then(function (j) { window.open(j.url || j, '_blank', 'noopener'); }).catch(function (e) { msg('puerta', e.message, false); });
    });
    el.querySelectorAll('[data-traspaso]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.traspaso;
        var cuerpo = a === 'entregar' ? { manual: v(el, '[data-c="t_manual"]'), accesos: v(el, '[data-c="t_accesos"]'), guia: v(el, '[data-c="t_guia"]') } : { comentario: v(el, '[data-c="t_com"]') };
        accion('traspaso', 'POST', '/traspaso/' + a, cuerpo, a === 'entregar' ? 'Traspaso entregado a OCOS.' : a === 'recibir' ? 'Traspaso recibido.' : 'Traspaso observado: vuelve a OTI.', b);
      });
    });
    el.querySelectorAll('[data-exceso]').forEach(function (b) {
      b.addEventListener('click', function () { accion('costos', 'POST', '/exceso', { decision: b.dataset.exceso, comentario: v(el, '[data-c="exceso_comentario"]') }, 'Decisión registrada.', b); });
    });
    el.querySelectorAll('[data-guardar-r]').forEach(function (b) {
      b.addEventListener('click', function () { var id = b.dataset.guardarR; accion('riesgos', 'PUT', '/riesgos/' + encodeURIComponent(id), { estado: v(el, '[data-est="' + id + '"]'), tratamiento: v(el, '[data-trat="' + id + '"]') }, 'Riesgo actualizado.', b); });
    });
    // Incorporar: las etapas dependen de la ruta y la modalidad
    var ir = el.querySelector('[data-c="i_ruta"]'), im = el.querySelector('[data-c="i_mod"]'), ie = el.querySelector('[data-c="i_etapa"]');
    if (ir && ie) {
      var llenar = function () { ie.innerHTML = secuencia(ir.value, im.value).map(function (k) { return '<option value="' + k + '">' + esc(NOMBRE[k]) + '</option>'; }).join(''); };
      ir.addEventListener('change', llenar); im.addEventListener('change', llenar); llenar();
    }
  }

  window.qbFlujo = { lista: lista, detalle: detalle };
  try { document.dispatchEvent(new CustomEvent('qb-flujo-listo')); } catch (e) { /* navegadores antiguos */ }
})();
