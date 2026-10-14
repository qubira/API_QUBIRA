'use strict';

/* Genera el PDF de una constancia de trabajo reproduciendo el diseño del
   ejemplo de referencia QUBIRA_RRHH/PLANTILLAS/ejemplo_constancia_CT-2026-0001.docx
   (membrete centrado, título centrado, QR a la izquierda con el código de
   verificación debajo, sello + firma superpuestos a la derecha con su
   timbre, pie de página con los datos de la empresa) con pdfkit en vez de
   rellenar el .docx y convertirlo a PDF — evita depender de LibreOffice
   headless en el hosting actual (Render). Se usa tanto para la descarga
   autenticada desde RRHH como para la página pública de verificación —
   siempre se regenera al vuelo desde los datos guardados, nunca se
   persiste el PDF como archivo. */

const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

/* pdfkit no embebe los 14 fonts "estándar" (Helvetica, etc.) — asume
   que el visor del PDF los tiene instalados. Eso funciona en Chrome,
   Adobe Reader, etc., pero la vista previa de PDF de WhatsApp usa un
   motor muy limitado que no los soporta bien y termina mostrando el
   texto corrido/superpuesto. Embebiendo una fuente real (Inter, la
   misma que usa el resto de QUBIRA) el PDF se ve igual en cualquier
   visor, sin depender de qué fonts tenga instalados. */
const FONT_REGULAR = path.join(__dirname, '../assets/fonts/Inter-Regular.woff');
const FONT_BOLD = path.join(__dirname, '../assets/fonts/Inter-Bold.woff');

const COLOR_LABEL = '#7C3AED';
const COLOR_BOX_BG = '#F4F6FE';
const COLOR_SIGNER = '#12286E';
const COLOR_TEXT = '#1F2937';
const COLOR_MUTED = '#6B7280';
const COLOR_RULE = '#E5E7EB';

const RUC_EMPRESA = '10764275981';
const COMPANY_SITE_URL = process.env.QUBIRA_PUBLIC_SITE_BASE || 'https://qubira.vercel.app';

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
  doc.fillColor(COLOR_LABEL).font('Inter-Bold').fontSize(8)
    .text(label.toUpperCase(), x + padX, y + padY, { width: w - padX * 2 });
  doc.fillColor(COLOR_TEXT).font('Inter').fontSize(11)
    .text(value || '—', x + padX, y + padY + 13, { width: w - padX * 2 });
}

/* Puntitos decorativos en la esquina superior derecha, como en la
   plantilla original — un patrón simple de cuadraditos a distinta
   opacidad, no hace falta replicar el asset exacto. */
function decorativeDots(doc, x, y) {
  doc.save();
  const positions = [
    [0, 0, 5], [14, 4, 4], [26, 0, 6], [6, 14, 4], [20, 16, 5],
    [36, 10, 4], [2, 26, 3], [16, 28, 4], [30, 24, 3], [40, 22, 3],
  ];
  for (const [dx, dy, size] of positions) {
    doc.fillColor(COLOR_LABEL).opacity(0.18 + Math.random() * 0.12)
      .rect(x + dx, y + dy, size, size).fill();
  }
  doc.restore();
}

/* constancia: fila de rrhh.constancias (camelCase ya resuelto por el caller),
   más `firmaUrl` (firma personal de quien emitió, según su propia carpeta
   en Cloudinary) y `selloUrl` (sello redondo de la empresa, compartido) —
   ambos opcionales y resueltos por el caller antes de llamar acá. */
async function buildConstanciaPdf(constancia, verifyUrl) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.registerFont('Inter', FONT_REGULAR);
  doc.registerFont('Inter-Bold', FONT_BOLD);
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  const center = left + pageW / 2;
  let y = doc.page.margins.top;

  // ── Franja vertical decorativa, borde izquierdo de toda la hoja ──
  const barW = 16;
  const barGradient = doc.linearGradient(0, 0, 0, doc.page.height);
  barGradient.stop(0, COLOR_SIGNER).stop(1, COLOR_LABEL);
  doc.rect(0, 0, barW, doc.page.height).fill(barGradient);

  // ── Membrete, todo centrado — el logo y "QUBIRA" enlazan a la web oficial ──
  decorativeDots(doc, left + pageW - 44, y - 6);
  const logo = await fetchLogoBuffer();
  if (logo) {
    try {
      doc.image(logo, center - 18, y, { width: 36, height: 36 });
      doc.link(center - 18, y, 36, 36, COMPANY_SITE_URL);
    } catch (_) { /* logo corrupto, seguimos sin él */ }
  }
  y += logo ? 42 : 0;
  doc.fillColor(COLOR_SIGNER).font('Inter-Bold').fontSize(17)
    .text('QUBIRA', left, y, { width: pageW, align: 'center', characterSpacing: 1.5, link: COMPANY_SITE_URL });
  y += 20;
  doc.fillColor(COLOR_MUTED).font('Inter').fontSize(8.5)
    .text('Desarrollo de Software · Soluciones Tecnológicas', left, y, { width: pageW, align: 'center' });
  y += 13;
  doc.fillColor(COLOR_SIGNER).font('Inter-Bold').fontSize(7.5)
    .text(`RUC ${RUC_EMPRESA}`, left, y, { width: pageW, align: 'center' });
  y += 20;

  doc.moveTo(left, y).lineTo(left + pageW, y).strokeColor(COLOR_RULE).lineWidth(1).stroke();
  y += 22;

  // ── Título, centrado ──
  doc.fillColor(COLOR_TEXT).font('Inter-Bold').fontSize(18).text('Constancia de Trabajo', left, y, { width: pageW, align: 'center' });
  y += 26;
  doc.fillColor(COLOR_MUTED).font('Inter').fontSize(10).text(`N.° ${constancia.numero}`, left, y, { width: pageW, align: 'center' });
  y += 16;
  doc.moveTo(center - 20, y).lineTo(center + 20, y).strokeColor(COLOR_RULE).lineWidth(1).stroke();
  y += 20;

  // ── Párrafo de apertura ──
  doc.fillColor(COLOR_TEXT).font('Inter').fontSize(10.5).text(
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
  dataRow(doc, left, y, pageW, 'Período laborado',
    `${formatDateEsLong(constancia.fechaInicio)} – ${/^\d{4}-\d{2}-\d{2}/.test(constancia.fechaFin) ? formatDateEsLong(constancia.fechaFin) : (constancia.fechaFin || 'Actualidad')}`);
  y += 48;
  dataRow(doc, left, y, pageW, 'Función principal', constancia.funcionPrincipal);
  y += 56;

  // ── Párrafo de cierre ──
  doc.fillColor(COLOR_TEXT).font('Inter').fontSize(10.5).text(
    'Durante su permanencia demostró responsabilidad, puntualidad y compromiso con las funciones encomendadas. ' +
    'Se expide la presente a solicitud del interesado(a), para los fines que estime convenientes.',
    left, y, { width: pageW, align: 'justify', lineGap: 2 }
  );
  y = doc.y + 42;

  // ── Pie: QR + código de verificación (izq.) | sello + firma + timbre (der.) ──
  const footY = y;
  const [selloBuf, firmaBuf] = await Promise.all([
    constancia.selloUrl ? fetchBuffer(constancia.selloUrl) : Promise.resolve(null),
    constancia.firmaUrl ? fetchBuffer(constancia.firmaUrl) : Promise.resolve(null),
  ]);
  const qrBuf = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 130 });

  // Izquierda: QR (enlaza a la página de verificación), código de
  // verificación (también clicable), lugar y fecha.
  try {
    doc.image(qrBuf, left, footY, { width: 56, height: 56 });
    doc.link(left, footY, 56, 56, verifyUrl);
  } catch (_) { /* no debería fallar */ }
  const codeY = footY + 64;
  doc.fillColor(COLOR_LABEL).font('Inter-Bold').fontSize(7.5).text('CÓDIGO DE VERIFICACIÓN', left, codeY, { width: colW });
  doc.fillColor(COLOR_TEXT).font('Inter-Bold').fontSize(9.5)
    .text(constancia.codigoVerificacion || '', left, codeY + 11, { width: colW, link: verifyUrl });
  doc.fillColor(COLOR_LABEL).font('Inter-Bold').fontSize(7.5).text('LUGAR Y FECHA DE EMISIÓN', left, codeY + 30, { width: colW });
  doc.fillColor(COLOR_TEXT).font('Inter').fontSize(9.5).text(`${constancia.lugar || ''}, ${formatDateEsLong(constancia.fechaEmision)}`, left, codeY + 41, { width: colW });

  // Derecha: sello y firma uno al lado del otro (NO superpuestos), y
  // debajo el timbre con nombre/cargo del firmante.
  const signX = left + colW + 10;
  if (selloBuf) {
    try { doc.image(selloBuf, signX, footY, { width: 60, height: 60 }); } catch (_) { /* sello corrupto */ }
  }
  if (firmaBuf) {
    try { doc.image(firmaBuf, signX + 60, footY - 2, { width: 150, height: 64, fit: [150, 64], align: 'center' }); } catch (_) { /* firma corrupta */ }
  }

  // Línea de firma, debajo del sello y la rúbrica (como la línea "firme
  // aquí" de la plantilla original), antes del timbre con nombre/cargo.
  const stampY = footY + 62;
  const stampW = colW - 20;
  const stampX = signX + 10;
  doc.moveTo(signX, stampY - 4).lineTo(stampX + stampW, stampY - 4).strokeColor(COLOR_SIGNER).lineWidth(0.75).stroke();
  doc.save();
  doc.roundedRect(stampX, stampY, stampW, 34, 3).lineWidth(1).strokeColor(COLOR_SIGNER).stroke();
  doc.roundedRect(stampX + 2, stampY + 2, stampW - 4, 30, 2).lineWidth(0.5).strokeColor(COLOR_SIGNER).stroke();
  doc.restore();
  doc.fillColor(COLOR_SIGNER).font('Inter-Bold').fontSize(9.5)
    .text((constancia.firmanteNombre || '').toUpperCase(), stampX, stampY + 5, { width: stampW, align: 'center' });
  doc.fillColor(COLOR_TEXT).font('Inter-Bold').fontSize(7)
    .text((constancia.firmanteCargo || '').toUpperCase(), stampX, stampY + 17, { width: stampW, align: 'center' });
  doc.fillColor(COLOR_MUTED).font('Inter').fontSize(6.5)
    .text('QUBIRA S.A.C.', stampX, stampY + 26, { width: stampW, align: 'center' });

  // ── Pie de página, centrado al fondo (dentro del área imprimible,
  //    nunca más abajo del margen inferior — si no, pdfkit crea una
  //    segunda página vacía solo para esta línea). ──
  doc.fillColor(COLOR_SIGNER).font('Inter-Bold').fontSize(7.5)
    .text(`QUBIRA S.A.C.   RUC ${RUC_EMPRESA}   ·   Lima, Perú`, left, doc.page.height - doc.page.margins.bottom - 16, { width: pageW, align: 'center', link: COMPANY_SITE_URL });

  doc.end();
  return done;
}

module.exports = { buildConstanciaPdf, RUC_EMPRESA };
