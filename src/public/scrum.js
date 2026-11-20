/* ============================================================
   Tablero Scrum de un proyecto — componente compartido (lo sirve la API).
   Uso: qbScrum.render(el, { token: fn, id: 'proyecto' })
   ============================================================ */
(function () {
  'use strict';
  var SRC = (document.currentScript && document.currentScript.src) || '';
  var API = SRC.replace(/\/api\/public\/scrum\.js.*$/, '') || 'https://api-qubira.onrender.com';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var COL = [['por_hacer', 'Por hacer'], ['en_curso', 'En curso'], ['revision', 'Revisión de código / QA'], ['hecho', 'Hecho']];
  var TIPO = { historia: 'Historia', falla: 'Falla', tecnica: 'Técnica' };
  var CSS = [
    '.qbs{--s-borde:rgba(127,127,140,.28);--s-suave:rgba(127,127,140,.07);--s-tenue:rgba(127,127,140,.95);--s-acento:#5b4fe0;--s-ok:#0f8f6e;--s-mal:#c0392b;color:inherit;font-size:14px;line-height:1.5;display:grid;gap:14px;min-width:0}',
    '.qbs *{box-sizing:border-box}.qbs h3{margin:0;font-size:17px}.qbs h4{margin:0;font-size:14.5px}.qbs p{margin:0}.qbs button,.qbs input,.qbs select,.qbs textarea{font:inherit;color:inherit}',
    '.qbs-sub{color:var(--s-tenue);font-size:13px}.qbs-caja{border:1px solid var(--s-borde);border-radius:12px;padding:14px;display:grid;gap:10px;min-width:0}',
    '.qbs-fila{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}.qbs-kan{display:grid;grid-template-columns:repeat(4,minmax(200px,1fr));gap:10px;overflow-x:auto}',
    '.qbs-col{background:var(--s-suave);border-radius:10px;padding:8px;display:grid;gap:8px;align-content:start;min-height:80px}.qbs-col h4{font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--s-tenue)}',
    '.qbs-tar{border:1px solid var(--s-borde);border-radius:9px;padding:8px 10px;display:grid;gap:6px;background:color-mix(in srgb,var(--s-suave) 30%,transparent)}.qbs-tar b{font-size:13.5px}',
    '.qbs-chip{font-size:11px;font-weight:700;line-height:18px;padding:0 7px;border-radius:999px;border:1px solid var(--s-borde)}.qbs-chip.f{color:var(--s-mal);border-color:var(--s-mal)}.qbs-chip.p{color:var(--s-acento);border-color:var(--s-acento)}',
    '.qbs-dod{display:grid;gap:2px;font-size:12px}.qbs-dod label{display:flex;gap:6px;align-items:center}',
    '.qbs-b{border:1px solid var(--s-borde);background:transparent;border-radius:8px;padding:5px 11px;font-weight:600;font-size:12.5px;cursor:pointer}.qbs-b.pri{background:var(--s-acento);border-color:var(--s-acento);color:#fff}.qbs-b:disabled{opacity:.5}',
    '.qbs input,.qbs select,.qbs textarea{border:1px solid var(--s-borde);border-radius:8px;padding:5px 8px;background:transparent;min-width:0}.qbs textarea{width:100%;min-height:54px;resize:vertical}.qbs select option{color:#111}',
    '.qbs-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:8px;align-items:end}.qbs label{display:grid;gap:3px;font-size:12.5px;font-weight:600}',
    '.qbs-b:focus-visible,.qbs input:focus-visible,.qbs select:focus-visible,.qbs textarea:focus-visible{outline:2px solid var(--s-acento);outline-offset:2px}',
    '.qbs-back{display:grid;gap:6px}.qbs-it{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;border:1px solid var(--s-borde);border-radius:9px;padding:7px 10px}.qbs-it b{flex:1 1 220px;font-size:13.5px}',
    '.qbs-err{color:var(--s-mal);font-size:13px}.qbs-ok{color:var(--s-ok);font-size:13px;font-weight:600}.qbs-barra{height:8px;border-radius:999px;background:var(--s-suave);overflow:hidden}.qbs-barra i{display:block;height:100%;background:var(--s-ok)}',
  ].join('');
  function estilos() { if (document.getElementById('qbs-estilos')) return; var st = document.createElement('style'); st.id = 'qbs-estilos'; st.textContent = CSS; document.head.appendChild(st); }
  function pedir(op, metodo, ruta, cuerpo) {
    var t = op.token ? op.token() : null;
    return fetch(API + '/api/scrum/' + encodeURIComponent(op.id) + ruta, { method: metodo, cache: 'no-store', headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}), body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401) throw new Error('Tu sesión venció.'); if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo completar la operación.'); return j.data; }); });
  }
  function tarjeta(h, d) {
    var dod = h.dod || {};
    return '<div class="qbs-tar" data-h="' + esc(h.id) + '"><div class="qbs-fila"><span class="qbs-chip' + (h.tipo === 'falla' ? ' f' : '') + '">' + esc(TIPO[h.tipo] || h.tipo) + '</span>' + (h.puntos ? '<span class="qbs-chip p">' + h.puntos + ' pts</span>' : '') + '</div><b>' + esc(h.titulo) + '</b>' +
      (h.criterios ? '<span class="qbs-sub">' + esc(h.criterios) + '</span>' : '') +
      (d.puedo_editar ? '<div class="qbs-dod">' + d.dod.map(function (x) { return '<label><input type="checkbox" data-dod="' + x.clave + '"' + (dod[x.clave] ? ' checked' : '') + '> ' + esc(x.nombre) + '</label>'; }).join('') + '</div>' +
        '<select data-estado="1">' + COL.map(function (c) { return '<option value="' + c[0] + '"' + (h.estado === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select>' : '') + '</div>';
  }
  function pintar(el, op, d) {
    var a = d.activo, enSprint = function (sid) { return d.historias.filter(function (h) { return h.sprint_id === sid; }); };
    var back = d.historias.filter(function (h) { return h.estado === 'backlog'; });
    var abiertos = d.sprints.filter(function (s) { return s.estado !== 'cerrado'; });
    var pct = d.resumen.puntos ? Math.round(100 * d.resumen.puntos_hechos / d.resumen.puntos) : (d.resumen.total ? Math.round(100 * d.resumen.hechas / d.resumen.total) : 0);
    el.innerHTML = '<div class="qbs">' +
      '<div class="qbs-fila" style="justify-content:space-between"><div><h3>Tablero Scrum</h3><p class="qbs-sub">' + d.resumen.hechas + ' de ' + d.resumen.total + ' historias hechas · ' + d.resumen.puntos_hechos + ' de ' + d.resumen.puntos + ' puntos · sprints de ' + d.dias_sprint + ' días. Para pasar a la comisión de prueba, el backlog debe quedar terminado.</p></div></div>' +
      '<div class="qbs-barra" aria-label="Avance ' + pct + ' %"><i style="width:' + pct + '%"></i></div>' +
      (a ? '<section class="qbs-caja"><div class="qbs-fila" style="justify-content:space-between"><h4>Sprint ' + a.numero + ' en curso · ' + esc(a.inicio) + ' → ' + esc(a.fin) + '</h4><span class="qbs-sub">Objetivo: ' + esc(a.objetivo || '') + '</span></div>' +
        '<div class="qbs-kan">' + COL.map(function (c) { return '<div class="qbs-col"><h4>' + c[1] + '</h4>' + enSprint(a.id).filter(function (h) { return h.estado === c[0]; }).map(function (h) { return tarjeta(h, d); }).join('') + '</div>'; }).join('') + '</div>' +
        (d.puedo_sprint ? '<label>Retrospectiva (qué salió bien y qué se mejora)<textarea data-c="retro"></textarea></label><div><button type="button" class="qbs-b" data-sprint="' + esc(a.id) + '" data-acc="cerrar">Cerrar sprint (Review y Retrospectiva)</button></div>' : '') + '</section>'
        : '<p class="qbs-sub">No hay un sprint en curso.</p>') +
      abiertos.filter(function (s) { return s.estado === 'planificado'; }).map(function (s) {
        return '<section class="qbs-caja"><h4>Sprint ' + s.numero + ' planificado · ' + esc(s.inicio) + ' → ' + esc(s.fin) + ' · ' + enSprint(s.id).length + ' historias</h4>' +
          enSprint(s.id).map(function (h) { return '<div class="qbs-it" data-h="' + esc(h.id) + '"><b>' + esc(h.titulo) + '</b>' + (d.puedo_editar ? '<button type="button" class="qbs-b" data-sacar="1">Quitar del sprint</button>' : '') + '</div>'; }).join('') +
          (d.puedo_sprint ? '<div class="qbs-form"><label>Objetivo del sprint<input data-obj="' + esc(s.id) + '" value="' + esc(s.objetivo || '') + '"></label><button type="button" class="qbs-b pri" data-sprint="' + esc(s.id) + '" data-acc="iniciar">Iniciar sprint</button></div>' : '') + '</section>';
      }).join('') +
      '<section class="qbs-caja"><h4>Product Backlog (' + back.length + ')</h4><div class="qbs-back">' + (back.length ? back.map(function (h) {
        return '<div class="qbs-it" data-h="' + esc(h.id) + '"><span class="qbs-chip' + (h.tipo === 'falla' ? ' f' : '') + '">' + esc(TIPO[h.tipo]) + '</span><b>' + esc(h.titulo) + (h.origen ? ' <span class="qbs-sub">(' + esc(h.origen) + ')</span>' : '') + '</b>' + (h.puntos ? '<span class="qbs-chip p">' + h.puntos + ' pts</span>' : '') +
          (d.puedo_priorizar ? '<button type="button" class="qbs-b" data-mover="arriba" aria-label="Subir prioridad">↑</button><button type="button" class="qbs-b" data-mover="abajo" aria-label="Bajar prioridad">↓</button><button type="button" class="qbs-b" data-descartar="1">Descartar</button>' : '') +
          (d.puedo_editar && abiertos.length ? '<select data-asignar="1"><option value="">Agregar a…</option>' + abiertos.map(function (s) { return '<option value="' + esc(s.id) + '">Sprint ' + s.numero + '</option>'; }).join('') + '</select>' : '') + '</div>';
      }).join('') : '<p class="qbs-sub">El backlog está vacío.</p>') + '</div>' +
      (d.puedo_falla ? '<div class="qbs-form"><label style="grid-column:1/-1">' + (d.puedo_editar ? 'Nueva historia de usuario' : 'Reportar una falla') + '<input data-c="h_tit" placeholder="Como [rol], quiero [acción] para [beneficio]"></label>' +
        '<label style="grid-column:1/-1">Criterios de aceptación<textarea data-c="h_crit"></textarea></label>' +
        (d.puedo_editar ? '<label>Tipo<select data-c="h_tipo"><option value="historia">Historia</option><option value="falla">Falla</option><option value="tecnica">Técnica</option></select></label><label>Puntos<select data-c="h_pts"><option value="">—</option><option>1</option><option>2</option><option>3</option><option>5</option><option>8</option><option>13</option><option>21</option></select></label>' : '') +
        '<button type="button" class="qbs-b pri" data-nueva="1">' + (d.puedo_editar ? 'Agregar al backlog' : 'Reportar falla') + '</button></div>' : '') + '</section>' +
      (d.puedo_sprint ? '<section class="qbs-caja"><h4>Nuevo sprint (' + d.dias_sprint + ' días)</h4><div class="qbs-form"><label>Objetivo<input data-c="s_obj"></label><label>Inicio<input type="date" data-c="s_ini"></label><button type="button" class="qbs-b" data-nuevo-sprint="1">Planificar sprint</button></div></section>' : '') +
      (d.sprints.some(function (s) { return s.estado === 'cerrado'; }) ? '<section class="qbs-caja"><h4>Sprints cerrados</h4>' + d.sprints.filter(function (s) { return s.estado === 'cerrado'; }).map(function (s) { return '<p><b>Sprint ' + s.numero + '</b> · ' + esc(s.inicio) + ' → ' + esc(s.fin) + ' · ' + enSprint(s.id).length + ' historias hechas<br><span class="qbs-sub">Retrospectiva: ' + esc(s.retro || '') + '</span></p>'; }).join('') + '</section>' : '') +
      '<div data-msg="1"></div></div>';
    enlazar(el, op, d);
  }
  function enlazar(el, op, d) {
    var msg = function (t, ok) { el.querySelector('[data-msg]').innerHTML = '<p class="' + (ok ? 'qbs-ok' : 'qbs-err') + '">' + esc(t) + '</p>'; };
    var hacer = function (metodo, ruta, cuerpo, ok) { pedir(op, metodo, ruta, cuerpo).then(function (nd) { pintar(el, op, nd); if (ok) msg(ok, true); }).catch(function (e) { msg(e.message, false); }); };
    var hid = function (x) { var c = x.closest('[data-h]'); return c && c.dataset.h; };
    var val = function (s) { var x = el.querySelector(s); return x ? x.value : ''; };
    el.querySelectorAll('[data-dod]').forEach(function (cb) { cb.addEventListener('change', function () { var o = {}; o[cb.dataset.dod] = cb.checked; hacer('PUT', '/historias/' + hid(cb), { dod: o }); }); });
    el.querySelectorAll('[data-estado]').forEach(function (s) { s.addEventListener('change', function () { hacer('PUT', '/historias/' + hid(s), { estado: s.value }, null); }); });
    el.querySelectorAll('[data-asignar]').forEach(function (s) { s.addEventListener('change', function () { if (s.value) hacer('PUT', '/historias/' + hid(s), { sprint_id: s.value }, 'Agregada al sprint.'); }); });
    el.querySelectorAll('[data-sacar]').forEach(function (b) { b.addEventListener('click', function () { hacer('PUT', '/historias/' + hid(b), { sprint_id: null }); }); });
    el.querySelectorAll('[data-mover]').forEach(function (b) { b.addEventListener('click', function () { hacer('PUT', '/historias/' + hid(b), { mover: b.dataset.mover }); }); });
    el.querySelectorAll('[data-descartar]').forEach(function (b) { b.addEventListener('click', function () { hacer('PUT', '/historias/' + hid(b), { estado: 'descartada' }, 'Historia descartada.'); }); });
    var nh = el.querySelector('[data-nueva]');
    if (nh) nh.addEventListener('click', function () { hacer('POST', '/historias', { titulo: val('[data-c="h_tit"]'), criterios: val('[data-c="h_crit"]'), tipo: val('[data-c="h_tipo"]') || 'falla', puntos: val('[data-c="h_pts"]'), origen: d.puedo_editar ? null : 'reportada por otra área' }, 'Agregada al backlog.'); });
    var ns = el.querySelector('[data-nuevo-sprint]');
    if (ns) ns.addEventListener('click', function () { hacer('POST', '/sprints', { objetivo: val('[data-c="s_obj"]'), inicio: val('[data-c="s_ini"]') }, 'Sprint planificado.'); });
    el.querySelectorAll('[data-sprint]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.acc, sid = b.dataset.sprint;
        hacer('POST', '/sprints/' + encodeURIComponent(sid) + '/' + a, a === 'cerrar' ? { retro: val('[data-c="retro"]') } : { objetivo: val('[data-obj="' + sid + '"]') }, a === 'cerrar' ? 'Sprint cerrado: lo no terminado volvió al backlog.' : 'Sprint iniciado.');
      });
    });
  }
  function render(el, op) {
    if (!el || !op || !op.id) return; estilos();
    el.innerHTML = '<div class="qbs"><p class="qbs-sub">Cargando el tablero…</p></div>';
    pedir(op, 'GET', '').then(function (d) { pintar(el, op, d); }).catch(function (e) { el.innerHTML = '<div class="qbs"><p class="qbs-err">' + esc(e.message) + '</p></div>'; });
  }
  window.qbScrum = { render: render };
  try { document.dispatchEvent(new CustomEvent('qb-scrum-listo')); } catch (e) { /* navegadores antiguos */ }
})();
