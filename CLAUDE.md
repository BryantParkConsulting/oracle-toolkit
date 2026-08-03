# oracle-toolkit — orientación

Toolkit de BPC para entregas EPM: **Oracle NSPB / Planning** y **NetSuite ERP**, desde la
extracción cruda hasta el PDF con marca BPC. Consolidado el 2026-07-31 desde cinco carpetas
sueltas de `C:\apps`.

Si venís de cero, leé esto entero antes de tocar nada. Son 5 minutos y te ahorra repetir
errores que ya cometimos.

---

## El modelo mental

Todo gira alrededor de **una carpeta por cliente** en `clients/<cliente>/`. Esa carpeta **es
el estado**: no hay base de datos ni registro de progreso, se mira qué archivos existen.

```
clients/<cliente>/
├── netsuite/     extracción cruda: probe, shape, fields, coa, balances, pnl…
├── erp/          derivados: modules.json, connectors.json, vertical.json, financials.json
├── env-docs/     documentación del entorno NSPB (formato fijo 01→04)
├── tenant-kb.json  KB del tenant de Planning
└── *.pdf         entregables
```

Cada script lee lo que produjo el anterior y no vuelve a consultar el sistema salvo que
tenga que hacerlo. Podés cortar y retomar en cualquier fase.

---

## Las dos rutas

### NetSuite — arranca con un token TBA del cliente

```bash
CLIENT=<c> node packages/netsuite/netsuite-export.js        # 4 fases: probe, shape, metadata, fields
CLIENT=<c> node packages/netsuite/ns-erp-assess.js          # → erp/modules.json (37 módulos, 5 estados)
CLIENT=<c> node packages/netsuite/ns-connector-map.js       # → erp/CONNECTORS.md (bundles + integraciones)
CLIENT=<c> node packages/netsuite/ns-vertical.js            # → erp/vertical.json (micro-vertical + benchmark)
CLIENT=<c> node packages/netsuite/ns-financials.js          # → erp/FINANCIALS.md (COA + IS/BS)
CLIENT=<c> CLIENT_NAME=<Nombre> node packages/reports/netsuite-abr-full.js   # → el entregable grande
```

`ns-financials.js` necesita dos consultas que hoy no están automatizadas —
`netsuite/coa.json` y `netsuite/balances.json`. Se sacan con `ns-sql.js` (ver §Consultas).

**Corré `ns-connector-map.js` temprano.** Es lo que evita proponer algo que el cliente ya
compró: si aparece FloQast o BlackLine el caso de conciliación cambia; si aparece el bundle
`NSPBCS_`, Planning no es un upsell sino un problema de adopción.

### NSPB / Planning — arranca con el LCM export

```bash
CLIENT=<c> GEMINI_API_KEY=... node packages/lcm/parse-lcm.js     # → tenant-kb.json
CLIENT=<c> node packages/analysis/architecture-report.js         # → state-report.md
CLIENT=<c> node packages/analysis/cube-optimize.js               # → optimization-report.md (necesita level-0 + activity report)
```

---

## Consultas ad-hoc

```bash
node packages/netsuite/ns-sql.js "SELECT ..."                    # tabla en consola
node packages/netsuite/ns-sql.js "SELECT ..." --out=archivo.json
node packages/netsuite/ns-sql.js --probe=tabla1,tabla2           # ¿existe? ¿cuántas filas?
```

Es también el cliente reutilizable: `require('./ns-sql')` exporta `suiteql(sql)` con
paginación resuelta.

---

## Credenciales

`.env` en la raíz (gitignored):

```
NS_ACCOUNT=<id>            NS_CONSUMER_KEY=...   NS_CONSUMER_SECRET=...
NS_TOKEN_ID=...            NS_TOKEN_SECRET=...   GEMINI_API_KEY=...
```

La receta completa para que el cliente cree la integración y el token está en
[`docs/NS-ERP-README.md`](docs/NS-ERP-README.md) §3. **El rol importa más que las
credenciales**: uno angosto produce falsos "módulo ausente".

Los PDFs se renderizan por Chrome DevTools Protocol:

```bash
chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=<temp> about:blank
```

---

## Reglas que no se negocian

1. **Los datos de cliente nunca salen de `clients/`**, ignorada en bloque con regla negativa
   (`clients/**`). Son exports completos de sistemas financieros reales.
2. **Una ausencia no es una ausencia.** SuiteQL solo expone un record type si la feature está
   habilitada **y** el rol la ve. Se reporta `unknown`, nunca `absent`.
3. **Todo entregable va en inglés.** Código, comentarios, commits y estos README van en
   español. Ojo: el texto de un PDF se ensambla desde varios archivos — traducir el generador
   no alcanza. Números en formato `en-US`.
4. **Todo lo prescriptivo va como "suggested change"** a validar con el cliente.
5. **Sin números inventados.** Si no se extrajo, se dice "no extraído". Nunca se estima.
6. **Nada de lenguaje de venta interno en un documento de cliente.** "Es un rescate de algo
   que ya pagan" o "antes de posicionar NSAR" no van.
7. **Rotar las credenciales** al terminar el assessment.

---

## Antes de tocar el pipeline de NetSuite

Leé **[`docs/NETSUITE-DISCOVERY-LEARNINGS.md`](docs/NETSUITE-DISCOVERY-LEARNINGS.md)**. Tiene
las trampas que ya nos costaron tiempo: qué tablas existen y cuáles no, `isstored='F'`, los
`custentity_` compartidos entre entidades, los signos del GL, los schedules que proyectan
hasta 2035, y cuatro cosas que dábamos por ciertas y eran falsas.

---

## Mapa de paquetes

| paquete | qué hace |
| --- | --- |
| `netsuite/` | extracción SuiteQL, assessment de módulos, conectores, micro-vertical, COA/IS/BS |
| `lcm/` | LCM export → tenant-kb.json, enriquecimiento, sanitización |
| `planning/` | operaciones en vivo contra NSPB: auth, carga, validaciones |
| `analysis/` | cube-optimize, level-0, IPM, architecture/optimization report |
| `reports/` | md/JSON → PDF con el shell BPC (CDP `:9222`) |
| `mcp-planning/` | el MCP de Planning (ESM) — LCM + REST desde Claude |
| `forge/` | genera dimensiones y forms (ESM) |
| `engagement/` | horas de engagement y reporte al cliente |
| `recon/` | NetSuite ↔ NSPB — semilla, comparador **sin escribir** |

**CJS y ESM conviven por paquete a propósito.** `mcp-planning` y `forge` son ESM; el resto
CJS heredado de `tools/`. `npm run check` valida cada archivo con el parser que le toca — no
unificar a la fuerza.

---

## Docs

| archivo | cuándo leerlo |
| --- | --- |
| [`docs/NETSUITE-DISCOVERY-LEARNINGS.md`](docs/NETSUITE-DISCOVERY-LEARNINGS.md) | ⭐ antes de tocar el pipeline de NetSuite |
| [`docs/NS-ERP-README.md`](docs/NS-ERP-README.md) | playbook del assessment de NetSuite: qué pedir, cómo correr, QA |
| [`docs/CUBE-OPTIMIZATION-README.md`](docs/CUBE-OPTIMIZATION-README.md) | antes de un análisis de optimización de cubo |
| [`docs/NSPB-LCM-AND-DATA-RUNBOOK.md`](docs/NSPB-LCM-AND-DATA-RUNBOOK.md) | operaciones de datos sobre Planning |
| [`skills/epm-assessment/SKILL.md`](skills/epm-assessment/SKILL.md) | el flujo guiado paso a paso |

---

## Estado y pendientes

- Sin remoto git: consolidación local.
- `packages/recon/` tiene la semilla del caso Talogy pero **el comparador NetSuite ↔ NSPB no
  está escrito**. Es el próximo bloque.
- El benchmark por micro-vertical (`ns-benchmarks.json`) tiene 12 verticales con profundidad
  despareja: `events-dmc` está desarrollado, otros tienen dos líneas.
- `ns-financials.js` depende de dos consultas manuales que convendría plegar dentro de
  `netsuite-export.js` como una quinta fase.
- Primer cliente corrido end-to-end: **PRA** (`clients/pra/`), agencia de eventos/DMC. No
  tenemos su LCM de Planning, así que ese lado está sin evaluar.


---

## apps/ — el producto

`apps/nspb-assistant/` es el **NSPB Assistant**: add-in de Excel (Office.js) + Cloudflare Worker que responde preguntas sobre Planning en lenguaje natural, mas su docs-site en Firebase y la extension de Chrome.

Es producto desplegado, no toolkit: se shippea a clientes y tiene su propio ciclo de deploy.

```bash
cd apps/nspb-assistant/worker && npm run deploy
```

Su guia tecnica propia esta en `apps/nspb-assistant/CLAUDE-nspb-assistant.md`.

**Cuidado:** el build del worker embebe `clients/<name>/tenant-kb.json` resolviendo rutas relativas a SU carpeta, no a la raiz del toolkit. Si movés algo, verificá esa resolucion.
