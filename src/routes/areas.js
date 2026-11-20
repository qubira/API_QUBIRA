'use strict';

/* ============================================================
   Áreas de trabajo para todos los módulos — fuente única: el
   catálogo «Áreas de trabajo» de ORH. Un área creada, renombrada o
   borrada en ORH se refleja sola en los filtros y listas de cada
   módulo, sin cambiar código.
   - GET /api/public/areas     → { areas: [{ clave, etiqueta }] }
   - GET /api/public/areas.js  → script que llena las listas de cada módulo
   ============================================================ */
const express = require('express');
const { listarAreas } = require('../lib/employeeArea');

const publico = express.Router();

let cache = { t: 0, areas: null };
publico.get('/areas', async (req, res) => {
  try {
    if (!cache.areas || Date.now() - cache.t > 60e3) cache = { t: Date.now(), areas: await listarAreas() };
    res.set('Cache-Control', 'no-store');
    res.json({ areas: cache.areas });
  } catch (e) { res.status(500).json({ error: 'No se pudieron leer las áreas' }); }
});

/* Cómo lo usa cada módulo:
   - Listas en JS: (window.__qbListasAreas ||= []).push([LISTA, 'CLAVE_PROPIA']);
     LISTA puede ser un arreglo [[clave, etiqueta], …] (se reemplaza su contenido,
     con el área propia primero) o un objeto { clave: etiqueta } (se completa).
   - Selects en HTML: <select data-qb-areas> se llena solo (conserva lo elegido).
   - Evento 'qb-areas' en document cuando llegan datos nuevos (para repintar).
   La lista escrita en cada módulo queda solo como respaldo sin conexión. */
const SCRIPT = `(function(){try{
var src=(document.currentScript&&document.currentScript.src)||'https://api-qubira.onrender.com/api/public/areas.js';
var url=src.replace(/\\/api\\/public\\/areas\\.js.*$/,'')+'/api/public/areas';
var datos=null;try{datos=JSON.parse(localStorage.getItem('qb_areas')||'null')}catch(e){}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function aplicar(r){if(!datos||!datos.length||!r)return;var lista=r[0],propia=r[1];
if(Array.isArray(lista)){var n=datos.map(function(a){return[a.clave,a.etiqueta]});if(propia)n.sort(function(x,y){return(y[0]===propia)-(x[0]===propia)});lista.splice.apply(lista,[0,lista.length].concat(n))}
else if(lista&&typeof lista==='object'){datos.forEach(function(a){lista[a.clave]=a.etiqueta})}}
function selects(){if(!datos||!datos.length)return;document.querySelectorAll('select[data-qb-areas]').forEach(function(s){var v=s.value,vacio=s.getAttribute('data-qb-areas-vacio');
s.innerHTML=(vacio!==null?'<option value="">'+esc(vacio||'Todas')+'</option>':'')+datos.map(function(a){return'<option value="'+esc(a.clave)+'">'+esc(a.etiqueta)+'</option>'}).join('');if(v)s.value=v})}
var reg=window.__qbListasAreas=window.__qbListasAreas||[];var push=reg.push;
reg.push=function(r){push.call(reg,r);aplicar(r);return reg.length};
function todo(){if(!datos)return;reg.forEach(aplicar);selects();try{document.dispatchEvent(new CustomEvent('qb-areas',{detail:datos}))}catch(e){}}
window.qbAreas=function(){return datos||[]};
todo();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',selects);
fetch(url,{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){if(d&&d.areas&&d.areas.length){var nuevo=JSON.stringify(d.areas)!==JSON.stringify(datos);datos=d.areas;try{localStorage.setItem('qb_areas',JSON.stringify(datos))}catch(e){}if(nuevo)todo()}}).catch(function(){});
}catch(e){}})();`;
publico.get('/areas.js', (req, res) => {
  res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
  res.send(SCRIPT);
});

/* Mapa jerárquico: datos (sin nombres de personas) y el componente que lo dibuja */
const fs = require('fs');
const path = require('path');
const { datosJerarquia } = require('../lib/jerarquia');
const MAPA_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'jerarquia-mapa.js'), 'utf8');
const BANDEJA_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'bandeja-docs.js'), 'utf8');
const FLUJO_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'flujo-proyecto.js'), 'utf8');
let cacheJer = { t: 0, d: null };
publico.get('/jerarquia', async (req, res) => {
  try {
    if (!cacheJer.d || Date.now() - cacheJer.t > 60e3) cacheJer = { t: Date.now(), d: await datosJerarquia() };
    res.set('Cache-Control', 'no-store');
    res.json(cacheJer.d);
  } catch (e) { res.status(500).json({ error: 'No se pudo leer la jerarquía' }); }
});
publico.get('/jerarquia.js', (req, res) => {
  res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
  res.send(MAPA_JS);
});
// Bandeja de pendientes del registro de documentos (la usan DST, ODACL y otros módulos)
publico.get('/bandeja.js', (req, res) => {
  res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
  res.send(BANDEJA_JS);
});
// Panel del flujo de proyectos (etapas y puertas) para ADG, GG, OTI, OPP, ODACL, DST y OCOS
publico.get('/flujo-proyecto.js', (req, res) => {
  res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
  res.send(FLUJO_JS);
});

module.exports = { publico };
