---
name: epm-assessment
description: Assess a client's Oracle NSPB/EPM Planning environment, their NetSuite ERP account, or both together — and produce the BPC deliverables (Current State Assessment, Optimization Review, connector map, environment KB, NetSuite↔NSPB reconciliation). Use when the user mentions a client assessment, an LCM export, a NetSuite account, "qué módulos usa", "current state", "optimization review", or wants to reconcile Planning against NetSuite.
---

# EPM Assessment — guided workflow

Trabajás sobre **una carpeta por cliente** en `clients/<cliente>/`. Esa carpeta ES el estado:
no hace falta recordar en qué punto quedó nada, se mira qué archivos existen.

Nunca pidas todo junto al principio. Pedí lo mínimo para el próximo paso, corré, mostrá
lo que salió, y recién ahí pedí lo siguiente.

---

> El instructivo completo para el usuario (cómo pedir el LCM, cómo crear el token) está en
> `docs/GETTING-STARTED.md` — mandalo si te preguntan por los prerrequisitos.

## Paso 0 — ¿de qué lado estamos?

Preguntá una sola cosa: **¿NSPB, NetSuite, o los dos?**

| respuesta | ruta |
| --- | --- |
| NSPB / Planning | A |
| NetSuite / ERP | B |
| los dos | A + B, después C |

Y creá `clients/<cliente>/` si no existe.

---

## Ruta A — NSPB / Planning (desde el LCM)

**Necesitás:** el LCM export del cliente (zip o carpeta descomprimida). Es lo único.
Se pide así: *"Migration → Snapshot → descargar el zip del backup"*.

```bash
CLIENT=<cliente> GEMINI_API_KEY=... node packages/lcm/parse-lcm.js      # → tenant-kb.json
CLIENT=<cliente> node packages/analysis/architecture-report.js          # → state-report.md
```

Para el **Optimization Review** hacen falta dos insumos más, y conviene pedirlos juntos:
un **export nivel-0** de cada cubo y el **Activity Report** del tenant.

```bash
CLIENT=<cliente> node packages/analysis/parse-level0.js
CLIENT=<cliente> node packages/analysis/cube-optimize.js                # → optimization-report.md
```

> Guía de interpretación Essbase y checklist de QA: `docs/CUBE-OPTIMIZATION-README.md`.
> Runbook de datos y carga: `docs/NSPB-LCM-AND-DATA-RUNBOOK.md`.

---

## Ruta B — NetSuite ERP

**Necesitás:** un token TBA de la cuenta del cliente. No hay atajo — el MCP de NetSuite de
BPC apunta a otra cuenta y además corre con rol restringido.

Guialo por la receta de `docs/NS-ERP-README.md` §3, en este orden y de a un paso:

1. Enable Features → SuiteCloud: `REST WEB SERVICES` + `TOKEN-BASED AUTHENTICATION`.
2. Setup → Integration → Manage Integrations → New. **Solo** TBA tildado.
   → Consumer Key/Secret, **se muestran una sola vez**.
3. Un rol read-only ancho: `REST Web Services` (Full), `Log in using Access Tokens` (Full),
   `SuiteAnalytics Workbook` (Edit), resto en View, **sin restricción por subsidiary/dept/class**.
   Un rol angosto produce falsos "módulo ausente" — es el error más caro de esta ruta.
4. Setup → Users/Roles → Access Tokens → New → Token ID/Secret, también una sola vez.

**Pedile que los pegue él en `.env`.** No los recibas por chat: quedan en el transcript.

```bash
CLIENT=<cliente> node packages/netsuite/netsuite-export.js              # 4 fases
CLIENT=<cliente> node packages/netsuite/ns-erp-assess.js                # → erp/modules.json
CLIENT=<cliente> node packages/netsuite/ns-connector-map.js             # → erp/CONNECTORS.md
CLIENT=<cliente> node packages/netsuite/ns-vertical.js                  # → erp/vertical.json
CLIENT=<cliente> node packages/netsuite/ns-financials.js                # → erp/FINANCIALS.md
CLIENT=<cliente> node packages/netsuite/netsuite-assessment-report.js   # → ASSESSMENT.md
```

`ns-financials.js` necesita dos consultas que todavía no están dentro de `netsuite-export.js`
— el COA y los saldos por cuenta. Se sacan con `ns-sql.js`; las consultas están en
`docs/NETSUITE-DISCOVERY-LEARNINGS.md` §6.

**El entregable**, con Chrome abierto en `--remote-debugging-port=9222`:

```bash
CLIENT=<cliente> CLIENT_NAME=<Nombre> node packages/reports/netsuite-abr-full.js
```

Produce el ABR completo con las recomendaciones de BPC. Hay dos versiones cortas por si se
necesitan sueltas: `netsuite-abr-pdf.js` (solo negocio) y `nspb-integration-pdf.js` (técnico,
para el equipo de Planning).

**Corré `ns-connector-map.js` temprano.** Es lo que evita proponer algo que el cliente ya
tiene: si aparece FloQast o BlackLine, el caso de NSAR cambia; si aparece Adaptive o Anaplan,
cambia el de NSPB; si aparece el bundle `NSPBCS_`, NSPB no es un upsell sino un problema
de adopción.

Al terminar el assessment: **recordale rotar las credenciales**.

---

## Ruta C — los dos lados juntos

Recién cuando A y B corrieron. Dos entregables distintos:

**KB descriptiva del entorno** — cómo está armado, para que un consultor nuevo lo entienda.
Formato fijo, mismo que `env-docs/` de NSPB:

| archivo | qué responde |
| --- | --- |
| `01-how-its-built.md` | COA por tipo, jerarquía, segmentos, subsidiarias, libros |
| `02-financial-statements.md` | IS y BS reconstruidos: qué cuentas caen en cada línea |
| `03-how-areas-connect.md` | AR/AP/ARM/leases/FAM → GL, y qué integración alimenta cada una |
| `04-how-to-load-data.md` | el procedimiento de carga real de ESE entorno |

**Reconciliación NetSuite ↔ NSPB** — el mismo POV por los dos lados y el diff:
SmartView da la grilla de Planning, SuiteQL el GL de NetSuite. Sirve para cazar lo que
en Talogy costó una investigación entera: dos orígenes distintos para el mismo número.

---

## Reglas que no se negocian

1. **Una ausencia no es una ausencia.** SuiteQL solo expone un record type si la feature
   está prendida **y** el rol la ve. Se reporta `unknown`, nunca `absent`. Lo mismo con
   cualquier tabla vacía por retención (`loginaudit`, `systemnote`).
2. **Todo lo prescriptivo va como "suggested changes" a validar con el cliente**, nunca
   como certeza.
3. **Sin números inventados.** Si no se extrajo, se dice "no extraído". Nunca se estima.
4. **Declarar la ventana** de telemetría en la portada.
5. **Datos de cliente nunca salen de `clients/`**, que está gitignored en bloque.
6. **Credenciales**: las pega el usuario en `.env`, se rotan al terminar.

Gotchas específicos de NetSuite (prefijos de SuiteApp, `isstored='F'`, campos `custentity_`
compartidos entre entidades, módulos que son `transaction.type` y no tablas):
`docs/NS-ERP-README.md` §8. Leerlos antes de interpretar nada.
