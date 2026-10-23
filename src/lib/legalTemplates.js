'use strict';

/**
 * Catálogo Oficial de 12 Plantillas Legales Corporativas de QUBIRA
 * Sincronizado y aprobado por ODACL (Oficina de Dirección y Asesoría Legal).
 * Permite que ODN (Comercial) obtenga siempre la versión oficial más reciente,
 * aplicando cualquier actualización aprobada en odacl.official_templates.
 */

const BASE_LEGAL_TEMPLATES = {
  desarrollo_software: {
    clave: 'desarrollo_software',
    titulo: 'Contrato de Desarrollo de Software - QUBIRA',
    tipo: 'Contrato de Desarrollo de Software',
    categoria: 'Tecnología & Software',
    descripcion: 'Modelo oficial completo de 14 cláusulas con metodología SCRUM, Sprints, entregables, penalidades y cesión patrimonial.',
    badge: 'Oficial Qubira',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div>
            <div style="font-size:16px; font-weight:800; color:#0f172a; letter-spacing:1px;">QUBIRA</div>
            <div style="font-size:11px; font-weight:700; color:#b45309;">SOLUCIONES CORPORATIVAS DE SOFTWARE</div>
          </div>
        </div>
        <div class="header-info">
          <strong>RUC: 10764275981</strong><br>
          Lima, República del Perú<br>
          qubirasac@gmail.com | www.qubira.vercel.app
        </div>
      </div>

      <h2 style="text-align:center; font-size:16px; font-weight:800; margin-bottom:14px; text-transform:uppercase; color:#0f172a;">
        CONTRATO DE PRESTACIÓN DE SERVICIOS DE DESARROLLO DE SOFTWARE<br>
        <span style="font-size:13px; font-weight:600; color:#475569;">N° [CODIGO_CONTRATO]</span>
      </h2>

      <p>Conste por el presente documento el <strong>CONTRATO DE PRESTACIÓN DE SERVICIOS DE DESARROLLO DE SOFTWARE</strong>, que celebran de una parte:</p>
      
      <p><strong>EL PROVEEDOR:</strong> <strong>QUBIRA</strong>, con RUC N° <strong>10764275981</strong>, con domicilio legal en la ciudad de Lima, República del Perú, debidamente representada por sus CEO y accionistas <strong>Melani A. Luyo R.</strong> y <strong>Abraham Aranda Cerna</strong>, a quien en adelante se denominará simplemente como <strong>QUBIRA</strong>; y de la otra parte:</p>

      <p><strong>EL CLIENTE:</strong> <strong>[NOMBRE_EMPRESA]</strong>, con RUC/DNI N° <strong>[RUC_CLIENTE]</strong>, con domicilio en <strong>[DIRECCION_COMPLETA_EMPRESA]</strong>, debidamente representada por <strong>[NOMBRE_COMPLETO_CLIENTE]</strong> en su calidad de <strong>[CARGO_REPRESENTANTE_CLIENTE]</strong>, a quien en adelante se denominará <strong>EL CLIENTE</strong>; bajo los términos y condiciones siguientes:</p>

      <p><strong>CLÁUSULA PRIMERA — OBJETO DEL CONTRATO:</strong> EL PROVEEDOR se obliga a favor de EL CLIENTE a realizar el análisis, diseño, programación, arquitectura, pruebas y despliegue del sistema web y panel administrativo denominado <strong>[NOMBRE_PROYECTO]</strong>.</p>

      <p><strong>CLÁUSULA SEGUNDA — METODOLOGÍA ÁGIL SCRUM:</strong> El proyecto se ejecutará bajo el marco de trabajo ágil SCRUM, con entregas incrementales y verificables en Sprints de una a dos semanas. EL CLIENTE ejercerá el rol de Product Owner validando cada entregable.</p>

      <p><strong>CLÁUSULA TERCERA — REQUERIMIENTOS FUNCIONALES:</strong> El software cumplirá con las especificaciones acordadas, incluyendo módulos de autenticación segura por roles, gestión de datos, panel dashboard interactivo y reportería.</p>

      <p><strong>CLÁUSULA CUARTA — ARQUITECTURA Y SEGURIDAD:</strong> El desarrollo se respaldará en bases de datos relacionales en la nube (PostgreSQL Neon) con encriptación SSL, almacenamiento de archivos en Cloudinary y control criptográfico de contraseñas con bcryptjs.</p>

      <p><strong>CLÁUSULA QUINTA — PRECIO Y FORMA DE PAGO:</strong> El precio total pactado es de <strong>[MONEDA] [PRECIO_ACORDADO]</strong> ([PRECIO_EN_LETRAS]), pagadero bajo la modalidad: <strong>[DETALLE_DE_PAGOS]</strong>.</p>

      <p><strong>CLÁUSULA SEXTA — PLAZO DE EJECUCIÓN:</strong> El plazo total para la entrega de la solución será de <strong>[TOTAL_DIAS]</strong> días calendario contados a partir de la recepción del pago inicial.</p>

      <p><strong>CLÁUSULA SÉPTIMA — PROPIEDAD INTELECTUAL (D.L. 822):</strong> La titularidad sobre el código fuente a medida se transferirá a EL CLIENTE una vez cancelado el 100% de la contraprestación económica. QUBIRA retiene la propiedad de sus librerías base y metodologías reutilizables.</p>

      <p><strong>CLÁUSULA OCTAVA — CONFIDENCIALIDAD:</strong> Ambas partes se obligan a mantener estricta reserva sobre la información técnica, comercial y operacional intercambiada con ocasión del proyecto durante un periodo de [ANOS_CONFIDENCIALIDAD] años.</p>

      <p><strong>CLÁUSULA NOVENA — GARANTÍA Y SOPORTE:</strong> QUBIRA otorga una garantía de [DIAS_GARANTIA] días calendario posteriores a la entrega final para la corrección sin costo de cualquier falla o error atribuible al desarrollo original.</p>

      <p><strong>CLÁUSULA DÉCIMA — JURISDICCIÓN Y LEY APLICABLE:</strong> Para cualquier controversia, las partes se someten a las leyes de la República del Perú y a los Juzgados de la ciudad de Lima.</p>

      <div class="word-signature-block">
        <div>
          <div class="signature-line">
            <strong>QUBIRA</strong><br>
            RUC 10764275981<br>
            Melani A. Luyo R. / Abraham Aranda Cerna
          </div>
        </div>
        <div>
          <div class="signature-line">
            <strong>[NOMBRE_EMPRESA]</strong><br>
            RUC / DNI: [RUC_CLIENTE]<br>
            [NOMBRE_COMPLETO_CLIENTE]<br>
            Representante Legal Autorizado
          </div>
        </div>
      </div>
    `
  },

  prestacion_servicios: {
    clave: 'prestacion_servicios',
    titulo: 'Contrato de Prestación de Servicios (Locación Civil)',
    tipo: 'Contrato de Prestación de Servicios',
    categoria: 'Civil & Comercial',
    descripcion: 'Contrato civil de locación de servicios conforme al artículo 1764 del Código Civil, sin subordinación laboral.',
    badge: 'Civil & Mercantil',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div>
            <div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div>
            <div style="font-size:11px; font-weight:700; color:#b45309;">LOCACIÓN DE SERVICIOS INDEPENDIENTES</div>
          </div>
        </div>
        <div class="header-info">RUC: 10764275981 &bull; Lima, Perú</div>
      </div>

      <h2 style="text-align:center; font-size:15px; font-weight:800; margin-bottom:14px; text-transform:uppercase;">
        CONTRATO DE LOCACIÓN DE SERVICIOS INDEPENDIENTES<br>
        <span style="font-size:12px; font-weight:600; color:#64748b;">(CÓDIGO CIVIL PERUANO, ARTÍCULO 1764°)</span>
      </h2>

      <p>Conste por el presente documento el Contrato de Locación de Servicios celebrado entre <strong>QUBIRA</strong>, con RUC N° <strong>10764275981</strong>, como <strong>EL COMITENTE</strong>; y de la otra parte <strong>[NOMBRE_EMPRESA]</strong>, con RUC/DNI <strong>[RUC_CLIENTE]</strong>, con domicilio en <strong>[DIRECCION_COMPLETA_EMPRESA]</strong>, debidamente representada por <strong>[NOMBRE_COMPLETO_CLIENTE]</strong>, en calidad de <strong>EL LOCADOR</strong>.</p>

      <p><strong>PRIMERA: NATURALEZA DEL CONTRATO:</strong> El presente contrato es de naturaleza estrictamente civil, regulado por los artículos 1764° y siguientes del Código Civil. En consecuencia, EL LOCADOR actuará con total autonomía técnica y sin subordinación.</p>

      <p><strong>SEGUNDA: OBJETO DEL SERVICIO:</strong> EL LOCADOR se compromete a prestar servicios especializados de <strong>[OBJETO_SERVICIO]</strong> a favor de EL COMITENTE, referidos al proyecto <strong>[NOMBRE_PROYECTO]</strong>.</p>

      <p><strong>TERCERA: HONORARIOS Y FORMA DE PAGO:</strong> Como contraprestación, EL COMITENTE abonará la suma de <strong>[MONEDA] [PRECIO_ACORDADO]</strong> ([PRECIO_EN_LETRAS]) previa presentación de Recibo por Honorarios / Factura electrónica y el informe de entregables aprobado. Modalidad: <strong>[DETALLE_DE_PAGOS]</strong>.</p>

      <p><strong>CUARTA: PLAZO DE EJECUCIÓN:</strong> El servicio se ejecutará en un plazo de <strong>[TOTAL_DIAS]</strong> días calendario, contados desde <strong>[FECHA_INICIO]</strong> hasta <strong>[FECHA_FIN]</strong>.</p>

      <p><strong>QUINTA: DETRACCIÓN DEL 12% (SUNAT):</strong> Si el servicio supera el importe establecido por la R.S. 183-2004/SUNAT, se aplicará la detracción correspondiente en la cuenta del Banco de la Nación.</p>

      <div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>EL COMITENTE</div></div>
        <div><div class="signature-line"><strong>[NOMBRE_EMPRESA]</strong><br>[NOMBRE_COMPLETO_CLIENTE]<br>EL LOCADOR<br>DNI / RUC: [RUC_CLIENTE]</div></div>
      </div>
    `
  },

  licenciamiento_software: {
    clave: 'licenciamiento_software',
    titulo: 'Contrato de Licenciamiento de Software (SaaS / Cloud)',
    tipo: 'Contrato de Licenciamiento de Software',
    categoria: 'Propiedad Intelectual',
    descripcion: 'Licencia de uso no exclusiva de plataformas en la nube, control de usuarios, soporte técnico y SLA.',
    badge: 'SaaS Licencia',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div><div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div><div style="font-size:11px; font-weight:700; color:#b45309;">LICENCIAS DE SOFTWARE & SERVICIOS CLOUD</div></div>
        </div>
        <div class="header-info">RUC: 10764275981 &bull; D.L. 822 Derechos de Autor</div>
      </div>

      <h2 style="text-align:center; font-size:15px; font-weight:800; margin-bottom:14px; text-transform:uppercase;">
        CONTRATO DE LICENCIA DE USO DE SOFTWARE COMO SERVICIO (SaaS)
      </h2>

      <p>Entre <strong>QUBIRA</strong> (<strong>EL LICENCIANTE</strong>) y <strong>[NOMBRE_EMPRESA]</strong> con RUC/DNI <strong>[RUC_CLIENTE]</strong>, con domicilio en <strong>[DIRECCION_COMPLETA_EMPRESA]</strong>, representada por <strong>[NOMBRE_COMPLETO_CLIENTE]</strong> (<strong>EL LICENCIATARIO</strong>) se acuerda:</p>
      
      <p><strong>1. CONCESIÓN DE LICENCIA:</strong> QUBIRA otorga a EL LICENCIATARIO una licencia de uso no exclusiva, intransferible y temporal para acceder a la plataforma <strong>[NOMBRE_PROYECTO]</strong> a través de internet.</p>

      <p><strong>2. PROHIBICIÓN DE COPIA E INGENIERÍA INVERSA:</strong> Conforme al D.L. 822 de la República del Perú, queda terminantemente prohibida la copia, modificación, desensamblado o comercialización no autorizada del software.</p>

      <p><strong>3. TARIFA MENSUAL:</strong> EL LICENCIATARIO abonará una suscripción de <strong>[MONEDA] [PRECIO_ACORDADO]</strong> ([PRECIO_EN_LETRAS]) que incluye acceso para [CANTIDAD_USUARIOS] usuarios activos, hosting y backups diarios. Forma de pago: <strong>[DETALLE_DE_PAGOS]</strong>.</p>

      <p><strong>4. VIGENCIA Y RENOVACIÓN:</strong> El presente contrato rige por un plazo de <strong>[TOTAL_DIAS]</strong> días / meses calendario, renovable automáticamente salvo preaviso de 30 días.</p>

      <div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>EL LICENCIANTE</div></div>
        <div><div class="signature-line"><strong>[NOMBRE_EMPRESA]</strong><br>[NOMBRE_COMPLETO_CLIENTE]<br>EL LICENCIATARIO<br>RUC / DNI: [RUC_CLIENTE]</div></div>
      </div>
    `
  },

  sla_servicio: {
    clave: 'sla_servicio',
    titulo: 'Acuerdo de Nivel de Servicio (SLA - Service Level Agreement)',
    tipo: 'Acuerdo de Nivel de Servicio (SLA)',
    categoria: 'Soporte & Cloud',
    descripcion: 'Compromiso contractual de disponibilidad (uptime 99.9%), matriz de tiempos de respuesta y soporte técnico.',
    badge: 'SLA 99.9%',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div><div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div><div style="font-size:11px; font-weight:700; color:#b45309;">ACUERDO DE NIVEL DE SERVICIO (SLA)</div></div>
        </div>
        <div class="header-info">RUC: 10764275981 &bull; Mesa de Ayuda TI</div>
      </div>

      <h2 style="text-align:center; font-size:15px; font-weight:800; margin-bottom:14px; text-transform:uppercase;">
        ACUERDO DE NIVEL DE SERVICIO TÉCNICO (SLA)
      </h2>

      <p>Celebrado entre <strong>QUBIRA</strong> y <strong>[NOMBRE_EMPRESA]</strong> (RUC/DNI <strong>[RUC_CLIENTE]</strong>) para el sistema y plataforma tecnológica <strong>[NOMBRE_PROYECTO]</strong>:</p>

      <p><strong>1. DISPONIBILIDAD MENSUAL DEL SISTEMA:</strong> QUBIRA garantiza un Uptime de disponibilidad del <strong>[PORCENTAJE_DISPONIBILIDAD]</strong> mensual en los servidores de producción.</p>

      <p><strong>2. TIEMPOS DE RESPUESTA ANTE INCIDENCIAS:</strong></p>
      <table style="border-collapse:collapse; width:100%; margin:12px 0;">
        <tr style="background:#f1f5f9;">
          <th style="border:1px solid #333; padding:8px;">Nivel de Severidad</th>
          <th style="border:1px solid #333; padding:8px;">Tiempo de Respuesta</th>
          <th style="border:1px solid #333; padding:8px;">Tiempo de Solución Estimada</th>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:8px;"><strong>Severidad 1 (Crítica - Caída Total)</strong></td>
          <td style="border:1px solid #333; padding:8px;">Menor a 1 hora</td>
          <td style="border:1px solid #333; padding:8px;">Menor a 4 horas</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:8px;"><strong>Severidad 2 (Alta - Falla en módulo)</strong></td>
          <td style="border:1px solid #333; padding:8px;">Menor a 4 horas</td>
          <td style="border:1px solid #333; padding:8px;">Menor a 12 horas</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:8px;"><strong>Severidad 3 (Media - Consulta / Ajuste)</strong></td>
          <td style="border:1px solid #333; padding:8px;">Menor a 8 horas</td>
          <td style="border:1px solid #333; padding:8px;">Menor a 24 horas</td>
        </tr>
      </table>

      <p><strong>3. TARIFA DEL SERVICIO:</strong> Se pacta un valor de mantenimiento y soporte de <strong>[MONEDA] [PRECIO_ACORDADO]</strong> ([PRECIO_EN_LETRAS]) mensual.</p>

      <div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>Dirección de Operaciones TI</div></div>
        <div><div class="signature-line"><strong>[NOMBRE_EMPRESA]</strong><br>[NOMBRE_COMPLETO_CLIENTE]<br>Aceptación del SLA</div></div>
      </div>
    `
  },

  laboral_dl728: {
    clave: 'laboral_dl728',
    titulo: 'Contrato de Trabajo a Plazo Sujeto a Modalidad (D.L. 728)',
    tipo: 'Contrato Laboral (D.L. 728)',
    categoria: 'Laboral & RR.HH.',
    descripcion: 'Contrato laboral formal bajo el régimen privado del Decreto Legislativo N° 728 con todos los beneficios de ley en Perú.',
    badge: 'Laboral SUNAFIL',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div>
            <div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div>
            <div style="font-size:11px; font-weight:700; color:#b45309;">DEPARTAMENTO LEGAL & RR.HH.</div>
          </div>
        </div>
        <div class="header-info">
          <strong>RUC: 10764275981</strong><br>
          D.L. N° 728 - Ley de Productividad y Competitividad Laboral<br>
          Lima, Perú
        </div>
      </div>

      <h2 style="text-align:center; font-size:15px; font-weight:800; margin-bottom:14px; text-transform:uppercase;">
        CONTRATO DE TRABAJO SUJETO A MODALIDAD POR INICIO O INCREMENTO DE ACTIVIDAD<br>
        <span style="font-size:12px; font-weight:600; color:#64748b;">(DECRETO LEGISLATIVO N° 728, ART. 57)</span>
      </h2>

      <p>Conste por el presente documento el Contrato Individual de Trabajo a Plazo Fijo que celebran de una parte <strong>QUBIRA</strong>, con RUC N° <strong>10764275981</strong>, representada por su CEO <strong>Melani A. Luyo R.</strong>, en calidad de <strong>EL EMPLEADOR</strong>; y de la otra parte <strong>[NOMBRE_COMPLETO_CLIENTE]</strong>, identificado con DNI N° <strong>[RUC_CLIENTE]</strong>, con domicilio en <strong>[DIRECCION_COMPLETA_EMPRESA]</strong>, a quien se denominará <strong>EL TRABAJADOR</strong>:</p>

      <p><strong>PRIMERA: OBJETO Y CARGO:</strong> EL EMPLEADOR contrata a EL TRABAJADOR para desempeñar las funciones de <strong>[CARGO_TRABAJADOR]</strong>, realizando tareas de programación, pruebas de software, soporte técnico y documentación de sistemas.</p>

      <p><strong>SEGUNDA: JORNADA Y HORARIO:</strong> La jornada de trabajo será de cuarenta y ocho (48) horas semanales de lunes a viernes en modalidad de trabajo mixto / presencial, respetándose el descanso semanal y los feriados de ley.</p>

      <p><strong>TERCERA: REMUNERACIÓN:</strong> EL TRABAJADOR percibirá una remuneración mensual de <strong>[MONEDA] [PRECIO_ACORDADO]</strong> ([PRECIO_EN_LETRAS]), sujeta a los descuentos obligatorios de ley (AFP u ONP y quinta categoría de corresponder).</p>

      <p><strong>CUARTA: PERIODO DE PRUEBA:</strong> Las partes pactan expresamente un periodo de prueba de tres (3) meses de conformidad con el Artículo 10° del D.L. 728.</p>

      <p><strong>QUINTA: DERECHOS DE AUTOR SOBRE EL SOFTWARE (D.L. 822):</strong> Todo programa de cómputo, código fuente, script o documentación técnica desarrollado por EL TRABAJADOR en ejercicio de sus funciones será de titularidad patrimonial exclusiva de QUBIRA</p>

      <p><strong>SEXTA: CONFIDENCIALIDAD:</strong> EL TRABAJADOR se obliga a no divulgar secretos comerciales, credenciales ni código fuente de la empresa a terceros.</p>

      <div class="word-signature-block">
        <div>
          <div class="signature-line">
            <strong>QUBIRA</strong><br>
            EL EMPLEADOR
          </div>
        </div>
        <div>
          <div class="signature-line">
            <strong>[NOMBRE_COMPLETO_CLIENTE]</strong><br>
            DNI N° [RUC_CLIENTE]<br>
            EL TRABAJADOR
          </div>
        </div>
      </div>
    `
  },

  servicios_profesionales: {
    clave: 'servicios_profesionales',
    titulo: 'Contrato de Servicios Profesionales TI (Con Cesión Patrimonial)',
    tipo: 'Contrato de Prestación de Servicios Profesionales',
    categoria: 'Servicios TI',
    descripcion: 'Contratación de programadores independientes con recibo por honorarios y cesión expresa de derechos patrimoniales sobre el software.',
    badge: 'Honorarios & D.L. 822',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div><div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div><div style="font-size:11px; font-weight:700; color:#b45309;">CONSULTORÍA PROFESIONAL DE SOFTWARE</div></div>
        </div>
        <div class="header-info">RUC: 10764275981 &bull; D.L. 822</div>
      </div>

      <h2 style="text-align:center; font-size:15px; font-weight:800; margin-bottom:14px; text-transform:uppercase;">
        CONTRATO DE SERVICIOS PROFESIONALES CON CESIÓN DE DERECHOS DE AUTOR
      </h2>

      <p>Celebrado entre <strong>QUBIRA</strong> y el Ingeniero/Desarrollador Independiente <strong>[NOMBRE_COMPLETO_CLIENTE]</strong>, DNI/RUC N° <strong>[RUC_CLIENTE]</strong> con domicilio en <strong>[DIRECCION_COMPLETA_EMPRESA]</strong>:</p>

      <p><strong>1. ACTIVIDADES:</strong> EL PROFESIONAL prestará servicios de desarrollo de software, testing automatizado y mantenimiento de APIs para el proyecto <strong>[NOMBRE_PROYECTO]</strong> sin relación de dependencia.</p>

      <p><strong>2. CESIÓN DE DERECHOS PATRIMONIALES (ART. 16 D.L. 822):</strong> Todo el código fuente, librerías, scripts y bases de datos creadas pasan a ser propiedad exclusiva y perpetua de QUBIRA</p>

      <p><strong>3. HONORARIOS:</strong> Se pacta la suma de <strong>[MONEDA] [PRECIO_ACORDADO]</strong> ([PRECIO_EN_LETRAS]) por entregables aprobados, emitiéndose el respectivo Recibo por Honorarios electrónico. Forma de pago: <strong>[DETALLE_DE_PAGOS]</strong>.</p>

      <div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>EL CONTRATANTE</div></div>
        <div><div class="signature-line"><strong>[NOMBRE_COMPLETO_CLIENTE]</strong><br>EL PROFESIONAL<br>DNI N° [RUC_CLIENTE]</div></div>
      </div>
    `
  },

  servicios_preprofesionales: {
    clave: 'servicios_preprofesionales',
    titulo: 'Convenio de Prácticas Pre Profesionales (Ley N° 28518)',
    tipo: 'Contrato de Prácticas Pre Profesionales',
    categoria: 'Formativo Laboral',
    descripcion: 'Convenio de aprendizaje formativo laboral conforme a la Ley de Modalidades Formativas Laborales con subvención y seguro FOLA.',
    badge: 'Ley 28518 Prácticas',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div><div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div><div style="font-size:11px; font-weight:700; color:#b45309;">MODALIDADES FORMATIVAS LABORALES</div></div>
        </div>
        <div class="header-info">Ley N° 28518 &bull; RUC 10764275981</div>
      </div>

      <h2 style="text-align:center; font-size:15px; font-weight:800; margin-bottom:14px; text-transform:uppercase;">
        CONVENIO DE APRENDIZAJE DE PRÁCTICAS PRE PROFESIONALES
      </h2>

      <p>Comparecen <strong>QUBIRA</strong> (LA EMPRESA), <strong>[NOMBRE_COMPLETO_CLIENTE]</strong> (EL PRACTICANTE) identificado con DNI N° <strong>[RUC_CLIENTE]</strong> y la <strong>[CENTRO_FORMATIVO]</strong> (EL CENTRO FORMATIVO):</p>

      <p><strong>1. JORNADA FORMATIVA:</strong> La jornada no excederá de seis (6) horas diarias ni treinta (30) horas semanales.</p>

      <p><strong>2. SUBVENCIÓN ECONÓMICA:</strong> LA EMPRESA otorgará una subvención económica mensual de <strong>[MONEDA] [PRECIO_ACORDADO]</strong> ([PRECIO_EN_LETRAS]).</p>

      <p><strong>3. SEGURO MÉDICO (FOLA):</strong> LA EMPRESA contratará una póliza de seguro médico con cobertura del 100% en enfermedades y accidentes.</p>

      <div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>LA EMPRESA</div></div>
        <div><div class="signature-line"><strong>[NOMBRE_COMPLETO_CLIENTE]</strong><br>DNI N° [RUC_CLIENTE]<br>EL PRACTICANTE</div></div>
      </div>
    `
  },

  proveedores_infraestructura: {
    clave: 'proveedores_infraestructura',
    titulo: 'Contrato con Proveedores de Infraestructura Cloud y Servidores',
    tipo: 'Contrato Proveedores Infraestructura',
    categoria: 'Infraestructura & Cloud',
    descripcion: 'Contrato para provisión de servidores, bases de datos serverless (Neon), CDN de medios (Cloudinary) y hosting.',
    badge: 'Infraestructura Cloud',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div><div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div><div style="font-size:11px; font-weight:700; color:#b45309;">INFRAESTRUCTURA & SERVIDORES CLOUD</div></div>
        </div>
        <div class="header-info">RUC: 10764275981 &bull; Lima, Perú</div>
      </div>

      <h2 style="text-align:center; font-size:15px; font-weight:800; margin-bottom:14px; text-transform:uppercase;">
        CONTRATO DE SUMINISTRO DE INFRAESTRUCTURA Y SERVICIOS EN LA NUBE
      </h2>

      <p>Celebrado entre <strong>QUBIRA</strong> y el Proveedor de Infraestructura Tecnológica <strong>[NOMBRE_EMPRESA]</strong>, con RUC/ID <strong>[RUC_CLIENTE]</strong>, representado por <strong>[NOMBRE_COMPLETO_CLIENTE]</strong>:</p>

      <p><strong>1. OBJETO:</strong> Suministro de cómputo en la nube, almacenamiento seguro de objetos e instancias de base de datos relacional PostgreSQL con disponibilidad 24/7 para el proyecto <strong>[NOMBRE_PROYECTO]</strong>.</p>

      <p><strong>2. COPIAS DE SEGURIDAD Y BACKUPS:</strong> EL PROVEEDOR garantizará copias de seguridad diarias automatizadas con retención mínima de 30 días.</p>

      <p><strong>3. SEGURIDAD DE LA INFORMACIÓN:</strong> Cumplimiento estricto con cifrado en tránsito (TLS 1.3) y en reposo (AES-256).</p>

      <p><strong>4. PRECIO DEL SERVICIO:</strong> Se acuerda la tarifa mensual de <strong>[MONEDA] [PRECIO_ACORDADO]</strong> ([PRECIO_EN_LETRAS]).</p>

      <div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>EL CLIENTE</div></div>
        <div><div class="signature-line"><strong>[NOMBRE_EMPRESA]</strong><br>[NOMBRE_COMPLETO_CLIENTE]<br>EL PROVEEDOR CLOUD</div></div>
      </div>
    `
  },

  acuerdo_nda: {
    clave: 'acuerdo_nda',
    titulo: 'Acuerdo de Confidencialidad y No Divulgación (NDA Bipartito)',
    tipo: 'Acuerdo de Confidencialidad (NDA)',
    categoria: 'Secreto Comercial',
    descripcion: 'Protección integral de secretos empresariales, código fuente, modelos de negocio y penalidades de 50 UIT.',
    badge: 'NDA Confidencial',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div><div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div><div style="font-size:11px; font-weight:700; color:#b45309;">ACUERDO DE NO DIVULGACIÓN (NDA)</div></div>
        </div>
        <div class="header-info">RUC: 10764275981 &bull; Secreto Industrial</div>
      </div>

      <h2 style="text-align:center; font-size:15px; font-weight:800; margin-bottom:14px; text-transform:uppercase;">
        ACUERDO MUTUO DE CONFIDENCIALIDAD Y NO DIVULGACIÓN (NDA)
      </h2>

      <p>Las partes, <strong>QUBIRA</strong> (RUC 10764275981) y <strong>[NOMBRE_EMPRESA]</strong> (RUC/DNI <strong>[RUC_CLIENTE]</strong>), representada por <strong>[NOMBRE_COMPLETO_CLIENTE]</strong>, acuerdan proteger la <strong>INFORMACIÓN CONFIDENCIAL</strong> intercambiada en el marco de las negociaciones de <strong>[NOMBRE_PROYECTO]</strong>:</p>

      <p><strong>1. DEFINICIÓN:</strong> Incluye código fuente, algoritmos, claves de API, estructuras de bases de datos, costos y documentación de software.</p>

      <p><strong>2. VIGENCIA:</strong> La obligación de confidencialidad subsistirá por un periodo de tres (3) años posteriores a la terminación de las relaciones comerciales.</p>

      <p><strong>3. PENALIDAD POR INCUMPLIMIENTO:</strong> La parte infractora responderá por los daños y perjuicios ocasionados, acordándose una penalidad convencional de hasta cincuenta (50) Unidades Impositivas Tributarias (UIT).</p>

      <div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>Parte Emisora / Receptora</div></div>
        <div><div class="signature-line"><strong>[NOMBRE_EMPRESA]</strong><br>[NOMBRE_COMPLETO_CLIENTE]<br>Parte Emisora / Receptora</div></div>
      </div>
    `
  },

  politica_privacidad: {
    clave: 'politica_privacidad',
    titulo: 'Política de Privacidad y Tratamiento de Datos Personales (Ley 29733)',
    tipo: 'Políticas de Privacidad',
    categoria: 'Datos Personales',
    descripcion: 'Documento legal para portales web y aplicaciones móviles conforme a la Ley de Protección de Datos Personales de Perú.',
    badge: 'Ley 29733 Datos',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div><div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div><div style="font-size:11px; font-weight:700; color:#b45309;">POLÍTICA DE PRIVACIDAD OFICIAL</div></div>
        </div>
        <div class="header-info">RUC 10764275981 &bull; Ley N° 29733</div>
      </div>

      <h2 style="text-align:center; font-size:15px; font-weight:800; margin-bottom:14px; text-transform:uppercase;">
        POLÍTICA DE PRIVACIDAD Y PROTECCIÓN DE DATOS PERSONALES
      </h2>

      <p><strong>QUBIRA</strong> y <strong>[NOMBRE_EMPRESA]</strong> (RUC <strong>[RUC_CLIENTE]</strong>) informan a los usuarios del sistema <strong>[NOMBRE_PROYECTO]</strong> sobre el tratamiento de sus datos personales:</p>

      <p><strong>1. BANCO DE DATOS:</strong> Los datos personales se almacenan en los bancos de datos debidamente registrados ante la Dirección General de Transparencia y Protección de Datos Personales (MINJUS).</p>

      <p><strong>2. DERECHOS ARCO:</strong> Los titulares podrán ejercer sus derechos de Acceso, Rectificación, Cancelación y Oposición remitiendo su solicitud a <strong>[CORREO_CLIENTE]</strong> o a <strong>qubirasac@gmail.com</strong>.</p>

      <p><strong>3. SEGURIDAD:</strong> Se aplican medidas de cifrado SSL, hash bcryptjs y protección en servidores seguros en la nube.</p>

      <div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>Responsable de Banco de Datos</div></div>
        <div><div class="signature-line"><strong>[NOMBRE_EMPRESA]</strong><br>[NOMBRE_COMPLETO_CLIENTE]<br>Cumplimiento Normativo</div></div>
      </div>
    `
  },

  terminos_condiciones: {
    clave: 'terminos_condiciones',
    titulo: 'Términos y Condiciones de Uso de la Plataforma Qubira',
    tipo: 'Términos y Condiciones',
    categoria: 'Legal Web',
    descripcion: 'Condiciones de uso de servicios digitales, licencias, propiedad de marcas y resolución de controversias en Lima.',
    badge: 'Términos Web',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div><div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div><div style="font-size:11px; font-weight:700; color:#b45309;">TÉRMINOS Y CONDICIONES GENERALES</div></div>
        </div>
        <div class="header-info">RUC 10764275981 &bull; Lima, Perú</div>
      </div>

      <h2 style="text-align:center; font-size:15px; font-weight:800; margin-bottom:14px; text-transform:uppercase;">
        TÉRMINOS Y CONDICIONES GENERALES DE USO
      </h2>

      <p>El acceso y uso de los sitios web y plataformas de software desarrollados para <strong>[NOMBRE_EMPRESA]</strong> (RUC <strong>[RUC_CLIENTE]</strong>) bajo la plataforma <strong>[NOMBRE_PROYECTO]</strong> se rigen por las siguientes estipulaciones:</p>

      <p><strong>1. ACEPTACIÓN:</strong> La utilización de la plataforma implica la aceptación plena de estos Términos.</p>

      <p><strong>2. DERECHOS DE AUTOR:</strong> Todo el contenido, marcas, logotipos, diseño gráfico y código fuente son propiedad protegida conforme a ley.</p>

      <p><strong>3. LIBRO DE RECLAMACIONES:</strong> Se encuentra a disposición el Libro de Reclamaciones Virtual en cumplimiento de la Ley N° 29571.</p>

      <div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>Dirección Ejecutiva</div></div>
        <div><div class="signature-line"><strong>[NOMBRE_EMPRESA]</strong><br>[NOMBRE_COMPLETO_CLIENTE]<br>Revisión Legal</div></div>
      </div>
    `
  },

  en_blanco: {
    clave: 'en_blanco',
    titulo: 'Documento Legal en Blanco con Membrete Corporativo',
    tipo: 'Documento Legal Personalizado',
    categoria: 'Personalizado',
    descripcion: 'Hoja en blanco con membrete oficial de QUBIRA y pie de firma para redactar cualquier contrato libremente.',
    badge: 'En Blanco',
    contenido_html: `
      <div class="qubira-official-header">
        <div class="header-brand">
          <img src="https://raw.githubusercontent.com/qubira/IMAGENES/main/logo2.png" alt="QUBIRA">
          <div>
            <div style="font-size:16px; font-weight:800; color:#0f172a;">QUBIRA</div>
            <div style="font-size:11px; font-weight:700; color:#b45309;">OFICINA DE ASUNTOS CORPORATIVOS Y LEGALES</div>
          </div>
        </div>
        <div class="header-info">
          <strong>RUC: 10764275981</strong><br>
          Lima, República del Perú<br>
          qubirasac@gmail.com
        </div>
      </div>

      <h2 style="text-align:center; font-size:16px; font-weight:800; margin-bottom:18px; text-transform:uppercase;">
        [TITULO_DOCUMENTO_LEGAL]
      </h2>

      <p>Conste por el presente documento celebrado entre <strong>QUBIRA</strong> (RUC 10764275981) y <strong>[NOMBRE_EMPRESA]</strong> (RUC/DNI <strong>[RUC_CLIENTE]</strong>), representada por <strong>[NOMBRE_COMPLETO_CLIENTE]</strong>:</p>

      <p style="margin-top:20px;">[CONTENIDO_DOCUMENTO_LEGAL]</p>

      <div class="word-signature-block">
        <div>
          <div class="signature-line">
            <strong>QUBIRA</strong><br>
            Representante Legal
          </div>
        </div>
        <div>
          <div class="signature-line">
            <strong>[NOMBRE_EMPRESA]</strong><br>
            [NOMBRE_COMPLETO_CLIENTE]<br>
            DNI / RUC: [RUC_CLIENTE]
          </div>
        </div>
      </div>
    `
  }
};

/**
 * Extrae todos los identificadores en corchetes [ ... ] del HTML
 * @param {string} html
 * @returns {string[]} Lista única de placeholders encontrados
 */
function extractPlaceholders(html) {
  if (!html || typeof html !== 'string') return [];
  const matches = html.match(/\[[^\]\n\r]{2,80}\]/g) || [];
  return Array.from(new Set(matches));
}

/**
 * Obtiene todas las plantillas aprobadas por ODACL combinando
 * el catálogo base con las plantillas oficiales actualizadas en Postgres.
 * @param {import('pg').Pool} pool
 * @returns {Promise<Array>} Lista de plantillas
 */
async function getApprovedTemplates(poolInstance) {
  let pool = poolInstance;
  if (!pool) {
    try {
      pool = require('../db').pool;
    } catch (_) {}
  }

  // 1. Clonar catálogo base
  const templatesMap = {};
  for (const [key, tpl] of Object.entries(BASE_LEGAL_TEMPLATES)) {
    templatesMap[key] = {
      clave: tpl.clave || key,
      titulo: tpl.titulo,
      tipo: tpl.tipo,
      categoria: tpl.categoria,
      descripcion: tpl.descripcion,
      badge: tpl.badge,
      contenido_html: tpl.contenido_html,
      oficial: null,
      updated_at: null,
    };
  }

  // 2. Consultar si existen actualizaciones publicadas como oficial por ODACL en Postgres
  if (pool && typeof pool.query === 'function') {
    try {
      const { rows } = await pool.query(`
        SELECT clave, titulo, tipo_documento, contenido_html, origen_doc_id, origen_titulo,
               origen_version, actualizado_por, updated_at, categoria, descripcion, badge
        FROM odacl.official_templates
        ORDER BY updated_at DESC
      `);

    for (const row of rows) {
      if (templatesMap[row.clave]) {
        templatesMap[row.clave].contenido_html = row.contenido_html;
        if (row.titulo) templatesMap[row.clave].titulo = row.titulo;
        if (row.tipo_documento) templatesMap[row.clave].tipo = row.tipo_documento;
        templatesMap[row.clave].oficial = {
          fecha: row.updated_at,
          por: row.actualizado_por || 'ODACL Legal',
          origenDocId: row.origen_doc_id,
          origenTitulo: row.origen_titulo,
          origenVersion: row.origen_version
        };
        templatesMap[row.clave].updated_at = row.updated_at;
      } else if (/_anexo_[a-z0-9]+$/.test(row.clave)) {
        // Los anexos de un contrato (ODACL) no son plantillas de contrato
        continue;
      } else {
        // Plantilla extra registrada en la base de datos
        templatesMap[row.clave] = {
          clave: row.clave,
          titulo: row.titulo || row.clave,
          tipo: row.tipo_documento || 'Contrato Legal',
          categoria: row.categoria || 'Legal ODACL',
          descripcion: row.descripcion || `Plantilla oficial personalizada ${row.titulo}`,
          badge: row.badge || 'ODACL Oficial',
          contenido_html: row.contenido_html,
          oficial: {
            fecha: row.updated_at,
            por: row.actualizado_por || 'ODACL Legal',
            origenDocId: row.origen_doc_id,
            origenTitulo: row.origen_titulo,
            origenVersion: row.origen_version
          },
          updated_at: row.updated_at
        };
      }
    }
  } catch (err) {
    console.warn('[legalTemplates] No se pudo consultar odacl.official_templates, usando base:', err.message);
  }
}

  // 3. Añadir los placeholders detectados a cada plantilla
  const templates = Object.values(templatesMap).map(tpl => {
    return {
      ...tpl,
      placeholders: extractPlaceholders(tpl.contenido_html)
    };
  });

  return templates;
}

/**
 * Obtiene una plantilla aprobada por su clave
 */
async function getApprovedTemplateByKey(poolOrClave, claveIfPool) {
  let pool = null;
  let clave = '';
  if (typeof poolOrClave === 'string') {
    clave = poolOrClave;
  } else {
    pool = poolOrClave;
    clave = claveIfPool;
  }
  const templates = await getApprovedTemplates(pool);
  return templates.find(t => t.clave === clave) || null;
}

module.exports = {
  BASE_LEGAL_TEMPLATES,
  extractPlaceholders,
  getApprovedTemplates,
  getApprovedTemplateByKey,
};
