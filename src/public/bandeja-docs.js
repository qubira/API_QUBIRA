/* ============================================================
   Bandeja de documentos de QUBIRA — componente compartido.
   Lo que le toca a la cuenta revisar o aprobar en el registro de
   documentos (actas, informes, contratos…) y sus documentos observados.
   Lo usan los módulos que no tienen el registro completo de ADG
   (DST, ODACL…). Uso:
     <script src="https://api-qubira.onrender.com/api/public/bandeja.js" defer></script>
     qbBandeja.render(elemento, { token: function () { return '…'; } });
   ============================================================ */
(function () {
  'use strict';
  var SRC = (document.currentScript && document.currentScript.src) || '';
  var API = SRC.replace(/\/api\/public\/bandeja\.js.*$/, '') || 'https://api-qubira.onrender.com';

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fecha = function (f) { if (!f) return ''; var d = new Date(f); return isNaN(d) ? '' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }); };
  var ACCION = { REVISA: 'Revisar', APRUEBA: 'Aprobar', OBSERVA: 'Observó', RECHAZA: 'Rechazó', ARCHIVA: 'Archivó', CREA: 'Creó', EMITE: 'Emitió' };
  var HECHO = { REVISA: 'Revisó', APRUEBA: 'Aprobó', OBSERVA: 'Observó', RECHAZA: 'Rechazó', ARCHIVA: 'Archivó', CREA: 'Creó', EMITE: 'Emitió' };
  var TIPO_ACTA = { seguridad: 'Seguridad', calidad: 'Calidad de software', reglas: 'Reglas de negocio', comision: 'Comisión de prueba' };
  var SEV = { critico: 'Crítico', alto: 'Alto', medio: 'Medio', bajo: 'Bajo' };

  var CSS = [
    '.qbb{--qbb-borde:rgba(127,127,140,.28);--qbb-suave:rgba(127,127,140,.08);--qbb-tenue:rgba(127,127,140,.95);--qbb-acento:#5b4fe0;--qbb-ok:#0f8f6e;--qbb-mal:#c0392b;--qbb-aviso:#b45309;',
    'color:inherit;font-size:14px;line-height:1.55;display:grid;gap:18px;min-width:0}',
    '.qbb *{box-sizing:border-box}.qbb h3{margin:0;font-size:17px;font-weight:700}.qbb h4{margin:0;font-size:14px;font-weight:700}.qbb p{margin:0}.qbb button,.qbb textarea{font:inherit;color:inherit}',
    '.qbb-sub{color:var(--qbb-tenue);font-size:13px;margin-top:4px;max-width:75ch}',
    '.qbb-cab{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:flex-end;justify-content:space-between}',
    '.qbb-lista{display:grid;gap:10px}.qbb-vacio{border:1px dashed var(--qbb-borde);border-radius:12px;padding:22px;text-align:center;color:var(--qbb-tenue)}',
    '.qbb-doc{border:1px solid var(--qbb-borde);border-radius:12px;padding:14px 16px;display:grid;gap:10px;min-width:0}',
    '.qbb-fila{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center}',
    '.qbb-cod{font:600 12.5px ui-monospace,Consolas,monospace;color:var(--qbb-acento)}',
    '.qbb-tit{font-weight:600;font-size:14.5px;min-width:0;overflow-wrap:anywhere}',
    '.qbb-meta{color:var(--qbb-tenue);font-size:12.5px}',
    '.qbb-paso{display:inline-block;font-weight:700;font-size:10.5px;line-height:18px;letter-spacing:.06em;text-transform:uppercase;border-radius:4px;padding:0 6px;background:var(--qbb-acento);color:#fff}',
    '.qbb-paso.rev{background:transparent;color:var(--qbb-acento);border:1px solid var(--qbb-acento)}',
    '.qbb-acc{display:flex;flex-wrap:wrap;gap:8px}',
    '.qbb-b{border:1px solid var(--qbb-borde);background:transparent;border-radius:8px;padding:6px 13px;font-weight:600;font-size:13px;cursor:pointer}',
    '.qbb-b:hover{border-color:var(--qbb-acento)}.qbb-b:disabled{opacity:.55;cursor:wait}',
    '.qbb-b.pri{background:var(--qbb-acento);border-color:var(--qbb-acento);color:#fff}.qbb-b.mal{color:var(--qbb-mal);border-color:var(--qbb-mal)}',
    '.qbb-b:focus-visible,.qbb textarea:focus-visible{outline:2px solid var(--qbb-acento);outline-offset:2px}',
    '.qbb textarea{width:100%;min-height:70px;border:1px solid var(--qbb-borde);border-radius:8px;padding:8px 10px;background:transparent;resize:vertical}',
    '.qbb-err{color:var(--qbb-mal);font-size:13px}.qbb-okm{color:var(--qbb-ok);font-size:13px;font-weight:600}',
    '.qbb-det{border-top:1px solid var(--qbb-borde);padding-top:10px;display:grid;gap:12px;min-width:0}',
    '.qbb-ruta{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:13px}.qbb-ruta li{display:flex;gap:8px;flex-wrap:wrap}',
    '.qbb-ruta .hecho{color:var(--qbb-ok);font-weight:700}.qbb-ruta .falta{color:var(--qbb-tenue)}',
    '.qbb-cifras{display:flex;flex-wrap:wrap;gap:6px 22px}.qbb-cifras b{display:block;font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}.qbb-cifras span{color:var(--qbb-tenue);font-size:12px}',
    '.qbb-tabla{overflow-x:auto;border:1px solid var(--qbb-borde);border-radius:10px}.qbb table{border-collapse:collapse;width:100%;font-size:13px;min-width:520px}',
    '.qbb th,.qbb td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--qbb-borde);vertical-align:top}.qbb tr:last-child td{border-bottom:0}',
    '.qbb th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--qbb-tenue);font-weight:600}',
    '.qbb-sev{font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase}.qbb-sev.critico{color:#c0392b}.qbb-sev.alto{color:#d35400}.qbb-sev.medio{color:#b7950b}.qbb-sev.bajo{color:#27ae60}',
  ].join('');
  function estilos() {
    if (document.getElementById('qbb-estilos')) return;
    var st = document.createElement('style'); st.id = 'qbb-estilos'; st.textContent = CSS; document.head.appendChild(st);
  }

  function pedir(op, ruta, cuerpo) {
    var t = op.token ? op.token() : null;
    return fetch(API + '/api/documentos' + ruta, {
      method: cuerpo ? 'POST' : 'GET', cache: 'no-store',
      headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}),
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
        if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo completar la operación. Inténtalo de nuevo.');
        return j;
      });
    });
  }

  function tarjeta(d, observado) {
    var p = d.pendiente || {};
    var esRev = p.accion === 'REVISA';
    return '<article class="qbb-doc" data-cod="' + esc(d.codigo) + '">' +
      '<div class="qbb-fila"><span class="qbb-cod">' + esc(d.codigo) + '</span>' +
      (observado ? '<span class="qbb-paso rev">Observado</span>' : '<span class="qbb-paso' + (esRev ? ' rev' : '') + '">Te toca ' + esc((ACCION[p.accion] || p.accion || '').toLowerCase()) + '</span>') + '</div>' +
      '<div class="qbb-tit">' + esc(d.titulo) + '</div>' +
      '<div class="qbb-meta">' + esc(d.area) + ' · ' + esc(d.tipo) + (d.creado_por ? ' · lo creó ' + esc(d.creado_por) : '') + (d.emitido_en ? ' · ' + esc(fecha(d.emitido_en)) : '') + '</div>' +
      (observado
        ? '<p class="qbb-sub" style="margin:0">Corrígelo desde el módulo donde lo creaste y vuelve a enviarlo; conserva su código.</p>'
        : '<div class="qbb-acc">' +
          '<button type="button" class="qbb-b" data-ver="1">Ver contenido</button>' +
          '<button type="button" class="qbb-b pri" data-accion="' + (esRev ? 'REVISA' : 'APRUEBA') + '">' + (esRev ? 'Marcar como revisado' : 'Aprobar') + '</button>' +
          '<button type="button" class="qbb-b" data-pedir="OBSERVA">Observar</button>' +
          (esRev ? '' : '<button type="button" class="qbb-b mal" data-pedir="RECHAZA">Rechazar</button>') +
          '</div><div class="qbb-motivo" hidden></div><div class="qbb-msg"></div><div class="qbb-det" hidden></div>') +
      '</article>';
  }

  function detalle(info) {
    var doc = info.documento || {}, c = info.contenido;
    var ruta = (doc.ruta || []).filter(function (r) { return r.accion !== 'CREA'; });
    var html = '<div><h4>Hoja de ruta</h4><ul class="qbb-ruta">' + (ruta.length ? ruta.map(function (r) {
      var hecho = !!r.fecha;
      return '<li><span class="' + (hecho ? 'hecho' : 'falta') + '">' + (hecho ? '✓' : '○') + '</span><b>' + esc(r.area) + '</b> ' +
        esc(hecho ? (HECHO[r.accion] || r.accion) : (ACCION[r.accion] || r.accion)) +
        (hecho && r.usuario_nombre ? ' · ' + esc(r.usuario_nombre) : '') + (hecho ? ' · ' + esc(fecha(r.fecha)) : ' · pendiente') +
        (r.comentario ? ' — «' + esc(r.comentario) + '»' : '') + '</li>';
    }).join('') : '<li class="falta">Sin pasos registrados.</li>') + '</ul></div>';
    if (c && c.clase === 'acta') {
      var r = c.resumen || {}, sev = r.severidad || {}, ab = r.abiertos || {}, ctr = r.controles || {};
      html += '<div style="display:grid;gap:8px"><h4>' + esc(TIPO_ACTA[c.tipo] || 'Acta') + (c.proyecto ? ' · ' + esc(c.proyecto) : '') + '</h4>' +
        '<p class="qbb-meta">' + (c.auditor ? 'Auditor: ' + esc(c.auditor) + ' · ' : '') + 'Versión ' + esc(c.version || '1.0') + (c.fecha_emision ? ' · ' + esc(fecha(c.fecha_emision + 'T12:00:00')) : '') + '</p>' +
        '<div class="qbb-cifras"><div><b>' + (r.total || 0) + '</b><span>hallazgos</span></div>' +
        ['critico', 'alto', 'medio', 'bajo'].map(function (k) { return '<div><b>' + (ab[k] || 0) + ' / ' + (sev[k] || 0) + '</b><span>' + SEV[k] + ' abiertos</span></div>'; }).join('') +
        '<div><b>' + (ctr.cumplen || 0) + ' / ' + (ctr.evaluados || 0) + '</b><span>controles que cumplen</span></div></div>';
      if ((c.hallazgos || []).length) {
        html += '<div class="qbb-tabla"><table><thead><tr><th>Ref.</th><th>Hallazgo</th><th>Severidad</th><th>Estado</th><th>Fecha límite</th></tr></thead><tbody>' +
          c.hallazgos.map(function (h) { return '<tr><td>' + esc(h.id || '') + '</td><td>' + esc(h.titulo || 'Observación registrada') + '</td><td><span class="qbb-sev ' + esc(h.severidad || 'bajo') + '">' + esc(SEV[h.severidad] || h.severidad || '') + '</span></td><td>' + esc(String(h.estado || 'pendiente').replace('_', ' ')) + '</td><td>' + esc(h.fecha_limite || '—') + '</td></tr>'; }).join('') +
          '</tbody></table></div>';
      }
      var noCumplen = [];
      (c.controles || []).forEach(function (dm) { (dm.items || []).forEach(function (i) { if (i.cumple === 'no') noCumplen.push({ dominio: dm.dominio, ref: i.ref, control: i.control }); }); });
      if (noCumplen.length) {
        html += '<div class="qbb-tabla"><table><thead><tr><th>Ref.</th><th>Control que no cumple</th><th>Dominio</th></tr></thead><tbody>' +
          noCumplen.map(function (i) { return '<tr><td>' + esc(i.ref || '') + '</td><td>' + esc(i.control) + '</td><td>' + esc(i.dominio || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      }
      html += '</div>';
    } else {
      html += '<p class="qbb-sub" style="margin:0">' + (doc.enlace_externo ? 'Documento externo: <a href="' + esc(doc.enlace_externo) + '" target="_blank" rel="noopener">abrir enlace</a>.' : 'El contenido completo se ve en el módulo donde se creó.') + '</p>';
    }
    return html;
  }

  function render(el, op) {
    if (!el) return;
    op = op || {};
    estilos();
    el.innerHTML = '<div class="qbb"><div class="qbb-vacio">Cargando tus pendientes…</div></div>';
    pedir(op, '/pendientes').then(function (j) {
      var pend = j.data || [], obs = j.observados || [];
      el.innerHTML = '<div class="qbb">' +
        '<div class="qbb-cab"><div><h3>Pendientes de revisar o aprobar</h3><p class="qbb-sub">Documentos del registro en los que le toca actuar a tu área y nivel. Nadie aprueba lo que creó.</p></div>' +
        '<button type="button" class="qbb-b" data-recargar="1">Actualizar</button></div>' +
        '<div class="qbb-lista">' + (pend.length ? pend.map(function (d) { return tarjeta(d, false); }).join('') : '<div class="qbb-vacio">No tienes documentos pendientes. Cuando un acta, informe o contrato llegue a tu área, aparecerá aquí.</div>') + '</div>' +
        (obs.length ? '<div><h3>Tus documentos observados</h3><p class="qbb-sub">Tienen observaciones de quien los revisó o aprobó.</p></div><div class="qbb-lista">' + obs.map(function (d) { return tarjeta(d, true); }).join('') + '</div>' : '') +
        '</div>';
      enlazar(el, op);
    }).catch(function (e) {
      el.innerHTML = '<div class="qbb"><div class="qbb-vacio"><p class="qbb-err">' + esc(e.message) + '</p><p style="margin-top:10px"><button type="button" class="qbb-b" data-recargar="1">Reintentar</button></p></div></div>';
      enlazar(el, op);
    });
  }

  function enlazar(el, op) {
    el.querySelectorAll('[data-recargar]').forEach(function (b) { b.addEventListener('click', function () { render(el, op); }); });
    el.querySelectorAll('.qbb-doc[data-cod]').forEach(function (card) {
      var cod = card.dataset.cod, msg = card.querySelector('.qbb-msg'), det = card.querySelector('.qbb-det'), mot = card.querySelector('.qbb-motivo');
      var ocupado = function (si) { card.querySelectorAll('button').forEach(function (b) { b.disabled = si; }); };
      var actuar = function (accion, comentario) {
        ocupado(true); msg.innerHTML = '';
        pedir(op, '/' + encodeURIComponent(cod) + '/ruta', { accion: accion, comentario: comentario || undefined }).then(function (j) {
          var d = j.data || {};
          msg.innerHTML = '<p class="qbb-okm">' + esc(HECHO[accion] || accion) + ' · ' + esc(cod) + ' quedó ' + esc(String(d.estado || '').toLowerCase()) + '.</p>';
          card.querySelectorAll('.qbb-acc, .qbb-motivo').forEach(function (x) { x.hidden = true; });
          setTimeout(function () { render(el, op); }, 1800);
        }).catch(function (e) { msg.innerHTML = '<p class="qbb-err">' + esc(e.message) + '</p>'; ocupado(false); });
      };
      card.querySelectorAll('[data-accion]').forEach(function (b) { b.addEventListener('click', function () { actuar(b.dataset.accion); }); });
      card.querySelectorAll('[data-pedir]').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = b.dataset.pedir;
          mot.hidden = false;
          mot.innerHTML = '<label style="display:grid;gap:6px"><b style="font-size:13px">' + (a === 'OBSERVA' ? 'Observación para quien lo creó' : 'Motivo del rechazo') + '</b><textarea id="qbb-m-' + esc(cod) + '"></textarea></label>' +
            '<div class="qbb-acc" style="margin-top:8px"><button type="button" class="qbb-b ' + (a === 'OBSERVA' ? 'pri' : 'mal') + '" data-confirmar="1">' + (a === 'OBSERVA' ? 'Enviar observación' : 'Rechazar documento') + '</button><button type="button" class="qbb-b" data-cancelar="1">Cancelar</button></div>';
          var ta = mot.querySelector('textarea'); ta.focus();
          mot.querySelector('[data-cancelar]').addEventListener('click', function () { mot.hidden = true; mot.innerHTML = ''; });
          mot.querySelector('[data-confirmar]').addEventListener('click', function () {
            if (!ta.value.trim()) { msg.innerHTML = '<p class="qbb-err">' + (a === 'OBSERVA' ? 'Escribe la observación.' : 'Escribe el motivo del rechazo.') + '</p>'; ta.focus(); return; }
            actuar(a, ta.value.trim());
          });
        });
      });
      var ver = card.querySelector('[data-ver]');
      if (ver) ver.addEventListener('click', function () {
        if (!det.hidden) { det.hidden = true; ver.textContent = 'Ver contenido'; return; }
        det.hidden = false; ver.textContent = 'Ocultar contenido'; det.innerHTML = '<p class="qbb-meta">Cargando…</p>';
        pedir(op, '/' + encodeURIComponent(cod) + '/contenido').then(function (j) { det.innerHTML = detalle(j.data || {}); })
          .catch(function (e) { det.innerHTML = '<p class="qbb-err">' + esc(e.message) + '</p>'; });
      });
    });
  }

  window.qbBandeja = { render: render };
  try { document.dispatchEvent(new CustomEvent('qb-bandeja-lista')); } catch (e) { /* navegadores antiguos */ }
})();
