/* ============================================================
   Campana de notificaciones de QUBIRA — componente compartido.
   Se monta sola en la esquina inferior derecha cuando hay sesión:
     <script src="…/api/public/notificaciones.js" data-token="dst_token" defer></script>
   data-token: clave(s) de localStorage con el token, separadas por coma.
   ============================================================ */
(function () {
  'use strict';
  var yo = document.currentScript;
  var SRC = (yo && yo.src) || '';
  var API = SRC.replace(/\/api\/public\/notificaciones\.js.*$/, '') || 'https://api-qubira.onrender.com';
  var CLAVES = String((yo && yo.getAttribute('data-token')) || 'token').split(',').map(function (s) { return s.trim(); });
  var token = function () { for (var i = 0; i < CLAVES.length; i++) { try { var t = localStorage.getItem(CLAVES[i]); if (t) return t; } catch (e) { /* sin almacenamiento */ } } return null; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var hace = function (f) { var m = Math.round((Date.now() - new Date(f)) / 60000); return m < 1 ? 'ahora' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }); };
  var CSS = [
    '.qbn-btn{position:fixed;right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(58px + env(safe-area-inset-bottom,0px));z-index:9998;width:46px;height:46px;border-radius:50%;border:0;background:#4f46e5;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;display:grid;place-items:center}',
    '.qbn-btn:focus-visible{outline:3px solid #a5b4fc;outline-offset:2px}.qbn-btn svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.qbn-n{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#dc2626;color:#fff;font:700 11px/20px system-ui,sans-serif;text-align:center}',
    '.qbn-pan{position:fixed;right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(114px + env(safe-area-inset-bottom,0px));z-index:9999;width:min(380px,calc(100vw - 36px));max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.22);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.qbn-pan[hidden]{display:none}.qbn-cab{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e5e7eb}.qbn-cab b{font-size:15px}',
    '.qbn-cab button{border:0;background:none;color:#4f46e5;font-weight:600;cursor:pointer;font-size:12.5px}.qbn-lista{overflow:auto;padding:4px 0}',
    '.qbn-it{padding:10px 14px;border-bottom:1px solid #f3f4f6;display:grid;gap:2px;cursor:pointer}.qbn-it:hover{background:#f9fafb}.qbn-it.nueva{background:#eef2ff}',
    '.qbn-it b{font-size:13.5px}.qbn-it span{color:#4b5563;font-size:12.5px}.qbn-it i{color:#9ca3af;font-size:11.5px;font-style:normal}.qbn-vacio{padding:22px 14px;text-align:center;color:#6b7280}',
    '@media (prefers-color-scheme: dark){.qbn-pan{background:#161b2e;color:#e8ebf5;border-color:#2a3150}.qbn-cab{border-color:#2a3150}.qbn-it{border-color:#20263d}.qbn-it:hover{background:#1c2238}.qbn-it.nueva{background:#262352}.qbn-it span{color:#9aa3bf}}',
  ].join('');
  var btn, pan, datos = { sin_leer: 0, avisos: [] }, temporizador = null;
  function pedir(metodo, ruta) {
    var t = token(); if (!t) return Promise.reject(new Error('sin sesión'));
    return fetch(API + '/api/notificaciones' + ruta, { method: metodo, cache: 'no-store', headers: { Authorization: 'Bearer ' + t } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function pintar() {
    var n = btn.querySelector('.qbn-n');
    n.hidden = !datos.sin_leer; n.textContent = datos.sin_leer > 99 ? '99+' : datos.sin_leer;
    btn.setAttribute('aria-label', 'Notificaciones' + (datos.sin_leer ? ': ' + datos.sin_leer + ' sin leer' : ''));
    pan.querySelector('.qbn-lista').innerHTML = datos.avisos.length ? datos.avisos.map(function (a) {
      return '<div class="qbn-it' + (a.leida ? '' : ' nueva') + '" data-id="' + a.id + '" role="button" tabindex="0"><b>' + esc(a.titulo) + '</b>' + (a.texto ? '<span>' + esc(a.texto) + '</span>' : '') + '<i>' + esc(hace(a.creada)) + '</i></div>';
    }).join('') : '<div class="qbn-vacio">No tienes notificaciones.</div>';
  }
  function cargar() { return pedir('GET', '').then(function (j) { datos = j; pintar(); }).catch(function () { /* sin sesión o sin red: se reintenta luego */ }); }
  function montar() {
    if (btn || !token()) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'qbn-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg><span class="qbn-n" hidden></span>';
    pan = document.createElement('div'); pan.className = 'qbn-pan'; pan.hidden = true; pan.setAttribute('role', 'dialog'); pan.setAttribute('aria-label', 'Notificaciones');
    pan.innerHTML = '<div class="qbn-cab"><b>Notificaciones</b><button type="button" data-todas="1">Marcar todas como leídas</button></div><div class="qbn-lista"></div>';
    document.body.appendChild(pan); document.body.appendChild(btn);
    btn.addEventListener('click', function () { pan.hidden = !pan.hidden; if (!pan.hidden) cargar(); });
    pan.querySelector('[data-todas]').addEventListener('click', function () { pedir('POST', '/leer-todas').then(cargar).catch(function () {}); });
    var leer = function (it) { if (!it || !it.classList.contains('nueva')) return; it.classList.remove('nueva'); datos.sin_leer = Math.max(0, datos.sin_leer - 1); pintar(); pedir('POST', '/' + it.dataset.id + '/leer').catch(function () {}); };
    pan.addEventListener('click', function (e) { leer(e.target.closest('.qbn-it')); });
    pan.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') leer(e.target.closest('.qbn-it')); if (e.key === 'Escape') { pan.hidden = true; btn.focus(); } });
    document.addEventListener('click', function (e) { if (!pan.hidden && !pan.contains(e.target) && !btn.contains(e.target)) pan.hidden = true; });
    cargar();
    temporizador = setInterval(function () { if (!document.hidden) cargar(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) cargar(); });
  }
  // La sesión puede guardarse después de cargar la página (inicio de sesión): se reintenta
  function intentar(n) { montar(); if (!btn && n < 30) setTimeout(function () { intentar(n + 1); }, 2000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { intentar(0); }); else intentar(0);
  window.qbNotif = { recargar: cargar };
})();
