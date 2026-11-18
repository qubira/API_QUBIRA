# Codificación de documentos internos — QUBIRA S.A.C.

Versión 1.0 · 18/11/2026 · Estado: **borrador para aprobación** (no implementado)

Este documento define cómo se codifican, emiten, aprueban, anulan y archivan los documentos y registros de todas las áreas de QUBIRA. Reemplaza los esquemas actuales de cada módulo (`CLI-006`, `PRF-2026-001`, `CT-2026-0022`, `PROJ-2026-042`, `AUD-SEC-2026-001`, `QS-0001`, `QB-FR-01`).

---

## 1. Principios

1. **Solo el servidor genera códigos.** El navegador nunca calcula un número; muestra «BORRADOR» hasta que el servidor asigna el código.
2. **El número se asigna al Emitir**, no al crear el borrador.
3. **Un número nunca se reutiliza.** Si un número se emitió, queda en el registro para siempre (aunque se anule o rechace).
4. **No se borra lo emitido.** Lo emitido se anula (documentos), se desactiva (clientes, proyectos) o se cierra (casos). Solo un borrador que nunca se emitió se puede eliminar, y solo por quien lo creó.
5. **El correlativo es atómico** (una sola operación en la base de datos). Nunca se usa `COUNT(*)` ni `MAX()`.
6. **El año es el de la hora de Lima** (America/Lima) en el momento de emitir. Para documentos externos, es el año de la fecha del documento original.
7. **El área del código es la del área dueña del tipo de registro** (el módulo responsable), no la de quien lo crea. Quién lo creó queda en `creado_por` y en el primer paso de la ruta.
8. **El catálogo de áreas de ORH es la única fuente de áreas.** No hay otra tabla de áreas ni nombres escritos en el código.

---

## 2. Formato de los códigos

Cada tipo tiene una regla según su campo `lleva_anio` y su `clase`:

| Regla | Formato | Ejemplo | Validación |
|---|---|---|---|
| Con año | `ÁREA-TIPO-AAAA-NNN` (3 dígitos o más) | `OTI-INF-2026-027` | `^[A-Z]{2,5}-[A-Z]{3}-\d{4}-\d{3,}$` |
| Sin año | `ÁREA-TIPO-NNNN` (4 dígitos o más) | `ODN-CLI-0006` | `^[A-Z]{2,5}-[A-Z]{3}-\d{4,}$` |
| Formatos | `ÁREA-FMT-NN` (2 dígitos o más) | `ODACL-FMT-01` | `^[A-Z]{2,5}-FMT-\d{2,}$` |

Además de la expresión, el servidor comprueba que:
- `ÁREA` sea la **sigla de un área activa** del catálogo de ORH;
- `TIPO` exista en el catálogo de tipos y la regla usada coincida con su `lleva_anio` y su `clase`.

La **versión** nunca forma parte del código: va en un campo aparte y se imprime junto a él (`ODN-PRF-2026-001 v3`, `ODACL-FMT-01 v2`).

Los números crecen sin tope (`-999` → `-1000`). El correlativo se reinicia cada año por área + tipo; los tipos sin año usan `anio = 0` y no se reinician nunca.

---

## 3. Áreas (catálogo de ORH)

Cada área del catálogo `areasTrabajo` tendrá estos campos, editables en **ORH → Configuración**:

| Campo | Regla |
|---|---|
| Sigla | 2 a 5 letras mayúsculas, única. **Se bloquea en cuanto se usa en algún código.** Si hace falta otra sigla, se crea un área nueva y la antigua se desactiva. |
| Nombre completo | Libre; se imprime en el membrete. Siempre editable. |
| Alias | Nombres antiguos o internos que el sistema reconoce como esta área (permisos, búsquedas, datos viejos). |
| Activa | Un área desactivada no emite códigos nuevos, pero sus códigos siguen siendo válidos. |

Estado inicial (al final de la fase 1):

| Sigla | Nombre completo | Alias |
|---|---|---|
| ADG | Alta Dirección Gerencial | — |
| GG | Gerencia General | — |
| OTI | Oficina de Tecnología e Información | TI |
| ORH | Oficina de Recursos Humanos | RRHH |
| OCOS | Oficina de Centro de Operaciones y Servicios | SOPORTE |
| ODN | Oficina de Desarrollo de Negocios | COMERCIAL |
| OPP | Oficina de Presupuestos y Planeación | CG |
| OCM | Oficina de Comunicación y Marketing | ACM |
| ODACL | Oficina de Asuntos Corporativos y Legales | DJ |
| DST | Desarrollo de Seguridad y Tecnología | — |

- Los nombres escritos hoy en `src/lib/jerarquia.js` se quitan: el mapa jerárquico, los membretes y los selectores leen todo del catálogo.
- `TI` → `OTI` y `SOPORTE` → `OCOS` se renombran **al final de la fase 1**, después de pasar todas las comparaciones de área del código por el traductor de alias y de probar con un usuario de OTI y uno de OCOS que conservan todos sus permisos.

---

## 4. Tipos (catálogo de tipos)

Cada tipo tiene: `sigla`, `nombre`, `clase`, `lleva_anio`, `ruta_defecto` (configurable), `firmante` (opcional, configurable) y `activo`.

### 4.1 Clases

| Clase | Tipos | Comportamiento |
|---|---|---|
| **DOCUMENTO** | INF, CTR, CST, ACT, MEM, SOL, PLN, CLG | Se emite y ya no se edita. Si cambia, se emite uno nuevo y el anterior pasa a ANULADO. |
| **VERSIONADO** | PRF, FMT | Conserva el código y sube la versión. Una versión nueva no gasta número. |
| **REGISTRO** | CLI, PRY, CAS | Se edita libremente y conserva su código para siempre. CLI y PRY se desactivan; CAS se cierra. No se anula ni se borra. |

### 4.2 Catálogo inicial

| Tipo | Nombre | Clase | Año | Ruta por defecto |
|---|---|---|---|---|
| INF | Informe | DOCUMENTO | Sí | Área crea → N5+ del área revisa → N3+ del área aprueba. Opción «Elevar a la Alta Dirección»: agrega «ADG aprueba» al final. |
| CTR | Contrato | DOCUMENTO | Sí | Según la contraparte (ver 4.3). |
| CST | Constancia | DOCUMENTO | Sí | ORH crea y se emite (sin aprobación). Solo puede emitirla personal de ORH con nivel N3 o superior; queda registrado quién la emitió. |
| ACT | Acta | DOCUMENTO | Sí | Área crea → N3+ del área aprueba. |
| MEM | Memorando | DOCUMENTO | Sí | Área crea → N3+ del área aprueba. |
| SOL | Solicitud | DOCUMENTO | Sí | Área crea → N3+ del área aprueba → área destino revisa. |
| PLN | Plan | DOCUMENTO | Sí | Área crea → N3+ del área revisa → GG aprueba. |
| CLG | Consulta legal | DOCUMENTO | Sí | Área crea → ODACL revisa → N3+ de ODACL aprueba. |
| PRF | Proforma | VERSIONADO | Sí | ODN crea → OPP revisa (valorización) → N3+ de ODN aprueba. |
| FMT | Formato | VERSIONADO | No | Área crea → N3+ del área aprueba. |
| CLI | Cliente | REGISTRO | No | Sin ruta: se emite al guardar. |
| PRY | Proyecto | REGISTRO | No | Sin ruta: se emite al guardar. |
| CAS | Caso de soporte | REGISTRO | Sí | Sin ruta: se emite al guardar. |

El detalle del documento (Calidad, Seguridad, Laboral, Proyecto, Externo, Adenda…) va en el campo `detalle`, no en el código.

### 4.3 Contratos según la contraparte

| Contraparte | Código | Detalle | Ruta |
|---|---|---|---|
| Cliente (incluye proyectos) | `ODN-CTR` | Proyecto / Servicio | ODN crea → ODACL revisa → ADG aprueba |
| Proveedor o tercero | `ODACL-CTR` | Externo | ODACL crea → ADG aprueba |
| Trabajador | `ORH-CTR` | Laboral | ORH crea → ODACL revisa → GG aprueba |

- Una **adenda** es un CTR nuevo de la misma área, con detalle «Adenda» y `referencia` = código del contrato original.
- El contrato con cliente guarda el código y la versión de la proforma aceptada, y se imprime: «Basado en ODN-PRF-2026-001 v3».

---

## 5. Estados

**DOCUMENTO**

```
BORRADOR ──Emitir──► EN RUTA ──► APROBADO ──► ARCHIVADO
   │                  │   ▲          │
 Eliminar        Observa  Corrige    └──► ANULADO (reemplazado por …)
 (solo creador)       ▼   │
                   OBSERVADO
                      │
                   Rechaza ──► RECHAZADO
```

- **Emitir** = sacar el documento de borrador y enviarlo a su ruta. En ese momento recibe su código, para que quienes revisan sepan qué están revisando. Si el tipo no tiene ruta, pasa directo a APROBADO.
- OBSERVADO vuelve a quien lo creó; al corregirlo conserva su código y vuelve a la ruta.
- RECHAZADO es final: el número queda registrado y no se reutiliza.

**VERSIONADO**
- Proforma: BORRADOR → EMITIDA (v1, v2, v3…) → ACEPTADA (la versión queda bloqueada y ya no se crean versiones) o ANULADA. Si después hay que negociar algo distinto, se emite una proforma nueva.
- Formato: cada versión aprobada queda VIGENTE y la anterior pasa a OBSOLETA. Los anexos guardan el código y la versión del formato que usaron.

**REGISTRO**
- CLI y PRY: ACTIVO ↔ INACTIVO.
- CAS: ABIERTO → CERRADO (se puede reabrir).

---

## 6. Ruta y permisos

| Acción | Quién puede |
|---|---|
| CREA | Cualquier persona del área dueña con acceso al módulo. |
| REVISA / OBSERVA | Nivel N5 o superior del área del paso. |
| APRUEBA / RECHAZA | Nivel N3 o superior del área del paso. |
| ARCHIVA | Nivel N3 o superior del área dueña. |
| ANULA | Nivel N3 o superior del área dueña, con motivo obligatorio. |

Reglas:
1. Solo personas del área del paso pueden actuar en ese paso, salvo ADG.
2. **Nadie puede aprobar un documento que creó.**
3. Si en el área no hay otra persona con el nivel necesario, aprueba el **jefe inmediato según el Mapa jerárquico** (GG para las oficinas, ADG para DST y GG). Si tampoco lo hay, aprueba ADG. En la ruta queda escrito el motivo, por ejemplo: «Aprobado por jefe inmediato: no hay otro aprobador en el área».
4. ADG solo aprueba los tipos cuya ruta lo incluye (contratos, informes elevados a la Alta Dirección); no todos.
5. Cada paso de la ruta guarda quién, cuándo, la acción y el comentario. Con eso se arma el bloque de firmas.

---

## 7. Anular, reemplazar y eliminar

- **Anular** (DOCUMENTO o PRF): motivo obligatorio. Si se reemplaza, el nuevo guarda `reemplaza_a` y se imprime:
  - en el anterior: «Anulado – reemplazado por ORH-CST-2026-031»
  - en el nuevo: «Reemplaza a ORH-CST-2026-024»
- **Eliminar**: solo un BORRADOR nunca emitido, y solo quien lo creó.
- En todos los módulos, los botones «Eliminar» de lo emitido se cambian por **Anular**, **Desactivar** o **Cerrar** según la clase.
- Los requerimientos de proyecto (715) no son documentos: no se codifican y conservan su comportamiento actual.

---

## 8. Documentos externos

Opción **«Registrar documento externo»** en el Registro de documentos de ADG, para documentos Word o PDF hechos fuera del sistema (por ejemplo, «IT000026 - PT»).

- Pueden registrarlos el **Jefe (N3) de cada área, solo para su área**, y **ADG para cualquier área**.
- Reciben un **número nuevo** del correlativo. El año del código es el de la **fecha del documento original**.
- Se guarda solo la ficha: código, título, fecha original, código antiguo (`codigo_anterior`), área, tipo, detalle y **enlace a Drive**. No se suben archivos.

---

## 9. Base de datos

Esquema nuevo `doc`. Áreas: columnas nuevas en `rrhh.catalogos` (no hay otra tabla de áreas).

```sql
-- Áreas: campos nuevos en el catálogo de ORH
ALTER TABLE rrhh.catalogos ADD COLUMN sigla TEXT;            -- única entre áreas
ALTER TABLE rrhh.catalogos ADD COLUMN nombre_completo TEXT;
ALTER TABLE rrhh.catalogos ADD COLUMN alias TEXT[];
ALTER TABLE rrhh.catalogos ADD COLUMN activo BOOLEAN DEFAULT true;

CREATE TABLE doc.tipos (
  sigla        CHAR(3) PRIMARY KEY,
  nombre       TEXT NOT NULL,
  clase        TEXT NOT NULL CHECK (clase IN ('DOCUMENTO','VERSIONADO','REGISTRO')),
  lleva_anio   BOOLEAN NOT NULL,
  ruta_defecto JSONB NOT NULL DEFAULT '[]',   -- [{area:'DUENA'|sigla, accion, nivel_min}]
  activo       BOOLEAN NOT NULL DEFAULT true
);

-- firmante: { "usuario": "...", "nombre": "...", "cargo": "..." } (opcional)
ALTER TABLE doc.tipos ADD COLUMN firmante JSONB;

CREATE TABLE doc.empresa (                    -- razón social, RUC, dirección…
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE doc.correlativos (
  area   TEXT NOT NULL,
  tipo   CHAR(3) NOT NULL,
  anio   INT NOT NULL,                        -- 0 = tipo sin año
  ultimo INT NOT NULL,
  PRIMARY KEY (area, tipo, anio)
);

-- Número siguiente, atómico (dos personas a la vez nunca reciben el mismo)
INSERT INTO doc.correlativos (area, tipo, anio, ultimo) VALUES ($1, $2, $3, 1)
ON CONFLICT (area, tipo, anio) DO UPDATE SET ultimo = doc.correlativos.ultimo + 1
RETURNING ultimo;

CREATE TABLE doc.documentos (
  id              BIGSERIAL PRIMARY KEY,
  codigo          TEXT UNIQUE,                -- NULL mientras es BORRADOR
  area            TEXT NOT NULL,              -- sigla del área dueña
  tipo            CHAR(3) NOT NULL REFERENCES doc.tipos(sigla),
  anio            INT,
  numero          INT,
  version         INT NOT NULL DEFAULT 1,     -- PRF y FMT
  detalle         TEXT,
  titulo          TEXT NOT NULL,
  estado          TEXT NOT NULL,
  formato_codigo  TEXT,                       -- formato usado (anexos)
  formato_version INT,
  referencia      TEXT,                       -- adenda → contrato original; contrato → proforma
  referencia_version INT,                     -- versión aceptada de la proforma
  reemplaza_a     TEXT,
  codigo_anterior TEXT,                       -- código antiguo (migración / externos)
  modulo          TEXT,                       -- de dónde viene: RRHH, COMERCIAL, TI…
  id_origen       TEXT,                       -- id del registro en su módulo
  enlace_externo  TEXT,                       -- Drive (documentos externos)
  fecha_documento DATE,
  motivo_anulacion TEXT,
  creado_por      TEXT NOT NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  emitido_en      TIMESTAMPTZ
);
CREATE INDEX ON doc.documentos (codigo_anterior);
CREATE UNIQUE INDEX ON doc.documentos (modulo, id_origen) WHERE id_origen IS NOT NULL;

CREATE TABLE doc.versiones (                  -- historial de FMT (PRF ya usa comercial.proforma_versiones)
  documento_id BIGINT REFERENCES doc.documentos(id),
  version      INT NOT NULL,
  estado       TEXT NOT NULL,                 -- VIGENTE / OBSOLETA
  creado_por   TEXT, creado_en TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (documento_id, version)
);

CREATE TABLE doc.ruta (
  id           BIGSERIAL PRIMARY KEY,
  documento_id BIGINT NOT NULL REFERENCES doc.documentos(id),
  orden        INT NOT NULL,
  area         TEXT NOT NULL,
  accion       TEXT NOT NULL CHECK (accion IN ('CREA','REVISA','OBSERVA','APRUEBA','RECHAZA','ARCHIVA','ANULA')),
  nivel_min    INT,
  usuario      TEXT,                          -- NULL mientras el paso está pendiente
  comentario   TEXT,
  motivo       TEXT,                          -- p. ej. «Aprobado por jefe inmediato: …»
  fecha        TIMESTAMPTZ
);
```

Los datos de cada módulo (proformas, constancias, clientes, proyectos…) siguen en sus tablas; cada una guarda el `codigo` y `doc.documentos` es el registro central que los une.

---

## 10. API

| Método y ruta | Uso |
|---|---|
| `POST /api/documentos` | Crea un BORRADOR (sin código). |
| `POST /api/documentos/:id/emitir` | Asigna el código y lo envía a su ruta. Devuelve el código. |
| `POST /api/documentos/:codigo/ruta` | Registra una acción de la ruta (REVISA, OBSERVA, APRUEBA, RECHAZA, ARCHIVA). |
| `POST /api/documentos/:codigo/version` | Nueva versión (PRF, FMT). |
| `POST /api/documentos/:codigo/aceptar` | Proforma aceptada: bloquea la versión. |
| `POST /api/documentos/:codigo/anular` | Anula con motivo; opcional `reemplazado_por`. |
| `DELETE /api/documentos/:id` | Solo BORRADOR y solo su creador. |
| `POST /api/documentos/externo` | Registra un documento externo (N3 de su área o ADG). |
| `GET /api/documentos?buscar=&area=&tipo=&estado=&anio=` | Búsqueda por código nuevo, código anterior, título o detalle. |
| `GET /api/documentos/por-codigo/:codigo` | Búsqueda interna por código nuevo o anterior; los dos llevan al mismo registro. |

La **verificación pública de constancias** acepta tres códigos: el anterior (`CT-2026-0022`), el nuevo (`ORH-CST-2026-022`) y el de verificación (`3E7E-925F-5356`, el del QR). Los tres llevan a la misma constancia. Las constancias ya entregadas se siguen verificando sin hacer nada, y la página muestra los dos números: «N.° ORH-CST-2026-022 (emitida como CT-2026-0022)».

Las proformas se generan como PDF en el navegador: el navegador **pide el código al servidor antes de generar el PDF** y luego lo imprime. Las constancias, los contratos y los documentos Word de ODACL se arman en el servidor, que rechaza el guardado si el texto no contiene el código asignado.

---

## 11. Impresión

- **Membrete:** `OTI-INF-2026-027 · Oficina de Tecnología e Información` (nombre completo desde el catálogo).
- **Línea de ruta:** `Ruta: OTI crea → OTI revisa → OTI aprueba`. Solo en documentos **internos**. Los que se entregan a personas de fuera (CST, CTR, PRF) no la imprimen; su ruta queda en el sistema.
- **Bloque de firmas:** generado desde `doc.ruta` (nombre, puesto, acción y fecha de cada paso). En la constancia sigue siendo una sola firma: quien la emite.
- **Razón social y RUC** se leen de la configuración de la empresa (`doc.empresa`), no están escritos en los modelos. Cuando QUBIRA S.A.C. tenga su RUC 20 se cambian una sola vez.
- Lo ya emitido no se reimprime ni se cambia.

### 11.1 Modelo de constancia (ORH-CST) — fase 2

Conserva su diseño actual, con estos ajustes:

1. **Número:** imprime el código nuevo (`N.° ORH-CST-2026-023`).
2. **Área:** nombre completo y sigla del catálogo de ORH, por ejemplo «Oficina de Desarrollo de Negocios (ODN)», no el nombre interno («Comercial»).
3. **Bajo el QR:** «Verifique esta constancia en qubira.vercel.app/verificar». La dirección `/verificar` se agrega al sitio público y abre la página de verificación actual; el QR sigue apuntando a la constancia exacta.
4. **Al pie, en letra pequeña:** «Formato ORH-FMT-01 v1». El modelo de constancia se registra como formato `ORH-FMT-01 v1`.
5. **Recuadro de firma:** se corrige el texto «QUBIRA» que sale cortado bajo el cargo.
6. **Firmante:** configurable en el catálogo de tipos (`firmante` de CST). Por defecto, GG: Abraham Aranda Cerna, Gerente. Quién la emitió queda registrado aparte.
7. **Razón social y RUC:** desde la configuración de la empresa.
- **Leyendas cuando aplican:** «Anulado – reemplazado por …», «Reemplaza a …», «Basado en ODN-PRF-2026-001 v3», «Adenda de …», «Formato ODACL-FMT-01 v1».

---

## 12. Qué emite cada módulo

| Módulo | Área dueña | Tipos |
|---|---|---|
| ORH (RRHH) | ORH | CST, CTR (Laboral), MEM, INF |
| ODN (Comercial) | ODN | CLI, PRF, CTR (Cliente) |
| OTI (TI) | OTI | PRY, ACT (Calidad), INF |
| DST | DST | ACT (Seguridad), FMT (modelos de auditoría), INF |
| ODACL | ODACL | CTR (Externo), CLG, FMT (anexos), INF |
| OCOS (Soporte) | OCOS | CAS, INF |
| OPP, OCM, GG, ADG | La suya | INF, MEM, PLN, SOL (desde el Registro de documentos) |

---

## 13. Migración

Se ejecuta en la fase 4, solo después de que la rama de respaldo `respaldo-codificacion-2026-11-18` esté creada en Neon y confirmada.

| Hoy | Nuevo | Nota |
|---|---|---|
| `CLI-006` | `ODN-CLI-0006` | Se conserva el número. |
| `PRF-2026-001` | `ODN-PRF-2026-001` | Conserva sus versiones. |
| `CT-2026-0022` | `ORH-CST-2026-022` | El código de verificación y el QR no cambian. El correlativo sigue después del más alto. |
| `PROJ-2026-042` | `OTI-PRY-0042` | Antes se revisan los repetidos (hoy se numeran con `COUNT`). |
| `AUD-CAL-2026-001` | `OTI-ACT-2026-001` | Detalle «Calidad». |
| `AUD-SEC-2026-001` | `DST-ACT-2026-001` | Detalle «Seguridad». |
| `QS-0001` | `OCOS-CAS-2026-001` | Por el botón «Enviar mis casos al sistema central», numerados en orden de llegada. |
| `QB-FR-01..03` | `ODACL-FMT-01..03 v1` | Anexos. |
| Modelo Word `QB-AUD-SEC` | `DST-FMT-01 v1` | |
| Contratos laborales (3, sin código) | `ORH-CTR-2026-001..003` | Detalle «Laboral». |
| Contratos de proyectos (3, sin código) | `ODN-CTR-2026-001..003` | Detalle «Proyecto». |
| Documentos Word de ODACL (23, sin código) | `ODN-CTR`, `ODACL-CTR` o `ODACL-FMT` | Según la contraparte. |
| Contratos externos `EXT-…` y consultas `ODACL-…` | `ODACL-CTR` (Externo) y `ODACL-CLG` | Hoy 0 registros. |

En todos los casos el código antiguo queda en `codigo_anterior`. «IT000026 - PT» no se migra: se carga con «Registrar documento externo».

**Antes de ejecutar te muestro y espero tu OK:**
1. La tabla completa de migración con todos los registros reales.
2. La clasificación de los 23 documentos de ODACL.
3. La lista de proyectos repetidos que se renumeran.

---

## 14. Fases (cada una necesita tu OK)

| Fase | Contenido |
|---|---|
| **1. Base** | Campos de áreas en el catálogo de ORH y su pantalla; quitar nombres de `jerarquia.js`; esquema `doc`, catálogo de tipos y correlativo; API; pasar comparaciones de área por el traductor de alias; prueba con usuarios de OTI y OCOS; al final, renombre `TI` → `OTI` y `SOPORTE` → `OCOS`. |
| **2. Registro** | Pantalla «Registro de documentos» en ADG (búsqueda, detalle, ruta, documento externo) y bandeja «Pendientes de mi aprobación»; plantilla común de membrete, ruta y firmas; configuración de la empresa (razón social, RUC); modelo de constancia (sección 11.1). |
| **3. Módulos** | Cada módulo pide su código al servidor; «Eliminar» → «Anular / Desactivar / Cerrar»; versiones y aceptación de proformas; botón de envío de casos de OCOS; verificación pública con código anterior. |
| **4. Migración** | Con la rama de respaldo confirmada y las tres listas aprobadas. |
| **5. Cierre** | Pruebas finales, limpieza del código antiguo e informe final. |

---

## 14.1 Cómo quedó cada módulo (fase 3)

| Módulo | Qué emite | Al «eliminar» |
|---|---|---|
| ODN Comercial | Clientes `ODN-CLI-NNNN`, proformas `ODN-PRF-AAAA-NNN` (versiones con el mismo código), contratos `ODN-CTR` (Proyecto/Servicio, «Basado en» la proforma aceptada) | Cliente → se desactiva · Proforma y contrato → se anulan con motivo |
| OTI / ADG | Proyectos `OTI-PRY-NNNN`, contratos de proyecto subidos por ADG → `ODN-CTR` (Proyecto), actas de calidad/reglas → `OTI-ACT`, actas de seguridad → `DST-ACT` | Proyecto → se desactiva (cancelado) · Contrato y acta → se anulan con motivo |
| ODACL | Contratos con proveedores → `ODACL-CTR` (Externo; el número de la contraparte va aparte), consultas → `ODACL-CLG`, documentos del editor al **Emitir**: cliente → `ODN-CTR`, proveedor → `ODACL-CTR`, modelo → `ODACL-FMT` | Lo emitido se anula · los 23 documentos anteriores esperan la migración |
| ORH | Constancias `ORH-CST` (fase 2), contratos laborales `ORH-CTR` (Laboral) | Se anulan con motivo |
| OCOS | Casos `OCOS-CAS-AAAA-NNN`, guardados en el servidor (antes solo en cada navegador) | Un caso se cierra (solucionado/cerrado) y se puede reabrir |

Reglas comunes:
- El navegador ya no calcula códigos: muestra `…-[SE ASIGNA AL EMITIR]` y el servidor escribe el código real en el texto del documento.
- Una proforma solo se acepta, y un contrato solo pasa a firma o vigencia, cuando terminó su ruta en el Registro de documentos.
- **Actas:** el borrador lleva un código provisional `BORRADOR-…` (las pantallas de Calidad lo usan como identificador). Recibe su código real al enviarse a revisión y solo se emite cuando su área lo aprobó.
- **Soporte:** «Enviar mis casos al sistema central» sube los casos guardados en cada navegador, numerados por fecha de creación; el `QS-…` queda como código anterior. Los casos de demostración `QS-0001` a `QS-0004` no se envían. El texto de los casos se guarda sin caracteres que abran etiquetas HTML, porque ahora lo ve todo el equipo.
- **Empresa:** la razón social y el RUC tienen una sola fuente, la ficha societaria de ODACL. La Configuración del Registro de documentos y ODACL editan el mismo dato.

## 15. Pruebas de aceptación

1. **Concurrencia:** 20 emisiones simultáneas del mismo área + tipo dan 20 números distintos y seguidos.
2. **Cambio de año:** una emisión a las 23:59 del 31/12 hora de Lima lleva ese año; la de las 00:00 empieza en `-001` del año nuevo.
3. **Validación:** se rechazan códigos con área inexistente o inactiva, tipo inexistente, o regla equivocada (`ODN-PRF-0001`, `ODN-CLI-2026-001`).
4. **Permisos de ruta:** el creador no puede aprobar; un N6 no puede aprobar; otra área no puede actuar (salvo ADG); el jefe inmediato aprueba cuando no hay otro, con el motivo escrito.
5. **Anular y reemplazar:** se imprimen las dos leyendas; el número anulado no se reutiliza; un borrador sí se puede eliminar y lo emitido no.
6. **Versiones:** una versión nueva de proforma no gasta número; la proforma aceptada no admite versiones; el contrato imprime «Basado en … vN».
7. **Verificación pública:** `CT-2026-0022`, `ORH-CST-2026-022` y `3E7E-925F-5356` abren la misma constancia, con «ORH-CST-2026-022 (emitida como CT-2026-0022)».
8. **Permisos tras el renombre:** un usuario de OTI y uno de OCOS conservan todos sus accesos.
