'use strict';

/* ============================================================
   Estado del servidor (Render, plan gratuito: 750 h/mes por workspace).
   - Cada 5 min, mientras el proceso está vivo, guarda un "latido" en
     sistema.render_latidos (uno por bloque de 5 min). Las horas usadas del
     mes = bloques con latido × 5 min.
   - GET  /api/public/estado     → JSON con tiempo encendido y horas del mes.
   - GET  /api/public/estado.js  → indicador flotante que cada módulo incluye
     con una sola línea <script>.
   ============================================================ */

const express = require('express');
const { pool } = require('../db');

const publico = express.Router();
const LIMITE = Number(process.env.RENDER_HORAS_LIMITE) || 750;
const INICIO = new Date();
const BLOQUE_MIN = 5;

let esquema = null;
function asegurarEsquema() {
  if (!esquema) {
    esquema = pool.query(`
      CREATE SCHEMA IF NOT EXISTS sistema;
      CREATE TABLE IF NOT EXISTS sistema.render_latidos (
        bloque TIMESTAMPTZ PRIMARY KEY
      );
    `).catch(e => { esquema = null; throw e; });
  }
  return esquema;
}

async function latido() {
  try {
    await asegurarEsquema();
    await pool.query(`INSERT INTO sistema.render_latidos (bloque)
      VALUES (to_timestamp(floor(extract(epoch FROM NOW()) / ${BLOQUE_MIN * 60}) * ${BLOQUE_MIN * 60}))
      ON CONFLICT DO NOTHING`);
    // Se guardan solo 3 meses
    await pool.query(`DELETE FROM sistema.render_latidos WHERE bloque < NOW() - INTERVAL '100 days'`);
  } catch (e) { console.warn('[ESTADO] latido:', e.message); }
}

// Solo se mide en Render (o si se fuerza con MEDIR_HORAS=on)
function iniciarMedicion() {
  if (!process.env.RENDER_EXTERNAL_URL && process.env.MEDIR_HORAS !== 'on') return;
  latido();
  setInterval(latido, BLOQUE_MIN * 60 * 1000);
}

publico.get('/estado', async (req, res) => {
  try {
    await asegurarEsquema();
    // Mes de facturación de Render: mes calendario en UTC
    const { rows: [r] } = await pool.query(`
      SELECT COUNT(*)::int AS bloques,
             MIN(bloque) AS desde,
             date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS inicio_mes,
             (date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC' AS fin_mes
      FROM sistema.render_latidos
      WHERE bloque >= date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
    const usadas = r.bloques * BLOQUE_MIN / 60 + (Number(process.env.RENDER_HORAS_AJUSTE) || 0);
    const horasRestantesMes = (new Date(r.fin_mes) - Date.now()) / 36e5;
    res.set('Cache-Control', 'no-store');
    res.json({
      encendido_desde: INICIO.toISOString(),
      encendido_segundos: Math.round(process.uptime()),
      horas_usadas_mes: +usadas.toFixed(2),
      limite: LIMITE,
      horas_restantes: +Math.max(0, LIMITE - usadas).toFixed(2),
      porcentaje: +(usadas / LIMITE * 100).toFixed(1),
      // Si sigue encendido hasta fin de mes
      proyeccion_fin_mes: +(usadas + horasRestantesMes).toFixed(1),
      medido_desde: r.desde,
      inicio_mes: r.inicio_mes,
      fin_mes: r.fin_mes,
      servicio: 'API_QUBIRA',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Indicador flotante para todos los módulos
const SCRIPT = `(function(){try{
if(window.__qbEstado)return;window.__qbEstado=1;
var s=document.currentScript||document.querySelector('script[src*="/api/public/estado.js"]');
var api=s.src.replace(/\\/estado\\.js.*$/,'')+'/estado';
var css='#qb-estado{position:fixed;right:12px;bottom:12px;z-index:2147483000;font:600 11.5px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#111827;color:#e5e7eb;border-radius:999px;padding:6px 11px 6px 9px;display:flex;align-items:center;gap:7px;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;user-select:none;opacity:.94}'+
'#qb-estado:hover{opacity:1}#qb-estado i{width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.25);flex:none}'+
'#qb-estado.alerta i{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.25)}#qb-estado.critico i{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.25)}#qb-estado.caido i{background:#9ca3af;box-shadow:none}'+
'#qb-estado .sep{opacity:.35}#qb-estado.min .txt{display:none}#qb-estado.min{padding:7px}'+
'#qb-estado-det{position:fixed;right:12px;bottom:48px;z-index:2147483000;width:270px;background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.18);padding:12px 14px;font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:none}'+
'#qb-estado-det b{font-weight:800}#qb-estado-det .fila{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:12px}#qb-estado-det .fila:last-of-type{border:0}'+
'#qb-estado-det .barra{height:8px;border-radius:99px;background:#f1f5f9;overflow:hidden;margin:8px 0 4px}#qb-estado-det .barra span{display:block;height:100%;border-radius:99px}'+
'#qb-estado-det small{color:#6b7280;font-size:11px;display:block;margin-top:6px}@media print{#qb-estado,#qb-estado-det{display:none!important}}';
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
var el=document.createElement('div');el.id='qb-estado';el.title='Estado del servidor QUBIRA (clic para ver detalle)';el.innerHTML='<i></i><span class="txt">Servidor…</span>';
var det=document.createElement('div');det.id='qb-estado-det';
function pon(){document.body.appendChild(el);document.body.appendChild(det)}
if(document.body)pon();else document.addEventListener('DOMContentLoaded',pon);
var mini=false;try{mini=localStorage.getItem('qb_estado_min')==='1'}catch(e){}
if(mini)el.classList.add('min');
var datos=null,base=0,t0=Date.now();
function dur(s){s=Math.max(0,Math.floor(s));var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d?d+' d '+h+' h':h?h+' h '+m+' min':m+' min'}
function hrs(x){return (Math.round(x*10)/10).toLocaleString('es-PE')+' h'}
function pinta(){if(!datos)return;var up=base+(Date.now()-t0)/1000;
var cls=datos.horas_restantes<50?'critico':datos.horas_restantes<150?'alerta':'';el.className=(mini?'min ':'')+cls;
el.querySelector('.txt').innerHTML='Activo '+dur(up)+' <span class="sep">|</span> Quedan '+hrs(datos.horas_restantes)+' de '+datos.limite;
var p=Math.min(100,datos.porcentaje),col=p>=93?'#ef4444':p>=80?'#f59e0b':'#10b981';
var fin=new Date(datos.fin_mes),dias=Math.max(0,Math.ceil((fin-Date.now())/864e5));
det.innerHTML='<b>Servidor QUBIRA (Render)</b>'+
'<div class="barra"><span style="width:'+p+'%;background:'+col+'"></span></div>'+
'<div class="fila"><span>Usadas este mes</span><b>'+hrs(datos.horas_usadas_mes)+' ('+datos.porcentaje+' %)</b></div>'+
'<div class="fila"><span>Quedan</span><b style="color:'+col+'">'+hrs(datos.horas_restantes)+' de '+datos.limite+' h</b></div>'+
'<div class="fila"><span>Encendido sin cortes</span><b>'+dur(up)+'</b></div>'+
'<div class="fila"><span>Se reinicia el contador</span><b>en '+dias+' día(s)</b></div>'+
'<div class="fila"><span>Si sigue encendido</span><b style="color:'+(datos.proyeccion_fin_mes>datos.limite?'#ef4444':'#059669')+'">'+hrs(datos.proyeccion_fin_mes)+' a fin de mes</b></div>'+
'<small>Mide solo el API de QUBIRA'+(datos.medido_desde?', desde el '+new Date(datos.medido_desde).toLocaleDateString('es-PE'):'')+'. Clic derecho en la etiqueta para minimizarla.</small>'}
function carga(){fetch(api,{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){if(d.error)throw 0;datos=d;base=d.encendido_segundos;t0=Date.now();pinta()}).catch(function(){el.className=(mini?'min ':'')+'caido';el.querySelector('.txt').textContent='Servidor despertando…'})}
el.addEventListener('click',function(){det.style.display=det.style.display==='block'?'none':'block'});
el.addEventListener('contextmenu',function(e){e.preventDefault();mini=!mini;el.classList.toggle('min',mini);try{localStorage.setItem('qb_estado_min',mini?'1':'0')}catch(x){}});
document.addEventListener('click',function(e){if(!el.contains(e.target)&&!det.contains(e.target))det.style.display='none'});
carga();setInterval(carga,60000);setInterval(pinta,30000);
}catch(e){}})();`;
publico.get('/estado.js', (req, res) => {
  res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
  res.send(SCRIPT);
});

module.exports = { publico, iniciarMedicion };
