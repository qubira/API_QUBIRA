/* ============================================================
   Casos de soporte derivados — componente compartido (lo sirve la API).
   OTI corrige errores de fondo, DST contiene incidentes de seguridad y
   ODACL evalúa los que expusieron datos personales (Ley 29733).
   Uso: qbCasos.render(el, { token: function () { return '…'; } })
   ============================================================ */
(function () {
  'use strict';
  var SRC = (document.currentScript && document.currentScript.src) || '';
  var API = SRC.replace(/\/api\/public\/casos-derivados\.js.*$/, '') || 'https://api-qubira.onrender.com';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fecha = function (f) { if (!f) return ''; var d = new Date(f); return isNaN(d) ? '' : d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  var TITULO = { OTI: 'Casos escalados a OTI', DST: 'Incidentes de seguridad', ODACL: 'Incidentes con datos personales', DIRECCION: 'Casos de soporte derivados' };
  var AYUDA = {
    OTI: 'El Especialista de Soporte Nivel 3 de OCOS los escaló porque son errores del producto. Corrígelos y devuélvelos a OCOS con la solución.',
    DST: 'Incidentes reportados por OCOS desde cualquier nivel. Contén el incidente, informa al Director General y devuélvelo a OCOS con el informe.',
    ODACL: 'Incidentes de seguridad que expusieron datos personales. Registra la evaluación legal (Ley 29733: comunicación a los titulares y a la Autoridad, medidas).',
    DIRECCION: 'Todos los casos que OCOS escaló a OTI o a DST.',
  };
  var CSS = [
    '.qbc{--c-borde:rgba(127,127,140,.28);--c-tenue:rgba(127,127,140,.95);--c-acento:#5b4fe0;--c-ok:#0f8f6e;--c-mal:#c0392b;color:inherit;font-size:14px;line-height:1.55;display:grid;gap:14px;min-width:0}',
    '.qbc *{box-sizing:border-box}.qbc h3{margin:0;font-size:17px}.qbc h4{margin:0;font-size:14.5px}.qbc p{margin:0}.qbc button,.qbc textarea{font:inherit;color:inherit}',
    '.qbc-sub{color:var(--c-tenue);font-size:13px}.qbc-caso{border:1px solid var(--c-borde);border-radius:12px;padding:14px 16px;display:grid;gap:9px;min-width:0}',
    '.qbc-fila{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}.qbc-cod{font:600 12.5px ui-monospace,Consolas,monospace;color:var(--c-acento)}',
    '.qbc-chip{font-size:11.5px;font-weight:600;line-height:20px;padding:0 8px;border-radius:999px;border:1px solid var(--c-borde)}.qbc-chip.mal{color:var(--c-mal);border-color:var(--c-mal)}.qbc-chip.ac{color:var(--c-acento);border-color:var(--c-acento)}',
    '.qbc-desc{white-space:pre-wrap;font-size:13.5px;max-height:160px;overflow:auto}',
    '.qbc-hist{list-style:none;margin:0;padding:0;display:grid;gap:5px;font-size:12.5px}.qbc-hist li{border-left:2px solid var(--c-borde);padding-left:8px}',
    '.qbc textarea{width:100%;min-height:64px;border:1px solid var(--c-borde);border-radius:8px;padding:7px 9px;background:transparent;resize:vertical}',
    '.qbc-b{border:1px solid var(--c-borde);background:transparent;border-radius:8px;padding:6px 13px;font-weight:600;font-size:13px;cursor:pointer}.qbc-b.pri{background:var(--c-acento);border-color:var(--c-acento);color:#fff}.qbc-b:disabled{opacity:.5}',
    '.qbc-b:focus-visible,.qbc textarea:focus-visible{outline:2px solid var(--c-acento);outline-offset:2px}.qbc-err{color:var(--c-mal);font-size:13px}.qbc-ok{color:var(--c-ok);font-size:13px;font-weight:600}',
  ].join('');
  function estilos() { if (document.getElementById('qbc-estilos')) return; var st = document.createElement('style'); st.id = 'qbc-estilos'; st.textContent = CSS; document.head.appendChild(st); }
  function pedir(op, metodo, ruta, cuerpo) {
    var t = op.token ? op.token() : null;
    return fetch(API + '/api/casos-derivados' + ruta, { method: metodo, cache: 'no-store', headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}), body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
        if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo completar la operación.');
        return j; }); });
  }
  function tarjeta(c) {
    var accion = c.puedo_devolver ? (c.areaActual === 'DST' ? 'Incidente contenido: devolver a OCOS' : 'Corregido: devolver a OCOS') : c.puedo_nota ? 'Registrar evaluación legal' : null;
    return '<article class="qbc-caso" data-id="' + esc(c.id) + '"><div class="qbc-fila"><span class="qbc-cod">' + esc(c.id) + '</span>' +
      '<span class="qbc-chip ac">' + esc(c.nivelNombre) + '</span>' + (c.seguridad ? '<span class="qbc-chip mal">Seguridad</span>' : '') + (c.datosPersonales ? '<span class="qbc-chip mal">Datos personales</span>' : '') +
      '<span class="qbc-chip">Prioridad ' + esc(c.prioridad) + '</span></div>' +
      '<h4>' + esc(c.titulo) + '</h4>' + (c.proyecto ? '<p class="qbc-sub">Proyecto: ' + esc(c.proyecto) + '</p>' : '') +
      (c.descripcion ? '<div class="qbc-desc">' + esc(c.descripcion) + '</div>' : '') +
      '<ul class="qbc-hist">' + (c.escalamiento || []).map(function (h) {
        return '<li><b>' + esc(h.accion) + '</b> · ' + esc(h.usuario || '') + (h.area ? ' (' + esc(h.area) + ')' : '') + ' · ' + esc(fecha(h.fecha)) + (h.de || h.a ? '<br><span class="qbc-sub">' + esc(h.de || '') + (h.a ? ' → ' + esc(h.a) : '') + '</span>' : '') +
          (h.avisos ? '<br><span class="qbc-sub">Avisos: ' + esc(h.avisos.join(', ')) + '</span>' : '') + (h.comentario ? '<br>' + esc(h.comentario) : '') + '</li>'; }).join('') + '</ul>' +
      (accion ? '<label style="display:grid;gap:4px;font-size:12.5px;font-weight:600">' + (c.puedo_nota && !c.puedo_devolver ? 'Evaluación legal' : 'Qué se hizo') + '<textarea data-com="1"></textarea></label>' +
        '<div class="qbc-fila"><button type="button" class="qbc-b pri" data-accion="' + (c.puedo_devolver ? 'devolver' : 'nota') + '">' + esc(accion) + '</button>' +
        (c.puedo_devolver && c.puedo_nota ? '<button type="button" class="qbc-b" data-accion="nota">Registrar evaluación legal</button>' : '') + '</div>' : '') +
      '<div data-msg="1"></div></article>';
  }
  function render(el, op) {
    if (!el) return; op = op || {}; estilos();
    var hist = !!op._hist;
    el.innerHTML = '<div class="qbc"><p class="qbc-sub">Cargando los casos…</p></div>';
    pedir(op, 'GET', hist ? '/?historial=1' : '/').then(function (j) {
      el.innerHTML = '<div class="qbc"><div class="qbc-fila" style="justify-content:space-between"><div><h3>' + esc(TITULO[j.area] || TITULO.DIRECCION) + '</h3><p class="qbc-sub">' + esc(AYUDA[j.area] || '') + '</p></div>' +
        '<div class="qbc-fila"><button type="button" class="qbc-b' + (hist ? '' : ' pri') + '" data-h="0">Pendientes</button><button type="button" class="qbc-b' + (hist ? ' pri' : '') + '" data-h="1">Historial</button></div></div>' +
        (j.casos.length ? j.casos.map(tarjeta).join('') : '<div class="qbc-caso"><p class="qbc-sub">' + (hist ? 'Sin casos en el historial.' : 'No hay casos pendientes para tu área.') + '</p></div>') + '</div>';
      el.querySelectorAll('[data-h]').forEach(function (b) { b.addEventListener('click', function () { op._hist = b.dataset.h === '1'; render(el, op); }); });
      el.querySelectorAll('.qbc-caso[data-id]').forEach(function (card) {
        card.querySelectorAll('[data-accion]').forEach(function (b) {
          b.addEventListener('click', function () {
            var com = card.querySelector('[data-com]').value, msg = card.querySelector('[data-msg]');
            if (!com.trim()) { msg.innerHTML = '<p class="qbc-err">Escribe el detalle antes de continuar.</p>'; return; }
            b.disabled = true;
            pedir(op, 'POST', '/' + encodeURIComponent(card.dataset.id) + '/' + b.dataset.accion, { comentario: com })
              .then(function () { msg.innerHTML = '<p class="qbc-ok">Listo.</p>'; setTimeout(function () { render(el, op); }, 1200); })
              .catch(function (e) { msg.innerHTML = '<p class="qbc-err">' + esc(e.message) + '</p>'; b.disabled = false; });
          });
        });
      });
    }).catch(function (e) { el.innerHTML = '<div class="qbc"><p class="qbc-err">' + esc(e.message) + '</p></div>'; });
  }
  window.qbCasos = { render: render };
  try { document.dispatchEvent(new CustomEvent('qb-casos-listo')); } catch (e) { /* navegadores antiguos */ }
})();
