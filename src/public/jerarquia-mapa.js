/* ============================================================
   QUBIRA — Mapa jerárquico (componente compartido por ORH, DST y ADG).
   Uso: qbJerarquia.render(elemento)
   Dibuja la estructura oficial de cargos con los datos vivos del catálogo
   de ORH (/api/public/jerarquia):
   - Mapa general: los cargos en un solo organigrama conectado, con zoom,
     cadena de mando y conexiones de trabajo entre áreas.
   - Pirámide de 9 niveles y catálogo buscable de cargos.
   - Cadena de mando por áreas y organigrama de cada área.
   - Ficha de cada puesto (función, jefe, equipo, conexiones, perfil, permisos).
   - Practicantes, permisos por nivel, reglas y comunicación entre áreas.
   Un cargo nuevo creado en ORH aparece aquí solo (con su jefe y sub-área).
   ============================================================ */
(function () {
  'use strict';
  var SRC = (document.currentScript && document.currentScript.src) || 'https://api-qubira.onrender.com/api/public/jerarquia.js';
  var API = SRC.replace(/\/api\/public\/jerarquia\.js.*$/, '');
  var COLORES = ['#4338ca', '#5b4fe0', '#6d5ef0', '#2563eb', '#0e7490', '#0f766e', '#15803d', '#65761a', '#b45309'];
  var PERFIL = {
    1: 'Título universitario con maestría; 10 años o más de experiencia, 5 en dirección de empresas.',
    2: 'Título universitario, maestría deseable; 8 años o más, 4 dirigiendo áreas.',
    3: 'Título universitario en la especialidad; 6 años o más, 3 liderando equipos.',
    4: 'Título universitario; 4 años o más en el proceso que coordina.',
    5: 'Bachiller o título; 3 años o más en la especialidad, 1 liderando personas.',
    6: 'Título o certificaciones de la especialidad; 4 años o más de experiencia.',
    7: 'Bachiller o técnico titulado; 1 a 3 años de experiencia.',
    8: 'Técnico o estudios superiores; 0 a 2 años de experiencia.',
    9: 'Pre-profesional: estudiante en curso. Profesional: egresado hace menos de 12 meses.',
  };
  var PERMISO = {
    1: 'Ve todas las áreas, dirige a toda la empresa, ve toda la auditoría y aprueba todo.',
    2: 'Ve todas las oficinas bajo su mando; de DST ve solo los reportes e indicadores de seguridad, no su operación. Dirige a los jefes de oficina, ve la auditoría de su línea y aprueba la operación.',
    3: 'Ve y dirige su oficina, ve la auditoría de su área y aprueba lo de su área.',
    4: 'Ve su oficina, organiza su proceso y ve la auditoría de su área.',
    5: 'Ve su oficina, dirige su equipo y ve la auditoría de su área.',
    6: 'Ve su oficina. No dirige personas ni ve auditoría.',
    7: 'Ve su oficina. No dirige personas ni ve auditoría.',
    8: 'Ve solo lo que se le asigna.',
    9: 'Ve solo lo que se le asigna.',
  };
  var cache = null, secuencia = 0;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); };
  var color = function (n) { return COLORES[(n || 9) - 1]; };

  var CSS = [
    '.qbj{--qbj-borde:rgba(127,127,140,.28);--qbj-suave:rgba(127,127,140,.08);--qbj-tenue:rgba(127,127,140,.95);--qbj-rama:rgba(127,127,140,.55);--qbj-acento:#5b4fe0;--qbj-link:#d0397a;--qbj-mint:#0f8f6e;--qbj-ambar:#b45309;',
    'color:inherit;font-size:14px;line-height:1.55;display:grid;gap:22px;min-width:0}',
    '.qbj *{box-sizing:border-box}.qbj h3{margin:0;font-size:17px;font-weight:700}.qbj h4{margin:0;font-size:14.5px;font-weight:700}.qbj p{margin:0}',
    '.qbj .qbj-sub{color:var(--qbj-tenue);font-size:13px;margin-top:4px;max-width:75ch}.qbj button{font:inherit;color:inherit}',
    '.qbj-caja{border:1px solid var(--qbj-borde);border-radius:12px;padding:18px;display:grid;gap:14px;min-width:0}',
    '.qbj-cifras{display:flex;flex-wrap:wrap;gap:8px 26px}.qbj-cifras b{display:block;font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}.qbj-cifras span{color:var(--qbj-tenue);font-size:12.5px}',
    '.qbj-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
    '.qbj-chip{border:1px solid var(--qbj-borde);background:transparent;border-radius:999px;padding:6px 13px;font-weight:600;font-size:12.5px;cursor:pointer}',
    '.qbj-chip.on{background:var(--qbj-acento);border-color:var(--qbj-acento);color:#fff}.qbj-chip.fl.on{background:var(--qbj-link);border-color:var(--qbj-link)}',
    '.qbj-chip:focus-visible,.qbj-tb:focus-visible,.qbj input:focus-visible,.qbj select:focus-visible{outline:2px solid var(--qbj-acento);outline-offset:2px}',
    '.qbj-tb{border:1px solid var(--qbj-borde);background:transparent;border-radius:8px;padding:6px 12px;min-width:36px;font-weight:700;font-size:13.5px;cursor:pointer}.qbj-tb:hover{border-color:var(--qbj-acento)}',
    '.qbj-barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.qbj-zoom{font:600 12px ui-monospace,Consolas,monospace;color:var(--qbj-tenue);min-width:42px;text-align:center}',
    '.qbj-tg{display:inline-flex;gap:6px;align-items:center;font-size:13px;font-weight:600;cursor:pointer}.qbj-tg input{accent-color:var(--qbj-link)}',
    '.qbj input[type=search],.qbj select{font:500 13.5px inherit;font-family:inherit;color:inherit;background:transparent;border:1px solid var(--qbj-borde);border-radius:8px;padding:7px 11px;min-width:0}',
    '.qbj input[type=search]{flex:1 1 220px}.qbj select option{color:#141a2e}',
    /* mapa general */
    '.qbj-mapa{position:relative;height:min(72vh,760px);border:1px solid var(--qbj-borde);border-radius:12px;overflow:hidden;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;background-color:var(--qbj-fondo);background-image:radial-gradient(var(--qbj-borde) 1px,transparent 1px);background-size:22px 22px}',
    '.qbj-mapa.mov{cursor:grabbing}.qbj-lz{position:absolute;left:0;top:0;transform-origin:0 0}',
    '.qbj-mb{position:absolute;border:1px solid var(--qbj-borde);border-radius:12px;background:var(--qbj-suave)}',
    '.qbj-mb-h{position:absolute;left:14px;top:9px;font-weight:800;font-size:15px;line-height:20px;white-space:nowrap}.qbj-mb-h small{font-weight:500;font-size:12px;color:var(--qbj-tenue);margin-left:6px}',
    '.qbj-mb-o{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;padding:calc(26px / var(--s,1)) 8px 0;text-align:center;pointer-events:none;z-index:3}',
    '.qbj-mb-o b{font-weight:800;font-size:calc(24px / var(--s,1));line-height:1.05;background:var(--qbj-fondo);padding:0 .25em;border-radius:.2em}.qbj-mb-o small{font-weight:600;font-size:calc(11px / var(--s,1));color:var(--qbj-tenue);margin-top:.3em;max-width:100%}',
    '.qbj-lejos .qbj-mb-o{display:flex}.qbj-lejos .qbj-mb-h{visibility:hidden}.qbj-lejos .qbj-mn,.qbj-lejos .qbj-ms{opacity:.3}',
    '.qbj-lineas{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}.qbj-lineas .e{fill:none;stroke:var(--qbj-rama);stroke-width:1.5}',
    '.qbj-lineas .lk{fill:none;stroke:var(--qbj-link);stroke-width:1.6;stroke-dasharray:6 5;opacity:.75}.qbj-sinlk .lk,.qbj-lineas .lk.off{display:none}',
    '.qbj-mn{position:absolute;display:flex;gap:8px;align-items:flex-start;padding:7px 10px 7px 7px;border-radius:8px;border:1px solid color-mix(in srgb,var(--c) 40%,transparent);background:color-mix(in srgb,var(--c) 13%,var(--qbj-fondo));text-align:left;cursor:pointer;overflow:hidden;z-index:2}',
    '.qbj-mn.pr{background:color-mix(in srgb,var(--qbj-ambar) 16%,var(--qbj-fondo))}.qbj-mn:hover,.qbj-mn:focus-visible{outline:2px solid var(--c);outline-offset:1px}',
    '.qbj-bd{flex:none;font:600 10.5px/18px ui-monospace,Consolas,monospace;background:var(--c);color:#fff;border-radius:4px;padding:0 5px}',
    '.qbj-mn .tx{min-width:0}.qbj-mn b{font-weight:600;font-size:12.5px;line-height:16px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.qbj-mn small{display:block;font-size:11px;line-height:14px;color:var(--qbj-tenue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.qbj-ms{position:absolute;height:34px;display:inline-flex;align-items:center;padding:0 12px;border-radius:999px;background:color-mix(in srgb,var(--qbj-mint) 16%,var(--qbj-fondo));color:var(--qbj-mint);font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;z-index:2;cursor:pointer}',
    '.qbj-sel .qbj-mn,.qbj-sel .qbj-ms{opacity:.2}.qbj-sel .qbj-mn.on,.qbj-sel .qbj-ms.on{opacity:1;outline:2px solid var(--c,var(--qbj-mint));outline-offset:1px}',
    '.qbj-sel .qbj-mn.on2{opacity:1;outline:2px dashed var(--qbj-link);outline-offset:2px}.qbj-sel .qbj-mn.yo{opacity:1;outline:3px solid var(--c);box-shadow:0 0 0 7px color-mix(in srgb,var(--c) 25%,transparent)}',
    '.qbj-sel .e{opacity:.25}.qbj-sel .e.on{opacity:1;stroke:var(--qbj-acento);stroke-width:2.5}.qbj-sel .lk{opacity:.08}.qbj-sel .lk.on{opacity:1;stroke-width:2.6}',
    '.qbj-info{min-height:40px;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:13.5px;color:var(--qbj-tenue)}.qbj-info b{color:var(--qbj-texto,inherit)}.qbj-info .qbj-tb{font-size:12.5px}',
    '.qbj-hint{color:var(--qbj-tenue);font-size:12.5px}',
    '.qbj-cgs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px;align-items:start}',
    '.qbj-cg{border:1px solid var(--qbj-borde);border-radius:10px;padding:12px 14px;display:grid;gap:8px;min-width:0}.qbj-cg h4 span{font:500 11.5px ui-monospace,Consolas,monospace;color:var(--qbj-tenue)}',
    '.qbj-cg ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}.qbj-cx{border:0;background:none;padding:0;text-align:left;cursor:pointer;font-weight:600;font-size:13px;line-height:1.4}',
    '.qbj-cx:hover b{color:var(--qbj-acento);text-decoration:underline}.qbj-cx i{font:500 11px ui-monospace,Consolas,monospace;color:var(--qbj-tenue);font-style:normal}.qbj-cx em{font-style:normal;color:var(--qbj-link);padding:0 4px}.qbj-cg p{color:var(--qbj-tenue);font-size:12px}',
    /* pirámide y catálogo */
    '.qbj-pir{display:grid;gap:5px;justify-items:center}.qbj-esc{width:var(--w);max-width:100%;display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:8px 14px;border-radius:6px;background:color-mix(in srgb,var(--c) 16%,transparent);border:1px solid color-mix(in srgb,var(--c) 45%,transparent);text-align:left;cursor:pointer}',
    '.qbj-esc.on{background:var(--c);color:#fff}.qbj-esc small{display:block;opacity:.85;font-size:12px}.qbj-esc b{font-size:14px}.qbj-esc .n,.qbj-esc .c{font-family:ui-monospace,Consolas,monospace;font-size:12px;white-space:nowrap}',
    '.qbj-esc:focus-visible{outline:3px solid var(--c);outline-offset:2px}',
    '.qbj-cat{max-height:560px;overflow:auto;border:1px solid var(--qbj-borde);border-radius:10px}.qbj-cat table{min-width:780px}',
    '.qbj-cat thead th{position:sticky;top:0;background:var(--qbj-fondo);z-index:1}.qbj-cat tbody tr{cursor:pointer}.qbj-cat tbody tr:hover td,.qbj-cat tbody tr:focus-visible td{background:var(--qbj-suave)}',
    '.qbj-cat td .fn{color:var(--qbj-tenue);font-size:12.5px;margin-top:2px;max-width:60ch}.qbj-vacio{padding:22px;text-align:center;color:var(--qbj-tenue)}',
    '.qbj-tipo{display:inline-block;font-weight:700;font-size:10px;line-height:16px;letter-spacing:.08em;text-transform:uppercase;color:var(--qbj-ambar);border:1px solid var(--qbj-ambar);border-radius:4px;padding:0 5px;margin-right:6px;vertical-align:1px}',
    /* organigramas */
    '.qbj-tree,.qbj-tree ul{list-style:none;margin:0;padding:0}.qbj-tree li{position:relative;padding-top:6px}.qbj-tree ul.k{padding-left:36px}',
    '.qbj-tree ul.k>li::before{content:"";position:absolute;left:-13px;top:0;bottom:0;border-left:1.5px solid var(--qbj-rama)}.qbj-tree ul.k>li:last-child::before{bottom:auto;height:25px}',
    '.qbj-tree ul.k>li::after{content:"";position:absolute;left:-13px;top:25px;width:11px;border-top:1.5px solid var(--qbj-rama)}',
    '.qbj-nodo{display:inline-flex;align-items:flex-start;gap:10px;padding:8px 12px 8px 8px;max-width:100%;border-radius:8px;border:1px solid color-mix(in srgb,var(--c) 38%,transparent);background:color-mix(in srgb,var(--c) 10%,transparent);text-align:left;cursor:pointer;vertical-align:top}',
    '.qbj-nodo .tx{min-width:0}.qbj-nodo .tx b{display:block;font-weight:600;font-size:14px;line-height:20px}.qbj-nodo .tx small{display:block;font-size:12px;line-height:17px;color:var(--qbj-tenue)}',
    '.qbj-nodo .qbj-bd{font-size:11px;line-height:20px;padding:0 6px}.qbj-nodo.raiz{border-width:1.5px;border-color:var(--c)}.qbj-nodo.raiz .tx b{font-weight:800}.qbj-nodo.pr{background:color-mix(in srgb,var(--qbj-ambar) 12%,transparent)}',
    '.qbj-nodo:hover,.qbj-nodo:focus-visible{outline:2px solid var(--c);outline-offset:1px}.qbj-nodo.ir .tx b::after{content:" ↓";color:var(--qbj-tenue);font-weight:500}',
    '.qbj-sa{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid transparent;border-radius:999px;background:color-mix(in srgb,var(--qbj-mint) 14%,transparent);color:var(--qbj-mint);font-weight:700;font-size:11.5px;line-height:20px;letter-spacing:.08em;text-transform:uppercase;vertical-align:top}',
    '.qbj-sa i{font:500 11px ui-monospace,Consolas,monospace;letter-spacing:0;text-transform:none;font-style:normal;opacity:.85}',
    '.qbj-arbol{overflow-x:auto;padding-bottom:4px}.qbj-orgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:16px;align-items:start}',
    '.qbj-org{border:1px solid var(--qbj-borde);border-radius:12px;padding:18px;display:grid;gap:12px;min-width:0;background:var(--qbj-suave);scroll-margin-top:12px}.qbj-org.marca{border-color:var(--qbj-acento);box-shadow:0 0 0 3px color-mix(in srgb,var(--qbj-acento) 25%,transparent)}',
    '.qbj-org-top{display:flex;justify-content:space-between;gap:8px 14px;flex-wrap:wrap;align-items:flex-start}.qbj-org-top .sig{font-weight:800;font-size:22px;line-height:1.1}.qbj-org-top small{display:block;color:var(--qbj-tenue);font-size:13px}',
    '.qbj-rep{font:600 11.5px ui-monospace,Consolas,monospace;padding:3px 9px;border-radius:999px;border:1px solid var(--qbj-borde);color:var(--qbj-tenue);white-space:nowrap}',
    '.qbj-stats{display:flex;flex-wrap:wrap;gap:6px 22px}.qbj-stats div{display:grid}.qbj-stats b{font-weight:800;font-size:19px;font-variant-numeric:tabular-nums}.qbj-stats span{color:var(--qbj-tenue);font-size:12px}',
    '.qbj-strip{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:3px}.qbj-cel{display:grid;place-items:center;height:36px;border-radius:5px;background:color-mix(in srgb,var(--c) 20%,transparent);font:600 10.5px/1.15 ui-monospace,Consolas,monospace;text-align:center}',
    '.qbj-cel em{font-style:normal;font-weight:500;color:var(--qbj-tenue);display:block}.qbj-cel.vacio{background:transparent;border:1px dashed var(--qbj-borde);color:var(--qbj-tenue)}',
    '.qbj-subs{display:flex;flex-wrap:wrap;gap:6px}.qbj-subs span{font-weight:600;font-size:12px;color:var(--qbj-mint);background:color-mix(in srgb,var(--qbj-mint) 14%,transparent);padding:2px 9px;border-radius:999px}',
    '.qbj-cadena{border:1px solid var(--qbj-borde);border-radius:10px;padding:14px;overflow-x:auto}',
    '.qbj-leyenda{display:flex;flex-wrap:wrap;gap:8px 16px;color:var(--qbj-tenue);font-size:12.5px;align-items:center}',
    /* tablas, flujos, reglas */
    '.qbj-tabla{overflow-x:auto}.qbj table{border-collapse:collapse;width:100%;font-size:13px}.qbj th,.qbj td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--qbj-borde);vertical-align:top}',
    '.qbj th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--qbj-tenue);white-space:nowrap}.qbj .no{color:var(--qbj-tenue)}',
    '.qbj-flujo{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:10px 0;border-top:1px solid var(--qbj-borde)}.qbj-flujo:first-child{border-top:0}',
    '.qbj-flujo b{font:700 12px ui-monospace,Consolas,monospace;padding:3px 8px;border-radius:6px;background:color-mix(in srgb,var(--qbj-acento) 16%,transparent)}',
    '.qbj-flujo em{font-style:normal;color:var(--qbj-tenue)}.qbj-flujo .t{font-weight:700;margin-right:6px}.qbj-flujo p{flex-basis:100%;color:var(--qbj-tenue);font-size:12.5px}',
    '.qbj ol{margin:0;padding-left:20px;display:grid;gap:6px}.qbj-dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px;align-items:start}',
    '.qbj-prac{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px}.qbj-modal{border:1px solid var(--qbj-borde);border-radius:10px;padding:14px;display:grid;gap:8px;min-width:0}',
    '.qbj-modal dl{margin:0;display:grid;grid-template-columns:max-content 1fr;gap:5px 14px;font-size:13px}.qbj-modal dt{color:var(--qbj-tenue)}.qbj-modal dd{margin:0}',
    '.qbj-nota{border-left:3px solid var(--qbj-acento);padding-left:12px;display:grid;gap:4px;font-size:13px}',
    /* ficha */
    'dialog.qbj-ficha{border:1px solid var(--qbj-borde);border-radius:14px;background:var(--qbj-fondo);color:inherit;padding:0;width:min(640px,calc(100vw - 32px));max-height:calc(100vh - 48px)}',
    'dialog.qbj-ficha::backdrop{background:rgba(10,14,28,.5)}.qbj-ficha-in{padding:22px;display:grid;gap:14px}',
    '.qbj-ficha-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.qbj-ficha h3{font-size:20px}',
    '.qbj-tags{display:flex;flex-wrap:wrap;gap:6px}.qbj-tags span{font-weight:600;font-size:12px;padding:2px 9px;border-radius:999px;border:1px solid var(--qbj-borde);color:var(--qbj-tenue)}',
    '.qbj-ficha dl{margin:0;display:grid;grid-template-columns:140px 1fr;gap:10px 16px;font-size:14px}.qbj-ficha dt{color:var(--qbj-tenue);font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding-top:2px}',
    '.qbj-ficha dd{margin:0;min-width:0}.qbj-ficha dd ul{margin:0;padding-left:18px}.qbj-link{border:0;background:none;padding:0;color:var(--qbj-acento);cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-align:left}',
    '.qbj-orh{border:1px solid var(--qbj-borde);border-radius:10px;padding:12px 14px;font-size:13.5px;display:grid;gap:4px}.qbj-orh b{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--qbj-tenue)}',
    '.qbj-cargando{padding:30px;text-align:center;color:var(--qbj-tenue)}',
    '@media(max-width:560px){.qbj-esc{grid-template-columns:36px 1fr;width:calc(58% + var(--k)*5.25%)}.qbj-esc .c{grid-column:2}.qbj-mapa{height:62vh}',
    '.qbj-tree ul.k{padding-left:28px}.qbj-tree ul.k>li::before,.qbj-tree ul.k>li::after{left:-11px}.qbj-tree ul.k>li::after{width:9px}',
    '.qbj-ficha dl{grid-template-columns:1fr;gap:2px 0}.qbj-ficha dd{margin-bottom:10px}.qbj-cel{font-size:9.5px}}',
  ].join('');

  function estilos() {
    if (document.getElementById('qbj-estilos')) return;
    var s = document.createElement('style'); s.id = 'qbj-estilos'; s.textContent = CSS; document.head.appendChild(s);
  }

  // Fondo real del panel que contiene el mapa (las fichas lo necesitan opaco para tapar las líneas)
  function fondoDe(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var b = getComputedStyle(n).backgroundColor;
      if (b && b !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(b)) return b;
    }
    return 'Canvas';
  }

  /* ─── Modelo: cargos con su jefe, sub-áreas y conexiones ─── */
  function preparar(d) {
    var niveles = d.niveles || [];
    var areas = (d.areas || []).map(function (a) { return Object.assign({}, a, { lista: [] }); });
    var C = [];
    areas.forEach(function (a) {
      (a.cargos || []).forEach(function (c) {
        var x = { i: C.length, nombre: c.nombre, nivel: c.nivel || 9, area: a.clave, a: a, subarea: c.subarea || null, jefeNombre: c.jefe || null, funcion: c.funcion || '', k: [], padre: null };
        x.tipo = /pre-?profesional/i.test(x.nombre) ? 'pre' : (/^practicante profesional/i.test(x.nombre) ? 'pro' : null);
        C.push(x); a.lista.push(x);
      });
    });
    var clave = function (ar, n) { return ar + '|' + norm(n); };
    var porArea = new Map(), porNombre = new Map();
    C.forEach(function (x) { porArea.set(clave(x.area, x.nombre), x); if (!porNombre.has(norm(x.nombre))) porNombre.set(norm(x.nombre), x); });
    C.forEach(function (x) {
      if (!x.jefeNombre) return;
      var j = porArea.get(clave(x.area, x.jefeNombre)) || porNombre.get(norm(x.jefeNombre));
      if (!j || j === x) return;
      for (var p = j; p; p = p.padre) if (p === x) return; // evita ciclos
      x.padre = j; j.k.push(x);
    });
    var memo = new Map();
    var tieneOtra = function (x) {
      if (memo.has(x)) return memo.get(x);
      memo.set(x, false);
      var r = x.k.some(function (c) { return c.area !== x.area || tieneOtra(c); });
      memo.set(x, r); return r;
    };
    var LK = (d.conexiones || []).map(function (c) {
      return { a: porArea.get(clave(c.deArea, c.de)), b: porArea.get(clave(c.aArea, c.a)), f: c.flujo, txt: c.texto, dos: !!c.dosVias };
    }).filter(function (l) { return l.a && l.b; });
    areas.forEach(function (a) { a.raices = a.lista.filter(function (x) { return !x.padre || x.padre.area !== a.clave; }); });
    return { d: d, niveles: niveles, areas: areas, C: C, LK: LK, tipos: d.tiposConexion || [], tieneOtra: tieneOtra };
  }
  var niv = function (M, n) { return M.niveles[n - 1] || { n: n, base: 'N' + n, principal: 'N' + n }; };
  var baseDe = function (M, x) { return x.tipo === 'pre' ? 'Pre-profesional' : x.tipo === 'pro' ? 'Profesional' : (niv(M, x.nivel).principal || niv(M, x.nivel).base); };
  var bajo = function (k) { return (k || []).reduce(function (s, y) { return s + (y.sa ? 0 : 1) + bajo(y.k); }, 0); };
  // Hijos de un cargo dentro de su área: los que abren una sub-área nueva se agrupan bajo ella
  function agrupar(padre, hijos) {
    var out = [], grupos = new Map();
    hijos.forEach(function (c) {
      if (c.subarea && c.subarea !== padre.subarea) {
        if (!grupos.has(c.subarea)) { var s = { sa: c.subarea, k: [] }; grupos.set(c.subarea, s); out.push(s); }
        grupos.get(c.subarea).k.push(c);
      } else out.push(c);
    });
    return out;
  }
  var hijosVista = function (n) { return n.sa ? n.k : agrupar(n, n.k.filter(function (c) { return c.area === n.area; })); };

  /* ─── Pintado ─── */
  function pintar(el, d) {
    var M = preparar(d);
    var uid = 'qbj' + (++secuencia);
    var st = el.__qbj || (el.__qbj = { area: 'TODAS', nivel: null, est: 'todos', q: '', flujo: 'todos' });
    var nPrac = M.C.filter(function (x) { return x.nivel === 9; }).length;
    var totalSub = M.areas.reduce(function (s, a) { var u = {}; a.lista.forEach(function (x) { if (x.subarea) u[x.subarea] = 1; }); return s + Object.keys(u).length; }, 0);

    el.innerHTML = '<div class="qbj" style="--qbj-fondo:' + esc(fondoDe(el)) + '">' +
      '<div class="qbj-cifras">' + [[M.niveles.length || 9, 'niveles jerárquicos'], [M.areas.length, 'áreas'], [M.C.length, 'cargos'], [totalSub, 'sub-áreas'], [nPrac, 'practicantes (pre y profesionales)'], [M.LK.length, 'conexiones entre áreas']]
        .map(function (c) { return '<div><b>' + c[0] + '</b><span>' + c[1] + '</span></div>'; }).join('') + '</div>' +

      '<section class="qbj-caja" id="' + uid + '-mapa-sec"><div><h3>Mapa general</h3><p class="qbj-sub">Todos los cargos en un solo organigrama conectado. Las líneas grises son la cadena de mando; las punteadas de color, las conexiones de trabajo entre cargos de distintas áreas. Toca un cargo para ver su cadena de mando completa, su equipo y con quién trabaja.</p></div>' +
      '<div class="qbj-barra"><button type="button" class="qbj-tb" data-z="-" aria-label="Alejar">−</button><span class="qbj-zoom">100%</span><button type="button" class="qbj-tb" data-z="+" aria-label="Acercar">+</button>' +
      '<button type="button" class="qbj-tb" data-z="0">Ver todo</button><label class="qbj-tg"><input type="checkbox" class="qbj-lkchk" checked> Interconexiones</label>' +
      '<input type="search" class="qbj-ir" list="' + uid + '-lista" placeholder="Ir a un cargo (escribe y elige)" aria-label="Ir a un cargo"><datalist id="' + uid + '-lista">' +
      M.C.map(function (x) { return '<option value="' + esc(x.nombre) + '">' + esc(x.a.etiqueta) + ' · N' + x.nivel + '</option>'; }).join('') + '</datalist></div>' +
      '<div class="qbj-chips qbj-flujos"></div>' +
      '<div class="qbj-mapa"><div class="qbj-lz"></div></div><div class="qbj-info"></div>' +
      '<p class="qbj-hint">Arrastra para moverte. Usa + y −, Ctrl + rueda del mouse o pellizca con dos dedos para acercar. De lejos ves el bloque de cada área; de cerca, cada cargo.</p>' +
      '<h4>Conexiones entre cargos de distintas áreas</h4><div class="qbj-cgs">' + M.tipos.map(function (t) {
        var ls = M.LK.filter(function (l) { return l.f === t.k; }); if (!ls.length) return '';
        return '<div class="qbj-cg"><h4>' + esc(t.t) + ' <span>' + ls.length + '</span></h4><ul>' + ls.map(function (l) {
          return '<li><button type="button" class="qbj-cx" data-ver="' + l.a.i + '"><b>' + esc(l.a.nombre) + '</b> <i>' + esc(l.a.a.etiqueta) + '</i><em>' + (l.dos ? '⇄' : '→') + '</em><b>' + esc(l.b.nombre) + '</b> <i>' + esc(l.b.a.etiqueta) + '</i></button><p>' + esc(l.txt) + '</p></li>'; }).join('') + '</ul></div>';
      }).join('') + '</div></section>' +

      '<section class="qbj-caja"><div><h3>Pirámide jerárquica y catálogo de cargos</h3><p class="qbj-sub">Toca un nivel para filtrar el catálogo. Toca una fila para ver la ficha del puesto: funciones, perfil, permisos y cómo asignarlo en ORH.</p></div>' +
      '<div class="qbj-pir"></div><div class="qbj-chips qbj-areas"></div>' +
      '<div class="qbj-barra"><input type="search" class="qbj-buscar" placeholder="Buscar cargo o función (ej. contador, redes, nube)" aria-label="Buscar cargo"><select class="qbj-est" aria-label="Filtrar"><option value="todos">Todos los cargos</option><option value="prac">Solo practicantes</option><option value="jefes">Solo quienes dirigen personas</option></select></div>' +
      '<div class="qbj-hint qbj-resumen"></div><div class="qbj-cat"><table><thead><tr><th>Cargo y función</th><th>Nivel</th><th>Área</th><th>Sub-área</th><th>Jefe inmediato</th></tr></thead><tbody></tbody></table><div class="qbj-vacio" hidden>Ningún cargo coincide. Prueba con otra palabra o quita los filtros.</div></div></section>' +

      '<section class="qbj-caja"><div><h3>Cadena de mando</h3><p class="qbj-sub">DST reporta al Director General (CEO); las oficinas reportan solo al Gerente General. Los directores fijan la política de su ramo y revisan resultados. Toca un área para ir a su organigrama.</p></div>' +
      '<div class="qbj-cadena"></div><div class="qbj-leyenda">' + M.niveles.map(function (l) { return '<span style="display:inline-flex;gap:5px;align-items:center"><span class="qbj-bd" style="--c:' + color(l.n) + '">N' + l.n + '</span>' + esc(l.principal || l.base) + '</span>'; }).join('') + '</div>' +
      '<h4>Organigrama de cada área</h4><div class="qbj-orgs"></div></section>' +

      '<section class="qbj-caja"><div><h3>Practicantes: pre-profesionales y profesionales</h3><p class="qbj-sub">Cada oficina tiene al menos un par de practicantes (pre-profesional y profesional), los dos en N9. Las oficinas con más de un frente técnico pueden tener un par por sub-área. El sub-cargo se elige según el convenio (Ley 28518).</p></div>' +
      '<div class="qbj-prac"><div class="qbj-modal"><h4><span class="qbj-tipo">Pre</span>Practicante pre-profesional</h4><dl><dt>Quién</dt><dd>Estudiante de universidad, instituto o escuela superior, mientras cursa sus estudios.</dd><dt>Jornada máx.</dt><dd>6 horas diarias, 30 semanales.</dd><dt>Subvención</dt><dd>Al menos una remuneración mínima vital por jornada completa; proporcional si es menor.</dd></dl></div>' +
      '<div class="qbj-modal"><h4><span class="qbj-tipo">Pro</span>Practicante profesional</h4><dl><dt>Quién</dt><dd>Egresado o bachiller, dentro de los 12 meses siguientes a su egreso.</dd><dt>Jornada máx.</dt><dd>8 horas diarias, 48 semanales.</dd><dt>Subvención</dt><dd>Al menos una remuneración mínima vital.</dd></dl></div></div>' +
      '<div class="qbj-nota"><b>Para los dos</b><p>Seguro de salud, 15 días de descanso por cada 12 meses, media subvención adicional por cada 6 meses de convenio continuo y certificado al terminar. ORH registra el convenio y ODACL lo revisa antes de firmar.</p></div>' +
      '<div class="qbj-tabla"><table><thead><tr><th>Área</th><th>Sub-área</th><th>Pre-profesional</th><th>Profesional</th><th>Tutor (jefe inmediato)</th></tr></thead><tbody class="qbj-tprac"></tbody></table></div></section>' +

      '<div class="qbj-dos"><section class="qbj-caja"><h3>Permisos por nivel</h3><div class="qbj-tabla"><table><thead><tr><th>Nivel</th><th>Ve</th><th>Dirige</th><th>Auditoría</th><th>Aprueba</th></tr></thead><tbody>' +
      (d.permisos || []).map(function (p) { return '<tr><td><b>' + esc(p.niveles) + '</b></td><td>' + esc(p.ve) + '</td><td>' + esc(p.dirige) + '</td><td>' + esc(p.auditoria) + '</td><td>' + esc(p.aprueba) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="qbj-sub">Registrar empleados: quien tenga acceso a ORH. Eliminarlos: ORH y ADG desde N5. Datos sensibles: solo la Alta Dirección. La auditoría de DST la ve solo ADG.</p></section>' +
      '<section class="qbj-caja"><h3>Reglas de la jerarquía</h3><ol>' + (d.reglas || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ol></section></div>' +

      '<section class="qbj-caja"><div><h3>Comunicación entre áreas</h3><p class="qbj-sub">Cada área se encarga de lo suyo y le pide a la responsable lo que no le toca.</p></div><div>' +
      (d.flujos || []).map(function (f) { return '<div class="qbj-flujo"><span class="t">' + esc(f.titulo) + '</span>' +
        f.pasos.map(function (p, i) { var s = String(p), dob = s.indexOf('⇄') === 0; return (i ? '<em>' + (dob ? '⇄' : '→') + '</em>' : '') + '<b>' + esc(dob ? s.slice(1).trim() : s) + '</b>'; }).join('') +
        '<p>' + esc(f.texto) + '</p></div>'; }).join('') + '</div></section>' +

      '<dialog class="qbj-ficha" aria-labelledby="' + uid + '-ft"><div class="qbj-ficha-in"></div></dialog>' +
      '</div>';

    var raiz = el.querySelector('.qbj');
    var q = function (s) { return raiz.querySelector(s); };
    var mapa = montarMapa(M, raiz, st);
    pintarCatalogo(M, raiz, st);
    pintarOrganigramas(M, raiz);
    pintarPracticantes(M, raiz);

    var dlg = q('dialog.qbj-ficha');
    function abrirFicha(i) {
      var x = M.C[i]; if (!x) return;
      var l = niv(M, x.nivel);
      var enlace = function (y) { return '<button type="button" class="qbj-link" data-ficha="' + y.i + '">' + esc(y.nombre) + '</button>'; };
      var cx = M.LK.filter(function (k) { return k.a === x || k.b === x; });
      q('.qbj-ficha-in').innerHTML =
        '<div class="qbj-ficha-top"><div style="display:grid;gap:8px"><div class="qbj-tags"><span class="qbj-bd" style="--c:' + color(x.nivel) + ';font-size:11.5px;line-height:20px;padding:0 7px">N' + x.nivel + ' · ' + esc(l.principal || l.base) + '</span>' +
        (x.tipo ? '<span class="qbj-tipo">' + (x.tipo === 'pre' ? 'Pre-profesional' : 'Profesional') + '</span>' : '') + '</div><h3 id="' + uid + '-ft">' + esc(x.nombre) + '</h3></div>' +
        '<button type="button" class="qbj-tb" data-cerrar="1">Cerrar</button></div>' +
        '<div class="qbj-tags"><span>' + esc(x.a.etiqueta) + ' · ' + esc(x.a.nombre) + '</span>' + (x.subarea ? '<span style="color:var(--qbj-mint)">' + esc(x.subarea) + '</span>' : '') + '</div>' +
        '<dl><dt>Función</dt><dd>' + (x.funcion ? esc(x.funcion) : '<span class="no">Sin función registrada en ORH.</span>') + '</dd>' +
        '<dt>Jefe inmediato</dt><dd>' + (x.padre ? enlace(x.padre) + (x.padre.area !== x.area ? ' <span class="no">(' + esc(x.padre.a.etiqueta) + ')</span>' : '') : (x.jefeNombre ? esc(x.jefeNombre) : '<span class="no">Cúspide de la empresa</span>')) + '</dd>' +
        '<dt>Equipo directo</dt><dd>' + (x.k.length ? '<ul>' + x.k.map(function (y) { return '<li>' + enlace(y) + (y.area !== x.area ? ' <span class="no">(' + esc(y.a.etiqueta) + ')</span>' : '') + '</li>'; }).join('') + '</ul>' + (bajo(x.k) > x.k.length ? '<span class="no">' + bajo(x.k) + ' cargos en toda su línea.</span>' : '') : '<span class="no">No dirige personas.</span>') + '</dd>' +
        '<dt>Se conecta con</dt><dd>' + (cx.length ? '<ul>' + cx.map(function (k) { var o = k.a === x ? k.b : k.a; var fl = k.dos ? '⇄' : (k.a === x ? '→' : '←');
          return '<li>' + fl + ' ' + enlace(o) + ' <span class="no">(' + esc(o.a.etiqueta) + ')</span>: ' + esc(k.txt) + '</li>'; }).join('') + '</ul>' : '<span class="no">Trabaja dentro de su área; sin conexiones directas con otras.</span>') + '</dd>' +
        '<dt>Perfil mínimo</dt><dd>' + esc(PERFIL[x.nivel] || '') + '</dd><dt>Permisos</dt><dd>' + esc(PERMISO[x.nivel] || '') + '</dd></dl>' +
        '<div class="qbj-orh"><b>Para asignarlo en ORH</b><span>Área: <strong>' + esc(x.a.etiqueta) + '</strong> · Cargo principal: <strong>' + esc(l.principal || l.base) + ' (N' + x.nivel + ')</strong> · Sub-cargo: <strong>' + esc(x.nombre) + '</strong></span></div>' +
        '<button type="button" class="qbj-tb" data-ver="' + x.i + '" style="justify-self:start">Ver en el mapa general</button>';
      if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } }
      dlg.scrollTop = 0;
    }
    function cerrarFicha() { if (dlg.open) { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } } }
    dlg.addEventListener('click', function (e) { if (e.target === dlg) cerrarFicha(); });

    raiz.addEventListener('click', function (e) {
      var t = e.target.closest('[data-cerrar],[data-ver],[data-ficha],[data-ir]');
      if (!t || !raiz.contains(t)) return;
      if (t.dataset.cerrar) return cerrarFicha();
      if (t.dataset.ver !== undefined) { cerrarFicha(); q('#' + uid + '-mapa-sec').scrollIntoView({ block: 'start' }); mapa.verCargo(+t.dataset.ver); return; }
      if (t.dataset.ficha !== undefined) return abrirFicha(+t.dataset.ficha);
      if (t.dataset.ir) { var o = raiz.querySelector('[data-org="' + t.dataset.ir + '"]'); if (o) { o.scrollIntoView({ block: 'start' }); raiz.querySelectorAll('.qbj-org.marca').forEach(function (z) { z.classList.remove('marca'); }); o.classList.add('marca'); } }
    });
    raiz.addEventListener('keydown', function (e) {
      var tr = e.target.closest && e.target.closest('tr[data-ficha]');
      if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirFicha(+tr.dataset.ficha); }
    });
  }

  /* ─── Mapa general: arriba en árbol, cada área como columna ─── */
  function montarMapa(M, raiz, st) {
    var NW = 236, NH = 58, PITCH = 68, SAH = 34, SAP = 46, IND = 22, PAD = 14, HEAD = 40, CG = 40, VG = 84;
    function vista(x) {
      if (!M.tieneOtra(x)) return { col: true, x: x, etq: x.a.etiqueta, sub: x.a.nombre };
      var mismos = x.k.filter(function (c) { return c.area === x.area; });
      var equipo = mismos.filter(function (c) { return !M.tieneOtra(c); });
      var otros = [];
      if (equipo.length) otros.push({ col: true, x: { sa: 'Equipo de ' + x.nombre, k: agrupar(x, equipo) }, etq: x.a.etiqueta, sub: 'Equipo de ' + x.nombre });
      x.k.filter(function (c) { return c.area !== x.area || M.tieneOtra(c); }).forEach(function (c) { otros.push(vista(c)); });
      var cols = otros.filter(function (v) { return v.col; }), tds = otros.filter(function (v) { return !v.col; });
      var mitad = Math.ceil(cols.length / 2);
      return { x: x, hijos: cols.slice(0, mitad).concat(tds, cols.slice(mitad)) };
    }
    var NODOS = [], ARISTAS = [], BLOQUES = [], nodoDe = {}, MW = 0, MH = 0;
    function medir(v) {
      if (v.col) {
        v.rows = []; (function w(n, dd) { v.rows.push({ n: n, d: dd }); hijosVista(n).forEach(function (y) { w(y, dd + 1); }); })(v.x, 0);
        v.w = PAD * 2 + NW + Math.max.apply(null, v.rows.map(function (r) { return r.d; })) * IND;
        v.h = HEAD + v.rows.reduce(function (s, r) { return s + (r.n.sa ? SAP : PITCH); }, 0) + PAD - 10;
        return v.w;
      }
      v.cw = v.hijos.reduce(function (s, h) { return s + medir(h); }, 0) + CG * Math.max(0, v.hijos.length - 1);
      v.w = Math.max(NW, v.cw); return v.w;
    }
    function ubicar(v, x0, y) {
      if (v.col) {
        BLOQUES.push({ x: x0, y: y, w: v.w, h: v.h, etq: v.etq, sub: v.sub });
        var cy = y + HEAD, pila = [];
        v.rows.forEach(function (r, j) {
          var h = r.n.sa ? SAH : NH, nodo = { v: r.n, x: x0 + PAD + r.d * IND, y: cy, h: h, padre: r.d ? pila[r.d - 1] : null };
          pila[r.d] = nodo; NODOS.push(nodo);
          if (j === 0) v.raiz = nodo;
          if (r.d) { var p = pila[r.d - 1]; ARISTAS.push({ d: 'M' + (p.x + 14) + ' ' + (p.y + p.h) + ' V' + (cy + h / 2) + ' H' + nodo.x, hijo: nodo }); }
          cy += r.n.sa ? SAP : PITCH;
        });
        v.top = { x: x0 + PAD + NW / 2, y: y };
        MW = Math.max(MW, x0 + v.w); MH = Math.max(MH, y + v.h); return;
      }
      var nx = x0 + v.w / 2 - NW / 2, nodo = { v: v.x, x: nx, y: y, h: NH, padre: null };
      NODOS.push(nodo); v.raiz = nodo; v.top = { x: nx + NW / 2, y: y };
      var cx = x0 + (v.w - v.cw) / 2, yh = y + NH + VG, bus = y + NH + VG / 2;
      v.hijos.forEach(function (h) {
        ubicar(h, cx, yh); h.raiz.padre = nodo;
        ARISTAS.push({ d: 'M' + (nx + NW / 2) + ' ' + (y + NH) + ' V' + bus + ' H' + h.top.x + ' V' + h.top.y, hijo: h.raiz });
        cx += h.w + CG;
      });
      MW = Math.max(MW, x0 + v.w); MH = Math.max(MH, y + NH);
    }
    // Árbol principal: la raíz con más cargos debajo; las demás raíces (cargos sin jefe) van en una fila aparte
    var tops = M.C.filter(function (x) { return !x.padre; }).sort(function (a, b) { return bajo(b.k) - bajo(a.k); });
    if (tops.length) {
      var principal = vista(tops[0]); medir(principal); ubicar(principal, 40, 40);
      var sueltos = tops.slice(1).map(vista);
      if (sueltos.length) {
        var yS = MH + 110, xS = 40;
        sueltos.forEach(function (v) { medir(v); ubicar(v, xS, yS); xS += v.w + CG; });
      }
    }
    MW += 40; MH += 40;
    NODOS.forEach(function (z, k) { if (!z.v.sa) nodoDe[z.v.i] = k; });

    function dLink(a, b) {
      var ay = a.y + a.h / 2, by = b.y + b.h / 2, ax, bx, dx;
      if (b.x > a.x + NW) { ax = a.x + NW; dx = (b.x - ax) / 2; return 'M' + ax + ' ' + ay + ' C' + (ax + dx) + ' ' + ay + ' ' + (b.x - dx) + ' ' + by + ' ' + b.x + ' ' + by; }
      if (b.x + NW < a.x) { bx = b.x + NW; dx = (a.x - bx) / 2; return 'M' + a.x + ' ' + ay + ' C' + (a.x - dx) + ' ' + ay + ' ' + (bx + dx) + ' ' + by + ' ' + bx + ' ' + by; }
      ax = a.x + NW; bx = b.x + NW; var off = Math.max(70, Math.abs(by - ay) / 4);
      return 'M' + ax + ' ' + ay + ' C' + (ax + off) + ' ' + ay + ' ' + (bx + off) + ' ' + by + ' ' + bx + ' ' + by;
    }
    var LKm = M.LK.filter(function (l) { return nodoDe[l.a.i] !== undefined && nodoDe[l.b.i] !== undefined; });
    var mk = 'qbjfl' + secuencia;
    var vp = raiz.querySelector('.qbj-mapa'), lz = raiz.querySelector('.qbj-lz');
    lz.style.width = MW + 'px'; lz.style.height = MH + 'px';
    lz.innerHTML = BLOQUES.map(function (b) { return '<div class="qbj-mb" style="left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px"><span class="qbj-mb-h">' + esc(b.etq) + '<small>' + esc(b.sub) + '</small></span><span class="qbj-mb-o"><b>' + esc(b.etq) + '</b><small>' + esc(b.sub) + '</small></span></div>'; }).join('') +
      '<svg class="qbj-lineas" width="' + MW + '" height="' + MH + '" viewBox="0 0 ' + MW + ' ' + MH + '" aria-hidden="true"><defs><marker id="' + mk + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--qbj-link)"/></marker></defs>' +
      ARISTAS.map(function (a) { return '<path class="e" d="' + a.d + '"/>'; }).join('') +
      LKm.map(function (l) { return '<path class="lk" d="' + dLink(NODOS[nodoDe[l.a.i]], NODOS[nodoDe[l.b.i]]) + '" marker-end="url(#' + mk + ')"' + (l.dos ? ' marker-start="url(#' + mk + ')"' : '') + '/>'; }).join('') + '</svg>' +
      NODOS.map(function (z, k) {
        if (z.v.sa) return '<span class="qbj-ms" data-m="' + k + '" style="left:' + z.x + 'px;top:' + z.y + 'px">' + esc(z.v.sa) + '</span>';
        var x = z.v;
        return '<button type="button" class="qbj-mn' + (x.tipo ? ' pr' : '') + '" data-m="' + k + '" style="left:' + z.x + 'px;top:' + z.y + 'px;width:' + NW + 'px;height:' + NH + 'px;--c:' + color(x.nivel) + '" title="' + esc(x.nombre) + '"><span class="qbj-bd">N' + x.nivel + '</span><span class="tx"><b>' + esc(x.nombre) + '</b><small>' + esc(x.a.etiqueta) + ' · ' + esc(baseDe(M, x)) + '</small></span></button>';
      }).join('');
    var elsN = Array.prototype.slice.call(lz.querySelectorAll('[data-m]')), elsE = Array.prototype.slice.call(lz.querySelectorAll('.e')), elsL = Array.prototype.slice.call(lz.querySelectorAll('.lk'));
    var info = raiz.querySelector('.qbj-info'), zoomTxt = raiz.querySelector('.qbj-zoom');

    var s = 1, tx = 0, ty = 0, tocado = false;
    function aplicar() {
      lz.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
      vp.style.setProperty('--s', s); vp.classList.toggle('qbj-lejos', s < .5); zoomTxt.textContent = Math.round(s * 100) + '%';
    }
    function zoomEn(f, cx, cy) { var ns = Math.min(1.6, Math.max(.06, s * f)); tx = cx - (cx - tx) * ns / s; ty = cy - (cy - ty) * ns / s; s = ns; tocado = true; aplicar(); }
    function ajustar() {
      var r = vp.getBoundingClientRect(); if (!r.width || !MW) { s = .2; aplicar(); return; }
      s = Math.min(r.width / MW, r.height / MH); tx = (r.width - MW * s) / 2; ty = Math.max(0, (r.height - MH * s) / 2); aplicar();
    }
    function centrarEn(z) { var r = vp.getBoundingClientRect(); s = Math.max(s, .85); tx = r.width / 2 - (z.x + NW / 2) * s; ty = r.height / 2 - (z.y + z.h / 2) * s; tocado = true; aplicar(); }
    var mitad = function () { var r = vp.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
    raiz.querySelectorAll('[data-z]').forEach(function (b) {
      b.onclick = function () { var z = b.dataset.z; if (z === '0') { limpiar(); tocado = false; ajustar(); } else { var m = mitad(); zoomEn(z === '+' ? 1.3 : 1 / 1.3, m[0], m[1]); } };
    });
    vp.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); var r = vp.getBoundingClientRect(); zoomEn(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    var pts = new Map(), ini = null, pinch = null, movido = false;
    vp.addEventListener('pointerdown', function (e) {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { ini = { x: e.clientX, y: e.clientY, tx: tx, ty: ty }; movido = false; }
      else if (pts.size === 2) { var v = Array.from(pts.values()); pinch = { d: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) || 1, s: s }; }
    });
    vp.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        var v = Array.from(pts.values()), r = vp.getBoundingClientRect();
        zoomEn((pinch.s * Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) / pinch.d) / s, (v[0].x + v[1].x) / 2 - r.left, (v[0].y + v[1].y) / 2 - r.top); movido = true; return;
      }
      if (!ini) return;
      var dx = e.clientX - ini.x, dy = e.clientY - ini.y;
      if (!movido && Math.hypot(dx, dy) > 5) { movido = true; try { vp.setPointerCapture(e.pointerId); } catch (er) { /* sin captura */ } vp.classList.add('mov'); }
      if (movido) { tx = ini.tx + dx; ty = ini.ty + dy; tocado = true; aplicar(); }
    });
    var soltar = function (e) { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { ini = null; vp.classList.remove('mov'); } };
    vp.addEventListener('pointerup', soltar); vp.addEventListener('pointercancel', soltar);
    vp.addEventListener('click', function (e) {
      if (movido) { movido = false; e.stopPropagation(); e.preventDefault(); return; }
      var m = e.target.closest('[data-m]'); if (m) seleccionar(+m.dataset.m); else limpiar();
    }, true);

    var INFO0 = 'Toca un cargo para ver su cadena de mando completa, su equipo directo y con quién trabaja en otras áreas.';
    function limpiar() {
      vp.classList.remove('qbj-sel');
      elsN.forEach(function (n) { n.classList.remove('on', 'on2', 'yo'); }); elsE.forEach(function (n) { n.classList.remove('on'); }); elsL.forEach(function (n) { n.classList.remove('on'); });
      info.textContent = INFO0;
    }
    function seleccionar(k, centrar) {
      var n = NODOS[k]; if (!n) return;
      var cadena = new Set(), rel = new Set(), nl = 0;
      for (var p = n; p; p = p.padre) cadena.add(p);
      LKm.forEach(function (l, j) { var on = l.a === n.v || l.b === n.v; elsL[j].classList.toggle('on', on); if (on) { nl++; rel.add(NODOS[nodoDe[(l.a === n.v ? l.b : l.a).i]]); } });
      NODOS.forEach(function (z, j) { elsN[j].classList.toggle('on', cadena.has(z) || z.padre === n); elsN[j].classList.toggle('on2', rel.has(z)); elsN[j].classList.toggle('yo', z === n); });
      ARISTAS.forEach(function (a, j) { elsE[j].classList.toggle('on', cadena.has(a.hijo) || a.hijo.padre === n); });
      vp.classList.add('qbj-sel');
      if (n.v.sa) {
        info.innerHTML = '<b>' + esc(n.v.sa) + '</b><span>' + bajo(n.v.k) + ' cargos</span><button type="button" class="qbj-tb" data-limpiar="1">Quitar selección</button>';
      } else {
        var x = n.v, linea = [];
        Array.from(cadena).reverse().forEach(function (z) { if (!z.v.sa) linea.push(z.v.nombre); });
        info.innerHTML = '<b>' + esc(x.nombre) + '</b><span>' + esc(x.a.etiqueta) + ' · N' + x.nivel + ' ' + esc(baseDe(M, x)) + '</span><span>Cadena: ' + esc(linea.join(' › ')) + '</span><span>' + x.k.length + ' a cargo directo · ' + nl + ' conexi' + (nl === 1 ? 'ón' : 'ones') + ' con otras áreas</span>' +
          '<button type="button" class="qbj-tb" data-ficha="' + x.i + '">Ver ficha</button><button type="button" class="qbj-tb" data-limpiar="1">Quitar selección</button>';
      }
      var lb = info.querySelector('[data-limpiar]'); if (lb) lb.onclick = limpiar;
      if (centrar) centrarEn(n);
    }
    raiz.querySelector('.qbj-ir').addEventListener('change', function (e) {
      var v = norm(e.target.value), x = M.C.find(function (c) { return norm(c.nombre) === v; });
      if (x && nodoDe[x.i] !== undefined) { seleccionar(nodoDe[x.i], true); e.target.value = ''; }
    });
    var chk = raiz.querySelector('.qbj-lkchk');
    chk.addEventListener('change', function () { vp.classList.toggle('qbj-sinlk', !chk.checked); });
    function pintarFlujos() {
      var cont = raiz.querySelector('.qbj-flujos');
      cont.innerHTML = [{ k: 'todos', t: 'Todas las conexiones' }].concat(M.tipos).map(function (f) {
        var n = f.k === 'todos' ? '' : ' <span style="opacity:.75">' + LKm.filter(function (l) { return l.f === f.k; }).length + '</span>';
        return '<button type="button" class="qbj-chip fl' + (st.flujo === f.k ? ' on' : '') + '" data-fl="' + esc(f.k) + '" aria-pressed="' + (st.flujo === f.k) + '">' + esc(f.t) + n + '</button>';
      }).join('');
      cont.querySelectorAll('[data-fl]').forEach(function (b) { b.onclick = function () { st.flujo = b.dataset.fl; chk.checked = true; vp.classList.remove('qbj-sinlk'); pintarFlujos(); }; });
      LKm.forEach(function (l, j) { elsL[j].classList.toggle('off', st.flujo !== 'todos' && l.f !== st.flujo); });
    }
    pintarFlujos(); limpiar(); ajustar();
    // Si el mapa se dibujó oculto (pestaña sin abrir), se ajusta al aparecer
    if (window.ResizeObserver) new ResizeObserver(function () { if (!tocado) ajustar(); }).observe(vp);
    return { verCargo: function (i) { if (nodoDe[i] !== undefined) seleccionar(nodoDe[i], true); } };
  }

  /* ─── Pirámide y catálogo ─── */
  function pintarCatalogo(M, raiz, st) {
    var tbody = raiz.querySelector('.qbj-cat tbody'), vacio = raiz.querySelector('.qbj-vacio'), resumen = raiz.querySelector('.qbj-resumen');
    var buscar = raiz.querySelector('.qbj-buscar'), est = raiz.querySelector('.qbj-est');
    buscar.value = st.q; est.value = st.est;
    function pir() {
      raiz.querySelector('.qbj-pir').innerHTML = M.niveles.map(function (l) {
        var c = M.C.filter(function (x) { return x.nivel === l.n; }).length;
        return '<button type="button" class="qbj-esc' + (st.nivel === l.n ? ' on' : '') + '" data-n="' + l.n + '" aria-pressed="' + (st.nivel === l.n) + '" style="--w:' + (34 + (l.n - 1) * 8.25) + '%;--k:' + (l.n - 1) + ';--c:' + color(l.n) + '">' +
          '<span class="n">N' + l.n + '</span><span><b>' + esc(l.principal || l.base) + '</b><small>' + esc(l.zona || '') + '</small></span><span class="c">' + c + ' cargo' + (c === 1 ? '' : 's') + '</span></button>';
      }).join('');
      raiz.querySelectorAll('.qbj-pir [data-n]').forEach(function (b) { b.onclick = function () { var n = +b.dataset.n; st.nivel = st.nivel === n ? null : n; todo(); }; });
      raiz.querySelector('.qbj-areas').innerHTML = [{ clave: 'TODAS', etiqueta: 'Todas' }].concat(M.areas).map(function (a) {
        return '<button type="button" class="qbj-chip' + (st.area === a.clave ? ' on' : '') + '" data-area="' + esc(a.clave) + '" aria-pressed="' + (st.area === a.clave) + '">' + esc(a.etiqueta) + '</button>';
      }).join('');
      raiz.querySelectorAll('.qbj-areas [data-area]').forEach(function (b) { b.onclick = function () { st.area = b.dataset.area; todo(); }; });
    }
    function tabla() {
      var qq = norm(st.q);
      var filas = M.C.filter(function (x) {
        return (st.area === 'TODAS' || x.area === st.area) && (!st.nivel || x.nivel === st.nivel) &&
          (st.est === 'todos' || (st.est === 'prac' && x.nivel === 9) || (st.est === 'jefes' && x.k.length > 0)) &&
          (!qq || norm(x.nombre + ' ' + x.funcion + ' ' + (x.subarea || '') + ' ' + x.a.etiqueta + ' ' + x.a.nombre).indexOf(qq) >= 0);
      }).sort(function (a, b) { return a.nivel - b.nivel || M.areas.indexOf(a.a) - M.areas.indexOf(b.a); });
      tbody.innerHTML = filas.map(function (x) {
        return '<tr data-ficha="' + x.i + '" tabindex="0"><td>' + (x.tipo ? '<span class="qbj-tipo">' + (x.tipo === 'pre' ? 'Pre' : 'Pro') + '</span>' : '') + '<b style="font-weight:600">' + esc(x.nombre) + '</b>' + (x.funcion ? '<div class="fn">' + esc(x.funcion) + '</div>' : '') + '</td>' +
          '<td><span class="qbj-bd" style="--c:' + color(x.nivel) + ';font-size:11px;line-height:20px">N' + x.nivel + '</span> <span class="no">' + esc(baseDe(M, x)) + '</span></td>' +
          '<td><b>' + esc(x.a.etiqueta) + '</b></td><td>' + esc(x.subarea || '—') + '</td><td>' + esc(x.padre ? x.padre.nombre : (x.jefeNombre || '—')) + '</td></tr>';
      }).join('');
      vacio.hidden = filas.length > 0;
      var activos = [st.area !== 'TODAS' ? (M.areas.find(function (a) { return a.clave === st.area; }) || {}).etiqueta : '', st.nivel ? 'N' + st.nivel : '', st.est !== 'todos' ? est.selectedOptions[0].text.toLowerCase() : '', st.q ? '«' + st.q + '»' : ''].filter(Boolean);
      resumen.innerHTML = 'Mostrando ' + filas.length + ' de ' + M.C.length + ' cargos' + (activos.length ? ' · ' + esc(activos.join(' · ')) + ' <button type="button" class="qbj-link" data-limpiar-cat="1">Quitar filtros</button>' : '');
      var lb = resumen.querySelector('[data-limpiar-cat]');
      if (lb) lb.onclick = function () { st.area = 'TODAS'; st.nivel = null; st.est = 'todos'; st.q = ''; buscar.value = ''; est.value = 'todos'; todo(); };
    }
    function todo() { pir(); tabla(); }
    buscar.addEventListener('input', function () { st.q = buscar.value; tabla(); });
    est.addEventListener('change', function () { st.est = est.value; tabla(); });
    todo();
  }

  /* ─── Cadena de mando y organigramas ─── */
  function nodoHTML(M, x, esRaiz) {
    if (x.sa) { var n = bajo(x.k); return '<span class="qbj-sa">' + esc(x.sa) + '<i>' + n + ' cargo' + (n === 1 ? '' : 's') + '</i></span>'; }
    var a = bajo(hijosVista(x));
    var sub = x.tipo === 'pre' ? 'Practicante · estudiante' : x.tipo === 'pro' ? 'Practicante · egresado' : baseDe(M, x) + (a ? ' · ' + a + ' a cargo' : '');
    return '<button type="button" class="qbj-nodo' + (esRaiz ? ' raiz' : '') + (x.tipo ? ' pr' : '') + '" style="--c:' + color(x.nivel) + '" data-ficha="' + x.i + '"><span class="qbj-bd">N' + x.nivel + '</span><span class="tx"><b>' +
      (x.tipo ? '<span class="qbj-tipo">' + (x.tipo === 'pre' ? 'Pre' : 'Pro') + '</span>' : '') + esc(x.nombre) + '</b><small>' + esc(sub) + '</small></span></button>';
  }
  function rama(M, x, esRaiz) {
    var hijos = hijosVista(x);
    return '<li>' + nodoHTML(M, x, esRaiz) + (hijos.length ? '<ul class="k">' + hijos.map(function (y) { return rama(M, y); }).join('') + '</ul>' : '') + '</li>';
  }
  function pintarOrganigramas(M, raiz) {
    // Cadena de mando por áreas: el área de arriba es la del jefe de su cargo principal
    var padreArea = new Map();
    M.areas.forEach(function (a) { var r = a.raices[0]; if (r && r.padre) padreArea.set(a, r.padre.a); });
    var hijosArea = function (a) { return M.areas.filter(function (b) { return padreArea.get(b) === a; }); };
    var datos = function (a) {
      var subs = []; a.lista.forEach(function (x) { if (x.subarea && subs.indexOf(x.subarea) < 0) subs.push(x.subarea); });
      return { subs: subs, prac: a.lista.filter(function (x) { return x.nivel === 9; }).length };
    };
    var nodoArea = function (a, esRaiz) {
      var r = a.raices[0], dd = datos(a), n = r ? r.nivel : 3;
      return '<button type="button" class="qbj-nodo ir' + (esRaiz ? ' raiz' : '') + '" style="--c:' + color(n) + '" data-ir="' + esc(a.clave) + '"><span class="qbj-bd">N' + n + '</span><span class="tx"><b>' + esc(r ? r.nombre : a.etiqueta) + '</b><small>' + esc(a.etiqueta) + ' · ' + dd.subs.length + ' sub-áreas · ' + a.lista.length + ' cargos</small></span></button>';
    };
    var ramaArea = function (a, esRaiz) { var h = hijosArea(a); return '<li>' + nodoArea(a, esRaiz) + (h.length ? '<ul class="k">' + h.map(function (b) { return ramaArea(b); }).join('') + '</ul>' : '') + '</li>'; };
    var topes = M.areas.filter(function (a) { return !padreArea.has(a) && a.lista.length; });
    raiz.querySelector('.qbj-cadena').innerHTML = '<ul class="qbj-tree">' + topes.map(function (a) { return ramaArea(a, true); }).join('') + '</ul>';

    raiz.querySelector('.qbj-orgs').innerHTML = M.areas.filter(function (a) { return a.lista.length; }).map(function (a) {
      var dd = datos(a), porNivel = {};
      a.lista.forEach(function (x) { porNivel[x.nivel] = (porNivel[x.nivel] || 0) + 1; });
      var strip = M.niveles.map(function (l) { var v = porNivel[l.n]; return v ? '<span class="qbj-cel" style="--c:' + color(l.n) + '" title="N' + l.n + ': ' + v + '">N' + l.n + '<em>' + v + '</em></span>' : '<span class="qbj-cel vacio">N' + l.n + '<em>–</em></span>'; }).join('');
      var r = a.raices[0];
      var rep = r && r.padre ? 'Reporta a ' + r.padre.nombre + (r.padre.area !== a.clave ? ' (' + r.padre.a.etiqueta + ')' : '') : (a.reporta ? 'Reporta a ' + (a.reportaEtiqueta || a.reporta) : 'Cúspide');
      return '<article class="qbj-org" data-org="' + esc(a.clave) + '"><div class="qbj-org-top"><div><span class="sig">' + esc(a.etiqueta) + '</span><small>' + esc(a.nombre || '') + '</small></div><span class="qbj-rep">' + esc(rep) + '</span></div>' +
        (a.funcion ? '<p class="qbj-sub" style="margin:0">' + esc(a.funcion) + '</p>' : '') +
        '<div class="qbj-stats"><div><b>' + a.lista.length + '</b><span>cargos</span></div><div><b>' + dd.subs.length + '</b><span>sub-áreas</span></div><div><b>' + Object.keys(porNivel).length + '</b><span>niveles</span></div><div><b>' + dd.prac + '</b><span>practicantes</span></div></div>' +
        '<div class="qbj-strip" aria-label="Cargos por nivel">' + strip + '</div>' +
        (dd.subs.length ? '<div class="qbj-subs">' + dd.subs.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="qbj-arbol"><ul class="qbj-tree">' + a.raices.map(function (x, j) { return rama(M, x, j === 0); }).join('') + '</ul></div></article>';
    }).join('');
  }

  function pintarPracticantes(M, raiz) {
    var filas = [];
    M.areas.forEach(function (a) {
      var lista = a.lista.filter(function (x) { return x.nivel === 9; });
      var porTutor = new Map();
      lista.forEach(function (x) { var k = x.padre || x; if (!porTutor.has(k)) porTutor.set(k, []); porTutor.get(k).push(x); });
      porTutor.forEach(function (xs, tutor) {
        var pre = xs.filter(function (x) { return x.tipo === 'pre'; }), pro = xs.filter(function (x) { return x.tipo !== 'pre'; });
        filas.push('<tr><td><b>' + esc(a.etiqueta) + '</b></td><td>' + esc(xs[0].subarea || '—') + '</td><td>' + (pre.map(function (x) { return esc(x.nombre); }).join('<br>') || '—') + '</td><td>' + (pro.map(function (x) { return esc(x.nombre); }).join('<br>') || '—') + '</td><td>' +
          (tutor !== xs[0] ? esc(tutor.nombre) + ' <span class="no">N' + tutor.nivel + '</span>' : '<span class="no">Sin tutor asignado</span>') + '</td></tr>');
      });
      if (!lista.length) filas.push('<tr><td><b>' + esc(a.etiqueta) + '</b></td><td colspan="4"><span class="no">Sin practicantes</span></td></tr>');
    });
    raiz.querySelector('.qbj-tprac').innerHTML = filas.join('');
  }

  function render(el) {
    if (!el) return;
    estilos();
    if (cache) pintar(el, cache); else el.innerHTML = '<div class="qbj"><div class="qbj-cargando">Cargando el mapa jerárquico…</div></div>';
    fetch(API + '/api/public/jerarquia', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (d) {
      var nuevo = JSON.stringify(d), viejo = cache && JSON.stringify(cache);
      cache = d;
      if (nuevo !== viejo) pintar(el, d); // solo se vuelve a dibujar si el catálogo cambió
    }).catch(function () {
      if (!cache) el.innerHTML = '<div class="qbj"><div class="qbj-cargando">No se pudo cargar el mapa jerárquico. Revisa tu conexión y vuelve a abrir esta sección.</div></div>';
    });
  }

  window.qbJerarquia = { render: render };
  try { document.dispatchEvent(new CustomEvent('qb-jerarquia-lista')); } catch (e) { /* navegadores antiguos */ }
})();
