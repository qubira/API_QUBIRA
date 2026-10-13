'use strict';

/* Genera el PDF de una constancia de trabajo reproduciendo el diseño de
   QUBIRA_RRHH/PLANTILLAS/Plantilla_Constancia_Trabajo_QUBIRA.docx (mismo
   texto, misma paleta de colores, misma tabla de datos) con pdfkit en
   vez de rellenar el .docx y convertirlo a PDF — evita depender de
   LibreOffice headless en el hosting actual (Render). El QR y, si existe,
   la imagen de firma se insertan al pie. Se usa tanto para la descarga
   autenticada desde RRHH como para la página pública de verificación —
   siempre se regenera al vuelo desde los datos guardados, nunca se
   persiste el PDF como archivo. */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const COLOR_LABEL = '#7C3AED';
const COLOR_BOX_BG = '#F4F6FE';
const COLOR_SIGNER = '#12286E';
const COLOR_TEXT = '#1F2937';
const COLOR_MUTED = '#6B7280';

const RUC_EMPRESA = '10764275981';

/* Las fechas se guardan en ISO (YYYY-MM-DD); se muestran en DD/MM/YYYY.
   fecha_fin puede ser texto libre ("Actualidad") en vez de una fecha —
   en ese caso se deja tal cual. */
function formatDateEs(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

async function fetchLogoBuffer() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (_) {
    return null;
  }
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

/* constancia: fila de rrhh.constancias (camelCase ya resuelto por el caller) */
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
  dataRow(doc, left, y, colW, 'Período laborado', `${formatDateEs(constancia.fechaInicio)} – ${constancia.fechaFin ? formatDateEs(constancia.fechaFin) : 'Actualidad'}`);
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

  // ── Pie: lugar/fecha | firma ──
  const footY = y;
  doc.fillColor(COLOR_LABEL).font('Helvetica-Bold').fontSize(8).text('LUGAR Y FECHA DE EMISIÓN', left, footY);
  doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(10.5).text(`${constancia.lugar || ''}, ${formatDateEs(constancia.fechaEmision)}`, left, footY + 14);

  const signX = left + colW + 10;
  if (constancia.firmaUrl) {
    try {
      const res = await fetch(constancia.firmaUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        doc.image(buf, signX + colW / 2 - 40, footY, { width: 80, height: 50, fit: [80, 50], align: 'center' });
      }
    } catch (_) { /* si falla la descarga, seguimos sin imagen */ }
  }
  doc.fillColor(COLOR_SIGNER).font('Helvetica-Bold').fontSize(11)
    .text(constancia.firmanteNombre || '', signX, footY + 54, { width: colW, align: 'center' });
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9.5)
    .text(constancia.firmanteCargo || '', signX, footY + 68, { width: colW, align: 'center' });
  doc.fillColor(COLOR_MUTED).fontSize(9.5).text('QUBIRA', signX, footY + 82, { width: colW, align: 'center' });

  // ── QR de verificación, al pie de la página ──
  const qrBuf = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 110 });
  const qrY = doc.page.height - doc.page.margins.bottom - 110;
  doc.image(qrBuf, left, qrY, { width: 90, height: 90 });
  doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(7.5)
    .text('Verifica la autenticidad de este documento escaneando el código\no ingresando el número de constancia en:', left + 100, qrY + 6, { width: pageW - 100 });
  doc.fillColor(COLOR_SIGNER).font('Helvetica-Bold').fontSize(8).text(verifyUrl, left + 100, qrY + 32, { width: pageW - 100 });

  doc.end();
  return done;
}

module.exports = { buildConstanciaPdf, RUC_EMPRESA };
