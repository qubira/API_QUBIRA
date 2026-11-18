/* ============================================================
   QUBIRA — Mapa jerárquico (componente compartido por ORH, DST y ADG).
   Uso: qbJerarquia.render(elemento)   → dibuja la pirámide, la cadena
   de mando, las áreas con sus cargos, la comunicación entre áreas, los
   permisos por nivel y las reglas. Lee /api/public/jerarquia (datos del
   catálogo de ORH: un cargo nuevo aparece aquí solo).
   ============================================================ */
(function () {
  'use strict';
  var SRC = (document.currentScript && document.currentScript.src) || 'https://api-qubira.onrender.com/api/public/jerarquia.js';
  var API = SRC.replace(/\/api\/public\/jerarquia\.js.*$/, '');
  var COLORES = ['#3b2fb8', '#4f46e5', '#6d5ef0', '#2563eb', '#0e7490', '#0f766e', '#15803d', '#4d7c0f', '#a16207'];
  var cache = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var CSS = '.qbj{--qbj-borde:rgba(127,127,140,.28);--qbj-suave:rgba(127,127,140,.08);--qbj-tenue:rgba(127,127,140,.85);color:inherit;font-size:14px;line-height:1.55;display:grid;gap:22px}' +
    '.qbj *{box-sizing:border-box}.qbj h3{margin:0;font-size:17px;font-weight:700}.qbj p{margin:0}.qbj .qbj-sub{color:var(--qbj-tenue);font-size:13px;margin-top:4px}' +
    '.qbj-caja{border:1px solid var(--qbj-borde);border-radius:12px;padding:18px;display:grid;gap:12px;min-width:0}' +
    '.qbj-cifras{display:flex;flex-wrap:wrap;gap:8px 26px}.qbj-cifras b{display:block;font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}.qbj-cifras span{color:var(--qbj-tenue);font-size:12.5px}' +
    '.qbj-pir{display:grid;gap:5px;justify-items:center}.qbj-esc{width:var(--w);max-width:100%;display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:8px 14px;border-radius:6px;background:var(--c);color:#fff;border:0;font:inherit;text-align:left;cursor:pointer}' +
    '.qbj-esc small{display:block;opacity:.85;font-size:12px}.qbj-esc b{font-size:14px}.qbj-esc .n{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;opacity:.9}.qbj-esc .c{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;opacity:.9;white-space:nowrap}' +
    '.qbj-esc.on{outline:3px solid var(--c);outline-offset:2px}.qbj-esc:focus-visible{outline:3px solid currentColor;outline-offset:2px}' +
    '.qbj-arbol{font:500 12.5px/1.8 ui-monospace,Consolas,monospace;white-space:pre;overflow-x:auto;margin:0}.qbj-arbol i{font-style:normal;color:var(--qbj-tenue)}' +
    '.qbj-chips{display:flex;flex-wrap:wrap;gap:6px}.qbj-chip{border:1px solid var(--qbj-borde);background:transparent;color:inherit;border-radius:999px;padding:6px 13px;font:600 12.5px inherit;font-family:inherit;cursor:pointer}' +
    '.qbj-chip.on{background:#4f46e5;border-color:#4f46e5;color:#fff}.qbj-chip:focus-visible{outline:2px solid #4f46e5;outline-offset:2px}' +
    '.qbj-areas{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;align-items:start}' +
    '.qbj-area{border:1px solid var(--qbj-borde);border-radius:12px;padding:16px;display:grid;gap:10px;min-width:0;background:var(--qbj-suave)}' +
    '.qbj-area header{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.qbj-area .sig{font-size:19px;font-weight:800}.qbj-area header small{display:block;color:var(--qbj-tenue);font-size:12px}' +
    '.qbj-rep{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0f766e;justify-self:start;border:1px solid rgba(15,118,110,.35);border-radius:999px;padding:2px 8px}' +
    '.qbj-niv{display:grid;grid-template-columns:30px 1fr;gap:8px;padding-top:8px;border-top:1px dashed var(--qbj-borde)}.qbj-niv .n{font:600 11.5px ui-monospace,Consolas,monospace;color:var(--c);padding-top:2px}' +
    '.qbj-niv .b{font-weight:700;font-size:12.5px;color:var(--c)}.qbj-cargos{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}.qbj-cargo{font-size:12.5px;padding:2px 8px;border-radius:6px;border:1px solid var(--qbj-borde);background:var(--qbj-suave)}' +
    '.qbj-flujo{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:10px 0;border-top:1px solid var(--qbj-borde)}.qbj-flujo:first-of-type{border-top:0}.qbj-flujo b{font:700 12px ui-monospace,Consolas,monospace;padding:3px 8px;border-radius:6px;background:rgba(79,70,229,.14)}' +
    '.qbj-flujo em{font-style:normal;color:var(--qbj-tenue)}.qbj-flujo .t{font-weight:700;margin-right:6px}.qbj-flujo p{flex-basis:100%;color:var(--qbj-tenue);font-size:12.5px}' +
    '.qbj-tabla{overflow-x:auto}.qbj table{border-collapse:collapse;width:100%;font-size:13px}.qbj th,.qbj td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--qbj-borde);vertical-align:top}.qbj th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--qbj-tenue)}' +
    '.qbj ol{margin:0;padding-left:20px;display:grid;gap:6px}.qbj-dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;align-items:start}.qbj-oculto{display:none!important}' +
    '.qbj-cargando{padding:30px;text-align:center;color:var(--qbj-tenue)}' +
    '@media(max-width:560px){.qbj-esc{grid-template-columns:36px 1fr;width:calc(58% + var(--k)*5.25%)}.qbj-esc .c{grid-column:2}.qbj-areas,.qbj-dos{grid-template-columns:1fr}}';

  function estilos() {
    if (document.getElementById('qbj-estilos')) return;
    var s = document.createElement('style'); s.id = 'qbj-estilos'; s.textContent = CSS; document.head.appendChild(s);
  }

  function arbol(d) {
    var porClave = {}; d.areas.forEach(function (a) { porClave[a.clave] = a; });
    var jefe = function (a) { var c = (a.cargos.find(function (x) { return x.nivel === 3; }) || {}).nombre; return c || ('Jefe de ' + a.etiqueta); };
    var cabeza = function (clave, nivel) { var a = porClave[clave]; var c = a && a.cargos.find(function (x) { return x.nivel === nivel; }); return c ? c.nombre : null; };
    var lineas = [];
    lineas.push('ALTA DIRECCIÓN GERENCIAL' + '                <i>ADG · N1</i>');
    var deADG = d.areas.filter(function (a) { return a.reporta === 'ADG' && a.clave !== 'GG'; });
    var deGG = d.areas.filter(function (a) { return a.reporta === 'GG'; });
    deADG.forEach(function (a) { lineas.push('├── ' + esc(jefe(a)) + '   <i>' + esc(a.etiqueta) + ' · N3 · reporta a ADG</i>'); });
    lineas.push('└── ' + esc(cabeza('GG', 2) || 'Gerente General') + '   <i>GG · N2</i>');
    deGG.forEach(function (a, i) { lineas.push('    ' + (i === deGG.length - 1 ? '└── ' : '├── ') + esc(jefe(a)) + '   <i>' + esc(a.etiqueta) + ' · N3</i>'); });
    return lineas.join('\n');
  }

  function pintar(el, d, estado) {
    var total = d.areas.reduce(function (s, a) { return s + a.cargos.length; }, 0);
    var porNivel = function (n) { return d.areas.reduce(function (s, a) { return s + a.cargos.filter(function (c) { return c.nivel === n; }).length; }, 0); };
    var color = function (n) { return COLORES[(n || 9) - 1]; };
    var areasVis = d.areas.filter(function (a) { return estado.area === 'TODAS' || a.clave === estado.area; });

    el.innerHTML = '<div class="qbj">' +
      '<div class="qbj-cifras"><div><b>' + d.niveles.length + '</b><span>niveles jerárquicos</span></div><div><b>' + d.areas.length + '</b><span>áreas</span></div><div><b>' + total + '</b><span>cargos y sub-cargos</span></div><div><b>' + d.flujos.length + '</b><span>flujos de comunicación</span></div></div>' +

      '<div class="qbj-caja"><div><h3>Pirámide jerárquica</h3><p class="qbj-sub">ADG en la cúspide, GG debajo y las oficinas de N3 a N9. Toca un nivel para ver solo sus cargos.</p></div><div class="qbj-pir">' +
      d.niveles.map(function (l) { var c = porNivel(l.n);
        return '<button type="button" class="qbj-esc' + (estado.nivel === l.n ? ' on' : '') + '" data-n="' + l.n + '" aria-pressed="' + (estado.nivel === l.n) + '" style="--w:' + (34 + (l.n - 1) * 8.25) + '%;--k:' + (l.n - 1) + ';--c:' + color(l.n) + '">' +
          '<span class="n">N' + l.n + '</span><span><b>' + esc(l.principal) + '</b><small>' + esc(l.zona) + '</small></span><span class="c">' + c + ' cargo' + (c === 1 ? '' : 's') + '</span></button>'; }).join('') +
      '</div></div>' +

      '<div class="qbj-dos"><div class="qbj-caja"><div><h3>Cadena de mando</h3><p class="qbj-sub">DST reporta directo a la Alta Dirección; las demás oficinas, a la Gerencia General.</p></div><pre class="qbj-arbol">' + arbol(d) + '</pre></div>' +
      '<div class="qbj-caja"><h3>Permisos por nivel</h3><div class="qbj-tabla"><table><thead><tr><th>Nivel</th><th>Ve</th><th>Dirige</th><th>Auditoría</th><th>Aprueba</th></tr></thead><tbody>' +
      d.permisos.map(function (p) { return '<tr><td><b>' + esc(p.niveles) + '</b></td><td>' + esc(p.ve) + '</td><td>' + esc(p.dirige) + '</td><td>' + esc(p.auditoria) + '</td><td>' + esc(p.aprueba) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="qbj-sub">Registrar empleados: quien tenga acceso a ORH. Eliminarlos: ORH y ADG desde N5. Datos sensibles: solo la Alta Dirección.</p></div></div>' +

      '<div class="qbj-caja"><div><h3>Áreas y cargos</h3><p class="qbj-sub">Cada área con su función y su escalera de cargos. Los cargos se administran en ORH → Configuración.</p></div>' +
      '<div class="qbj-chips">' + ['TODAS'].concat(d.areas.map(function (a) { return a.clave; })).map(function (k) {
        var a = d.areas.find(function (x) { return x.clave === k; });
        return '<button type="button" class="qbj-chip' + (estado.area === k ? ' on' : '') + '" data-area="' + esc(k) + '" aria-pressed="' + (estado.area === k) + '">' + esc(a ? a.etiqueta : 'Todas') + '</button>'; }).join('') +
      (estado.nivel ? '<button type="button" class="qbj-chip on" data-quitar="1">N' + estado.nivel + ' ✕</button>' : '') + '</div>' +
      '<div class="qbj-areas">' + areasVis.map(function (a) {
        var niveles = {}; a.cargos.forEach(function (c) { if (!estado.nivel || c.nivel === estado.nivel) (niveles[c.nivel] = niveles[c.nivel] || []).push(c.nombre); });
        var ns = Object.keys(niveles).map(Number).sort(function (x, y) { return x - y; });
        if (estado.nivel && !ns.length) return '';
        return '<article class="qbj-area"><header><div><span class="sig">' + esc(a.etiqueta) + '</span><small>' + esc(a.nombre) + '</small></div><small>' + a.cargos.length + ' cargos</small></header>' +
          (a.reporta ? '<span class="qbj-rep">Reporta a ' + esc(a.reportaEtiqueta) + '</span>' : '<span class="qbj-rep">Cúspide</span>') +
          (a.funcion ? '<p class="qbj-sub" style="margin:0">' + esc(a.funcion) + '</p>' : '') +
          (ns.length ? ns.map(function (n) { var l = d.niveles[n - 1] || {};
            return '<div class="qbj-niv" style="--c:' + color(n) + '"><span class="n">N' + n + '</span><div><span class="b">' + esc(l.principal || '') + '</span><div class="qbj-cargos">' +
              niveles[n].map(function (c) { return '<span class="qbj-cargo">' + esc(c) + '</span>'; }).join('') + '</div></div></div>'; }).join('') : '<p class="qbj-sub">Aún sin sub-cargos: créalos en ORH → Configuración.</p>') +
          '</article>'; }).join('') + '</div></div>' +

      '<div class="qbj-dos"><div class="qbj-caja"><div><h3>Comunicación entre áreas</h3><p class="qbj-sub">Cada área se encarga de lo suyo y le pide a la responsable lo que no le toca.</p></div><div>' +
      d.flujos.map(function (f) { return '<div class="qbj-flujo"><span class="t">' + esc(f.titulo) + '</span>' +
        f.pasos.map(function (p, i) { var s = String(p); var dob = s.indexOf('⇄') === 0; return (i ? '<em>' + (dob ? '⇄' : '→') + '</em>' : '') + '<b>' + esc(dob ? s.slice(1).trim() : s) + '</b>'; }).join('') +
        '<p>' + esc(f.texto) + '</p></div>'; }).join('') + '</div></div>' +
      '<div class="qbj-caja"><h3>Reglas de la jerarquía</h3><ol>' + d.reglas.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ol></div></div>' +
      '</div>';

    el.querySelectorAll('[data-n]').forEach(function (b) { b.onclick = function () { var n = +b.dataset.n; estado.nivel = estado.nivel === n ? null : n; pintar(el, d, estado); }; });
    el.querySelectorAll('[data-area]').forEach(function (b) { b.onclick = function () { estado.area = b.dataset.area; pintar(el, d, estado); }; });
    var q = el.querySelector('[data-quitar]'); if (q) q.onclick = function () { estado.nivel = null; pintar(el, d, estado); };
  }

  function render(el) {
    if (!el) return;
    estilos();
    var estado = { area: 'TODAS', nivel: null };
    if (cache) pintar(el, cache, estado); else el.innerHTML = '<div class="qbj"><div class="qbj-cargando">Cargando el mapa jerárquico…</div></div>';
    fetch(API + '/api/public/jerarquia', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (d) {
      cache = d; pintar(el, d, estado);
    }).catch(function () {
      if (!cache) el.innerHTML = '<div class="qbj"><div class="qbj-cargando">No se pudo cargar el mapa jerárquico. Revisa tu conexión y vuelve a abrir esta sección.</div></div>';
    });
  }

  window.qbJerarquia = { render: render };
  try { document.dispatchEvent(new CustomEvent('qb-jerarquia-lista')); } catch (e) { /* navegadores antiguos */ }
})();
