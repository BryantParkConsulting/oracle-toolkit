# NSPB Assistant — Guía técnica del proyecto

Add-in de Excel (Office.js) + Cloudflare Worker que permite consultar Oracle NetSuite Planning & Budgeting (Hyperion Planning / Essbase) en lenguaje natural. El usuario escribe en el task pane, el Worker ejecuta queries NSPB con Gemini + tool-use, y el resultado se escribe como grilla formateada directo en la hoja de Excel.

**Doc map:** [`README.md`](README.md) (front door) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (handoff completo — tool catalog, endpoint catalog, gotchas) · [`docs/ROADMAP.md`](docs/ROADMAP.md) (status + Squarespace recap)

---

## Estructura

```
nspb-migrate-fresh/
├── add-in/src/
│   ├── taskpane.html       UI del task pane (Chat / Status / Help / Report tabs)
│   ├── taskpane.css        Estilos (chat, palette, status sub-tabs underline)
│   └── taskpane.js         ~11K LoC — todo el cliente
├── add-in/help/            user-facing markdown
├── add-in/installer-scripts/  .bat files
├── worker/
│   ├── worker.js           ~11K LoC — handler, system prompt, tools, dispatch
│   ├── clientNetsuite.js   Config Pharmalogic (fallback legacy)
│   ├── build.js            concat + base64 + KB embed + taskpane inline → bundle.js
│   ├── inline-templates.js Inlinea templates/master.html
│   ├── templates/master.html  Diseño HTML del reporte
│   ├── kb.md               ~170KB KB NSPB embebido
│   └── bundle.js           Output del build (gitignored)
├── tools/
│   ⚠ El tooling de ENTREGA se mudó a C:\apps\bpc-toolkit (2026-07-31).
│   Acá quedan solo scripts del producto (videos, UAT, dev-server) y one-offs
│   de cliente. parse-lcm, enrich-kb, cube-optimize, los generadores de PDF y
│   los playbooks viven ahora en bpc-toolkit/packages/ y bpc-toolkit/docs/.
├── clients/<name>/tenant-kb.json   KB por tenant (embebido en bundle)
├── clients/<name>/deliverables/    Entregables finales con fecha (PDF, CSVs)
├── docs/                   ARCHITECTURE.md, ROADMAP.md, etc.
├── docs-site/              Firebase Hosting docs (React + Vite)
├── Customer_Installer/     ZIP que se envía al cliente
└── tests/samples/          Repro artifacts (xlsx/zip, gitignored content)
```

---

## `clients/` — snapshots de entorno por cliente (MIRAR ACÁ PRIMERO)

Este repo no es solo el add-in: `clients/<cliente>/` es **el repositorio de snapshots de los
entornos NSPB de los clientes** y del trabajo ya hecho sobre ellos. Antes de armar una carga de
datos, un template, un análisis de cubo — o de pedirle un archivo al cliente — revisar acá.
Suele estar hecho.

Cada folder tiene, según el cliente: el LCM descomprimido (`Export.xml` + carpetas de artefactos
`CALC-*`, `FDMEE-*`, `DOCREP-*`, `HP-*`), `tenant-kb.json`, `env-docs/`, `deliverables/`, y las
planillas reales que ya se usaron con ese cliente.

`env-docs/` tiene formato fijo y es la fuente de verdad del entorno:

| archivo | qué responde |
| --- | --- |
| `01-how-its-built.md` | dimensionalidad y estructura |
| `02-navigation-flow.md` | navegación / flujo de la app |
| `03-how-areas-connect.md` | cómo se conectan las áreas |
| `04-how-to-load-data.md` | **el procedimiento de carga de ESE entorno** — usarlo en vez de inventar formato |

Estado al 2026-07-22 — con LCM + env-docs: `symetri`, `talogy`, `enfinity`, `daywireless`,
`spindrift`, `chime`. Solo tenant-kb: `squarespace`, `swoop`, `demo`. Vacíos: `lincoln`, `overture`.

`clients/enfinity/cashflow-build/` es el caso más desarrollado (dimensiones reales, calc script,
XML de los forms de input y de review, JSON de mapeo, y un template HsSet/HsGet ya armado) — sirve
de patrón para cualquier build de cash-flow.

---

## Deploy

```bash
cd worker
npm run deploy        # build.js + inline-templates.js + wrangler deploy
# o paso a paso:
node build.js && npx wrangler deploy
```

Después del deploy: cerrar y reabrir el task pane en Excel. El badge de versión (ej. `v0.230`) en el header confirma el refresh.

---

## Arquitectura técnica

### Request flow

```
Excel task pane (Office.js)
  → POST /api/chat   { message, catalog, businessRules, forms, variables,
                       jobs, lastGrid, appConfig, glossary, activeSheet, lang }
      → Cloudflare Worker (worker.js)
          → server-side intercepts (explain X, topic help, etc.)  ← anti-hallucination
          → buildSystemPrompt() → Gemini Flash (tool_use, AUTO mode)
              → tool dispatch
                  → NSPB Planning REST / SmartView XML / Interop REST / DM
          → respuesta JSON { reply, grid?, action?, ... }
  → taskpane.js renderiza grilla / ejecuta action en hoja
```

### Gemini Flash → Pro fallback

- Flash con `toolMode=AUTO` (default).
- Si Flash devuelve `MALFORMED_FUNCTION_CALL` → retry Flash con `toolMode=ANY`.
- Si sigue fallando o no hay tool call cuando se esperaba → escala a Pro.

### Stateless

El worker no guarda estado entre requests. El cliente envía todo el contexto en cada call. Única excepción: `svSessionCache` (SmartView session IDs, TTL ~10 min en memoria del worker — best-effort, se rehidrata si expira).

### Auth NSPB

Solo **HTTP Basic Auth**. Endpoints UI con cookie auth (`/aif/ui/model/*`, partes de `/efsvbuirest/`) están fuera de alcance: se stubbean con error explicativo, NO throw.

REST APIs usadas:
- **Planning v3** — `/HyperionPlanning/rest/v3/...` (apps, cubes, rules, jobs, variables)
- **SmartView XML** — `/HyperionPlanning/SmartView` (forms, ad-hoc grids, EnumJobs)
- **Interop** — `/interop/rest/.../applicationsnapshots` y `/listfiles` (LCM snapshots, file browser)
- **DM (FDMEE)** — `/aif/rest/V1/...` (integrations, jobs, mappings)

---

## Per-tenant KB pipeline

Para onboardear un cliente nuevo:

```bash
# Drop el Oracle LCM export en lcm-export/ — el parser vive en el toolkit
CLIENT=squarespace GEMINI_API_KEY=AIza... node ../bpc-toolkit/packages/lcm/parse-lcm.js
#   → genera clients/squarespace/tenant-kb.json con
#     { forms, rules, variables, dimensions, dashboards, FRs, FDMEE, navigation }
#     y enrich-kb.js agrega aiSummary a cada rule/form/variable
CLIENT=squarespace npm --prefix worker run deploy
#   → build.js embebe tenant-kb.json en el bundle
```

El `aiSummary` pre-computado se usa en el server-side intercept de `explain X` para evitar hallucinations: el handler matchea por regex, busca en el KB, y devuelve el summary sin llamar a Gemini.

---

## Verb convention

- `show X` → enumera (rules, forms, variables, snapshots, files, accounts, dimensions, jobs, integrations)
- `open form X` → renderiza un form como grilla
- `explain X` → analiza un solo objeto (rule/form/variable/account) usando aiSummary
- `run rule X` → ejecuta (con monitor manual en Status → Jobs)
- `create snapshot X` / `delete snapshot X` → mutan (con confirm)
- `restore snapshot X` → ⛔ NUNCA implementar (decisión explícita: muy destructivo)
- `analyze this` / `format` / `clean` → operan sobre la hoja activa
- `set variable X = Y` → muta substitution variable

---

## Invariantes (no romper)

1. **Worker stateless** — nunca state global entre requests (salvo `svSessionCache`).
2. **Basic Auth only** — no intentar cookie auth; stubear con error claro.
3. **Gemini types como strings planos** — `type: "string"`, nunca `["integer","string"]`. Rompe el schema validator.
4. **`runOpenForm` resiliente** — si `req_GetFormSlice` falla con errcode 60000, renderizar stub + banner ⚠, no throwear.
5. **SmartView XML para forms** — `req_GetFormSlice` requiere bloque `<preferences>` completo y `<navigate withData="1"/>` (sin esto las celdas vienen vacías).
6. **Portabilidad config** — usar `effectiveCubeDefaults(settings, cube)` / `effectiveCubeDims(settings, cube)`, nunca `CLIENT_CONFIG.cubeDimDefaults` directo.
7. **Explain intercept antes de Gemini** — regex match en `runChatTurn`, lookup en `tenant-kb.json`, return aiSummary. No mandar a Gemini si hay match.
8. **Form lookup form-first** — los nombres pueden colisionar con dashboards; primero buscar en `kb.forms`, dashboard solo como fallback.
9. **`analyze_inplace` deja 1 col vacía** — entre la grilla original y las nuevas Δ$/Δ% para que SmartView Refresh no las pise.
10. **Verbo unificado** — ver tabla arriba; no agregar sinónimos sin razón fuerte.

Gotchas extendidos + tool catalog completo → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Para agregar un tool nuevo

1. Definir el schema (objeto con `name`, `description`, `parameters` con types string-planos) y agregarlo al array `TOOLS` en `worker.js`.
2. Escribir `runNombreTool(params, settings)` con la lógica NSPB.
3. Agregar dispatch en `runChatTurn()`.
4. Agregar ejemplo/routing hint en `buildSystemPrompt()`.
5. Si requiere render especial en cliente, agregar handler en `runClientAction()` en `taskpane.js`.
6. Actualizar el catalog en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
7. `npm --prefix worker run deploy`.

---

## Debugging

```bash
cd worker
npx wrangler tail        # logs en vivo del worker — cada request + debug mirror
```

En el cliente, `debug last` en el chat muestra el último request/response crudo.
