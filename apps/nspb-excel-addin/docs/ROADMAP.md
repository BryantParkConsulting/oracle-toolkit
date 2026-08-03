# NSPB Assistant — Descripción de producto y Roadmap

---

## 📌 SOURCE OF TRUTH — Recap oficial reunión Squarespace (Rajiv) · 2026-05-15

Esta es la lista canónica de compromisos del demo. Cualquier prioridad o ítem nuevo se valida contra este recap antes de empezar.

### Quick recap (textual del meeting recap)

> The meeting focused on demonstrating a proof of concept (POC) for an NSPB AI chat tool that integrates with NetSuite Planning. Bruno presented the demo, showing how the tool can install as an add-in, connect to NetSuite using planning links and API keys, and load metadata including forms, dimensions, and calculations through a JSON file. The tool allows users to analyze data, compare scenarios, and examine business rules and variables, with features like generating insights, creating reports, and displaying system status. Rajiv provided feedback on preferred user interaction methods, suggesting a more driven approach where users can quiz the system rather than receiving pre-programmed information upfront. The discussion covered potential enhancements including snapshot management, optimization features, and integration with Claude AI instead of Gemini, with Bruno confirming these features could be implemented in the following week for testing on the client's development environment.

### Next steps — compromisos textuales del demo (con status real)

**Bruno**
1. **Connect to client's test environment + pull LCM (metadata) to test POC capabilities** — ✅ **HECHO** (demo tenant parseado: 46 rules, 81 forms, 37 vars, 14 dims, 11 dashboards, 37 FRs).
2. **Implement functionality to create and manage forecast versions** (`create new version`, `roll back to version`) in the chat interface — ⏳ **PENDIENTE** (P3). Note: `restore_snapshot` decidido NEVER (destructivo), pero versions de DATA sí van.
3. **Develop ability for the chat to compare values from different forecast scenarios and/or previous snapshots, including support for lowest-level data and audit history (showing who last updated a cell)** — ⏳ **PENDIENTE** (P2). Tres pedazos: (a) `compare_grid` con columnas de varianza Δ$/Δ%, (b) comparación contra snapshot histórico a nivel 0, (c) `show_cell_audit` cruzando con auditoría NSPB.
4. **Integrate support for Claude API** (con key que provee Rajiv) — ⏳ **PENDIENTE** (P1). Backend ya tiene `detectProvider` + `callClaude`, solo falta campo en Settings + storage.
5. **Add optimization analysis features** — DB size analysis, rule usage statistics, propuestas de optimización (dense/sparse recommendations) — ⏳ **PENDIENTE** (P5). Tool `analyze_db_optimization`.
6. **Export all data at level zero + load into DuckDB for further analysis and reporting** — ⏳ **PENDIENTE** (P4). Tres fases: `export_level_zero` → DuckDB-WASM en task pane → `analyze_cube_data` (coverage / density / outliers).
7. **Update variables in data maps + status/progress indicators for running rules** — ✅ **HECHO** (`set variable X = Y` funciona end-to-end + running indicator amarillo pulsante al submit + chip "Go to Jobs" a panel Status).
8. **Continue enhancing "explain" and "show variables" for rules and forms, including summarizing code and variables used** — ✅ **HECHO** (`explain rule/form/variable/account` con AI summary cacheado offline en `tenant-kb.json`, incluye scope/inputs/outputs/calculations + variables que la rule consume + walk-through del script source con `explain rule X — walk me through the script`).
9. **Question-driven UI** (drill-down rather than receiving pre-programmed comprehensive info upfront) — ⏳ **PENDIENTE** (P5). Pedido explícito de Rajiv: el chat debe "quiz" al usuario con preguntas de seguimiento en lugar de info masiva.
10. **Snapshot functionality + month-end automation** — ✅ **PARCIAL**: `create_snapshot` + `show snapshots` + `show files` + `+ Create new` button en Status tab. Falta: `delete_snapshot` (P3), `download_snapshot` (P3, complejo en CF Worker).

**Rajiv**
- Provide Claude API key for integration / testing — ⏳ **PENDIENTE** (esperando).

**Follow-up meeting** — Schedule + conduct demo en el ambiente de test de Rajiv la semana siguiente al demo original (2026-05-15).

### Status global contra el recap

| Compromiso | Status | Próximo paso |
|---|---|---|
| 1. Connect + LCM pull | ✅ | Re-correr parser contra el tenant real de Squarespace cuando esté listo |
| 2. Forecast versions | ⏳ P3 | `create_version` / `list_versions` / `rollback_version` |
| 3. Compare + lowest-level + audit | ⏳ P2 | `compare_grid` variance cols + `show_cell_audit` + snapshot compare |
| 4. Claude API | ⏳ P1 | Esperando key de Rajiv. Mientras tanto: campo en Settings + persistir |
| 5. Optimization analysis | ✅ (extensión) | `performance` / `optimize ai` en el Web Console Copilot: snapshot determinístico (member counts, storage mix, dyn-calc load, alias gaps) + recomendaciones AI dense/sparse. Falta paridad en el add-in Excel (`analyze_db_optimization`). |
| 6. DuckDB export + analyze | ⏳ P4 | `export_level_zero` (fase 1) |
| 7. Update vars + status indicators | ✅ | — |
| 8. Explain + show variables | ✅ | — |
| 9. Question-driven UI | ⏳ P5 | Repensar prompts + chips para drill-down |
| 10. Snapshots | ✅ partial | `delete_snapshot` (rápido), `download_snapshot` (medium) |

**Score actual: 4/10 compromisos completos** + 1 parcial. Quedan 5 estructurales: versions, compare/audit, Claude key, optimization, DuckDB, question-driven UI.

---

## Qué es

NSPB Assistant es un add-in para Microsoft Excel que permite a usuarios de finanzas y controlling consultar Oracle NetSuite Planning & Budgeting (Hyperion Planning / Essbase) en lenguaje natural, directamente desde una celda de Excel.

El usuario escribe una pregunta o instrucción en el panel lateral ("dame los actuals de Revenue por subsidiaria para Q1 FY25") y el add-in:
1. Envía el mensaje + contexto del tenant al Worker (Cloudflare)
2. El Worker usa Gemini (flash → pro fallback) con tool-use para ejecutar las queries NSPB necesarias
3. El resultado se escribe como una grilla formateada directamente en la hoja activa de Excel

No requiere conocer MDX, Essbase SmartView, ni los códigos internos del cubo. El objetivo es que cualquier controller o analista financiero pueda hacer análisis ad-hoc sin depender de IT.

---

## Stack técnico

| Componente | Tecnología |
|---|---|
| Task pane UI | Office.js + HTML/CSS/JS vanilla |
| Backend | Cloudflare Worker (JS) |
| LLM | Google Gemini Flash (→ Pro fallback) / Claude API (pendiente, solicitado por Rajiv (Squarespace)) |
| Auth NSPB | HTTP Basic Auth |
| Deploy | `wrangler deploy` → `gentle-moon-046f.nspbassistant.workers.dev` |
| Build | `node worker/build.js` (concatena + inlinea kb.md + taskpane) |

---

## Features implementadas y funcionando

### Queries ad-hoc
| Feature | Tool | Estado |
|---|---|---|
| Grilla ad-hoc libre (account × period × POV) | `build_adhoc` | ✅ Funcionando |
| Presets predefinidos (revenue/opex Pharmalogic) | `run_preset` | ✅ Funcionando (solo tenant Pharmalogic) |
| Comparar dos escenarios en grilla | `compare_grid` | ✅ Funcionando |
| Top N drivers de varianza | `top_drivers` | ✅ Funcionando |
| Modificar celdas de la grilla activa | `modify_grid` | ✅ Funcionando |
| Buscar miembro por nombre/concepto en cualquier dimensión | `find_member` | ✅ Funcionando |

### Formularios NSPB
| Feature | Tool | Estado |
|---|---|---|
| Abrir un formulario de input NSPB como grilla | `open_form` | ✅ Funcionando |
| Ver inventario de formularios disponibles | `show_inventory` | ✅ Funcionando |

### Discovery / Metadata
| Feature | Tool | Estado |
|---|---|---|
| Mostrar dimensiones del cubo | `show_dimension` | ✅ Funcionando |
| Ver detalle de Data Management (DM) | `show_dm_details` | ✅ Funcionando |
| Ver detalle de integración DM | `show_integration_detail` | ✅ Funcionando |
| Ver mappings de integración | `show_mapping` | ✅ Funcionando |
| Ver pipeline de jobs DM | `show_pipeline` | ✅ Funcionando |
| Navegar file browser NSPB | `show_filebrowser` | ✅ Funcionando |

### Productividad en hoja Excel
| Feature | Tool | Estado |
|---|---|---|
| Formatear hoja activa como reporte limpio | `format_active_sheet` | ✅ Funcionando |
| Limpiar ceros de la hoja activa | `clean_active_sheet` | ✅ Funcionando |
| Analizar hoja activa y dar comentario financiero | `analyze_active_sheet` | ✅ Funcionando |

### Explain — AI tutor sobre el tenant (entregado post-demo)
| Feature | Tool | Estado |
|---|---|---|
| Explicar una business rule (descripción, RTP, scope, inputs/outputs/calculations) | `explain` (target=rule) | ✅ Funcionando — aiSummary pre-computado en el LCM parse |
| Walk-through del script source de una rule | `explain rule X — walk me through the script` | ✅ Funcionando |
| Explicar un form (rules atadas, rowDims/colDims/POV, variables usadas, purpose) | `explain` (target=form) | ✅ Funcionando — aiSummary pre-computado |
| Explicar una substitution variable (valor, scope, rules que la consumen, category, whenToUpdate) | `explain` (target=variable) | ✅ Funcionando — aiSummary pre-computado |
| Explicar un account (alias, parent, level, storage, **fórmula de dynamic calc**, forms y rules que lo referencian) | `explain` (target=account) | ✅ Funcionando |
| Picker con drill-down para rules / forms / variables / accounts | UI palette | ✅ Funcionando |
| Server-side intercept que fuerza el tool call (anti-hallucination) | `runChatTurn` | ✅ Funcionando |

### Pipeline de delivery por cliente (entregado post-demo)
| Feature | Comando | Estado |
|---|---|---|
| Parsear LCM export → `tenant-kb.json` (forms, dashboards, FRs, rules, dims, vars, FDMEE, navigation) | `node tools/parse-lcm.js` | ✅ Funcionando — `CLIENT=<name>` para multi-tenant |
| Enriquecer KB con AI summary por rule/form/variable (Gemini Flash, una pasada offline) | integrado a `parse-lcm.js` con `GEMINI_API_KEY` | ✅ Funcionando — ~3 min para 46 rules + 81 forms + 37 vars |
| CSV multi-line parsing (formulas con `/* */` y newlines) | `splitCsvRows()` | ✅ Funcionando |
| Entity decoding (`&amp;` → `&`) en form names + member refs | `decodeXmlEntities()` | ✅ Funcionando |
| Captura de `rowMembers/columnMembers/povMembers/pageMembers` con `&SUBVAR` refs | `memberRefsIn()` | ✅ Funcionando — usado por var-detection en forms |

### UX / Settings
| Feature | Estado |
|---|---|
| Panel de settings (host, app, user, password) | ✅ Funcionando |
| Gemini flash → pro fallback automático | ✅ Funcionando |
| Test de conexión desde settings | ✅ Funcionando |
| Help integrado | ✅ Funcionando |
| Knowledge base NSPB inlinada (kb.md, ~170KB) | ✅ Funcionando |

---

## Requerimientos cliente — Rajiv (Squarespace) (demo 2025-05-15)

Extraídos del recap de la reunión de demo. Compromisos para testear en el ambiente de desarrollo de Rajiv (Squarespace).

### ✅ Hecho y testeado por Bruno

- [x] **Conectar al ambiente de test de Rajiv (Squarespace)** — pull del LCM hecho, parser end-to-end + enrichment funcionando contra demo tenant (46 rules, 81 forms, 37 vars, 14 dims, 11 dashboards, 37 FRs)
- [x] **Explain mejorado** (`explain_rule`, `explain_form`, `show_rule_variables`) — Rajiv pidió esto explícitamente. Cubierto y testeado con drill-down por rule / form / variable / account, AI summary cacheado en el LCM parse (no llama a Gemini en runtime). Detalle en la sección "Explain — AI tutor" arriba.

### ⏳ Pendiente — pedidos de Rajiv (Squarespace) por prioridad

#### 🔥 P1 — Quick wins (<1 día de trabajo)

- [ ] **Soporte Claude API** — campo "Claude API key" en Settings; cuando está presente, rutear a Claude en lugar de Gemini. Rajiv provee la key. _(La lógica `detectProvider` y `callClaude` ya existen en el worker; falta solo el campo en Settings + storage + persistencia.)_
- [x] **`create_snapshot`** ⏳ _hecho, falta test en el tenant real de Rajiv_ — desde el chat, lanza migración/export LCM de toda la aplicación. Pide nombre del snapshot al usuario si no lo dio. Usa `POST /interop/rest/v1/applicationsnapshots/{name}/migration?type=export` (fallback a versión legacy `11.1.2.3.600`). Job corre async; tool devuelve job id + mensaje al usuario explicando que tarda 5-30 min y el archivo aparece en el outbox cuando completa.
- [x] **`list_snapshots`** ⏳ _hecho, falta test_ — lista los snapshots existentes en el outbox (`GET /interop/rest/v1/applicationsnapshots`). Renderiza sheet `NSPB_Snapshots` con name / type / size / date, más reciente primero.
- [ ] **`delete_snapshot`** — borrar un snapshot por nombre (`DELETE /interop/rest/v1/applicationsnapshots/{name}`). Necesario para limpieza del outbox antes que se llene.
- [ ] **`download_snapshot`** — descargar un snapshot al cliente. Endpoint es streaming, complejo en Cloudflare Worker; podría redirigir al usuario a la NSPB Migration UI.
- ⛔ **`restore_snapshot`** — **NEVER**. Operación destructiva irreversible: importa un snapshot LCM y reemplaza la metadata completa del tenant (forms, rules, dims). Si el snapshot tiene un error o no es el correcto, **se pierde todo el trabajo posterior** y solo se recupera con soporte Oracle. **No vamos a exponer esto desde el chat por ningún motivo.** Si Rajiv necesita restaurar un snapshot, lo tiene que hacer manualmente desde la NSPB Migration UI con confirmación interactiva, donde Oracle muestra warnings adicionales.
- [x] **Snapshot section en Status tab** — bloque "📦 Application Snapshots (N)" abajo de Scheduled Jobs con las 5 más recientes (nombre / tamaño / fecha) + botón "+ Create new" (pre-fills `create snapshot backup-YYYY-MM-DD-` en el chat) + "Show all →" (corre `show snapshots`). El botón Refresh del tab ahora también fetchea snapshots vía `/api/list-snapshots`. _(Hecho 2026-05-18.)_
- [x] **`update_variable`** — cambiar una substitution variable desde el chat (`set variable NSP_PER_FcstCurrMo = TP10`, opcional `in <Cube>` para cube-scoped). Endpoint `/api/set-subst-var` → `PUT /HyperionPlanning/rest/v3/applications/{app}/substitutionvariables/{name}` con Basic Auth. Hecho y testeado.

#### 🔥 P2 — Tools de análisis (1-3 días cada uno)

- [ ] **`compare_grid` con columnas de varianza** — `Actual | Budget | <blank> | Δ$ | Δ%` para permitir refresh sin perder el análisis. Rajiv lo pidió así explícitamente.
- [ ] **In-place analysis sobre el ad-hoc/form que está abierto** — Rajiv pidió que el análisis NO cree una hoja nueva: lee el SmartView ad-hoc o el form abierto al costado, manda la grilla + la pregunta a Gemini, y devuelve (a) **columnas nuevas agregadas al lado** de los datos existentes con el output del análisis (variance, % change, contribution, etc.) (b) **texto explicativo en el chat** con lo más notorio. Ejemplo: usuario abrió "Income Statement" en SV, pide "analiza variaciones FY24 vs FY25", el tool agrega cols Δ$/Δ% al final de la grilla y manda al chat "Revenue cae 12% en Q3, principalmente por …". El SV refresh debe respetar las columnas agregadas (van fuera del slice).
- [ ] **`run_rule_with_status`** — correr reglas con indicador de progreso/status en tiempo real (saber cuándo terminó, si falló).
- [ ] **`show_cell_audit`** — mostrar quién actualizó por última vez una celda específica (cruzar con datos de auditoría de NSPB).

#### 🔥 P3 — Gestión de versions/snapshots de data (no de LCM)

- [ ] **`create_version`** — crear nueva versión de forecast desde el chat ("create new version Q2 Forecast")
- [ ] **`list_versions`** — listar versiones/snapshots disponibles del cubo
- [ ] **`rollback_version`** — volver a una versión anterior de forecast ("roll back to last snapshot")
- [ ] **`compare_snapshot`** — comparar escenario actual vs snapshot anterior, incluyendo datos a nivel 0

#### 🔥 P4 — DuckDB en 3 fases (~1 semana total)

- [ ] **Fase 1 — `export_level_zero`**: lanzar job `EXPORT_DATA` vía Planning REST (`POST /jobs` con `exportLevel=LEVEL0`), polling hasta completar, descargar el CSV del outbox al browser. Elige cubo (Plan / Details / Rpt / Workforc) y filtros de POV opcionales.
- [ ] **Fase 2 — Carga en DuckDB-WASM**: el CSV se carga automáticamente en [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview) corriendo dentro del task pane. Tabla disponible como `level0_{cube}_{fecha}` para queries SQL.
- [ ] **Fase 3 — `analyze_cube_data`**: con los datos en DuckDB, correr queries automáticas para entender distribución del cubo (cobertura por escenario/año/versión/período, accounts con datos, subsidiarias activas, densidad, outliers). Resultado se escribe como hoja `CUBE_STATS_{cube}`.

#### 🔥 P5 — Status tab + scheduled jobs live retrieve

- [ ] **Scheduled Jobs retrieve live** — el tab Status muestra "Scheduled Jobs (0 — showing examples)" porque NO existe ningún endpoint que retrieve los schedules reales del tenant. Solo se renderiza data demo. Hay que implementar `/api/discover-schedules` que consulte el Job Scheduler de NSPB y poblar `nspb-addin.schedules.v1`. Una vez en lugar, el panel pasa de "demo data shown" a la lista real con cron expressions, próximas ejecuciones, etc.
- [ ] **Run-now button funcional para schedules reales** — actualmente solo funciona en demo (no-op). Cuando haya retrieve live, conectar el botón ▶ Run a `/api/run-job` y `/api/run-dm-job`.

#### 🔥 P5b — DM tools rotos / a mejorar (marcados WIP en palette)

- [ ] **`show pipelines`** — el endpoint discovery devuelve listas vacías en tenants reales (probado contra demo de Rajiv: spinner colgado o resultado vacío). Marcado como **dev pending** en el palette de `/show`. Hay que: (a) investigar el endpoint correcto del Pipelines API en NSPB v25.x, (b) parsear la respuesta correctamente, (c) testar end-to-end.
- [ ] **`show integrations`** — escribe sheet pero con datos muy parciales (5 filas vs los integrations reales que tiene el tenant). Marcado como **dev pending**. Mejorar el discovery para traer integraciones DM con sus mappings + source/target apps reales.
- [ ] **`run integration <name>`** — ya estaba marcado WIP. Para completar el ciclo de DM.
- [ ] **`run data rule <name>`** — WIP. Necesario para ejecutar data rules con período custom.
- [ ] **`run pipeline <name>`** — WIP. Multi-step orchestration.
- [ ] **`download file <name>` / `upload file <name>`** — WIP. Snapshot download + CSV upload al inbox de DM.

#### 🔥 P6 — Optimización + UX

- [ ] **`analyze_db_optimization`** — análisis de tamaño de DB, block size, sparse/dense, performance de cálculos. Devuelve recomendaciones.
- [ ] **Modo pregunta-respuesta** — Rajiv prefiere interfaz drill-down donde el usuario "interroga" al sistema, no recibir info masiva pre-programada. El chat guía con preguntas de seguimiento.
- [x] **Progress indicators** — spinner / status mientras se ejecutan reglas o jobs largos. _(Hecho 2026-05-18: bubble con animación amarilla pulsante mientras `/api/run-rule` está in-flight.)_

---

## Roadmap — Features pendientes o no testeadas

### Web Console Copilot (extensión Chrome) — backlog

La extensión `extension/` (side panel que maneja la consola Planning real vía trusted-clicks) tiene su propio backlog. Estado actual: open form + explain-on-open (KB cards de form/rule/variable con valores y chips), read/analyze/explain unificados en "Explain this screen", FAQ chips por área, POV advisory (no auto-cambia), tema Oracle Redwood, follow-up chips (≤5) en cada respuesta.

Ya funcionando en la extensión (2026-06-11):
- [x] **Explain de forms / rules / variables** — tarjetas determinísticas del KB (sin alucinar): form (para qué sirve, quién lo usa, reglas con ⚡on-save, variables `&X = valor`, layout) · rule (qué calcula, inputs→outputs, variables del body, en qué forms corre, cómo ejecutarla) · variable (valor actual, qué controla, cuándo actualizar, impacto). Cada una con follow-up chips. Esto cubre el compromiso #8 del recap en el canal web.
- [x] **Optimization / performance analysis** — `performance` (snapshot determinístico: member counts, storage mix, dyn-calc, alias gaps + flags) + `optimize ai` (recomendaciones dense/sparse del Worker). En menú ▸ Actions ▸ "Analyze the model".
- [x] **Capa NL→intent** (2 niveles): `trySmartIntent`/`aiResolveIntent` rutean lenguaje natural a openNav/openForm/analyze/answer; preguntas puras van al Worker (kb.md NSPB + tenant KB). Clarifying questions PARCIAL: ante match ambiguo (form/rule con varios candidatos) el chat pregunta "¿cuál?" en vez de adivinar. Falta el "quiz proactivo" del #9.
- [x] **Follow-up chips (≤5)** contextuales en cada respuesta.

Pendientes pedidos por Bruno (2026-06-11):
- [ ] **DuckDB en el chat web** — DuckDB-WASM SÍ corre en browser; el blocker NO es DuckDB sino el pipeline de export de nivel-0. En MV3 hay que habilitar `wasm-unsafe-eval` en el CSP del manifest. Fases: (a) export level-0 (driving el ad-hoc/Spreadsheet Export de la consola, o vía Planning REST) → (b) cargar el CSV/Arrow en DuckDB-WASM dentro del side panel → (c) queries de coverage/density/outliers desde el chat. Paridad con el compromiso #6.
- [ ] **Conteo de bloques por Scenario / Version / Year SIN exportar todo** ⭐ — Essbase no lo muestra directo en la UI sliced, pero se obtiene sin full-export: (a) **Database Statistics** da bloques existentes TOTALES + block size; (b) para sliced, correr un calc/MDX chico con `FIX(scenario, version, year) ... ` que cuente combinaciones de sparse con datos (p.ej. exportar sólo el índice, o `@COUNT` sobre los sparse). Plan: tool `count_blocks` que arme y corra ese calc por slice y devuelva la tabla al chat. Alimenta el optimization analysis con datos REALES (hoy es sólo metadata).
- [ ] **Question-driven / clarifying proactivo (#9)** — reforzar para que ante ambigüedad o falta de contexto el chat repregunte (no sólo en match de nombres).
- [x] **Change History de celda — v1 (guía + chips)** ⭐ pedido Squarespace/Rajiv. Comando `cell history` / `who changed this cell` / `quién modificó la celda` → explica que NSPB guarda usuario+valor old→new+timestamp, guía al right-click → Change History, y ofrece chips: Open Audit (trail completo) / Open form para inspeccionar la celda. Surfaced como chip en la tarjeta de form + en adhoc + menú Actions ▸ Workflows + follow-up chip.
- [x] **Change History de celda — v2 (drive real)** ⭐ `read cell history` → `runCellHistory()` en background.js: right-click programático (`trustedRightClick`, button:right/buttons:2 — abre el context menu JET/SlickGrid) sobre la celda SELECCIONADA (`.slick-cell.active/.selected`, recursivo en iframes) → click "Change History" → lee el panel (readScreenText) → el Worker resume "quién cambió, old→new, cuándo". Chip "🕵️ Read the selected cell's history" en la card advisory. ⚠ Necesita verificación con Planning logueado (perfil debug deslogueado). Si la celda es calculada/parent, "Change History" no aparece → error claro pidiendo una celda base.
- [ ] **Manejar el menú Analyze (ad-hoc) desde el chat**: hoy `adhoc` lee la pantalla y sugiere; falta DRIVE real de las acciones del ad-hoc grid (Zoom In / Zoom Out / Keep/Remove Selected / Pivot To / Insert-Delete Column / Adjust). Mapear el right-click + toolbar del ad-hoc para que los chips ("Zoom in on X", "Keep only Q1") ejecuten de verdad.
- [ ] **"Open form as ad-hoc"**: chip en la tarjeta del form que dispare Actions → New Ad hoc Grid (convierte el form en grilla ad-hoc para análisis libre). Distinto de operar sobre el form.
- [ ] **Llenar celdas con datos** (input form o ad-hoc): "llená con el % de actuals del año/período anterior" → calcular y escribir valores en celdas editables (data entry asistida). Heavy: requiere leer prior-year actuals + escribir + opcionalmente Save (corre rules on-save). Confirmar siempre antes de escribir.
- [ ] Navegar/inventariar TODO el menú Analyze para que el chat entienda qué acciones ofrece y se las explique al usuario (ya existe `tools/survey-console.js` como base para mapear).

### Alta prioridad

#### Multi-tenant portability ⚠️ Parcialmente entregado
El sistema actual usa `clientNetsuite.js` como fallback del tenant de Pharmalogic, pero ya hay infraestructura para tenants nuevos via `appConfig` discovery + `tenant-kb.json` por cliente.

Plan documentado en [`claude-plan/harmonic-wandering-clover.md`](../claude-plan/harmonic-wandering-clover.md).

Subtareas:
- [x] `runDiscoverAppConfig()` — detecta cubes, dims, defaults y periods vía Planning REST
- [x] Endpoint `/api/discover-app-config`
- [x] Botón **Detect** en Settings (consolidado dentro de `⚡ Load everything`)
- [x] Cliente envía `appConfig` en body de `/api/chat`
- [x] Worker usa `appConfig` si viene; fallback a `clientNetsuite.js` si no
- [x] **Pipeline de delivery por cliente**: `CLIENT=<name> node tools/parse-lcm.js` genera `clients/<name>/tenant-kb.json` (con AI enrichment si hay `GEMINI_API_KEY`). El usuario importa ese JSON via Settings.
- [ ] Hoja `NSPB_AppConfig` generada automáticamente con estructura del tenant _(deprecado: el contenido vive en el chat summary de "Load everything")_
- [ ] Textarea **Glossary** en Settings (contexto libre del tenant, se inyecta al system prompt)
- [ ] Period hints dinámicos desde `appConfig.periodMembers` (TP1-12 vs Jan-Dec vs Ene-Dic)
- [ ] Presets en tenant nuevo: error claro en lugar de fallo silencioso
- [ ] **Refresh tenant KB from live LCM** — botón que dispara LCM Export job vía REST → polling → parse + enrich on-demand (en lugar de re-importar manualmente)

#### KB universal NSPB/finanzas 📋 Pendiente
La `kb.md` actual tiene documentación técnica de NSPB desde MCP3. Falta una capa de conocimiento financiero/controller universal:
- [ ] Terminología financiera (Revenue, COGS, Gross Margin, EBITDA, Variance, YoY, FX)
- [ ] Mecánica de períodos NSPB (BegBalance, YearTotal, YTD, QTD, MTD, rolling N)
- [ ] Workflows de closing mensual y forecast
- [ ] Guía de uso efectivo del chat (cuándo usar cada tool)

### Media prioridad

#### UX del task pane 📋 Pendiente / no testeado
- [ ] Historial de conversación persistente entre sesiones (localStorage)
- [ ] Botón "Copy to clipboard" en respuestas del chat
- [ ] Soporte para múltiples perfiles de conexión (host + app + user guardados con nombre)
- [ ] Indicador visual cuando Gemini escala de flash a pro
- [ ] Preview de la grilla antes de escribirla a la hoja

#### Herramientas de análisis adicionales 📋 Pendiente
- [ ] `run_commentary` — genera comentario narrativo de varianza automáticamente (delta favorable/desfavorable, top 3 drivers)
- [ ] `export_to_pdf` — formatea la hoja actual y genera PDF (vía Office.js)
- [ ] `schedule_refresh` — agenda refresh automático de una grilla al abrir el archivo
- [ ] `show_saved_queries` — lista y re-ejecuta queries guardadas por el usuario

#### Seguridad / infra 📋 Pendiente
- [ ] Rotación de credenciales — las credenciales NSPB se guardan en localStorage en claro; evaluar cifrado con CryptoKey API
- [ ] Rate limiting por tenant en el worker
- [ ] Logging de uso por tenant (Cloudflare Analytics + D1 o KV)

### Baja prioridad / backlog

- [ ] i18n del task pane (actualmente solo inglés)
- [ ] Presets configurables por tenant desde Settings UI
- [ ] Soporte para tenants con auth OAuth (actualmente solo Basic Auth)
- [ ] Modo offline con caché de última grilla en Service Worker
- [ ] App Store / AppSource listing para distribución sin sideload

---

## Notas de arquitectura importantes

- **Worker stateless**: el cliente envía todo el contexto en cada request (catalog, businessRules, forms, variables, lastGrid, appConfig). No hay sesión server-side excepto `svSessionCache` para SmartView sIDs (~10 min TTL).
- **Basic Auth only**: endpoints bajo `/aif/ui/model/*`, `/interop/*`, `/efsvbuirest/.../flows/*` requieren cookies de sesión UI y están fuera de alcance — se stubbean con error explicativo.
- **Gemini tool schema**: los tipos deben ser strings planos (`"string"`, no `["integer","string"]`) porque Gemini rechaza union types.
- **`runOpenForm` resiliente**: si `req_GetFormSlice` falla (errcode 60000 = falta acceso a dimensión), se renderiza instrucciones + rules con grilla stub + banner ⚠ en lugar de tirar error.

### Convención de verbos en el chat (UX standard)

Para que el usuario aprenda un solo patrón en lugar de adivinar entre `show` / `list` / `display` / `view`:

| Verbo | Significado | Ejemplos |
|---|---|---|
| **show** | enumerar inventario → escribe sheet | `show forms`, `show rules`, `show jobs`, `show variables`, `show snapshots`, `show navigation flow` |
| **open** | renderizar UNA cosa específica en Excel | `open form Income Statement.`, `open OpEx Detail.` |
| **explain** | analizar UNA cosa específica (AI tutor, no escribe sheet) | `explain rule X`, `explain form Y`, `explain variable Z`, `explain account A` |
| **run** | ejecutar | `run rule X`, `run job Y` |
| **create** / **delete** / **restore** | mutar | `create snapshot X`, `delete snapshot X` (TODO), `restore snapshot X` (TODO) |
| **build** / **compare** | armar ad-hoc grid | `build adhoc`, `compare A vs B` |
| **analyze** / **format** / **clean** | operar sobre la hoja activa | `analyze this`, `format this as a report`, `clean zeros` |

Aliases legacy aceptados (mantener compat, pero no son la frase canónica): `list X` → `show X`, `display X` → `show X`.
