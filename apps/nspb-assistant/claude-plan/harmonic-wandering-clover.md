# Plan: NSPB Add-in — Multi-Tenant Portability Refactor

## Context

Hoy [worker/clientNetsuite.js](worker/clientNetsuite.js) está 100% atado al tenant de Pharmalogic (NetSuite app):
- Cubes hardcoded: `Plan/Details/Rpt/Workforc`
- Defaults hardcoded: `SUB_2`, `TD/TC/TL/TR/TI/TRS`, `FY24`, `Actual`, `Base`, `USD`
- Presets que referencian `P_400000` (revenue) y `P_600000` (opex) — códigos únicos de este tenant
- Member hints "revenue" → `P_400000`, "pharmalogic" → `SUB_2`
- Período = `TP1..TP12 + YearTotal` (otros tenants usan `Jan..Dec`, `Ene..Dic`, etc.)

Resultado: en otro tenant funcionan los discovers + show_inventory + open_form, pero **build_adhoc / run_preset / compare_grid / top_drivers fallan** porque los códigos no existen.

Goal: que el add-in funcione en cualquier tenant sin tocar código — solo cambiando settings + corriendo discovery.

## Approach

**Hybrid: agregar layer de auto-discovery POR ENCIMA del CLIENT_CONFIG hardcoded.** Si el cliente lo envía, gana; sino, fallback al hardcoded actual (no regresiona el tenant de Pharmalogic).

### Step 1 — Nueva función `runDiscoverAppConfig(settings)` en worker

Llama Planning REST (Basic-Auth-friendly) y devuelve:

| Campo | Endpoint |
|-------|----------|
| `cubes` | `GET /HyperionPlanning/rest/v3/applications/{app}/plantypes` → cube name list |
| `cubeDims[cube]` | `GET /applications/{app}/plantypes/{cube}/dimensions` → dim list per cube |
| `cubeDimDefaults[cube][dim]` | per dim, tomar `defaultMember` del response |
| `periodMembers` | `GET /applications/{app}/dimensions/Period/members/Period?descendants=Children` → list (Jan-Dec, TP1-TP12, etc.) |
| `years` | dim Years → list de años populated |
| `scenarios` | dim Scenario → children (Actual/Budget/Forecast or whatever) |

Returns:
```js
{
  appName, cubes: [...], mainCube,
  cubeDims: {[cube]: [...]},
  cubeDimDefaults: {[cube]: {[dim]: defaultMember}},
  periodMembers: [...],         // ["Jan","Feb",..."Dec","YearTotal"] o ["TP1",...]
  scenarios: [...], years: [...],
  detectedAt: <ISO>
}
```

### Step 2 — Endpoint nuevo + client storage

- New endpoint `POST /api/discover-app-config`
- New client storage key `APP_CONFIG_KEY = "nspb-addin.appConfig.v1"`
- New client handler `onDiscoverAppConfig()` → fetch + save + auto-write `NSPB_AppConfig` sheet (cubes, dims, defaults).
- New button in Settings: **"Detect"** (corre el config detection — primer click on a fresh tenant).
- Cleared en host/app change.

### Step 3 — Client envía `appConfig` en `/api/chat` body

`onSend()` lee `APP_CONFIG_KEY` y lo añade al body junto con catalog/businessRules/etc. Worker la recibe como nuevo opt.

### Step 4 — Worker usa appConfig SI VIENE, sino fallback

Cambios en:
- `buildSystemPrompt(lastGrid, catalog, opts)` — si `opts.appConfig` viene, usar sus cubes/cubeDims/cubeDimDefaults/periodMembers en lugar de CLIENT_CONFIG. Fallback CLIENT_CONFIG si no.
- `runBuildAdhoc`, `runCompareGrid`, `runTopDrivers`, `runModifyGrid` — todas las que leen CLIENT_CONFIG.cubeDimDefaults para auto-fill POV — aceptar `appConfig` y usar primero.
- `runPreset` — si appConfig presente Y diferente de Pharmalogic, return error informativo "presets are tenant-specific and not configured for this app".

### Step 5 — Conceptos semánticos vía find_member (no códigos hardcoded)

Las **dimensiones** son universales (Account, Scenario, Years, Period, Subsidiary, etc. — toda app NSPB las tiene). Lo que varía son los **códigos de los miembros** (P_400000 vs ACCT_4000 vs Revenue_Top, etc.).

Approach: el system prompt enseña a Gemini que **CADA concepto de cuenta/escenario/año debe pasar por find_member primero** contra el catálogo del tenant:

- "revenue/sales/top line" → `find_member({query:'revenue', dim:'Account'})` → usa el código devuelto
- "opex/operating expense/expenses" → `find_member({query:'expense', dim:'Account'})` o `'operating'`
- "actual/actuals" → `find_member({query:'actual', dim:'Scenario'})`
- "budget/plan" → `find_member({query:'budget', dim:'Scenario'})`
- "forecast/fcst" → `find_member({query:'forecast', dim:'Scenario'})`
- "this year/current year" → tomar el año más reciente populated de `appConfig.years`

Esto reemplaza completamente los `memberHints` hardcoded. find_member ya hace fuzzy matching contra el catálogo discovered, así que funciona idéntico en cualquier tenant.

- **Period hints** (q1, q2, by month, etc.) se generan dinámicamente desde `appConfig.periodMembers` — si el tenant usa TP1-TP12, Q1=[TP1,TP2,TP3]; si usa Jan-Dec, Q1=[Jan,Feb,Mar]; si usa Ene-Dic, Q1=[Ene,Feb,Mar].
- **Glossary** queda EMPTY por default. Settings UI gana una **textarea "Glossary"** opcional — usuario describe particularidades de su tenant en texto libre.

### Step 6 — Auto-detect en `init()` o explícito

- Si APP_CONFIG_KEY no existe Y connection test pasa: silently auto-run `onDiscoverAppConfig()` en background, después de Settings → Save.
- Else: usuario debe clickear "Detect" manual (primera vez en tenant nuevo).

### Step 7 — Settings UI

Agregar:
- Botón **Detect** al lado de Test (corre `onDiscoverAppConfig`).
- Textarea **Glossary** (multi-line, persistente en settings).

## Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| [worker/worker.js](worker/worker.js) | Nueva `runDiscoverAppConfig`, endpoint `/api/discover-app-config`, modificar `buildSystemPrompt` + `runBuildAdhoc`/`runCompareGrid`/`runTopDrivers`/`runModifyGrid` para usar appConfig. ~150 LoC. |
| [worker/clientNetsuite.js](worker/clientNetsuite.js) | Sin cambios estructurales — sigue como fallback. |
| [src/taskpane.html](src/taskpane.html) | Agregar botón Detect + textarea Glossary. ~10 LoC. |
| [src/taskpane.js](src/taskpane.js) | Storage key APP_CONFIG_KEY, handler onDiscoverAppConfig, init() auto-detect, onSend() pasa appConfig + glossary, clear-on-host-change. ~80 LoC. |

Total ~240 LoC. No regresiona el tenant actual.

## Verificación

1. **Mismo tenant (Pharmalogic) sin clickear Detect**: comportamiento idéntico al actual (fallback a CLIENT_CONFIG). Test harness sigue 33/33.
2. **Mismo tenant DESPUÉS de clickear Detect**: appConfig sobreescribe CLIENT_CONFIG → cubes detectados deberían matchear (`Plan/Details/Rpt/Workforc`), defaults deberían matchear `SUB_2`/`TD`/etc. Si discrepa, log y comparar.
3. **Tenant nuevo (cuando el user lo conecte)**:
   - Test connection ✓
   - Click Detect → `NSPB_AppConfig` sheet con cubes + dims + defaults del nuevo tenant
   - "show me variables/forms/rules/jobs" → ✓ (siempre funcionaron)
   - Build_adhoc usa los nuevos defaults sin fallar
   - find_member resuelve "revenue" / "opex" / "rent" / etc. del catalog del nuevo tenant
   - Presets que dependen de Pharmalogic codes → error claro "preset X requires P_400000 which doesn't exist in this tenant"
4. **Test harness extendido**:
   - Phase A nuevo test: `/api/discover-app-config` debe devolver `cubes.length > 0`, `cubeDims` con todas las dims, etc.
   - Phase B: chat con `appConfig` en el body — verificar que no rompe los tools existentes.

## Step 8 — KB.md genérica de NSPB / finanzas (agregado por user)

Crear `worker/kb.md` que bundle.js inlinea como string constant. Contiene conocimiento universal de NSPB / Hyperion Planning + finanzas / controller — independiente del tenant. buildSystemPrompt incluye el KB como sección `## KNOWLEDGE BASE` antes del glossary del usuario.

Contenidos (~150-300 líneas markdown):
- **NSPB conventions**: qué es un cube, cómo funcionan dimensiones (Account/Period/Years/Scenario/Version/Subsidiary), POV, cells, intersections.
- **Period mechanics**: BegBalance, YearTotal, TPn vs Jan-Dec, time intelligence (YTD, QTD, MTD), rolling N.
- **Finance terminology**: Revenue, COGS, Gross Margin, Opex, EBITDA, Net Income, Working Capital, Cash Flow, Variance (favorable/unfavorable), YoY, FX impact.
- **Controller workflows**: monthly close, variance commentary, forecast revisions, budget vs actual analysis, what KPIs matter.
- **How to ask Claude**: examples of effective queries, when to use compare_grid vs build_adhoc vs top_drivers.

User-supplied glossary (Settings textarea) se concatena después del KB → permite override / añadir contexto del tenant específico.

## Out of scope

- **Memberbreathing hints en Settings UI**: el user no puede agregar hints custom desde la UI. Si necesita ("rent" → cierto código en su tenant), debe usar find_member ad-hoc cada vez.
- **Presets per-tenant**: queda hardcoded en CLIENT_CONFIG. Tenants nuevos no tienen presets — solo build_adhoc + find_member.
- **Auto-detección de scenario / year semantics**: "actual" / "this year" siguen siendo memberHints universales que asumen nombres standard. Tenants que usen "Real" / "Plan_2025" en lugar de "Actual" / "FY25" requerirán que el user use el nombre exacto o use find_member.
- **i18n del UI**: textos del task pane siguen en inglés.

## Notas de seguridad

- `runDiscoverAppConfig` puede hacer ~15-30 subrequests (1 por dim para defaults). Cloudflare free tier permite 50 — cabemos. Si tenant tiene >40 dims totales, partir en dos llamadas o reducir defaults solo para dims con `<isPlannable>` true.
- Glossary user-input se inyecta tal cual al system prompt → trustea al usuario (es su prompt). No sanitizar para no perder formato libre.
