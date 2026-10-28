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
    descripcion: "Locación de servicios (arts. 1764 y ss. del Código Civil) en la que QUBIRA presta consultoría, soporte o capacitación: alcance, entregables, pago, datos personales, responsabilidad y resolución.",
    badge: 'Civil & Mercantil',
    contenido_html: `
      <h2 style="text-align:center; font-size:16px; font-weight:800; margin-bottom:14px; text-transform:uppercase; color:#0f172a;">CONTRATO DE LOCACIÓN DE SERVICIOS<br><span style="font-size:13px; font-weight:600; color:#475569;"><b>[CODIGO_CONTRATO]</b></span></h2>
<h3>COMPARECENCIA DE LAS PARTES</h3>
<p>Conste por el presente documento el Contrato de Locación de Servicios que celebran, en la ciudad de Lima, República del Perú, con fecha [FECHA_DIA_MES_AÑO]:</p>
<p>De una parte, <b>[RAZON_SOCIAL_QUBIRA]</b>, con RUC N.° [RUC_QUBIRA], con domicilio en [DOMICILIO_QUBIRA], distrito de [DISTRITO_QUBIRA], provincia y departamento de Lima, debidamente representado(a) por [NOMBRE_REPRESENTANTE_QUBIRA], identificado(a) con DNI N.° [DNI_REPRESENTANTE_QUBIRA], en su calidad de [CARGO_REPRESENTANTE_QUBIRA], a quien en adelante se denominará «QUBIRA» o «EL LOCADOR».</p>
<p>De la otra parte, <b>[NOMBRE_EMPRESA]</b>, con RUC N.° [RUC_CLIENTE], dedicada al rubro de [RUBRO_EMPRESA], con domicilio en [DIRECCION_COMPLETA_EMPRESA], debidamente representada por [NOMBRE_COMPLETO_REPRESENTANTE], identificado(a) con DNI/CE N.° [NUMERO_DNI_CE_REPRESENTANTE], en su calidad de [CARGO_REPRESENTANTE], a quien en adelante se denominará «EL CLIENTE».</p>
<p>QUBIRA y EL CLIENTE serán denominados conjuntamente «LAS PARTES» e individualmente «LA PARTE». Ambas declaran tener capacidad legal suficiente para contratar y celebran el presente contrato en los términos y condiciones siguientes.</p>

<h3>CLÁUSULA PRIMERA — ANTECEDENTES</h3>
<p><b>1.1. QUBIRA.</b> QUBIRA es una empresa que presta servicios de tecnologías de la información, consultoría, capacitación, soporte y desarrollo de soluciones digitales.</p>
<p><b>1.2. EL CLIENTE.</b> EL CLIENTE requiere [NECESIDAD_DEL_CLIENTE] y aceptó la Propuesta Comercial N.° [CODIGO_PROPUESTA] del [FECHA_PROPUESTA], que forma parte del presente contrato como Anexo 1. En caso de discrepancia, prevalece el contrato.</p>

<h3>CLÁUSULA SEGUNDA — OBJETO Y ALCANCE</h3>
<p><b>2.1. Objeto.</b> QUBIRA se obliga a prestar a EL CLIENTE los servicios de <b>[OBJETO_SERVICIO]</b> (en adelante, «el Servicio»), y EL CLIENTE se obliga a pagar la retribución pactada, conforme a los artículos 1764 y siguientes del Código Civil.</p>
<p><b>2.2. Alcance.</b> El Servicio comprende: [ALCANCE_DEL_SERVICIO]. No comprende: [EXCLUSIONES_DEL_SERVICIO]. Cualquier actividad no incluida se cotiza por separado.</p>
<p><b>2.3. Entregables.</b> QUBIRA entregará: [ENTREGABLES_DEL_SERVICIO].</p>
<p><b>2.4. Obligación de medios.</b> QUBIRA presta el Servicio con la diligencia profesional exigible, sin garantizar resultados que dependan de decisiones, información o sistemas de EL CLIENTE o de terceros.</p>

<h3>CLÁUSULA TERCERA — AUTONOMÍA</h3>
<p><b>3.1. Independencia.</b> QUBIRA presta el Servicio con autonomía técnica y organizativa, con su propio personal, que no tendrá vínculo laboral ni de subordinación con EL CLIENTE. QUBIRA asume las obligaciones laborales, tributarias y previsionales de su personal.</p>
<p><b>3.2. Coordinación.</b> Cada parte designa un coordinador: por QUBIRA, [NOMBRE_COORDINADOR_QUBIRA]; por EL CLIENTE, [NOMBRE_COORDINADOR_CLIENTE]. Los coordinadores aprueban entregables, cronogramas y cambios.</p>

<h3>CLÁUSULA CUARTA — PLAZO Y CRONOGRAMA</h3>
<p><b>4.1. Vigencia.</b> El contrato rige desde el [FECHA_INICIO] hasta el [FECHA_FIN], conforme al cronograma del Anexo 1. Puede ampliarse por acuerdo escrito.</p>
<p><b>4.2. Prórroga automática del plazo.</b> Los plazos de QUBIRA se prorrogan por el tiempo que EL CLIENTE demore en entregar información, accesos, aprobaciones o pagos a su cargo.</p>

<h3>CLÁUSULA QUINTA — RETRIBUCIÓN Y FORMA DE PAGO</h3>
<p><b>5.1. Retribución.</b> EL CLIENTE pagará a QUBIRA la suma de <b>[PRECIO_ACORDADO]</b> ([PRECIO_EN_LETRAS]), [INCLUYE_O_NO_IGV] el IGV, en [MONEDA], por el alcance pactado.</p>
<p><b>5.2. Forma de pago.</b> [DETALLE_DE_PAGOS], contra la emisión del comprobante de pago electrónico correspondiente, mediante depósito o transferencia a la cuenta que QUBIRA indique.</p>
<p><b>5.3. Mora.</b> El retraso en el pago genera automáticamente intereses moratorios a la tasa máxima permitida por el Banco Central de Reserva del Perú (artículo 1333, inciso 1, del Código Civil) y faculta a QUBIRA a suspender el Servicio hasta su regularización, sin responsabilidad por los retrasos que ello genere (artículo 1426).</p>
<p><b>5.4. Gastos adicionales.</b> Los viáticos, licencias de terceros u otros gastos no previstos en la Propuesta Comercial solo se asumen por EL CLIENTE con su aprobación previa y escrita.</p>

<h3>CLÁUSULA SEXTA — OBLIGACIONES DE LAS PARTES</h3>
<p><b>6.1. De QUBIRA.</b> a) Prestar el Servicio conforme al alcance y al cronograma; b) informar sobre el avance y los riesgos identificados; c) guardar confidencialidad; y d) entregar la documentación de cierre.</p>
<p><b>6.2. De EL CLIENTE.</b> a) Pagar la retribución en la oportunidad pactada; b) entregar oportunamente la información, los accesos y las aprobaciones necesarias, y garantizar que son veraces y que cuenta con autorización para compartirlos; c) designar a su coordinador; y d) revisar los entregables dentro de los cinco (5) días hábiles de recibidos. Vencido ese plazo sin observaciones, los entregables se entienden aprobados.</p>

<h3>CLÁUSULA SÉPTIMA — PROPIEDAD INTELECTUAL</h3>
<p><b>7.1. Entregables.</b> Con el pago total de la retribución, EL CLIENTE adquiere el derecho de usar los entregables para sus fines internos.</p>
<p><b>7.2. Conocimientos de QUBIRA.</b> QUBIRA conserva la titularidad de sus metodologías, plantillas, herramientas, librerías y conocimientos previos o generales, aunque se utilicen en el Servicio, conforme al Decreto Legislativo N.° 822.</p>

<h3>CLÁUSULA OCTAVA — CONFIDENCIALIDAD Y DATOS PERSONALES</h3>
<p><b>8.1. Confidencialidad.</b> LAS PARTES guardarán reserva sobre la información no pública que reciban de la otra, la usarán solo para el contrato y la protegerán con medidas razonables, durante su vigencia y por tres (3) años después. No se considera confidencial la información pública, la conocida previamente sin obligación de reserva o la que deba revelarse por mandato legal o judicial.</p>
<p><b>8.2. Datos personales.</b> Si el Servicio implica tratar datos personales de EL CLIENTE, este actúa como titular del banco de datos y QUBIRA como encargado del tratamiento, conforme a la Ley N.° 29733 y su Reglamento. QUBIRA tratará los datos solo según las instrucciones de EL CLIENTE y para el Servicio, aplicará medidas de seguridad, no los transferirá a terceros salvo a sus proveedores tecnológicos con iguales garantías y, al término, los devolverá o eliminará. EL CLIENTE garantiza contar con el consentimiento u otra base legal para el tratamiento.</p>

<h3>CLÁUSULA NOVENA — RESPONSABILIDAD</h3>
<p><b>9.1. Límite.</b> Salvo dolo o culpa inexcusable (artículo 1328 del Código Civil), la responsabilidad total de QUBIRA por el contrato no excederá el monto efectivamente pagado por EL CLIENTE en los seis (6) meses anteriores al hecho que la origina, y no comprende el lucro cesante, la pérdida de datos no respaldados por EL CLIENTE ni los daños indirectos.</p>
<p><b>9.2. Caso fortuito.</b> Ninguna parte responde por el incumplimiento causado por caso fortuito o fuerza mayor (artículo 1315), incluidas las fallas de servicios de terceros fuera de su control, siempre que lo comunique oportunamente.</p>

<h3>CLÁUSULA DÉCIMA — RESOLUCIÓN</h3>
<p><b>10.1. Por incumplimiento.</b> Si una parte incumple una obligación esencial, la otra puede requerirle su cumplimiento en un plazo de quince (15) días, bajo apercibimiento de resolución (artículo 1429). Se consideran causales de resolución de pleno derecho (artículo 1430) la falta de pago por más de treinta (30) días y la infracción de la Cláusula Octava.</p>
<p><b>10.2. Efectos.</b> Resuelto el contrato, EL CLIENTE paga los servicios prestados hasta esa fecha y QUBIRA entrega los avances pagados.</p>

<h3>CLÁUSULA UNDÉCIMA — DISPOSICIONES FINALES</h3>

<p><b>11.1. Comunicaciones.</b> Los domicilios de la introducción son domicilios especiales (artículo 34 del Código Civil). Las comunicaciones formales se envían a [CORREO_QUBIRA] y [CORREO_CLIENTE], y se presumen conocidas al llegar a su destino (artículo 1374). LAS PARTES aceptan la manifestación de voluntad y la firma electrónicas (artículos 141 y 141-A del Código Civil; Ley N.° 27269), así como los correos y registros electrónicos como medios de prueba.</p>
<p><b>11.2. Cesión.</b> EL CLIENTE no puede ceder su posición contractual sin autorización escrita de QUBIRA (artículo 1435). QUBIRA puede ceder sus créditos derivados del contrato.</p>
<p><b>11.3. Disposiciones varias.</b> El contrato y sus anexos constituyen el acuerdo completo entre LAS PARTES; sus modificaciones constan en adenda escrita. La nulidad de una cláusula no afecta a las demás (artículo 224). La tolerancia de una parte frente a un incumplimiento no implica renuncia a sus derechos.</p>
<p><b>11.4. Controversias.</b> LAS PARTES buscarán un trato directo durante quince (15) días y, cuando sea exigible, una conciliación extrajudicial en Lima (Ley N.° 26872). De no llegar a un acuerdo, se someten a los Juzgados y Salas Civiles de la Corte Superior de Justicia de Lima, renunciando al fuero de sus domicilios.</p>
<p><b>11.5. Ley aplicable.</b> El contrato se rige por las leyes de la República del Perú.</p>
<p><b>FIRMAS</b></p>
<p>En señal de conformidad, LAS PARTES suscriben el presente contrato, física o electrónicamente, en dos (2) ejemplares de igual valor, en la ciudad de Lima, [FECHA_DIA_MES_AÑO].</p>
<p><br></p><div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>[RAZON_SOCIAL_QUBIRA]<br>RUC [RUC_QUBIRA]<br>[NOMBRE_REPRESENTANTE_QUBIRA]<br>[CARGO_REPRESENTANTE_QUBIRA]</div></div>
        <div><div class="signature-line"><strong>EL CLIENTE</strong><br>[NOMBRE_EMPRESA]<br>RUC [RUC_CLIENTE]<br>[NOMBRE_COMPLETO_REPRESENTANTE]<br>[CARGO_REPRESENTANTE]</div></div>
      </div>
    `
  },

  licenciamiento_software: {
    clave: 'licenciamiento_software',
    titulo: 'Contrato de Licenciamiento de Software (SaaS / Cloud)',
    tipo: 'Contrato de Licenciamiento de Software',
    categoria: 'Propiedad Intelectual',
    descripcion: "Licencia de uso SaaS no exclusiva: plan y usuarios, restricciones, SLA, suscripción con renovación, encargo de tratamiento de datos (Ley 29733), devolución de datos y límites de responsabilidad.",
    badge: 'SaaS Licencia',
    contenido_html: `
      <h2 style="text-align:center; font-size:16px; font-weight:800; margin-bottom:14px; text-transform:uppercase; color:#0f172a;">CONTRATO DE LICENCIA DE USO DE SOFTWARE COMO SERVICIO (SaaS)<br><span style="font-size:13px; font-weight:600; color:#475569;"><b>[CODIGO_CONTRATO]</b></span></h2>
<h3>COMPARECENCIA DE LAS PARTES</h3>
<p>Conste por el presente documento el Contrato de Licencia de Uso de Software como Servicio que celebran, en la ciudad de Lima, República del Perú, con fecha [FECHA_DIA_MES_AÑO]:</p>
<p>De una parte, <b>[RAZON_SOCIAL_QUBIRA]</b>, con RUC N.° [RUC_QUBIRA], con domicilio en [DOMICILIO_QUBIRA], distrito de [DISTRITO_QUBIRA], provincia y departamento de Lima, debidamente representado(a) por [NOMBRE_REPRESENTANTE_QUBIRA], identificado(a) con DNI N.° [DNI_REPRESENTANTE_QUBIRA], en su calidad de [CARGO_REPRESENTANTE_QUBIRA], a quien en adelante se denominará «QUBIRA» o «EL LICENCIANTE».</p>
<p>De la otra parte, <b>[NOMBRE_EMPRESA]</b>, con RUC N.° [RUC_CLIENTE], dedicada al rubro de [RUBRO_EMPRESA], con domicilio en [DIRECCION_COMPLETA_EMPRESA], debidamente representada por [NOMBRE_COMPLETO_REPRESENTANTE], identificado(a) con DNI/CE N.° [NUMERO_DNI_CE_REPRESENTANTE], en su calidad de [CARGO_REPRESENTANTE], a quien en adelante se denominará «EL CLIENTE».</p>
<p>QUBIRA y EL CLIENTE serán denominados conjuntamente «LAS PARTES» e individualmente «LA PARTE». Ambas declaran tener capacidad legal suficiente para contratar y celebran el presente contrato en los términos y condiciones siguientes.</p>

<h3>CLÁUSULA PRIMERA — DEFINICIONES</h3>
<p><b>1.1. Plataforma.</b> El software <b>[NOMBRE_DE_LA_PLATAFORMA]</b>, de titularidad de QUBIRA, al que EL CLIENTE accede por internet, incluidas sus actualizaciones y su documentación.</p>
<p><b>1.2. Usuarios Autorizados.</b> Las personas que EL CLIENTE habilita para usar la Plataforma con credenciales individuales, dentro del número contratado.</p>
<p><b>1.3. Datos del Cliente.</b> La información que EL CLIENTE o sus Usuarios Autorizados cargan o generan en la Plataforma.</p>
<p><b>1.4. Plan.</b> La modalidad de suscripción contratada: <b>[PLAN_DE_SUSCRIPCION]</b>, con las funcionalidades y los límites descritos en el Anexo 1.</p>

<h3>CLÁUSULA SEGUNDA — OBJETO Y LICENCIA</h3>
<p><b>2.1. Objeto.</b> QUBIRA otorga a EL CLIENTE una licencia de uso de la Plataforma, no exclusiva, intransferible, no sublicenciable, revocable conforme a este contrato y limitada al territorio de [TERRITORIO_DE_USO], para las necesidades internas de su negocio, durante la vigencia de la suscripción.</p>
<p><b>2.2. Alcance.</b> La licencia comprende hasta [NUMERO_DE_USUARIOS] Usuarios Autorizados y los módulos: [MODULOS_INCLUIDOS].</p>
<p><b>2.3. Titularidad.</b> La Plataforma es una obra protegida por el Decreto Legislativo N.° 822, Ley sobre el Derecho de Autor. QUBIRA conserva todos los derechos sobre ella, su código fuente y objeto, su diseño, sus marcas y sus mejoras, incluso las que se realicen a partir de sugerencias de EL CLIENTE. El contrato no transfiere a EL CLIENTE derecho alguno sobre la Plataforma distinto de la licencia de uso.</p>
<p><b>2.4. Restricciones.</b> EL CLIENTE no podrá: a) copiar, modificar, descompilar, desensamblar o aplicar ingeniería inversa a la Plataforma; b) sublicenciarla, alquilarla o ponerla a disposición de terceros; c) compartir credenciales entre personas; d) usarla para fines ilícitos, para enviar contenido malicioso o para vulnerar su seguridad; ni e) usarla para desarrollar un producto competidor.</p>

<h3>CLÁUSULA TERCERA — PRESTACIÓN DEL SERVICIO</h3>
<p><b>3.1. Disponibilidad y soporte.</b> QUBIRA mantiene la Plataforma disponible y brinda soporte conforme al Acuerdo de Nivel de Servicio (SLA) que forma parte del contrato como Anexo 2. Las ventanas de mantenimiento programado se avisan con al menos cuarenta y ocho (48) horas de anticipación.</p>
<p><b>3.2. Actualizaciones.</b> QUBIRA puede actualizar y mejorar la Plataforma sin reducir de forma sustancial las funcionalidades del Plan contratado.</p>
<p><b>3.3. Respaldo.</b> QUBIRA realiza copias de seguridad de los Datos del Cliente con la periodicidad indicada en el Anexo 2 y las conserva cifradas.</p>
<p><b>3.4. Implementación.</b> La configuración inicial, la migración de datos y la capacitación se rigen por el Anexo 1. Los servicios adicionales se cotizan por separado.</p>

<h3>CLÁUSULA CUARTA — PRECIO, FACTURACIÓN Y SUSPENSIÓN</h3>
<p><b>4.1. Precio.</b> EL CLIENTE pagará una suscripción de <b>[PRECIO_SUSCRIPCION]</b> ([PRECIO_SUSCRIPCION_EN_LETRAS]) por [PERIODICIDAD_DEL_PAGO], [INCLUYE_O_NO_IGV] el IGV, en [MONEDA], y, de corresponder, un cargo único de implementación de [PRECIO_IMPLEMENTACION].</p>
<p><b>4.2. Facturación.</b> La suscripción se paga por adelantado dentro de los primeros [DIAS_PARA_EL_PAGO] días de cada periodo, contra el comprobante de pago electrónico.</p>
<p><b>4.3. Suspensión por falta de pago.</b> Si EL CLIENTE no paga dentro de los quince (15) días siguientes a su vencimiento, QUBIRA puede suspender el acceso previo aviso de cinco (5) días, sin perjuicio de los intereses moratorios a la tasa máxima permitida por el Banco Central de Reserva del Perú. El acceso se restablece al regularizarse el pago.</p>
<p><b>4.4. Reajuste.</b> QUBIRA puede reajustar el precio en cada renovación, con aviso escrito de al menos treinta (30) días. Si EL CLIENTE no está de acuerdo, puede no renovar.</p>

<h3>CLÁUSULA QUINTA — DATOS DEL CLIENTE Y DATOS PERSONALES</h3>
<p><b>5.1. Titularidad.</b> Los Datos del Cliente son de EL CLIENTE. QUBIRA los usa solo para prestar el servicio, darle soporte y cumplir obligaciones legales, y puede generar estadísticas anónimas de uso para mejorar la Plataforma.</p>
<p><b>5.2. Encargo de tratamiento.</b> Respecto de los datos personales contenidos en los Datos del Cliente, EL CLIENTE es el titular del banco de datos y QUBIRA el encargado del tratamiento, conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento. QUBIRA: a) trata los datos solo según las instrucciones de EL CLIENTE; b) aplica medidas de seguridad técnicas y organizativas adecuadas; c) exige confidencialidad a su personal; d) solo recurre a subencargados (como proveedores de nube) con garantías equivalentes, que EL CLIENTE autoriza desde ya; e) notifica a EL CLIENTE los incidentes de seguridad que afecten sus datos sin dilación indebida; y f) lo asiste en la atención de los derechos de los titulares.</p>
<p><b>5.3. Flujo transfronterizo.</b> EL CLIENTE autoriza que los datos se alojen en servidores ubicados fuera del Perú de los proveedores de infraestructura que QUBIRA utiliza, siempre que estos ofrezcan un nivel de protección adecuado conforme a la normativa peruana.</p>
<p><b>5.4. Responsabilidad de EL CLIENTE.</b> EL CLIENTE garantiza que cuenta con el consentimiento de los titulares u otra base legal para cargar los datos personales y que los Datos del Cliente no infringen derechos de terceros.</p>
<p><b>5.5. Devolución.</b> Al término del contrato, QUBIRA pondrá a disposición de EL CLIENTE, durante treinta (30) días, la exportación de los Datos del Cliente en un formato estándar. Vencido ese plazo, los eliminará de forma segura, salvo obligación legal de conservarlos.</p>

<h3>CLÁUSULA SEXTA — CONFIDENCIALIDAD</h3>
<p><b>6.1. Reserva.</b> LAS PARTES guardarán reserva sobre la información no pública que reciban de la otra, durante el contrato y por tres (3) años después. EL CLIENTE considerará confidenciales la Plataforma, su documentación técnica y las condiciones comerciales de este contrato.</p>

<h3>CLÁUSULA SÉPTIMA — GARANTÍAS Y RESPONSABILIDAD</h3>
<p><b>7.1. Garantía.</b> QUBIRA garantiza que la Plataforma funcionará sustancialmente según su documentación. Si no es así, corregirá el defecto en los plazos del Anexo 2; si no puede hacerlo, EL CLIENTE puede resolver el contrato y recibir la devolución del precio pagado por el periodo no utilizado.</p>
<p><b>7.2. Exclusiones.</b> QUBIRA no responde por fallas causadas por el uso indebido de la Plataforma, por equipos o conexiones de EL CLIENTE, por integraciones de terceros no provistas por QUBIRA o por caso fortuito o fuerza mayor (artículo 1315 del Código Civil).</p>
<p><b>7.3. Límite.</b> Salvo dolo o culpa inexcusable (artículo 1328), la responsabilidad total de QUBIRA no excederá lo pagado por EL CLIENTE en los doce (12) meses anteriores al hecho que la origina, y no comprende el lucro cesante ni los daños indirectos.</p>
<p><b>7.4. Indemnidad.</b> QUBIRA mantendrá indemne a EL CLIENTE frente a reclamos de terceros que aleguen que la Plataforma infringe sus derechos de propiedad intelectual, siempre que EL CLIENTE le avise oportunamente y le permita conducir la defensa.</p>

<h3>CLÁUSULA OCTAVA — VIGENCIA, RENOVACIÓN Y TÉRMINO</h3>
<p><b>8.1. Vigencia.</b> El contrato rige por [PLAZO_INICIAL_DE_LA_SUSCRIPCION] desde el [FECHA_INICIO_SUSCRIPCION] y se renueva automáticamente por periodos iguales, salvo que alguna parte comunique su decisión de no renovar con al menos treinta (30) días de anticipación al vencimiento.</p>
<p><b>8.2. Resolución.</b> Cualquier parte puede resolver el contrato de pleno derecho (artículo 1430) si la otra incumple una obligación esencial y no la subsana dentro de los quince (15) días de requerida. Son obligaciones esenciales el pago, las restricciones de la Cláusula Segunda y la Cláusula Quinta.</p>
<p><b>8.3. Efectos.</b> Al término, cesa la licencia, EL CLIENTE paga lo devengado y se aplica la devolución de datos del numeral 5.5. Subsisten las Cláusulas Quinta, Sexta y Séptima.</p>

<h3>CLÁUSULA NOVENA — DISPOSICIONES FINALES</h3>

<p><b>9.1. Comunicaciones.</b> Los domicilios de la introducción son domicilios especiales (artículo 34 del Código Civil). Las comunicaciones formales se envían a [CORREO_QUBIRA] y [CORREO_CLIENTE], y se presumen conocidas al llegar a su destino (artículo 1374). LAS PARTES aceptan la manifestación de voluntad y la firma electrónicas (artículos 141 y 141-A del Código Civil; Ley N.° 27269), así como los correos y registros electrónicos como medios de prueba.</p>
<p><b>9.2. Cesión.</b> EL CLIENTE no puede ceder su posición contractual sin autorización escrita de QUBIRA (artículo 1435). QUBIRA puede ceder sus créditos derivados del contrato.</p>
<p><b>9.3. Disposiciones varias.</b> El contrato y sus anexos constituyen el acuerdo completo entre LAS PARTES; sus modificaciones constan en adenda escrita. La nulidad de una cláusula no afecta a las demás (artículo 224). La tolerancia de una parte frente a un incumplimiento no implica renuncia a sus derechos.</p>
<p><b>9.4. Controversias.</b> LAS PARTES buscarán un trato directo durante quince (15) días y, cuando sea exigible, una conciliación extrajudicial en Lima (Ley N.° 26872). De no llegar a un acuerdo, se someten a los Juzgados y Salas Civiles de la Corte Superior de Justicia de Lima, renunciando al fuero de sus domicilios.</p>
<p><b>9.5. Ley aplicable.</b> El contrato se rige por las leyes de la República del Perú.</p>
<p><b>ANEXOS</b></p>
<p>Anexo 1: Plan contratado, módulos, implementación y capacitación. Anexo 2: Acuerdo de Nivel de Servicio (SLA).</p>
<p><b>FIRMAS</b></p>
<p>En señal de conformidad, LAS PARTES suscriben el presente contrato, física o electrónicamente, en dos (2) ejemplares de igual valor, en la ciudad de Lima, [FECHA_DIA_MES_AÑO].</p>
<p><br></p><div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>[RAZON_SOCIAL_QUBIRA]<br>RUC [RUC_QUBIRA]<br>[NOMBRE_REPRESENTANTE_QUBIRA]<br>[CARGO_REPRESENTANTE_QUBIRA]</div></div>
        <div><div class="signature-line"><strong>EL CLIENTE</strong><br>[NOMBRE_EMPRESA]<br>RUC [RUC_CLIENTE]<br>[NOMBRE_COMPLETO_REPRESENTANTE]<br>[CARGO_REPRESENTANTE]</div></div>
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
    descripcion: "Contrato modal por inicio o incremento de actividad (art. 57 del D. Leg. 728): causa objetiva, periodo de prueba, jornada y teletrabajo, beneficios según el régimen laboral, cesión de derechos del software y confidencialidad.",
    badge: 'Laboral SUNAFIL',
    contenido_html: `
      <h2 style="text-align:center; font-size:16px; font-weight:800; margin-bottom:14px; text-transform:uppercase; color:#0f172a;">CONTRATO DE TRABAJO SUJETO A MODALIDAD POR INICIO O INCREMENTO DE ACTIVIDAD<br><span style="font-size:13px; font-weight:600; color:#475569;">(TUO del D. Leg. N.° 728, aprobado por D.S. N.° 003-97-TR, artículo 57)<br><b>[CODIGO_CONTRATO]</b></span></h2>
<h3>COMPARECENCIA DE LAS PARTES</h3>
<p>Conste por el presente documento el Contrato de Trabajo Sujeto a Modalidad por Inicio o Incremento de Actividad que celebran, en la ciudad de Lima, República del Perú, con fecha [FECHA_DIA_MES_AÑO]:</p>
<p>De una parte, <b>[RAZON_SOCIAL_QUBIRA]</b>, con RUC N.° [RUC_QUBIRA], con domicilio en [DOMICILIO_QUBIRA], distrito de [DISTRITO_QUBIRA], provincia y departamento de Lima, debidamente representado(a) por [NOMBRE_REPRESENTANTE_QUBIRA], identificado(a) con DNI N.° [DNI_REPRESENTANTE_QUBIRA], en su calidad de [CARGO_REPRESENTANTE_QUBIRA], a quien en adelante se denominará «QUBIRA» o «EL EMPLEADOR».</p>
<p>De la otra parte, <b>[NOMBRE_COMPLETO_TRABAJADOR]</b>, de nacionalidad [NACIONALIDAD_TRABAJADOR], identificado(a) con [TIPO_DOCUMENTO_TRABAJADOR] N.° [NUMERO_DOCUMENTO_TRABAJADOR], con domicilio en [DOMICILIO_TRABAJADOR], a quien en adelante se denominará «EL TRABAJADOR».</p>
<p>EL EMPLEADOR y EL TRABAJADOR serán denominados conjuntamente «LAS PARTES». Ambas declaran tener capacidad legal suficiente para contratar y celebran el presente contrato en los términos y condiciones siguientes.</p>

<h3>CLÁUSULA PRIMERA — ANTECEDENTES Y CAUSA OBJETIVA</h3>
<p><b>1.1. Antecedentes.</b> EL EMPLEADOR es una empresa dedicada al desarrollo de software a medida, la implementación de plataformas digitales y la prestación de servicios de tecnologías de la información.</p>
<p><b>1.2. Causa objetiva.</b> EL EMPLEADOR requiere contratar personal de manera temporal debido a [CAUSA_OBJETIVA_DE_LA_CONTRATACION], lo que constituye un incremento de actividad en los términos del artículo 57 del TUO del Decreto Legislativo N.° 728, Ley de Productividad y Competitividad Laboral. La causa objetiva aquí descrita es determinante para la contratación y su desaparición no genera la conversión del contrato en uno de duración indeterminada, salvo en los supuestos del artículo 77 de la misma norma.</p>
<p><b>1.3. Declaración de EL TRABAJADOR.</b> EL TRABAJADOR declara contar con la formación, la experiencia y las competencias necesarias para el puesto, y que la información y los documentos que entregó durante el proceso de selección son verdaderos.</p>

<h3>CLÁUSULA SEGUNDA — OBJETO, CARGO Y FUNCIONES</h3>
<p><b>2.1. Cargo.</b> EL EMPLEADOR contrata a EL TRABAJADOR para que desempeñe el cargo de <b>[CARGO_DEL_TRABAJADOR]</b> en el área de [AREA_DEL_TRABAJADOR], bajo la supervisión de [CARGO_DEL_JEFE_INMEDIATO].</p>
<p><b>2.2. Funciones.</b> EL TRABAJADOR realizará las siguientes funciones principales: [FUNCIONES_PRINCIPALES_DEL_PUESTO]. Asimismo, cumplirá las demás tareas afines a su cargo que le encomiende EL EMPLEADOR, dentro de los límites del <i>ius variandi</i> y sin afectar su categoría ni su remuneración.</p>
<p><b>2.3. Lineamientos de trabajo.</b> EL TRABAJADOR cumplirá las metodologías, estándares de código, flujos de revisión, herramientas de gestión de proyectos y políticas de seguridad de la información que EL EMPLEADOR le comunique por escrito o mediante sus canales internos.</p>

<h3>CLÁUSULA TERCERA — PLAZO Y PERIODO DE PRUEBA</h3>
<p><b>3.1. Plazo.</b> El presente contrato rige desde el [FECHA_INICIO_LABORES] hasta el [FECHA_FIN_LABORES]. Podrá renovarse por acuerdo escrito de LAS PARTES mientras subsista la causa objetiva, sin exceder el plazo máximo de tres (3) años previsto en el artículo 57 del TUO del Decreto Legislativo N.° 728.</p>
<p><b>3.2. Periodo de prueba.</b> LAS PARTES acuerdan un periodo de prueba de tres (3) meses, conforme al artículo 10 del TUO del Decreto Legislativo N.° 728. Superado dicho periodo, EL TRABAJADOR adquiere protección contra el despido arbitrario por el tiempo que dure el contrato.</p>
<p><b>3.3. Vencimiento.</b> Al vencer el plazo, el vínculo laboral se extingue de pleno derecho, sin necesidad de aviso previo, de conformidad con el literal c) del artículo 16 de la misma norma.</p>

<h3>CLÁUSULA CUARTA — JORNADA, HORARIO Y MODALIDAD</h3>
<p><b>4.1. Jornada.</b> La jornada de trabajo es de [HORAS_SEMANALES] horas semanales, distribuidas de [DIAS_DE_TRABAJO], en el horario de [HORARIO_DE_TRABAJO], con un refrigerio de cuarenta y cinco (45) minutos que no forma parte de la jornada. La jornada no excederá de ocho (8) horas diarias ni de cuarenta y ocho (48) horas semanales, conforme al artículo 25 de la Constitución Política del Perú y al TUO del Decreto Legislativo N.° 854.</p>
<p><b>4.2. Sobretiempo.</b> El trabajo en sobretiempo es voluntario, requiere autorización previa y escrita del jefe inmediato y se compensa con el pago de la sobretasa de ley o con periodos equivalentes de descanso, según acuerden LAS PARTES.</p>
<p><b>4.3. Modalidad.</b> Las labores se prestarán en modalidad [MODALIDAD_DE_TRABAJO] (presencial, teletrabajo o mixta). Cuando se preste en teletrabajo, total o parcial, se aplicará la Ley N.° 31572, Ley del Teletrabajo, y su Reglamento: EL TRABAJADOR tendrá derecho a la desconexión digital de al menos doce (12) horas continuas en un periodo de veinticuatro (24) horas, y EL EMPLEADOR compensará los gastos de internet y energía eléctrica cuando EL TRABAJADOR utilice sus propios medios, en el monto o la forma que se fije por escrito.</p>
<p><b>4.4. Lugar de trabajo.</b> Cuando la labor sea presencial, se prestará en [LUGAR_DE_TRABAJO] o en las instalaciones de los clientes que EL EMPLEADOR indique dentro de la provincia de Lima.</p>

<h3>CLÁUSULA QUINTA — REMUNERACIÓN Y BENEFICIOS SOCIALES</h3>
<p><b>5.1. Remuneración.</b> EL TRABAJADOR percibirá una remuneración mensual bruta de <b>S/ [REMUNERACION_MENSUAL]</b> ([REMUNERACION_EN_LETRAS] soles), que en ningún caso será inferior a la Remuneración Mínima Vital vigente. Se paga por mes vencido, a más tardar el último día hábil de cada mes, mediante depósito en la cuenta de remuneraciones que EL TRABAJADOR indique.</p>
<p><b>5.2. Retenciones.</b> EL EMPLEADOR retendrá los aportes al sistema pensionario elegido por EL TRABAJADOR (SPP o SNP), el Impuesto a la Renta de quinta categoría cuando corresponda y los demás descuentos autorizados por ley o por EL TRABAJADOR por escrito. EL EMPLEADOR asume el aporte a EsSalud.</p>
<p><b>5.3. Beneficios sociales.</b> EL TRABAJADOR gozará de los beneficios sociales que correspondan al régimen laboral de EL EMPLEADOR, que es el <b>[REGIMEN_LABORAL_DEL_EMPLEADOR]</b> (régimen general del Decreto Legislativo N.° 728 o régimen especial de la micro o pequeña empresa del TUO de la Ley de Impulso al Desarrollo Productivo y al Crecimiento Empresarial, aprobado por D.S. N.° 013-2013-PRODUCE, según la inscripción vigente en el REMYPE), incluidos, según corresponda, las gratificaciones legales (Ley N.° 27735), la compensación por tiempo de servicios (TUO del D. Leg. N.° 650), el descanso vacacional (D. Leg. N.° 713) y el seguro social de salud.</p>
<p><b>5.4. Boletas.</b> EL EMPLEADOR entregará la boleta de pago de cada mes, que podrá ser electrónica y remitida al correo [CORREO_TRABAJADOR].</p>

<h3>CLÁUSULA SEXTA — OBLIGACIONES DE LAS PARTES</h3>
<p><b>6.1. De EL TRABAJADOR.</b> Son obligaciones de EL TRABAJADOR: a) prestar sus servicios con diligencia, buena fe y lealtad; b) cumplir el Reglamento Interno de Trabajo, las políticas de seguridad de la información y las instrucciones de sus superiores; c) registrar su asistencia y el avance de sus tareas en las herramientas que se le asignen; d) cuidar los equipos, cuentas y accesos que se le entreguen y devolverlos al término del vínculo; e) comunicar oportunamente cualquier incidente de seguridad, pérdida de equipos o acceso indebido; y f) cumplir las normas de seguridad y salud en el trabajo de la Ley N.° 29783.</p>
<p><b>6.2. De EL EMPLEADOR.</b> Son obligaciones de EL EMPLEADOR: a) pagar la remuneración y los beneficios en la forma y la oportunidad pactadas; b) registrar a EL TRABAJADOR en la Planilla Electrónica (T-Registro) dentro del plazo de ley; c) proporcionar las herramientas, licencias y accesos necesarios para el trabajo; d) garantizar condiciones de seguridad y salud en el trabajo; y e) prevenir y sancionar el hostigamiento sexual conforme a la Ley N.° 27942 y su Reglamento.</p>

<h3>CLÁUSULA SÉPTIMA — PROPIEDAD INTELECTUAL</h3>
<p><b>7.1. Titularidad.</b> Los programas de ordenador, el código fuente y objeto, las bases de datos, los diseños, la documentación, los prototipos, las invenciones y, en general, toda obra o creación que EL TRABAJADOR desarrolle en cumplimiento de sus funciones o con medios de EL EMPLEADOR (en adelante, «las Obras») pertenecen a EL EMPLEADOR.</p>
<p><b>7.2. Cesión de derechos patrimoniales.</b> En aplicación del artículo 16 del Decreto Legislativo N.° 822, Ley sobre el Derecho de Autor, y por medio de este contrato, EL TRABAJADOR cede a EL EMPLEADOR, en forma exclusiva, sin límite territorial y por todo el plazo de protección legal, la totalidad de los derechos patrimoniales sobre las Obras, incluidos los de reproducción, distribución, comunicación pública, transformación, adaptación, traducción e importación, por cualquier medio o formato conocido o por conocerse. La remuneración pactada comprende la contraprestación por esta cesión.</p>
<p><b>7.3. Derechos morales.</b> Los derechos morales de EL TRABAJADOR son irrenunciables. Sin perjuicio de ello, EL TRABAJADOR autoriza que las Obras se modifiquen, integren a otros productos y se exploten sin mencionar su nombre cuando así lo exijan su naturaleza o los compromisos de EL EMPLEADOR con sus clientes.</p>
<p><b>7.4. Conocimientos previos.</b> EL TRABAJADOR declara que no incorporará a las Obras código, librerías o materiales de terceros sin la licencia correspondiente ni sin autorización de EL EMPLEADOR, ni secretos de anteriores empleadores.</p>

<h3>CLÁUSULA OCTAVA — CONFIDENCIALIDAD Y DATOS PERSONALES</h3>
<p><b>8.1. Información confidencial.</b> EL TRABAJADOR guardará reserva absoluta sobre el código fuente, las credenciales, la arquitectura de los sistemas, la información de clientes y proveedores, las propuestas comerciales, los precios y cualquier información no pública a la que acceda. Esta obligación subsiste durante la relación laboral y por cinco (5) años después de su término, y por tiempo indefinido respecto del código fuente y los secretos comerciales.</p>
<p><b>8.2. Uso de herramientas.</b> EL TRABAJADOR no copiará información de EL EMPLEADOR o de sus clientes en dispositivos, cuentas o repositorios personales, ni la ingresará en herramientas de inteligencia artificial o servicios en línea no autorizados por EL EMPLEADOR.</p>
<p><b>8.3. Datos personales.</b> EL TRABAJADOR tratará los datos personales a los que acceda únicamente para el cumplimiento de sus funciones y conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento. EL TRABAJADOR autoriza a EL EMPLEADOR a tratar sus datos personales para la gestión de la relación laboral y el cumplimiento de obligaciones legales.</p>

<h3>CLÁUSULA NOVENA — EXTINCIÓN DEL CONTRATO</h3>
<p><b>9.1. Causas.</b> El contrato se extingue por el vencimiento del plazo, por mutuo acuerdo, por renuncia, por despido fundado en causa justa o por cualquiera de las demás causas previstas en el artículo 16 del TUO del Decreto Legislativo N.° 728.</p>
<p><b>9.2. Renuncia.</b> EL TRABAJADOR que renuncie deberá avisar por escrito con treinta (30) días naturales de anticipación, plazo que EL EMPLEADOR puede exonerar total o parcialmente (artículo 18).</p>
<p><b>9.3. Entrega del cargo.</b> Al término del vínculo, EL TRABAJADOR devolverá los equipos, documentos y accesos; entregará el código y la documentación de los trabajos en curso en los repositorios de EL EMPLEADOR, y EL EMPLEADOR pagará los beneficios sociales dentro del plazo legal.</p>

<h3>CLÁUSULA DÉCIMA — DISPOSICIONES FINALES</h3>
<p><b>10.1. Registro.</b> EL EMPLEADOR presentará el presente contrato ante la Autoridad Administrativa de Trabajo, a través de la plataforma virtual del Ministerio de Trabajo y Promoción del Empleo, dentro de los quince (15) días naturales siguientes a su celebración, conforme al artículo 73 del TUO del Decreto Legislativo N.° 728.</p>
<p><b>10.2. Normas aplicables.</b> En lo no previsto rigen el TUO del Decreto Legislativo N.° 728, su Reglamento y las demás normas laborales vigentes.</p>
<p><b>10.3. Comunicaciones.</b> LAS PARTES señalan como domicilios los indicados en la introducción y aceptan como válidas las comunicaciones al correo corporativo asignado a EL TRABAJADOR y al correo [CORREO_TRABAJADOR].</p>
<p><b>10.4. Controversias.</b> Cualquier controversia se someterá a los Juzgados Especializados de Trabajo de la Corte Superior de Justicia de Lima.</p>
<p><b>FIRMAS</b></p>
<p>En señal de conformidad, LAS PARTES suscriben el presente contrato, física o electrónicamente, en tres (3) ejemplares de igual valor, en la ciudad de Lima, [FECHA_DIA_MES_AÑO].</p>
<p><br></p><div class="word-signature-block">
        <div><div class="signature-line"><strong>EL EMPLEADOR</strong><br>[RAZON_SOCIAL_QUBIRA]<br>RUC [RUC_QUBIRA]<br>[NOMBRE_REPRESENTANTE_QUBIRA]<br>[CARGO_REPRESENTANTE_QUBIRA]</div></div>
        <div><div class="signature-line"><strong>EL TRABAJADOR</strong><br>[NOMBRE_COMPLETO_TRABAJADOR]<br>[TIPO_DOCUMENTO_TRABAJADOR] N.° [NUMERO_DOCUMENTO_TRABAJADOR]</div></div>
      </div>
    `
  },

  servicios_profesionales: {
    clave: 'servicios_profesionales',
    titulo: 'Contrato de Servicios Profesionales TI (Con Cesión Patrimonial)',
    tipo: 'Contrato de Prestación de Servicios Profesionales',
    categoria: 'Servicios TI',
    descripcion: "Locación con programadores o diseñadores independientes: entregables por repositorio, recibo por honorarios, cesión exclusiva de derechos patrimoniales (D. Leg. 822), seguridad y no captación.",
    badge: 'Honorarios & D.L. 822',
    contenido_html: `
      <h2 style="text-align:center; font-size:16px; font-weight:800; margin-bottom:14px; text-transform:uppercase; color:#0f172a;">CONTRATO DE LOCACIÓN DE SERVICIOS PROFESIONALES DE TECNOLOGÍA CON CESIÓN DE DERECHOS PATRIMONIALES<br><span style="font-size:13px; font-weight:600; color:#475569;"><b>[CODIGO_CONTRATO]</b></span></h2>
<h3>COMPARECENCIA DE LAS PARTES</h3>
<p>Conste por el presente documento el Contrato de Locación de Servicios Profesionales de Tecnología que celebran, en la ciudad de Lima, República del Perú, con fecha [FECHA_DIA_MES_AÑO]:</p>
<p>De una parte, <b>[RAZON_SOCIAL_QUBIRA]</b>, con RUC N.° [RUC_QUBIRA], con domicilio en [DOMICILIO_QUBIRA], distrito de [DISTRITO_QUBIRA], provincia y departamento de Lima, debidamente representado(a) por [NOMBRE_REPRESENTANTE_QUBIRA], identificado(a) con DNI N.° [DNI_REPRESENTANTE_QUBIRA], en su calidad de [CARGO_REPRESENTANTE_QUBIRA], a quien en adelante se denominará «QUBIRA» o «EL COMITENTE».</p>
<p>De la otra parte, <b>[NOMBRE_COMPLETO_LOCADOR]</b>, identificado(a) con [TIPO_DOCUMENTO_LOCADOR] N.° [NUMERO_DOCUMENTO_LOCADOR], con RUC N.° [RUC_LOCADOR], con domicilio en [DOMICILIO_LOCADOR], profesional independiente en [ESPECIALIDAD_DEL_LOCADOR], a quien en adelante se denominará «EL LOCADOR».</p>
<p>QUBIRA y EL LOCADOR serán denominados conjuntamente «LAS PARTES». Ambas declaran tener capacidad legal suficiente para contratar y celebran el presente contrato en los términos y condiciones siguientes.</p>

<h3>CLÁUSULA PRIMERA — OBJETO Y NATURALEZA</h3>
<p><b>1.1. Objeto.</b> EL LOCADOR se obliga a prestar a QUBIRA, de manera autónoma, los servicios profesionales de [DESCRIPCION_DE_LOS_SERVICIOS] para el proyecto [NOMBRE_DEL_PROYECTO] (en adelante, «los Servicios»), y a entregar los resultados descritos en la Cláusula Segunda.</p>
<p><b>1.2. Naturaleza civil.</b> El presente contrato es de locación de servicios, regulado por los artículos 1764 y siguientes del Código Civil. EL LOCADOR presta los Servicios con autonomía técnica, sin subordinación ni sujeción a horario, con sus propios medios y organizando su tiempo, por lo que no existe relación laboral entre LAS PARTES. Las coordinaciones, revisiones de código y plazos de entrega no constituyen subordinación.</p>
<p><b>1.3. Prestación personal.</b> EL LOCADOR presta los Servicios personalmente y no puede encargarlos a terceros sin autorización escrita de QUBIRA (artículo 1766 del Código Civil).</p>

<h3>CLÁUSULA SEGUNDA — ENTREGABLES Y ACEPTACIÓN</h3>
<p><b>2.1. Entregables.</b> EL LOCADOR entregará: [ENTREGABLES_DEL_LOCADOR], según el cronograma siguiente: [CRONOGRAMA_DE_ENTREGAS].</p>
<p><b>2.2. Forma de entrega.</b> El código fuente se entrega mediante commits y <i>pull requests</i> en los repositorios de QUBIRA, con la documentación técnica, las instrucciones de instalación y las pruebas que correspondan. No se considera entregado el trabajo que solo exista en equipos o cuentas de EL LOCADOR.</p>
<p><b>2.3. Aceptación.</b> QUBIRA revisará cada entregable dentro de los cinco (5) días hábiles siguientes y comunicará su conformidad u observaciones. EL LOCADOR subsanará las observaciones sin costo adicional dentro de los cinco (5) días hábiles siguientes. A falta de pronunciamiento de QUBIRA en el plazo indicado, el entregable se entiende aceptado.</p>
<p><b>2.4. Estándares.</b> Los entregables cumplirán los estándares de código, seguridad y documentación que QUBIRA comunique, y no contendrán código malicioso, puertas traseras ni dependencias con licencias incompatibles con su uso comercial.</p>

<h3>CLÁUSULA TERCERA — PLAZO</h3>
<p><b>3.1. Vigencia.</b> El contrato rige desde el [FECHA_INICIO_SERVICIOS] hasta el [FECHA_FIN_SERVICIOS] o hasta la aceptación del último entregable, lo que ocurra primero. Puede ampliarse por acuerdo escrito.</p>

<h3>CLÁUSULA CUARTA — RETRIBUCIÓN Y FORMA DE PAGO</h3>
<p><b>4.1. Retribución.</b> QUBIRA pagará a EL LOCADOR una retribución total de <b>S/ [RETRIBUCION_TOTAL]</b> ([RETRIBUCION_EN_LETRAS] soles), que comprende los Servicios y la cesión de derechos de la Cláusula Quinta.</p>
<p><b>4.2. Forma de pago.</b> La retribución se paga [FORMA_DE_PAGO_DEL_LOCADOR], dentro de los [DIAS_PARA_EL_PAGO] días hábiles siguientes a la aceptación de cada entregable y a la emisión del recibo por honorarios electrónico, mediante depósito en la cuenta que EL LOCADOR indique.</p>
<p><b>4.3. Tributos.</b> QUBIRA efectuará la retención del Impuesto a la Renta de cuarta categoría cuando corresponda, salvo que EL LOCADOR acredite la suspensión de retenciones. EL LOCADOR asume sus propias obligaciones tributarias y previsionales.</p>
<p><b>4.4. Gastos.</b> Los equipos, el software, la conexión y demás gastos para prestar los Servicios son de cargo de EL LOCADOR, salvo los accesos y las licencias de los proyectos de QUBIRA, que esta proporciona.</p>

<h3>CLÁUSULA QUINTA — PROPIEDAD INTELECTUAL Y CESIÓN DE DERECHOS</h3>
<p><b>5.1. Cesión exclusiva.</b> Por el presente contrato, EL LOCADOR cede a QUBIRA, en forma exclusiva, total, sin límite territorial y por todo el plazo de protección legal, los derechos patrimoniales sobre los programas de ordenador, el código fuente y objeto, las bases de datos, los diseños, la documentación y las demás obras creadas en ejecución de los Servicios (en adelante, «las Obras»), conforme al Decreto Legislativo N.° 822, Ley sobre el Derecho de Autor. La cesión comprende los derechos de reproducción, distribución, comunicación pública, transformación, adaptación, traducción e importación, por cualquier medio conocido o por conocerse, y faculta a QUBIRA a ceder o licenciar las Obras a sus clientes y a terceros.</p>
<p><b>5.2. Oportunidad.</b> La cesión opera respecto de cada Obra desde su creación, y la retribución pactada constituye su única contraprestación.</p>
<p><b>5.3. Derechos morales.</b> Los derechos morales de EL LOCADOR son irrenunciables. Sin perjuicio de ello, EL LOCADOR autoriza que las Obras se modifiquen, integren a otros productos y se exploten sin mencionar su nombre cuando así lo exijan su naturaleza o los compromisos de QUBIRA con sus clientes.</p>
<p><b>5.4. Garantía de originalidad.</b> EL LOCADOR garantiza que las Obras son originales, que no infringen derechos de terceros y que los componentes de terceros que incorpore cuentan con licencias que permiten su uso comercial, las que identificará por escrito. EL LOCADOR mantendrá indemne a QUBIRA frente a cualquier reclamo derivado del incumplimiento de esta garantía.</p>
<p><b>5.5. Conocimientos previos.</b> Las herramientas, librerías genéricas y conocimientos que EL LOCADOR tenía antes del contrato siguen siendo suyos; si los incorpora a las Obras, otorga a QUBIRA una licencia no exclusiva, perpetua, gratuita e irrevocable para usarlos como parte de ellas.</p>

<h3>CLÁUSULA SEXTA — CONFIDENCIALIDAD, SEGURIDAD Y DATOS PERSONALES</h3>
<p><b>6.1. Confidencialidad.</b> EL LOCADOR guardará reserva sobre el código fuente, las credenciales, la arquitectura, la información de los clientes de QUBIRA y cualquier información no pública que reciba, durante el contrato y por cinco (5) años después de su término, y por tiempo indefinido respecto del código fuente y los secretos comerciales.</p>
<p><b>6.2. Seguridad.</b> EL LOCADOR usará los accesos solo para los Servicios; no compartirá credenciales; no copiará código ni datos en repositorios, dispositivos o cuentas personales; no ingresará información de QUBIRA o de sus clientes en herramientas de inteligencia artificial o servicios en línea no autorizados, y comunicará cualquier incidente de seguridad dentro de las veinticuatro (24) horas de conocerlo.</p>
<p><b>6.3. Datos personales.</b> Si para los Servicios EL LOCADOR accede a datos personales, actuará como encargado del tratamiento por cuenta de QUBIRA, conforme a la Ley N.° 29733 y su Reglamento: los tratará solo según las instrucciones de QUBIRA, aplicará medidas de seguridad y los devolverá o eliminará al término del contrato.</p>
<p><b>6.4. No captación.</b> Durante el contrato y por doce (12) meses después, EL LOCADOR no ofrecerá directamente a los clientes de QUBIRA que conoció por los Servicios, servicios iguales o sustitutos de los que prestó en el proyecto, salvo autorización escrita de QUBIRA.</p>

<h3>CLÁUSULA SÉPTIMA — INCUMPLIMIENTO Y RESOLUCIÓN</h3>
<p><b>7.1. Penalidad por demora.</b> Por cada día hábil de retraso injustificado en un entregable, QUBIRA podrá aplicar una penalidad del [PORCENTAJE_PENALIDAD_DIARIA] % del pago de ese entregable, hasta un máximo del diez por ciento (10 %), que se descontará del pago correspondiente.</p>
<p><b>7.2. Resolución.</b> QUBIRA puede resolver el contrato de pleno derecho, mediante comunicación escrita, si EL LOCADOR incumple las Cláusulas Quinta o Sexta o acumula la penalidad máxima (artículo 1430 del Código Civil). Cualquiera de LAS PARTES puede, además, ponerle fin sin expresión de causa con quince (15) días de aviso escrito.</p>
<p><b>7.3. Efectos.</b> Al término del contrato, QUBIRA pagará los entregables aceptados y la parte proporcional del trabajo en curso que reciba; EL LOCADOR entregará el código y la documentación existentes y eliminará la información de QUBIRA en su poder. Subsisten las Cláusulas Quinta y Sexta.</p>

<h3>CLÁUSULA OCTAVA — DISPOSICIONES FINALES</h3>
<p><b>8.1. Comunicaciones.</b> Las comunicaciones se envían a [CORREO_QUBIRA] y [CORREO_LOCADOR], y se presumen conocidas al llegar a su destino (artículo 1374 del Código Civil). LAS PARTES aceptan la firma electrónica (Ley N.° 27269).</p>
<p><b>8.2. Normas aplicables.</b> El contrato se rige por las leyes de la República del Perú; en lo no previsto, por el Código Civil y el Decreto Legislativo N.° 822.</p>
<p><b>8.3. Controversias.</b> LAS PARTES procurarán un trato directo durante quince (15) días; de no llegar a un acuerdo, se someten a los Juzgados y Salas Civiles de la Corte Superior de Justicia de Lima.</p>
<p><b>FIRMAS</b></p>
<p>En señal de conformidad, LAS PARTES suscriben el presente contrato, física o electrónicamente, en dos (2) ejemplares de igual valor, en la ciudad de Lima, [FECHA_DIA_MES_AÑO].</p>
<p><br></p><div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>[RAZON_SOCIAL_QUBIRA]<br>RUC [RUC_QUBIRA]<br>[NOMBRE_REPRESENTANTE_QUBIRA]<br>[CARGO_REPRESENTANTE_QUBIRA]</div></div>
        <div><div class="signature-line"><strong>EL LOCADOR</strong><br>[NOMBRE_COMPLETO_LOCADOR]<br>RUC [RUC_LOCADOR]</div></div>
      </div>
    `
  },

  servicios_preprofesionales: {
    clave: 'servicios_preprofesionales',
    titulo: 'Convenio de Prácticas Pre Profesionales (Ley N° 28518)',
    tipo: 'Contrato de Prácticas Pre Profesionales',
    categoria: 'Formativo Laboral',
    descripcion: "Convenio tripartito (empresa, practicante y centro de formación) conforme a la Ley 28518: plan de aprendizaje, jornada máxima, subvención, seguro, certificado y propiedad intelectual.",
    badge: 'Ley 28518 Prácticas',
    contenido_html: `
      <h2 style="text-align:center; font-size:16px; font-weight:800; margin-bottom:14px; text-transform:uppercase; color:#0f172a;">CONVENIO DE PRÁCTICAS PREPROFESIONALES<br><span style="font-size:13px; font-weight:600; color:#475569;">(Ley N.° 28518, Ley sobre Modalidades Formativas Laborales, y su Reglamento, D.S. N.° 007-2005-TR)<br><b>[CODIGO_CONTRATO]</b></span></h2>
<h3>COMPARECENCIA DE LAS PARTES</h3>
<p>Conste por el presente documento el Convenio de Prácticas Preprofesionales que celebran, en la ciudad de Lima, República del Perú, con fecha [FECHA_DIA_MES_AÑO]:</p>
<p>De una parte, <b>[RAZON_SOCIAL_QUBIRA]</b>, con RUC N.° [RUC_QUBIRA], con domicilio en [DOMICILIO_QUBIRA], distrito de [DISTRITO_QUBIRA], provincia y departamento de Lima, debidamente representado(a) por [NOMBRE_REPRESENTANTE_QUBIRA], identificado(a) con DNI N.° [DNI_REPRESENTANTE_QUBIRA], en su calidad de [CARGO_REPRESENTANTE_QUBIRA], a quien en adelante se denominará «QUBIRA» o «LA EMPRESA».</p>
<p>De otra parte, <b>[NOMBRE_COMPLETO_PRACTICANTE]</b>, identificado(a) con [TIPO_DOCUMENTO_PRACTICANTE] N.° [NUMERO_DOCUMENTO_PRACTICANTE], con domicilio en [DOMICILIO_PRACTICANTE], estudiante del [CICLO_O_AÑO_DE_ESTUDIOS] de la carrera de [CARRERA_PROFESIONAL], a quien en adelante se denominará «EL PRACTICANTE».</p>
<p>Y de otra parte, <b>[NOMBRE_DEL_CENTRO_DE_FORMACION]</b>, con RUC N.° [RUC_CENTRO_DE_FORMACION], con domicilio en [DOMICILIO_CENTRO_DE_FORMACION], debidamente representado(a) por [NOMBRE_REPRESENTANTE_CENTRO], identificado(a) con DNI N.° [DNI_REPRESENTANTE_CENTRO], en su calidad de [CARGO_REPRESENTANTE_CENTRO], a quien en adelante se denominará «EL CENTRO DE FORMACIÓN».</p>
<p>LA EMPRESA, EL PRACTICANTE y EL CENTRO DE FORMACIÓN serán denominados conjuntamente «LAS PARTES», y celebran el presente convenio en los términos y condiciones siguientes.</p>

<h3>CLÁUSULA PRIMERA — OBJETO</h3>
<p><b>1.1. Objeto.</b> El presente convenio tiene por objeto que EL PRACTICANTE aplique sus conocimientos, habilidades y aptitudes mediante el desempeño en una situación real de trabajo en LA EMPRESA, como complemento de su formación profesional, conforme a la Ley N.° 28518 y su Reglamento.</p>
<p><b>1.2. Naturaleza.</b> El presente convenio es de naturaleza formativa y no genera relación laboral entre LA EMPRESA y EL PRACTICANTE. No le son aplicables las normas del régimen laboral, salvo las expresamente previstas en la ley.</p>

<h3>CLÁUSULA SEGUNDA — ÁREA, PLAN DE APRENDIZAJE Y SUPERVISIÓN</h3>
<p><b>2.1. Área.</b> EL PRACTICANTE realizará sus prácticas en el área de [AREA_DE_PRACTICAS], en actividades relacionadas con su carrera, tales como [ACTIVIDADES_FORMATIVAS].</p>
<p><b>2.2. Plan Específico de Aprendizaje.</b> LA EMPRESA y EL CENTRO DE FORMACIÓN elaboran el Plan Específico de Aprendizaje que forma parte del presente convenio como anexo, en el que se detallan los conocimientos y las competencias que EL PRACTICANTE debe adquirir.</p>
<p><b>2.3. Supervisor.</b> LA EMPRESA designa como supervisor(a) de las prácticas a [NOMBRE_DEL_SUPERVISOR], [CARGO_DEL_SUPERVISOR], quien guiará, evaluará e informará sobre el desempeño de EL PRACTICANTE.</p>

<h3>CLÁUSULA TERCERA — PLAZO Y JORNADA FORMATIVA</h3>
<p><b>3.1. Plazo.</b> El convenio rige desde el [FECHA_INICIO_PRACTICAS] hasta el [FECHA_FIN_PRACTICAS], y puede renovarse por acuerdo de LAS PARTES sin exceder la duración de los estudios de EL PRACTICANTE.</p>
<p><b>3.2. Jornada.</b> La jornada formativa es de [HORAS_DIARIAS] horas diarias, de [DIAS_DE_PRACTICA], en el horario de [HORARIO_DE_PRACTICAS], sin exceder de seis (6) horas diarias ni de treinta (30) horas semanales, conforme a la Ley N.° 28518. La jornada se adecuará a los horarios académicos de EL PRACTICANTE.</p>
<p><b>3.3. Modalidad.</b> Las prácticas se desarrollarán en modalidad [MODALIDAD_DE_PRACTICAS] (presencial, remota o mixta), con las herramientas que LA EMPRESA proporcione.</p>

<h3>CLÁUSULA CUARTA — SUBVENCIÓN ECONÓMICA Y BENEFICIOS</h3>
<p><b>4.1. Subvención.</b> LA EMPRESA otorgará a EL PRACTICANTE una subvención económica mensual de <b>S/ [SUBVENCION_MENSUAL]</b> ([SUBVENCION_EN_LETRAS] soles), que no será inferior a la Remuneración Mínima Vital cuando se cumpla la jornada máxima; si la jornada es menor, se paga en forma proporcional, conforme a la Ley N.° 28518. La subvención no tiene carácter remunerativo ni está afecta a aportes laborales.</p>
<p><b>4.2. Subvención adicional.</b> LA EMPRESA otorgará una subvención adicional equivalente a media subvención mensual por cada seis (6) meses de duración continua del convenio.</p>
<p><b>4.3. Descanso.</b> Cuando el convenio dure más de doce (12) meses, EL PRACTICANTE gozará de un descanso de quince (15) días con el pago de la subvención.</p>
<p><b>4.4. Seguro.</b> LA EMPRESA asegura a EL PRACTICANTE contra riesgos de enfermedad y accidentes, mediante EsSalud o un seguro privado, con la cobertura mínima que establece la Ley N.° 28518 y su Reglamento.</p>
<p><b>4.5. Certificado.</b> Al término de las prácticas, LA EMPRESA entregará a EL PRACTICANTE el certificado que acredite su participación y las competencias desarrolladas.</p>

<h3>CLÁUSULA QUINTA — OBLIGACIONES DE LAS PARTES</h3>
<p><b>5.1. De LA EMPRESA.</b> a) Brindar orientación y capacitación técnica y profesional en el área; b) pagar la subvención en forma oportuna; c) no cobrar suma alguna por la formación; d) registrar el convenio en la Planilla Electrónica y ante la Autoridad Administrativa de Trabajo dentro del plazo de ley; e) emitir los informes de evaluación que solicite EL CENTRO DE FORMACIÓN; y f) respetar los límites al número de beneficiarios previstos en la ley.</p>
<p><b>5.2. De EL PRACTICANTE.</b> a) Acatar las disposiciones formativas y las normas internas de LA EMPRESA; b) cumplir con diligencia el Plan Específico de Aprendizaje; c) observar la reserva de la información de LA EMPRESA y de sus clientes; y d) cuidar los bienes y accesos que se le asignen.</p>
<p><b>5.3. De EL CENTRO DE FORMACIÓN.</b> a) Velar por el cumplimiento del Plan Específico de Aprendizaje; b) supervisar y evaluar las prácticas; y c) comunicar a LA EMPRESA cualquier cambio en la condición académica de EL PRACTICANTE.</p>

<h3>CLÁUSULA SEXTA — PROPIEDAD INTELECTUAL Y CONFIDENCIALIDAD</h3>
<p><b>6.1. Propiedad intelectual.</b> Los programas, códigos, diseños, documentos y demás creaciones que EL PRACTICANTE elabore en el marco de las prácticas o con medios de LA EMPRESA pertenecen a LA EMPRESA. EL PRACTICANTE cede a LA EMPRESA, en forma exclusiva y sin límite territorial ni temporal, los derechos patrimoniales sobre dichas creaciones, conforme al Decreto Legislativo N.° 822, sin perjuicio de sus derechos morales, que son irrenunciables.</p>
<p><b>6.2. Confidencialidad.</b> EL PRACTICANTE guardará reserva sobre la información técnica, comercial y de clientes a la que acceda, durante el convenio y por tres (3) años después de su término. No copiará información en dispositivos o cuentas personales ni la ingresará en servicios en línea no autorizados.</p>
<p><b>6.3. Datos personales.</b> LAS PARTES tratarán los datos personales intercambiados solo para la ejecución del convenio, conforme a la Ley N.° 29733 y su Reglamento.</p>

<h3>CLÁUSULA SÉPTIMA — TÉRMINO DEL CONVENIO</h3>
<p><b>7.1. Causas.</b> El convenio termina por vencimiento del plazo, por mutuo acuerdo, por la pérdida de la condición de estudiante de EL PRACTICANTE, por incumplimiento grave de las obligaciones de cualquiera de LAS PARTES o por decisión unilateral comunicada por escrito con quince (15) días de anticipación.</p>
<p><b>7.2. Desnaturalización.</b> LAS PARTES declaran conocer que el convenio se desnaturaliza en los supuestos previstos en la Ley N.° 28518 y su Reglamento, por lo que LA EMPRESA velará por el cumplimiento estricto de sus fines formativos.</p>

<h3>CLÁUSULA OCTAVA — DISPOSICIONES FINALES</h3>
<p><b>8.1. Normas aplicables.</b> En lo no previsto rigen la Ley N.° 28518, su Reglamento y sus normas complementarias.</p>
<p><b>8.2. Comunicaciones.</b> Las comunicaciones se dirigirán a los domicilios indicados y a los correos [CORREO_QUBIRA], [CORREO_PRACTICANTE] y [CORREO_CENTRO_DE_FORMACION].</p>
<p><b>8.3. Controversias.</b> Cualquier controversia se someterá a los Juzgados de la Corte Superior de Justicia de Lima.</p>
<p><b>FIRMAS</b></p>
<p>En señal de conformidad, LAS PARTES suscriben el presente convenio, física o electrónicamente, en tres (3) ejemplares de igual valor, en la ciudad de Lima, [FECHA_DIA_MES_AÑO].</p>
<p><br></p><div class="word-signature-block">
        <div><div class="signature-line"><strong>LA EMPRESA</strong><br>[RAZON_SOCIAL_QUBIRA]<br>[NOMBRE_REPRESENTANTE_QUBIRA]<br>[CARGO_REPRESENTANTE_QUBIRA]</div></div>
        <div><div class="signature-line"><strong>EL PRACTICANTE</strong><br>[NOMBRE_COMPLETO_PRACTICANTE]<br>[TIPO_DOCUMENTO_PRACTICANTE] N.° [NUMERO_DOCUMENTO_PRACTICANTE]</div></div>
      </div><p><br></p><div class="word-signature-block">
        <div><div class="signature-line"><strong>EL CENTRO DE FORMACIÓN</strong><br>[NOMBRE_DEL_CENTRO_DE_FORMACION]<br>[NOMBRE_REPRESENTANTE_CENTRO]<br>[CARGO_REPRESENTANTE_CENTRO]</div></div>
      </div>
    `
  },

  proveedores_infraestructura: {
    clave: 'proveedores_infraestructura',
    titulo: 'Contrato con Proveedores de Infraestructura Cloud y Servidores',
    tipo: 'Contrato Proveedores Infraestructura',
    categoria: 'Infraestructura & Cloud',
    descripcion: "Contratación de hosting, bases de datos o nube: disponibilidad garantizada con créditos, seguridad, RPO/RTO, aviso de incidentes, datos personales y asistencia de salida.",
    badge: 'Infraestructura Cloud',
    contenido_html: `
      <h2 style="text-align:center; font-size:16px; font-weight:800; margin-bottom:14px; text-transform:uppercase; color:#0f172a;">CONTRATO DE PRESTACIÓN DE SERVICIOS DE INFRAESTRUCTURA TECNOLÓGICA Y NUBE<br><span style="font-size:13px; font-weight:600; color:#475569;"><b>[CODIGO_CONTRATO]</b></span></h2>
<h3>COMPARECENCIA DE LAS PARTES</h3>
<p>Conste por el presente documento el Contrato de Prestación de Servicios de Infraestructura Tecnológica y Nube que celebran, en la ciudad de Lima, República del Perú, con fecha [FECHA_DIA_MES_AÑO]:</p>
<p>De una parte, <b>[RAZON_SOCIAL_QUBIRA]</b>, con RUC N.° [RUC_QUBIRA], con domicilio en [DOMICILIO_QUBIRA], distrito de [DISTRITO_QUBIRA], provincia y departamento de Lima, debidamente representado(a) por [NOMBRE_REPRESENTANTE_QUBIRA], identificado(a) con DNI N.° [DNI_REPRESENTANTE_QUBIRA], en su calidad de [CARGO_REPRESENTANTE_QUBIRA], a quien en adelante se denominará «QUBIRA» o «EL CLIENTE».</p>
<p>De la otra parte, <b>[RAZON_SOCIAL_PROVEEDOR]</b>, con RUC N.° [RUC_PROVEEDOR], con domicilio en [DOMICILIO_PROVEEDOR], debidamente representada por [NOMBRE_REPRESENTANTE_PROVEEDOR], identificado(a) con DNI/CE N.° [DNI_REPRESENTANTE_PROVEEDOR], en su calidad de [CARGO_REPRESENTANTE_PROVEEDOR], a quien en adelante se denominará «EL PROVEEDOR».</p>
<p>QUBIRA y EL PROVEEDOR serán denominados conjuntamente «LAS PARTES». Ambas declaran tener capacidad legal suficiente para contratar y celebran el presente contrato en los términos y condiciones siguientes.</p>

<h3>CLÁUSULA PRIMERA — OBJETO</h3>
<p><b>1.1. Objeto.</b> EL PROVEEDOR se obliga a prestar a QUBIRA los servicios de <b>[SERVICIOS_DE_INFRAESTRUCTURA]</b> (servidores, bases de datos, almacenamiento, red de distribución de contenidos u otros), con las especificaciones técnicas del Anexo 1 (en adelante, «los Servicios»).</p>
<p><b>1.2. Finalidad.</b> QUBIRA utiliza los Servicios para alojar y operar sus plataformas y las soluciones que desarrolla para sus clientes, por lo que EL PROVEEDOR reconoce que la continuidad, la seguridad y la confidencialidad de los Servicios son esenciales para el contrato.</p>

<h3>CLÁUSULA SEGUNDA — NIVELES DE SERVICIO</h3>
<p><b>2.1. Disponibilidad.</b> EL PROVEEDOR garantiza una disponibilidad mensual de los Servicios de al menos <b>[PORCENTAJE_DISPONIBILIDAD] %</b>, medida fuera de las ventanas de mantenimiento programado, que se avisarán con setenta y dos (72) horas de anticipación y se realizarán en horarios de baja demanda.</p>
<p><b>2.2. Soporte.</b> EL PROVEEDOR atenderá los incidentes en los siguientes tiempos máximos de respuesta: críticos, [TIEMPO_RESPUESTA_CRITICO]; altos, [TIEMPO_RESPUESTA_ALTO]; y demás, [TIEMPO_RESPUESTA_NORMAL], mediante [CANALES_DE_SOPORTE].</p>
<p><b>2.3. Créditos.</b> Si la disponibilidad mensual es inferior a la garantizada, EL PROVEEDOR otorgará a QUBIRA un crédito sobre la siguiente facturación del [PORCENTAJE_CREDITO] % del cargo mensual por cada punto porcentual de incumplimiento, sin perjuicio de la resolución prevista en la Cláusula Octava.</p>

<h3>CLÁUSULA TERCERA — SEGURIDAD Y CONTINUIDAD</h3>
<p><b>3.1. Medidas de seguridad.</b> EL PROVEEDOR mantendrá controles de seguridad acordes con estándares reconocidos (como ISO/IEC 27001), entre ellos: cifrado de la información en tránsito y en reposo, control de accesos con mínimo privilegio y autenticación multifactor, registro y monitoreo de eventos, gestión de parches y vulnerabilidades, y protección física de los centros de datos.</p>
<p><b>3.2. Respaldo y recuperación.</b> EL PROVEEDOR realizará copias de seguridad con la periodicidad del Anexo 1 y garantizará un punto de recuperación (RPO) de [RPO_ACORDADO] y un tiempo de recuperación (RTO) de [RTO_ACORDADO].</p>
<p><b>3.3. Incidentes.</b> EL PROVEEDOR notificará a QUBIRA todo incidente de seguridad que afecte o pueda afectar la información de QUBIRA o de sus clientes dentro de las veinticuatro (24) horas de conocerlo, con la información disponible y las medidas adoptadas, y colaborará en su investigación y en las comunicaciones que exija la ley.</p>
<p><b>3.4. Ubicación.</b> La información se alojará en [UBICACION_DE_LOS_SERVIDORES]. EL PROVEEDOR no la trasladará a otra jurisdicción sin aviso previo y escrito a QUBIRA.</p>

<h3>CLÁUSULA CUARTA — DATOS PERSONALES</h3>
<p><b>4.1. Encargo.</b> Respecto de los datos personales alojados en los Servicios, EL PROVEEDOR actúa como encargado (o subencargado) del tratamiento por cuenta de QUBIRA, conforme a la Ley N.° 29733 y su Reglamento. En consecuencia, EL PROVEEDOR: a) no accede a los datos ni los usa para fines propios; b) los trata solo para prestar los Servicios; c) aplica las medidas de la Cláusula Tercera; d) no subcontrata el tratamiento sin informar previamente a QUBIRA y exigir garantías equivalentes; y e) devuelve o elimina los datos al término del contrato.</p>
<p><b>4.2. Flujo transfronterizo.</b> Cuando los servidores se ubiquen fuera del Perú, EL PROVEEDOR garantiza un nivel de protección adecuado conforme a la normativa peruana y facilitará la información que QUBIRA requiera para cumplir sus obligaciones ante la Autoridad Nacional de Protección de Datos Personales.</p>

<h3>CLÁUSULA QUINTA — PRECIO Y FACTURACIÓN</h3>
<p><b>5.1. Precio.</b> QUBIRA pagará a EL PROVEEDOR [PRECIO_DEL_SERVICIO] ([PRECIO_DEL_SERVICIO_EN_LETRAS]) por [PERIODICIDAD_DEL_PAGO], [INCLUYE_O_NO_IGV] el IGV, en [MONEDA_DEL_SERVICIO], según el detalle del Anexo 1. Los consumos variables se facturan conforme a las tarifas del mismo anexo.</p>
<p><b>5.2. Pago.</b> El pago se realiza dentro de los [DIAS_PARA_EL_PAGO] días siguientes a la recepción del comprobante de pago electrónico. Las observaciones a una factura se comunican dentro de los diez (10) días de recibida; el monto no observado se paga en el plazo pactado.</p>
<p><b>5.3. Sin suspensión inmediata.</b> En caso de atraso en el pago, EL PROVEEDOR no suspenderá los Servicios sin un aviso escrito previo de al menos quince (15) días, dada su criticidad para los clientes de QUBIRA.</p>

<h3>CLÁUSULA SEXTA — CONFIDENCIALIDAD Y PROPIEDAD</h3>
<p><b>6.1. Confidencialidad.</b> EL PROVEEDOR guardará reserva sobre toda la información de QUBIRA y de sus clientes a la que tenga acceso, durante el contrato y por cinco (5) años después, y exigirá igual obligación a su personal y subcontratistas.</p>
<p><b>6.2. Propiedad.</b> La información, el código y las configuraciones que QUBIRA aloje en los Servicios son de QUBIRA o de sus clientes. EL PROVEEDOR no adquiere derecho alguno sobre ellos.</p>
<p><b>6.3. Auditoría.</b> QUBIRA puede solicitar, una vez al año o tras un incidente relevante, los informes de auditoría o certificaciones vigentes de EL PROVEEDOR que acrediten el cumplimiento de la Cláusula Tercera.</p>

<h3>CLÁUSULA SÉPTIMA — RESPONSABILIDAD</h3>
<p><b>7.1. Responsabilidad.</b> EL PROVEEDOR responde por los daños que cause a QUBIRA por incumplir el contrato, en especial por la pérdida, alteración o divulgación de información debida a la falta de las medidas de seguridad pactadas. Salvo dolo o culpa inexcusable (artículo 1328 del Código Civil) o infracción de las Cláusulas Tercera, Cuarta y Sexta, la responsabilidad de cada parte no excederá lo pagado en los doce (12) meses anteriores al hecho que la origina.</p>
<p><b>7.2. Caso fortuito.</b> Ninguna parte responde por el incumplimiento debido a caso fortuito o fuerza mayor (artículo 1315), siempre que lo comunique oportunamente y active sus planes de continuidad.</p>

<h3>CLÁUSULA OCTAVA — VIGENCIA, TÉRMINO Y SALIDA</h3>
<p><b>8.1. Vigencia.</b> El contrato rige por [PLAZO_DEL_CONTRATO] desde el [FECHA_INICIO_SERVICIOS] y se renueva automáticamente por periodos iguales, salvo aviso de no renovación con treinta (30) días de anticipación.</p>
<p><b>8.2. Resolución.</b> QUBIRA puede resolver el contrato de pleno derecho (artículo 1430) si la disponibilidad es inferior a la garantizada durante dos (2) meses consecutivos o tres (3) en un año, o si EL PROVEEDOR infringe las Cláusulas Tercera, Cuarta o Sexta. Cualquier parte puede resolverlo por otro incumplimiento esencial no subsanado en quince (15) días desde su requerimiento (artículo 1429).</p>
<p><b>8.3. Asistencia de salida.</b> Al término del contrato, por cualquier causa, EL PROVEEDOR mantendrá los Servicios por un periodo de transición de hasta treinta (30) días, a las tarifas vigentes, entregará toda la información de QUBIRA en formatos estándar y, una vez confirmada la migración, la eliminará de forma segura y lo certificará por escrito.</p>

<h3>CLÁUSULA NOVENA — DISPOSICIONES FINALES</h3>
<p><b>9.1. Comunicaciones.</b> Las comunicaciones se envían a [CORREO_QUBIRA] y [CORREO_PROVEEDOR], y se presumen conocidas al llegar a su destino (artículo 1374 del Código Civil). LAS PARTES aceptan la firma electrónica (Ley N.° 27269).</p>
<p><b>9.2. Cesión y subcontratación.</b> EL PROVEEDOR no puede ceder su posición contractual sin autorización escrita de QUBIRA (artículo 1435) y responde por sus subcontratistas como por sí mismo.</p>
<p><b>9.3. Prelación.</b> El contrato prevalece sobre los términos generales de servicio de EL PROVEEDOR en todo lo que se oponga a ellos.</p>
<p><b>9.4. Controversias y ley aplicable.</b> El contrato se rige por las leyes de la República del Perú. LAS PARTES buscarán un trato directo durante quince (15) días; de no llegar a un acuerdo, se someten a los Juzgados y Salas Civiles de la Corte Superior de Justicia de Lima.</p>
<p><b>ANEXOS</b></p>
<p>Anexo 1: Especificaciones técnicas, tarifas, respaldo y contactos de soporte.</p>
<p><b>FIRMAS</b></p>
<p>En señal de conformidad, LAS PARTES suscriben el presente contrato, física o electrónicamente, en dos (2) ejemplares de igual valor, en la ciudad de Lima, [FECHA_DIA_MES_AÑO].</p>
<p><br></p><div class="word-signature-block">
        <div><div class="signature-line"><strong>QUBIRA</strong><br>[RAZON_SOCIAL_QUBIRA]<br>RUC [RUC_QUBIRA]<br>[NOMBRE_REPRESENTANTE_QUBIRA]<br>[CARGO_REPRESENTANTE_QUBIRA]</div></div>
        <div><div class="signature-line"><strong>EL PROVEEDOR</strong><br>[RAZON_SOCIAL_PROVEEDOR]<br>RUC [RUC_PROVEEDOR]<br>[NOMBRE_REPRESENTANTE_PROVEEDOR]<br>[CARGO_REPRESENTANTE_PROVEEDOR]</div></div>
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
    descripcion: "Política del sitio web de QUBIRA conforme a la Ley 29733: titular y banco de datos, finalidades, base legal, conservación, transferencias, seguridad, derechos y cookies.",
    badge: 'Ley 29733 Datos',
    contenido_html: `
      <h2 style="text-align:center; font-size:16px; font-weight:800; margin-bottom:14px; text-transform:uppercase; color:#0f172a;">POLÍTICA DE PRIVACIDAD Y TRATAMIENTO DE DATOS PERSONALES<br><span style="font-size:13px; font-weight:600; color:#475569;">Última actualización: [FECHA_ULTIMA_ACTUALIZACION]</span></h2>
<p>La presente Política de Privacidad explica cómo <b>[RAZON_SOCIAL_QUBIRA]</b> (en adelante, «QUBIRA») recopila, usa, conserva, comparte y protege los datos personales de las personas que visitan su sitio web [SITIO_WEB_QUBIRA], se comunican con ella, solicitan cotizaciones o usan sus servicios, en cumplimiento de la Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento vigente.</p>

<h3>1. TITULAR DEL BANCO DE DATOS PERSONALES</h3>
<p><b>1.1. Identificación.</b> El titular del banco de datos personales y responsable del tratamiento es [RAZON_SOCIAL_QUBIRA], con RUC N.° [RUC_QUBIRA], con domicilio en [DOMICILIO_QUBIRA], distrito de [DISTRITO_QUBIRA], Lima, Perú.</p>
<p><b>1.2. Contacto.</b> Para cualquier consulta sobre esta Política o el ejercicio de sus derechos, puede escribir a <b>[CORREO_QUBIRA]</b>.</p>
<p><b>1.3. Registro.</b> Los datos se almacenan en el banco de datos denominado «[NOMBRE_DEL_BANCO_DE_DATOS]», inscrito en el Registro Nacional de Protección de Datos Personales con el código [CODIGO_DE_INSCRIPCION_DEL_BANCO].</p>

<h3>2. DATOS PERSONALES QUE RECOPILAMOS</h3>
<p><b>2.1. Datos que usted nos entrega.</b> a) Datos de identificación y contacto: nombres, apellidos, documento de identidad, correo electrónico, teléfono, empresa y cargo; b) datos de su consulta o requerimiento: descripción del proyecto, presupuesto estimado y documentos que adjunte; c) datos para la contratación y facturación: RUC, razón social, domicilio fiscal y datos del representante; y d) datos de cuenta, si se registra en alguna de nuestras plataformas: usuario y credenciales cifradas.</p>
<p><b>2.2. Datos que se obtienen automáticamente.</b> Al navegar por el sitio se registran datos técnicos como la dirección IP, el tipo de navegador y dispositivo, las páginas visitadas y la fecha y hora de acceso, mediante cookies y tecnologías similares (ver el numeral 9).</p>
<p><b>2.3. Datos sensibles.</b> QUBIRA no solicita datos sensibles a través del sitio web. Le pedimos no incluirlos en sus mensajes ni en los documentos que adjunte.</p>
<p><b>2.4. Menores de edad.</b> El sitio y los servicios están dirigidos a personas mayores de edad y empresas. QUBIRA no recopila a sabiendas datos de menores de catorce (14) años sin el consentimiento de sus padres o tutores; si detecta que lo hizo, los eliminará.</p>

<h3>3. FINALIDADES DEL TRATAMIENTO</h3>
<p><b>3.1. Finalidades necesarias.</b> Tratamos sus datos para: a) atender sus consultas, solicitudes de información y de cotización; b) elaborar propuestas comerciales y, si las acepta, celebrar y ejecutar el contrato; c) prestar soporte técnico y gestionar las cuentas de usuario; d) emitir comprobantes de pago y cumplir obligaciones tributarias, contables y legales; e) mantener la seguridad del sitio y prevenir fraudes o usos indebidos; y f) atender reclamos y requerimientos de autoridades.</p>
<p><b>3.2. Finalidades adicionales.</b> Solo con su consentimiento previo, libre, expreso, informado e inequívoco, trataremos sus datos para: a) enviarle información sobre nuestros servicios, novedades, eventos y promociones; y b) realizar encuestas de satisfacción y estudios de mercado. Puede negarse o retirar este consentimiento en cualquier momento, sin que ello afecte las finalidades necesarias.</p>

<h3>4. BASE LEGAL</h3>
<p>El tratamiento se basa en: a) su consentimiento, para las finalidades adicionales y cuando se requiera; b) la ejecución de una relación contractual o precontractual de la que usted es parte, o de las medidas que solicite antes de contratar; y c) el cumplimiento de obligaciones legales de QUBIRA, conforme al artículo 14 de la Ley N.° 29733.</p>

<h3>5. CONSERVACIÓN DE LOS DATOS</h3>
<p>Conservamos los datos mientras sean necesarios para la finalidad para la que se recopilaron: las consultas no concretadas, por un plazo máximo de [PLAZO_CONSERVACION_CONSULTAS]; los datos de clientes, durante la relación contractual y por los plazos de prescripción de las acciones legales y los exigidos por las normas tributarias; y los datos para comunicaciones comerciales, hasta que retire su consentimiento. Vencidos esos plazos, se eliminan o anonimizan de forma segura.</p>

<h3>6. DESTINATARIOS Y TRANSFERENCIAS</h3>
<p><b>6.1. Encargados del tratamiento.</b> Para operar sus servicios, QUBIRA puede compartir datos con proveedores que tratan la información por su cuenta y según sus instrucciones, como servicios de alojamiento en la nube, bases de datos, correo electrónico, almacenamiento de archivos, mensajería y analítica web. Estos proveedores están obligados a mantener la confidencialidad y la seguridad de los datos.</p>
<p><b>6.2. Flujo transfronterizo.</b> Algunos de estos proveedores tienen sus servidores fuera del Perú (por ejemplo, en los Estados Unidos de América). En tales casos, QUBIRA verifica que ofrezcan un nivel de protección adecuado conforme a la normativa peruana.</p>
<p><b>6.3. Otras comunicaciones.</b> QUBIRA no vende ni alquila datos personales. Solo los comunica a terceros cuando lo exija la ley o una autoridad competente, o con su consentimiento.</p>

<h3>7. SEGURIDAD</h3>
<p>QUBIRA aplica medidas técnicas, organizativas y legales para proteger los datos contra pérdida, alteración, acceso o tratamiento no autorizado, entre ellas: conexiones cifradas (HTTPS), cifrado de contraseñas, control de accesos por roles, autenticación reforzada para el personal, copias de seguridad y obligaciones de confidencialidad para colaboradores y proveedores. Ningún sistema es completamente infalible; si ocurre un incidente que afecte sus datos, actuaremos conforme a la normativa vigente.</p>

<h3>8. SUS DERECHOS</h3>
<p><b>8.1. Derechos.</b> Usted puede ejercer, en cualquier momento y de forma gratuita, los derechos de información, acceso, rectificación, actualización e inclusión, cancelación (supresión) y oposición, así como los demás reconocidos por la Ley N.° 29733 y su Reglamento, y revocar el consentimiento otorgado.</p>
<p><b>8.2. Procedimiento.</b> Envíe su solicitud a [CORREO_QUBIRA] con el asunto «Derechos de datos personales», indicando su nombre completo, el derecho que ejerce, su pedido concreto y un medio para responderle, y adjuntando copia de su documento de identidad (o del poder de su representante). QUBIRA responderá dentro de los plazos que establece el Reglamento de la Ley N.° 29733.</p>
<p><b>8.3. Tutela.</b> Si considera que no fue atendido debidamente, puede presentar una reclamación ante la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.</p>

<h3>9. COOKIES</h3>
<p><b>9.1. Uso.</b> El sitio usa cookies técnicas, necesarias para su funcionamiento y seguridad, y, si usted las acepta, cookies de análisis que nos permiten conocer de forma agregada cómo se usa el sitio.</p>
<p><b>9.2. Configuración.</b> Puede aceptar, rechazar o eliminar las cookies no necesarias desde el aviso de cookies del sitio o la configuración de su navegador. Si las desactiva, algunas funciones podrían no estar disponibles.</p>

<h3>10. ENLACES A TERCEROS</h3>
<p>El sitio puede contener enlaces a sitios o redes sociales de terceros, que tienen sus propias políticas de privacidad. QUBIRA no es responsable del tratamiento que esos terceros realicen.</p>

<h3>11. CAMBIOS A ESTA POLÍTICA</h3>
<p>QUBIRA puede actualizar esta Política para reflejar cambios normativos o en sus servicios. La versión vigente estará siempre publicada en el sitio, con su fecha de última actualización. Si los cambios afectan finalidades que requieren su consentimiento, se lo solicitaremos nuevamente.</p>

<h3>12. CONSENTIMIENTO</h3>
<p>Al marcar la casilla de aceptación en nuestros formularios, usted declara haber leído esta Política y otorga su consentimiento para el tratamiento de sus datos en los términos aquí descritos. Las finalidades adicionales del numeral 3.2 requieren una aceptación separada y opcional.</p>
    `
  },

  terminos_condiciones: {
    clave: 'terminos_condiciones',
    titulo: 'Términos y Condiciones de Uso de la Plataforma Qubira',
    tipo: 'Términos y Condiciones',
    categoria: 'Legal Web',
    descripcion: "Condiciones de uso del sitio y las plataformas de QUBIRA: contratación, cuentas, uso permitido, propiedad intelectual, responsabilidad, Libro de Reclamaciones y jurisdicción.",
    badge: 'Términos Web',
    contenido_html: `
      <h2 style="text-align:center; font-size:16px; font-weight:800; margin-bottom:14px; text-transform:uppercase; color:#0f172a;">TÉRMINOS Y CONDICIONES DE USO DEL SITIO WEB Y PLATAFORMAS DE QUBIRA<br><span style="font-size:13px; font-weight:600; color:#475569;">Última actualización: [FECHA_ULTIMA_ACTUALIZACION]</span></h2>
<p>Los presentes Términos y Condiciones (en adelante, «los Términos») regulan el acceso y el uso del sitio web [SITIO_WEB_QUBIRA] y de las plataformas digitales de <b>[RAZON_SOCIAL_QUBIRA]</b> (en adelante, «QUBIRA»). Le pedimos leerlos con atención antes de usar el sitio.</p>

<h3>1. IDENTIFICACIÓN DE QUBIRA</h3>
<p>[RAZON_SOCIAL_QUBIRA], con RUC N.° [RUC_QUBIRA], con domicilio en [DOMICILIO_QUBIRA], distrito de [DISTRITO_QUBIRA], Lima, Perú, y correo de contacto [CORREO_QUBIRA], es una empresa dedicada al desarrollo de software a medida, la implementación de plataformas digitales y la prestación de servicios de tecnologías de la información.</p>

<h3>2. ACEPTACIÓN</h3>
<p><b>2.1. Aceptación.</b> Al acceder al sitio, registrarse en una plataforma o enviar un formulario, usted (en adelante, «el Usuario») declara ser mayor de edad, tener capacidad para obligarse y aceptar estos Términos y la Política de Privacidad. Si actúa en nombre de una empresa, declara contar con facultades para representarla.</p>
<p><b>2.2. Modificaciones.</b> QUBIRA puede modificar los Términos en cualquier momento. La versión vigente es la publicada en el sitio, con su fecha de última actualización. El uso del sitio después de una modificación implica su aceptación.</p>

<h3>3. SERVICIOS Y CONTRATACIÓN</h3>
<p><b>3.1. Información del sitio.</b> El sitio presenta información sobre los servicios de QUBIRA con fines informativos. Las descripciones, ejemplos y precios referenciales que se publiquen no constituyen una oferta vinculante.</p>
<p><b>3.2. Cotizaciones y contratos.</b> Los proyectos y servicios se contratan mediante una propuesta comercial y un contrato escrito, físico o electrónico, que prevalecen sobre estos Términos en lo que regulen. Las cotizaciones tienen la vigencia indicada en cada una.</p>
<p><b>3.3. Plataformas por suscripción.</b> El uso de las plataformas de QUBIRA por suscripción se rige, además, por su contrato de licencia y su acuerdo de nivel de servicio.</p>

<h3>4. CUENTAS DE USUARIO</h3>
<p><b>4.1. Registro.</b> Para usar algunas funciones, el Usuario debe registrarse con datos veraces y mantenerlos actualizados.</p>
<p><b>4.2. Credenciales.</b> El Usuario es responsable de la confidencialidad de sus credenciales y de toda actividad realizada con ellas. Debe comunicar de inmediato a QUBIRA cualquier uso no autorizado.</p>
<p><b>4.3. Suspensión.</b> QUBIRA puede suspender o cancelar cuentas que incumplan estos Términos, previo aviso cuando sea posible, sin perjuicio de las acciones legales que correspondan.</p>

<h3>5. USO PERMITIDO</h3>
<p>El Usuario se obliga a usar el sitio y las plataformas conforme a la ley, la buena fe y estos Términos. En particular, no podrá: a) acceder o intentar acceder sin autorización a sistemas, cuentas o información de QUBIRA o de terceros; b) introducir virus, código malicioso o realizar ataques que afecten el funcionamiento del sitio; c) extraer contenidos de forma masiva o automatizada sin autorización; d) suplantar la identidad de otra persona; e) publicar o transmitir contenido ilícito, ofensivo, difamatorio o que infrinja derechos de terceros; ni f) usar el sitio para enviar comunicaciones comerciales no solicitadas.</p>

<h3>6. PROPIEDAD INTELECTUAL</h3>
<p><b>6.1. Titularidad.</b> El sitio, las plataformas, su código, diseño, textos, gráficos, logotipos, marcas y demás contenidos son de titularidad de QUBIRA o de terceros que autorizaron su uso, y están protegidos por el Decreto Legislativo N.° 822, Ley sobre el Derecho de Autor, y por la Decisión N.° 486 de la Comunidad Andina, entre otras normas.</p>
<p><b>6.2. Uso autorizado.</b> El Usuario puede visualizar los contenidos para su uso personal o para evaluar los servicios de QUBIRA. No puede reproducirlos, distribuirlos, modificarlos ni explotarlos comercialmente sin autorización escrita.</p>
<p><b>6.3. Contenido del Usuario.</b> El Usuario conserva los derechos sobre la información y los archivos que envíe, y autoriza a QUBIRA a usarlos solo para atender su solicitud o prestar el servicio contratado.</p>

<h3>7. DATOS PERSONALES</h3>
<p>El tratamiento de los datos personales del Usuario se rige por la Política de Privacidad de QUBIRA, publicada en el sitio, conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento.</p>

<h3>8. RESPONSABILIDAD</h3>
<p><b>8.1. Disponibilidad.</b> QUBIRA procura que el sitio esté disponible y libre de errores, pero no garantiza su funcionamiento ininterrumpido. Puede suspenderlo temporalmente por mantenimiento, actualizaciones o causas ajenas a su control.</p>
<p><b>8.2. Exclusiones.</b> En la medida permitida por la ley, QUBIRA no responde por los daños derivados del uso indebido del sitio por parte del Usuario, de fallas de conexión o equipos del Usuario, de contenidos o servicios de sitios de terceros enlazados, ni de caso fortuito o fuerza mayor.</p>
<p><b>8.3. Derechos irrenunciables.</b> Nada en estos Términos limita los derechos que el Código de Protección y Defensa del Consumidor, Ley N.° 29571, reconoce a los consumidores, cuando corresponda.</p>

<h3>9. LIBRO DE RECLAMACIONES</h3>
<p>Conforme a la Ley N.° 29571 y su reglamento del Libro de Reclamaciones, QUBIRA pone a disposición de los consumidores un Libro de Reclamaciones virtual en [ENLACE_LIBRO_DE_RECLAMACIONES]. Los reclamos se responden dentro del plazo legal.</p>

<h3>10. ENLACES A TERCEROS</h3>
<p>El sitio puede contener enlaces a sitios de terceros. QUBIRA no controla ni se hace responsable de sus contenidos, políticas o prácticas.</p>

<h3>11. COMUNICACIONES</h3>
<p>El Usuario acepta recibir comunicaciones de QUBIRA relacionadas con su solicitud, su cuenta o los servicios contratados al correo o teléfono que haya proporcionado. Las comunicaciones comerciales solo se envían con su consentimiento, conforme a la Política de Privacidad.</p>

<h3>12. LEY APLICABLE Y JURISDICCIÓN</h3>
<p>Estos Términos se rigen por las leyes de la República del Perú. Cualquier controversia se someterá a los jueces y tribunales de Lima, sin perjuicio del derecho de los consumidores a acudir al Instituto Nacional de Defensa de la Competencia y de la Protección de la Propiedad Intelectual (INDECOPI) o a los órganos competentes de su domicilio.</p>

<h3>13. CONTACTO</h3>
<p>Para consultas sobre estos Términos, puede escribir a [CORREO_QUBIRA].</p>
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
