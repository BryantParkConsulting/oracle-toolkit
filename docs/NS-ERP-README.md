# NetSuite ERP — Current State Assessment (playbook)

Gemelo del **NSPB Current State Assessment** ([architecture-report.js](architecture-report.js)), pero del lado del **ERP de NetSuite** en vez del app de Planning. Misma idea: *"qué tenés implementado / qué usás de verdad / qué te sobra / qué te falta"*, con un capítulo de **integración con NSPB** al mismo peso.

> Decisión de scope (2026-06-22): reporte con **ERP-health + integración NSPB con peso igual**. Construido en paralelo (catálogo/esqueleto + extracción live del sandbox).
>
> **Actualización 2026-07-31 — el pipeline existe.** La extracción ya no es manual por browser: se hace por **SuiteQL/REST con un token TBA del cliente** ([netsuite-export.js](netsuite-export.js)), y el mapeo al catálogo es [ns-erp-assess.js](ns-erp-assess.js). Ver §3 y §7. Probado end-to-end contra una cuenta de producción de 345K transacciones.

---

## 1. El modelo (igual que NSPB)

Cada módulo del catálogo ([ns-erp-catalog.json](ns-erp-catalog.json)) se clasifica en uno de cuatro estados:

| Estado | Significado | Acción típica |
|---|---|---|
| `active` | prendido **y** con uso real en la ventana | mantener |
| `partial` | prendido pero subutilizado / uso parcial | optimizar / capacitar |
| `dormant` | prendido (o licenciado) y ~cero uso | apagar / limpiar / re-entrenar |
| `absent` | no prendido | **upsell** si le sirviría al cliente |

La clave es cruzar **config** (qué está prendido) con **telemetría** (qué se usa) — exactamente como el assessment de NSPB cruza el LCM export con el Activity Report + audit.

---

## 2. Qué extraer del cliente (checklist de extracción)

El catálogo dice, módulo por módulo, de dónde sale cada señal (`detect.via`). Resumido por fuente:

### A. `enable_features` — el inventario maestro
`Setup > Company > Enable Features`. **Recorrer todas las subtabs** (Company, Accounting, Tax, Transactions, Items & Inventory, CRM, Analytics, SuiteCloud, Web Presence, Employees). Cada checkbox tildado = módulo prendido. Esto da el universo `active`+`dormant` (prendido) vs `absent` (no prendido).

### B. `installed_bundles` — SuiteApps
`Customization > SuiteBundler > Search & Install Bundles > List`. Buscar especialmente: **NSPB connector**, Fixed Assets Management (FAM), Advanced Revenue Management, Account Reconciliation (ARCS), SuiteBilling.

### C. `setup_page` — estructura y customización
- `Setup > Company > Subsidiaries` (OneWorld)
- `Setup > Accounting > Manage Accounting Books` (multi-book)
- `Setup > Accounting > Manage Accounting Periods` + `Fiscal Calendars`
- `Lists > Accounting > Accounts` (COA: tamaño, numeración, tipos)
- `Setup > Company > Classifications` (class/dept/location)
- `Customization > ... > Custom Segments`
- `Customization > Scripting > Scripts` y `> Workflows` (footprint de customización viva)
- `Setup > Integration > Manage Integrations` (qué sistemas externos tocan NetSuite)

### D. `saved_search` — la telemetría (active vs dormant)
La **fuente de verdad** del uso. Armar una transaction saved search:
- **Results**: agrupada por `Type` (tipo de transacción), con `Count`
- **Criteria**: `Date` en la ventana (default últimos 6 meses), `Posting = T` para las que aplican
- Esto separa los módulos transaccionales `active` de los `dormant` (feature prendida, 0 transacciones).

> Para volúmenes de records no-transaccionales (proyectos, suscripciones, assets) → saved search sobre el record type correspondiente.

### E. `suiteql` — **ahora el canal principal**
Con un **token TBA del cliente** se obtienen volúmenes exactos sin armar una sola saved search a mano. Reemplaza a A/B/C/D para todo lo que sea *uso*; A y B siguen siendo necesarios para *config* (ver §3b). **El MCP de NetSuite de BPC (cuenta 7282750) NO sirve para la cuenta del cliente** — es otra cuenta, y además corre con un rol restringido que deja tablas invisibles.

---

## 3. Cómo extraer — canal SuiteQL/TBA (recomendado)

Pedirle al cliente que cree la integración y el token. Alcanza con acceso de Administrator a su cuenta:

1. **Setup → Company → Enable Features → SuiteCloud**: confirmar `REST WEB SERVICES` y `TOKEN-BASED AUTHENTICATION` (y `SUITECLOUD DEVELOPMENT FRAMEWORK` si se va a correr SDF).
2. **Setup → Integration → Manage Integrations → New**: nombre reconocible, State=Enabled, **solo** Token-Based Authentication tildado. Sin OAuth 2.0, sin User Credentials, sin issuetoken endpoint. → guarda y muestra **Consumer Key/Secret una sola vez**.
3. **Rol** — es lo que decide qué se va a ver. Crear uno read-only con `REST Web Services` (Full), `Log in using Access Tokens` (Full), `SuiteAnalytics Workbook` (Edit) y el resto en View, **sin restricción por subsidiary/department/class**. Un rol angosto produce falsos "módulo ausente".
4. **Setup → Users/Roles → Access Tokens → New** → Token ID/Secret, también una sola vez.
5. Volcar los 5 valores a `.env` (gitignored) y correr §7.

> **Rotar las credenciales al terminar el assessment.** Son de la producción del cliente.

## 3b. Lo que SuiteQL no puede ver (sigue siendo browser o SDF)

`Enable Features` completo, workflows (SuiteFlow), definiciones de saved search, reportes de Report Builder, ARCS, SuiteAnalytics Connect/Workbook, approval routing, SuiteCommerce. Para esto: browser con Claude in Chrome (§2 A–D) o `suitecloud object:import`.

---

## 4. Salida: `clients/<cliente>/erp/modules.json`

Mismo espíritu que el `modules.json` de NSPB. Schema propuesto:

```jsonc
{
  "client": "enfinity",
  "account": "4766983-sb3",          // env / sandbox
  "extractedAt": "2026-06-22",
  "windowMonths": 6,
  "edition": { "oneworld": true, "subsidiaries": 12, "books": 2, "currencies": 5 },
  "modules": [
    {
      "id": "fixed-assets",          // ← matchea ns-erp-catalog.json
      "enabled": true,               // de Enable Features / bundles
      "usage": { "metric": "asset records", "count": 0, "txnLast6m": 0 },
      "state": "dormant",            // active | partial | dormant | absent
      "evidence": "FAM bundle instalado; 0 depreciation runs en la ventana",
      "nspbNote": "..."              // copiado/derivado del catálogo
    }
  ],
  "integration": {                   // el capítulo NSPB
    "connectorPresent": true,
    "actualsSource": { "book": "Primary", "via": "saved search X" },
    "dimensionMap": [
      { "nspbDim": "Entity", "source": "Subsidiary", "quality": "ok" },
      { "nspbDim": "Account", "source": "GL accounts (412)", "quality": "ok" },
      { "nspbDim": "Cost Center", "source": "Department", "quality": "70% tagged" }
    ],
    "gaps": ["Class sin taggear en 30% de las txns", "Native Budgets aún en uso"]
  }
}
```

Clasificación `state` (regla):
- `enabled === false` → **absent**
- `enabled && usage ≈ 0` → **dormant**
- `enabled && usage parcial` (subset del módulo, o tagging bajo) → **partial**
- `enabled && usage pleno` → **active**

---

## 5. El capítulo de integración NSPB (peso igual)

Lo que hace al deliverable vendible junto al de Planning. Tres bloques:

1. **El puente** — ¿existe el connector NSPB? ¿de qué accounting book salen los actuals? ¿corre scheduled o es export manual? (módulo `nspb-connector`).
2. **El mapa de dimensiones** — NetSuite → NSPB: Subsidiary→Entity, COA→Account, Class/Dept/Location/Custom Segment→custom dims. Para cada uno, **calidad** (¿qué % de txns están taggeadas? Planning sólo puede ser tan granular como el actual taggeado).
3. **Gaps & duplicados** — Native Budgets vivos en paralelo a NSPB, forecasting nativo vs NSPB, drivers que faltan (sin statistical accounts / sin SuitePeople para Workforce).

---

## 6. QA pre-entrega (igual de estricto que cube-optimize)

- [ ] Cada módulo `dormant`/`absent` tiene **evidencia** (no afirmar "no lo usan" sin el conteo).
- [ ] Los volúmenes salen de una saved search reproducible (guardar el searchId / definición).
- [ ] El mapa de dimensiones está validado contra el LCM de NSPB del cliente (qué dims existen de verdad en Planning).
- [ ] Todo lo prescriptivo va como **"suggested changes"** a validar con el cliente — nunca como certeza (ver feedback global del proyecto).
- [ ] Ventana de telemetría explícita en la portada (ej. "últimos 6 meses").
- [ ] Sin números inventados: si no se extrajo, decir "no extraído", no estimar.

---

## 7. Pipeline

```bash
# 1. extracción — 4 fases, ~10 min en una cuenta de 345K transacciones
CLIENT=<cliente> node tools/netsuite-export.js                 # probe+shape+metadata+fields
CLIENT=<cliente> node tools/netsuite-export.js --phase=probe   # solo el mapa de módulos

# 2. mapeo al catálogo → clients/<cliente>/erp/modules.json
CLIENT=<cliente> node tools/ns-erp-assess.js

# 3. reporte
CLIENT=<cliente> node tools/netsuite-assessment-report.js      # → netsuite/ASSESSMENT.md
```

**Fases de la extracción** (`clients/<cliente>/netsuite/`):

| fase | salida | qué contiene |
|---|---|---|
| `probe` | `probe.json` | ~90 tablas: ¿responde? ¿cuántas filas? ¿última actividad? |
| `shape` | `shape.json` | volumetría y breakdowns; **nunca filas de detalle** |
| `metadata` | `metadata.json` | diccionario de campos vía `metadata-catalog` (opcional) |
| `fields` | `fields.json` | fill-rate por custom field — el hallazgo de optimización |

**Pendiente:** `ns-erp-report.js` (modules.json → erp-report.md con el capítulo NSPB) y su PDF.

---

## 8. Gotchas — leer antes de interpretar nada

Todos aprendidos rompiéndose contra una cuenta real de producción.

1. **Una ausencia es ambigua.** SuiteQL solo expone un record type si la feature está habilitada **y** el rol tiene permiso. `Record 'x' was not found` no distingue las dos cosas. Por eso el pipeline usa un quinto estado **`unknown`** además de los cuatro del catálogo: clasificar como `absent` algo que no se puede ver es la forma más rápida de que te desarmen el informe. Se desambigua con SDF o Enable Features.
2. **Los módulos transaccionales no son tablas.** AR, AP, journals, opportunities son valores de `transaction.type`. El uso real sale de `GROUP BY BUILTIN.DF(type), año`, no de probar tablas.
3. **Hay ceros que no significan "sin uso".** `loginaudit`, `systemnote`, `deletedrecord`, `transactionhistory` dependen de retención y permisos. Excluirlos del cálculo de uso.
4. **`customfield` mezcla dos cosas.** `fieldtype='SCRIPT'` son parámetros de script, no campos de datos: contarlos infla la deuda de customización (en la cuenta de prueba, 349 de 3.187).
5. **`isstored='F'` no es columna.** Los campos de fórmula no se pueden consultar; sin filtrarlos, 284 de 445 mediciones de fill-rate rebotan.
6. **Un `custentity_` vive en customer, vendor, employee y job a la vez.** Que esté vacío en uno no lo hace muerto — puede no aplicar ahí. El único número defendible es el campo vacío en **todas** las tablas donde se midió.
7. **`nspb-connector` se detecta por `CUSTRECORD_NSPBCS_*`**, no por la palabra "Planning" (que matchea cualquier "Planning Category"). Si aparece, el encuadre del deliverable cambia por completo: no es un upsell de NSPB, es adopción del NSPB que ya compraron.
7b. **CORREGIDO (2026-07-31): los workflows SÍ se exponen en SuiteQL.** La tabla `workflow` existe y responde. Este documento decía lo contrario. Lo mismo con `expensereport` y `opportunity`: si la tabla responde, la feature está prendida, y cero filas es uso nulo MEDIDO (`dormant`), no ausencia de dato (`unknown`). Ver [NETSUITE-DISCOVERY-LEARNINGS.md](NETSUITE-DISCOVERY-LEARNINGS.md) §2.

8. **Sin ventana móvil.** El playbook asume "últimos 6 meses"; el pipeline actual cuenta histórico completo. Declararlo en portada.
9. **SuiteApps se delatan por prefijo**, no por el listado de features: `NSPBCS_` (connector NSPB), `ncfar_` (FAM), `CELIGO_`, `AVATAX_`, `SFDC_`, y los tipos `NetLease *` en transacciones.

> `ns-erp-report-pdf.js` reusa el shell de diseño de [state-report-pdf.js](state-report-pdf.js) / [report-to-pdf.js](report-to-pdf.js) (tokens BPC, cover, donuts, hbars).
