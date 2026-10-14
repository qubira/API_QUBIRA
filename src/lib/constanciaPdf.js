'use strict';

/* Genera el PDF de una constancia de trabajo reproduciendo el diseño de
   QUBIRA_RRHH/PLANTILLAS/Plantilla_Constancia_Trabajo_QUBIRA.docx (mismo
   texto, misma paleta de colores, misma tabla de datos) con pdfkit en
   vez de rellenar el .docx y convertirlo a PDF — evita depender de
   LibreOffice headless en el hosting actual (Render). El QR y, si
   existen, el sello de la empresa y la firma personal del emisor se
   insertan al pie. Se usa tanto para la descarga autenticada desde RRHH
   como para la página pública de verificación — siempre se regenera al
   vuelo desde los datos guardados, nunca se persiste el PDF como
   archivo. */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const COLOR_LABEL = '#7C3AED';
const COLOR_BOX_BG = '#F4F6FE';
const COLOR_SIGNER = '#12286E';
const COLOR_TEXT = '#1F2937';
const COLOR_MUTED = '#6B7280';

const RUC_EMPRESA = '10764275981';

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* Las fechas se guardan en ISO (YYYY-MM-DD); se muestran escritas en
   español ("13 de octubre de 2026"). fecha_fin puede ser texto libre
   ("Actualidad") en vez de una fecha — en ese caso se deja tal cual. */
function formatDateEsLong(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const [, y, mo, d] = m;
  return `${d} de ${MESES_ES[parseInt(mo, 10) - 1]} de ${y}`;
}

async function fetchBuffer(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (_) {
    return null;
  }
}

function fetchLogoBuffer() {
  return fetchBuffer('https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png');
}

function dataRow(doc, x, y, w, label, value) {
  const padX = 10, padY = 8;
  doc.save();
  doc.roundedRect(x, y, w, 40, 4).fill(COLOR_BOX_BG);
  doc.restore();
  doc.fillColor(COLOR_LABEL).font('Helvetica-Bold').fontSize(8)
    .text(label.toUpperCase(), x + padX, y + padY, { width: w - padX * 2 });
  doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(11)
    .text(value || '—', x + padX, y + padY + 13, { width: w - padX * 2 });
  doc.restore();
}

/* constancia: fila de rrhh.constancias (camelCase ya resuelto por el caller),
   más `firmaUrl` (firma personal de quien emitió, según su propia carpeta
   en Cloudinary) y `selloUrl` (sello redondo de la empresa, compartido) —
   ambos opcionales y resueltos por el caller antes de llamar acá. */
async function buildConstanciaPdf(constancia, verifyUrl) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  let y = doc.page.margins.top;

  // ── Membrete ──
  const logo = await fetchLogoBuffer();
  if (logo) {
    try { doc.image(logo, left, y, { width: 40, height: 40 }); } catch (_) { /* logo corrupto, seguimos sin él */ }
  }
  doc.fillColor(COLOR_SIGNER).font('Helvetica-Bold').fontSize(18).text('QUBIRA', left + (logo ? 50 : 0), y + 2);
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9)
    .text('Desarrollo de Software – Soluciones Tecnológicas', left + (logo ? 50 : 0), y + 24);
  doc.fillColor(COLOR_MUTED).fontSize(9).text(`RUC ${RUC_EMPRESA}`, left, y, { width: pageW, align: 'right' });
  y += 55;

  doc.moveTo(left, y).lineTo(left + pageW, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
  y += 20;

  // ── Título ──
  doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(16).text('Constancia de Trabajo', left, y);
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(11).text(`N.° ${constancia.numero}`, left, y + 20);
  y += 50;

  // ── Párrafo de apertura ──
  doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(10.5).text(
    `QUBIRA, con RUC N.° ${RUC_EMPRESA}, hace constar que ${constancia.tratamiento || ''} ${constancia.nombreCompleto} ` +
    `ha formado parte de nuestro equipo de trabajo, desempeñándose conforme al siguiente detalle:`,
    left, y, { width: pageW, align: 'justify', lineGap: 2 }
  );
  y = doc.y + 18;

  // ── Tabla de datos (2 columnas) ──
  const colW = (pageW - 10) / 2;
  dataRow(doc, left, y, colW, 'Nombre completo', constancia.nombreCompleto);
  dataRow(doc, left + colW + 10, y, colW, 'Documento de identidad', `${constancia.tipoDocumento || ''} ${constancia.numeroDocumento || ''}`.trim());
  y += 48;
  dataRow(doc, left, y, colW, 'Área', constancia.area);
  dataRow(doc, left + colW + 10, y, colW, 'Cargo', constancia.cargo);
  y += 48;
  dataRow(doc, left, y, colW, 'Período laborado',
    `${formatDateEsLong(constancia.fechaInicio)} – ${/^\d{4}-\d{2}-\d{2}/.test(constancia.fechaFin) ? formatDateEsLong(constancia.fechaFin) : (constancia.fechaFin || 'Actualidad')}`);
  y += 48;
  dataRow(doc, left, y, pageW, 'Función principal', constancia.funcionPrincipal);
  y += 56;

  // ── Párrafo de cierre ──
  doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(10.5).text(
    'Durante su permanencia demostró responsabilidad, puntualidad y compromiso con las funciones encomendadas. ' +
    'Se expide la presente a solicitud del interesado(a), para los fines que estime convenientes.',
    left, y, { width: pageW, align: 'justify', lineGap: 2 }
  );
  y = doc.y + 40;

  // ── Pie izquierdo: sello de la empresa + QR, código de verificación, lugar/fecha ──
  const footY = y;
  const [selloBuf, firmaBuf] = await Promise.all([
    constancia.selloUrl ? fetchBuffer(constancia.selloUrl) : Promise.resolve(null),
    constancia.firmaUrl ? fetchBuffer(constancia.firmaUrl) : Promise.resolve(null),
  ]);
  const qrBuf = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 130 });

  let stampX = left;
  if (selloBuf) {
    try { doc.image(selloBuf, stampX, footY, { width: 58, height: 58 }); stampX += 62; } catch (_) { /* sello corrupto */ }
  }
  try { doc.image(qrBuf, stampX, footY, { width: 58, height: 58 }); } catch (_) { /* no debería fallar, pero no bloqueamos el PDF por esto */ }

  const codeY = footY + 64;
  doc.fillColor(COLOR_LABEL).font('Helvetica-Bold').fontSize(7.5).text('CÓDIGO DE VERIFICACIÓN', left, codeY, { width: colW });
  doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(9.5).text(constancia.codigoVerificacion || '', left, codeY + 11, { width: colW });
  doc.fillColor(COLOR_LABEL).font('Helvetica-Bold').fontSize(7.5).text('LUGAR Y FECHA DE EMISIÓN', left, codeY + 30, { width: colW });
  doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9.5).text(`${constancia.lugar || ''}, ${formatDateEsLong(constancia.fechaEmision)}`, left, codeY + 41, { width: colW });

  // ── Pie derecho: firma personal de quien emite + nombre/cargo ──
  const signX = left + colW + 10;
  if (firmaBuf) {
    try { doc.image(firmaBuf, signX + colW / 2 - 45, footY, { width: 90, height: 50, fit: [90, 50], align: 'center' }); } catch (_) { /* firma corrupta */ }
  }
  doc.fillColor(COLOR_SIGNER).font('Helvetica-Bold').fontSize(11)
    .text(constancia.firmanteNombre || '', signX, footY + 56, { width: colW, align: 'center' });
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9.5)
    .text(constancia.firmanteCargo || '', signX, footY + 70, { width: colW, align: 'center' });
  doc.fillColor(COLOR_MUTED).fontSize(9.5).text('QUBIRA', signX, footY + 84, { width: colW, align: 'center' });

  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(7)
    .text('Verifica la autenticidad de este documento ingresando el código de verificación en:', left, doc.page.height - doc.page.margins.bottom - 24, { width: pageW });
  doc.fillColor(COLOR_SIGNER).font('Helvetica-Bold').fontSize(7.5).text(verifyUrl, left, doc.page.height - doc.page.margins.bottom - 13, { width: pageW });

  doc.end();
  return done;
}

module.exports = { buildConstanciaPdf, RUC_EMPRESA };
